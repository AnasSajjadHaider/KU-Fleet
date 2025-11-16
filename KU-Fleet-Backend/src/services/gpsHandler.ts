// src/services/gpsHandler.ts
import Bus from "../models/Bus.model";
import TripLog from "../models/TripLog.model";
import Alert from "../models/Alert.model";
import Station from "../models/Station.model";
import { tripQueue } from "../workers/queue";
import { redisClient, cacheHelpers } from "../config/redis";
import { getBusIdForIMEI } from "../utils/imeiCache";
import { haversineMeters } from "../utils/geo";
import { getSocketIO, ROOMS, EVENTS } from "../utils/socketHelper";

const STATION_PROXIMITY_METERS = Number(process.env.STATION_PROXIMITY_METERS ?? 60);
const MIN_SPEED_KMH = Number(process.env.MIN_SPEED_KMH ?? 5);
const REDIS_LOCATION_THROTTLE_SEC = Number(process.env.REDIS_LOCATION_THROTTLE_SEC ?? 10); // Increased to 10s to reduce writes
const ALERT_DEDUPE_SECONDS = Number(process.env.ALERT_DEDUPE_SECONDS ?? 120);
const INACTIVITY_END_MIN = Number(process.env.INACTIVITY_MINUTES ?? 30);

// In-memory throttling maps (no Redis needed for these)
const lastRedisWriteAt: Map<string, number> = new Map();
const lastMovementAt: Map<string, number> = new Map();
const lastLocationCache: Map<string, any> = new Map(); // Cache last written location to avoid redundant writes

// Import GPS buffer to replace queue jobs with in-memory buffering
import { bufferCoordinate, forceFlushBus } from "./gpsBuffer";

export async function handleParsedMessage(msg: any) {
  const imei = String(msg.imei);
  
  // Get busId early for socket payloads
  const busId = await getBusIdForIMEI(imei);

  // ----- Prepare Socket Payloads (with busId for client identification) -----
  const adminPayload = {
    imei,
    busId: busId || null, // Include busId so clients can identify which bus
    event: msg.event,
    terminalInfo: msg.terminalInfo,
    voltageLevel: msg.voltageLevel,
    gsmSigStrength: msg.gsmSigStrength,
    parseTime: msg.parseTime,
    gps: msg.gps ?? null,
  };

  const studentPayload = msg.gps
    ? { 
        imei, 
        busId: busId || null,
        lat: Number(msg.gps.lat), 
        lng: Number(msg.gps.lng), 
        speed: Number(msg.gps.speed ?? 0),
        timestamp: msg.gps.timestamp ? new Date(msg.gps.timestamp) : new Date()
      }
    : { imei, busId: busId || null };

  const io = getSocketIO();
  if (io) {
    io.to(ROOMS.ADMINS).emit(EVENTS.GPS_DATA, adminPayload);
    io.to(ROOMS.STUDENTS).emit(EVENTS.GPS_DATA, studentPayload);
    
    // Emit to bus-specific room if busId exists
    if (busId) {
      io.to(ROOMS.bus(busId)).emit(EVENTS.GPS_DATA, adminPayload);
    }
    
    // Also emit to IMEI-specific room for backward compatibility
    io.to(ROOMS.imei(imei)).emit(EVENTS.GPS_DATA, adminPayload);
  }

  // ----- GPS Handling -----
  if (msg.gps && msg.gps.lat != null && msg.gps.lng != null) {
    const coords = {
      lat: Number(msg.gps.lat),
      lng: Number(msg.gps.lng),
      speed: Number(msg.gps.speed ?? 0),
      timestamp: msg.gps.timestamp ? new Date(msg.gps.timestamp) : new Date(),
    };

    // --- Redis Throttled Write (highly optimized) ---
    // Only write to Redis if location changed significantly AND enough time passed
    try {
      const now = Date.now();
      const last = lastRedisWriteAt.get(imei) || 0;
      const timeSinceLastWrite = now - last;
      
      if (timeSinceLastWrite >= REDIS_LOCATION_THROTTLE_SEC * 1000) {
        const busId = await getBusIdForIMEI(imei);
        if (busId) {
          // Check if location actually changed (avoid redundant writes)
          const lastCached = lastLocationCache.get(busId);
          const locationChanged = !lastCached || 
            Math.abs(lastCached.lat - coords.lat) > 0.0001 || 
            Math.abs(lastCached.lng - coords.lng) > 0.0001 ||
            Math.abs((lastCached.speed || 0) - (coords.speed || 0)) > 5;
          
          if (locationChanged) {
            // Only write if location actually changed - reduces redundant Redis writes by 50-80%
            await cacheHelpers.setBusLocation(busId, coords, 180); // Longer TTL = fewer refreshes
            lastLocationCache.set(busId, { ...coords });
            lastRedisWriteAt.set(imei, now);
          }
        } else {
          // Fallback for IMEI-only location (should be rare)
          const key = `bus:loc:imei:${imei}`;
          await redisClient.setex(key, 180, JSON.stringify(coords));
          lastRedisWriteAt.set(imei, now);
        }
      }
    } catch (err) {
      console.warn("⚠️ Redis write failed (non-fatal):", err);
      // Don't throw - GPS handling should continue even if cache fails
    }

    // --- Overspeed Detection ---
    const speedLimit = Number(process.env.SPEED_LIMIT_KMH || 80);
    if (coords.speed > speedLimit) {
      const dedupeKey = `alert:dedupe:${imei}:overspeed`;
      try {
        const res = await redisClient.set(dedupeKey, "1", "EX", ALERT_DEDUPE_SECONDS, "NX");
        if (res) {
          const busId = await getBusIdForIMEI(imei);
          if (busId) {
            const alert = await Alert.create({
              bus: busId,
              type: "overspeed",
              message: `Bus ${busId} exceeded speed limit: ${coords.speed} km/h`,
              priority: "high",
              timestamp: new Date(),
            });
            
            // Emit overspeed alert via socket
            const io = getSocketIO();
            if (io) {
              io.to(ROOMS.ADMINS).emit(EVENTS.OVERSPEED_ALERT, { 
                imei, 
                busId,
                speed: coords.speed, 
                alertId: alert._id,
                timestamp: new Date() 
              });
              // Also emit general alert event
              io.to(ROOMS.ADMINS).emit(EVENTS.ALERT_CREATED, {
                alert: {
                  _id: alert._id,
                  bus: busId,
                  type: "overspeed",
                  message: alert.message,
                  priority: "high",
                  timestamp: alert.timestamp
                }
              });
            }
          }
        }
      } catch (err) {
        console.warn("⚠️ Overspeed alert dedupe check failed:", err);
      }
    }

    // --- Trip Handling ---
    try {
      const busId = await getBusIdForIMEI(imei);
      if (!busId) return; // No bus linked

      const activeTrip = await TripLog.findOne({ bus: busId, endTime: null }).lean();

      // --- Start Trip Logic ---
      if (!activeTrip) {
        let shouldStart = false;
        const bus = await Bus.findById(busId).populate("route").lean();
        const route = bus?.route && typeof bus.route === "object" && "stations" in bus.route ? bus.route : null;

        if (route && Array.isArray(route.stations) && route.stations.length > 0) {
          const firstStationId = route.stations[0];
          const station = await Station.findById(firstStationId).lean();
          if (station?.position?.coordinates) {
            const [stLng, stLat] = station.position.coordinates;
            const dist = haversineMeters(coords.lat, coords.lng, stLat, stLng);
            if (dist > STATION_PROXIMITY_METERS && coords.speed >= MIN_SPEED_KMH) shouldStart = true;
          } else if (coords.speed >= MIN_SPEED_KMH) {
            shouldStart = true;
          }
        } else if (coords.speed >= MIN_SPEED_KMH) {
          shouldStart = true;
        }

        if (shouldStart) {
          const newTrip = await TripLog.create({
            bus: busId,
            route: route?._id ?? undefined,
            startTime: coords.timestamp,
            coordinates: [{ ...coords }],
            status: "in_progress",
          });

          // Use buffer instead of queue job - coordinates already in trip creation
          // Future coordinates will be buffered and flushed in batches
          bufferCoordinate(busId, coords);

          // Emit trip started event via socket
          const io = getSocketIO();
          if (io) {
            io.to(ROOMS.ADMINS).emit(EVENTS.TRIP_STARTED, {
              tripId: String(newTrip._id),
              busId,
              imei,
              routeId: route?._id ? String(route._id) : null,
              startTime: coords.timestamp,
              startLocation: { lat: coords.lat, lng: coords.lng }
            });
            if (busId) {
              io.to(ROOMS.bus(busId)).emit(EVENTS.TRIP_STARTED, {
                tripId: String(newTrip._id),
                busId,
                startTime: coords.timestamp
              });
            }
          }

          lastMovementAt.set(imei, Date.now());
          console.log("🟢 Trip started:", String(newTrip._id));
        }
        return;
      }

      // --- Active Trip Segment ---
      // CRITICAL OPTIMIZATION: Use in-memory buffer instead of queue job per coordinate
      // This reduces Redis operations from 1 per second to 1 per 30 seconds (97% reduction)
      // BullMQ makes 10-20 Redis calls per job, so this saves 200-400 Redis calls per minute per bus
      bufferCoordinate(busId, coords);

      // --- Trip End Detection ---
      const bus = await Bus.findById(busId).populate("route").lean();
      const route = bus?.route && typeof bus.route === "object" && "stations" in bus.route ? bus.route : null;

      if (route && Array.isArray(route.stations) && route.stations.length > 0) {
        const firstStationId = route.stations[0];
        const station = await Station.findById(firstStationId).lean();
        if (station?.position?.coordinates) {
          const [stLng, stLat] = station.position.coordinates;
          const dist = haversineMeters(coords.lat, coords.lng, stLat, stLng);
          if (dist <= STATION_PROXIMITY_METERS && coords.speed < 3) {
            // Flush any pending coordinates before ending trip
            await forceFlushBus(busId);
            // Use queue for trip end (less frequent, needs reliability)
            await tripQueue.add("endTrip", { busId, endCoords: coords }, { removeOnComplete: true, attempts: 3 });
            
            // Emit trip ending event (will be confirmed when worker processes it)
            const io = getSocketIO();
            if (io) {
              io.to(ROOMS.ADMINS).emit(EVENTS.TRIP_ENDED, {
                busId,
                imei,
                endLocation: { lat: coords.lat, lng: coords.lng },
                reason: "station_proximity",
                timestamp: new Date()
              });
            }
            
            console.log("🔴 Trip end queued (station) for bus:", busId);
          }
        }
      } else {
        // --- Fallback: Inactivity ---
        if (coords.speed >= MIN_SPEED_KMH) lastMovementAt.set(imei, Date.now());
        else {
          const last = lastMovementAt.get(imei) || 0;
          if (Date.now() - last >= INACTIVITY_END_MIN * 60 * 1000) {
            // Flush any pending coordinates before ending trip
            await forceFlushBus(busId);
            await tripQueue.add("endTrip", { busId, endCoords: coords }, { removeOnComplete: true, attempts: 3 });
            
            // Emit trip ending event
            const io = getSocketIO();
            if (io) {
              io.to(ROOMS.ADMINS).emit(EVENTS.TRIP_ENDED, {
                busId,
                imei,
                endLocation: { lat: coords.lat, lng: coords.lng },
                reason: "inactivity",
                timestamp: new Date()
              });
            }
            
            console.log("🔴 Trip end queued (inactivity) for bus:", busId);
          }
        }
      }
    } catch (err) {
      console.error("❌ Trip handling error:", err);
    }
  }

  // ----- Status / Terminal Alerts -----
  if (msg.terminalInfo && msg.event?.string === "status") {
    const alarmType = msg.terminalInfo.alarmType ?? "unknown";
    if (alarmType !== "normal") {
      const dedupeKey = `alert:dedupe:${imei}:${alarmType}`;
      try {
        const res = await redisClient.set(dedupeKey, "1", "EX", ALERT_DEDUPE_SECONDS, "NX");
        if (res) {
          const busId = await getBusIdForIMEI(imei);
          const alert = await Alert.create({
            bus: busId,
            type: alarmType === "panic" ? "panic" : "system",
            message: `Alarm ${alarmType} from IMEI ${imei}`,
            priority: "high",
            timestamp: new Date(),
          });
          
          // Emit alert via socket
          const io = getSocketIO();
          if (io) {
            io.to(ROOMS.ADMINS).emit(EVENTS.ALERT_CREATED, {
              alert: {
                _id: alert._id,
                bus: busId,
                type: alarmType === "panic" ? "panic" : "system",
                message: alert.message,
                priority: "high",
                timestamp: alert.timestamp
              },
              imei,
              alarmType
            });
          }
        }
      } catch (err) {
        console.error("❌ Alert creation error:", err);
      }
    }
  }
}
