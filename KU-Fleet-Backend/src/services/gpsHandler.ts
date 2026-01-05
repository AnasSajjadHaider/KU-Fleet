// src/services/gpsHandler.ts
import Bus from "../models/Bus.model";
import TripLog, { ITripLog } from "../models/TripLog.model";
import Alert from "../models/Alert.model";
import Station, { IStation } from "../models/Station.model";
import { IRoute } from "../interfaces/Route";
import { tripQueue } from "../workers/queue";
import { redisClient, cacheHelpers } from "../config/redis";
import { getBusIdForIMEI } from "../utils/imeiCache";
import { haversineMeters } from "../utils/geo";
import { getSocketIO, ROOMS, EVENTS } from "../utils/socketHelper";
import { bufferCoordinate, forceFlushBus } from "./gpsBuffer";

const STATION_PROXIMITY_METERS = Number(process.env.STATION_PROXIMITY_METERS ?? 60);
const MIN_SPEED_KMH = Number(process.env.MIN_SPEED_KMH ?? 5);
const REDIS_LOCATION_THROTTLE_SEC = Number(process.env.REDIS_LOCATION_THROTTLE_SEC ?? 10);
const ALERT_DEDUPE_SECONDS = Number(process.env.ALERT_DEDUPE_SECONDS ?? 120);
const INACTIVITY_END_MIN = Number(process.env.INACTIVITY_MINUTES ?? 30);
const SPEED_LIMIT_KMH = Number(process.env.SPEED_LIMIT_KMH ?? 80);

// In-memory throttling
const lastRedisWriteAt: Map<string, number> = new Map();
const lastMovementAt: Map<string, number> = new Map();
const lastLocationCache: Map<string, BusCoordinates> = new Map();

interface TerminalInfo {
  status?: boolean;
  ignition?: boolean;
  charging?: boolean;
  alarmType?: string;
  gpsTracking?: boolean;
  relayState?: boolean;
}

export interface GPSData {
  lat: number;
  lng: number;
  speed?: number;
  timestamp?: Date | string;
}

export interface ParsedMessage {
  imei: string | number;
  event?: { number: number; string: string };
  terminalInfo?: TerminalInfo;
  voltageLevel?: string;
  gsmSigStrength?: string;
  parseTime?: number;
  expectsResponse?: boolean;
  gps?: GPSData;
  lat?: number; // legacy
  lon?: number; // legacy
  speed?: number; // legacy
  fixTime?: string | Date;
}

export interface BusCoordinates {
  lat: number;
  lng: number;
  speed: number;
  timestamp: Date;
}

// Type guard to detect valid GPS coordinates
function hasValidCoords(msg: ParsedMessage): msg is ParsedMessage & { gps: GPSData } {
  return !!((msg.gps && msg.gps.lat != null && msg.gps.lng != null) || (msg.lat != null && msg.lon != null));
}

export async function handleParsedMessage(msg: ParsedMessage): Promise<void> {
  const imei = String(msg.imei);
  const busId = await getBusIdForIMEI(imei);
  const io = getSocketIO();

  // --- Extract coordinates ---
  let coords: BusCoordinates | null = null;
  if (hasValidCoords(msg)) {
    coords = {
      lat: msg.gps?.lat ?? msg.lat!,
      lng: msg.gps?.lng ?? msg.lon!,
      speed: msg.gps?.speed ?? msg.speed ?? 0,
      timestamp: msg.gps?.timestamp ? new Date(msg.gps.timestamp) : msg.fixTime ? new Date(msg.fixTime) : new Date(),
    };
  }

  // --- Prepare socket payloads ---
  const adminPayload = {
    imei,
    busId: busId ?? null,
    event: msg.event ?? null,
    terminalInfo: msg.terminalInfo ?? null,
    voltageLevel: msg.voltageLevel ?? null,
    gsmSigStrength: msg.gsmSigStrength ?? null,
    parseTime: msg.parseTime ?? Date.now(),
    gps: coords,
  };

  const studentPayload = coords
    ? { imei, busId: busId ?? null, lat: coords.lat, lng: coords.lng, speed: coords.speed, timestamp: coords.timestamp }
    : { imei, busId: busId ?? null };

  if (io) {
    io.to(ROOMS.ADMINS).emit(EVENTS.GPS_DATA, adminPayload);
    io.to(ROOMS.STUDENTS).emit(EVENTS.GPS_DATA, studentPayload);
    if (busId) io.to(ROOMS.bus(busId)).emit(EVENTS.GPS_DATA, adminPayload);
    io.to(ROOMS.imei(imei)).emit(EVENTS.GPS_DATA, adminPayload);
  }

  if (!coords) return;

  // --- Redis throttled write ---
  try {
    const now = Date.now();
    const last = lastRedisWriteAt.get(imei) || 0;

    if (now - last >= REDIS_LOCATION_THROTTLE_SEC * 1000) {
      if (busId) {
        const lastCached = lastLocationCache.get(busId);
        const changed =
          !lastCached ||
          Math.abs(lastCached.lat - coords.lat) > 0.0001 ||
          Math.abs(lastCached.lng - coords.lng) > 0.0001 ||
          Math.abs(lastCached.speed - coords.speed) > 5;

        if (changed) {
          await cacheHelpers.setBusLocation(busId, coords, 180);
          lastLocationCache.set(busId, { ...coords });
          lastRedisWriteAt.set(imei, now);
        }
      } else {
        await redisClient.setex(`bus:loc:imei:${imei}`, 180, JSON.stringify(coords));
        lastRedisWriteAt.set(imei, now);
      }
    }
  } catch (err) {
    console.warn("⚠️ Redis write failed:", err);
  }

  // --- Overspeed detection ---
  if (coords.speed > SPEED_LIMIT_KMH && busId) {
    const dedupeKey = `alert:dedupe:${imei}:overspeed`;
    try {
      const res = await redisClient.set(dedupeKey, "1", "EX", ALERT_DEDUPE_SECONDS, "NX");
      if (res) {
        const alert = await Alert.create({
          bus: busId,
          type: "overspeed",
          message: `Bus ${busId} exceeded speed limit: ${coords.speed} km/h`,
          priority: "high",
          timestamp: new Date(),
        });
        if (io) {
          io.to(ROOMS.ADMINS).emit(EVENTS.OVERSPEED_ALERT, { imei, busId, speed: coords.speed, alertId: alert._id, timestamp: new Date() });
          io.to(ROOMS.ADMINS).emit(EVENTS.ALERT_CREATED, { alert: { _id: alert._id, bus: busId, type: "overspeed", message: alert.message, priority: "high", timestamp: alert.timestamp } });
        }
      }
    } catch (err) {
      console.warn("⚠️ Overspeed alert dedupe check failed:", err);
    }
  }

  // --- Trip handling ---
  try {
    if (!busId) return;

    const activeTrip = await TripLog.findOne({ bus: busId, endTime: null }).lean<ITripLog | null>();

    // Type-safe populate
    const busDoc = await Bus.findById(busId).populate<{ route: IRoute }>("route").lean<{ route: IRoute | null }>();
    const route = busDoc?.route ?? null;

    // --- Start Trip ---
    if (!activeTrip) {
      let shouldStart = coords.speed >= MIN_SPEED_KMH;

      if (route?.stations?.length) {
        const firstStationId = route.stations[0];
        const station = await Station.findById(firstStationId).lean<IStation | null>();
        if (station?.position?.coordinates) {
          const [stLng, stLat] = station.position.coordinates;
          const dist = haversineMeters(coords.lat, coords.lng, stLat, stLng);
          if (dist <= STATION_PROXIMITY_METERS) shouldStart = false;
        }
      }

      if (shouldStart) {
        const newTrip = await TripLog.create({
          bus: busId,
          route: route?._id ?? undefined,
          startTime: coords.timestamp,
          coordinates: [coords],
          status: "in_progress",
        });

        bufferCoordinate(busId, coords);

        if (io) {
          io.to(ROOMS.ADMINS).emit(EVENTS.TRIP_STARTED, {
            tripId: String(newTrip._id),
            busId,
            imei,
            routeId: route?._id ? String(route._id) : null,
            startTime: coords.timestamp,
            startLocation: { lat: coords.lat, lng: coords.lng },
          });
          io.to(ROOMS.bus(busId)).emit(EVENTS.TRIP_STARTED, { tripId: String(newTrip._id), busId, startTime: coords.timestamp });
        }

        lastMovementAt.set(imei, Date.now());
        console.log("🟢 Trip started:", String(newTrip._id));
      }

      return;
    }

    // --- Active Trip Segment ---
    bufferCoordinate(busId, coords);

    // --- End Trip ---
    if (route?.stations?.length) {
      const firstStationId = route.stations[0];
      const station = await Station.findById(firstStationId).lean<IStation | null>();
      if (station?.position?.coordinates) {
        const [stLng, stLat] = station.position.coordinates;
        const dist = haversineMeters(coords.lat, coords.lng, stLat, stLng);
        if (dist <= STATION_PROXIMITY_METERS && coords.speed < 3) {
          await forceFlushBus(busId);
          await tripQueue.add("endTrip", { busId, endCoords: coords }, { removeOnComplete: true, attempts: 3 });
          if (io) io.to(ROOMS.ADMINS).emit(EVENTS.TRIP_ENDED, { busId, imei, endLocation: { lat: coords.lat, lng: coords.lng }, reason: "station_proximity", timestamp: new Date() });
          console.log("🔴 Trip end queued (station) for bus:", busId);
        }
      }
    } else {
      const last = lastMovementAt.get(imei) || 0;
      if (coords.speed >= MIN_SPEED_KMH) lastMovementAt.set(imei, Date.now());
      else if (Date.now() - last >= INACTIVITY_END_MIN * 60 * 1000) {
        await forceFlushBus(busId);
        await tripQueue.add("endTrip", { busId, endCoords: coords }, { removeOnComplete: true, attempts: 3 });
        if (io) io.to(ROOMS.ADMINS).emit(EVENTS.TRIP_ENDED, { busId, imei, endLocation: { lat: coords.lat, lng: coords.lng }, reason: "inactivity", timestamp: new Date() });
        console.log("🔴 Trip end queued (inactivity) for bus:", busId);
      }
    }
  } catch (err) {
    console.error("❌ Trip handling error:", err);
  }

  // --- Terminal / Status Alerts ---
  if (msg.terminalInfo && msg.event?.string === "status") {
    const alarmType = msg.terminalInfo.alarmType ?? "unknown";
    if (alarmType !== "normal") {
      const dedupeKey = `alert:dedupe:${imei}:${alarmType}`;
      try {
        const res = await redisClient.set(dedupeKey, "1", "EX", ALERT_DEDUPE_SECONDS, "NX");
        if (res) {
          const alert = await Alert.create({
            bus: busId ?? undefined,
            type: alarmType === "panic" ? "panic" : "system",
            message: `Alarm ${alarmType} from IMEI ${imei}`,
            priority: "high",
            timestamp: new Date(),
          });
          if (io) {
            io.to(ROOMS.ADMINS).emit(EVENTS.ALERT_CREATED, {
              alert: {
                _id: alert._id,
                bus: busId,
                type: alarmType === "panic" ? "panic" : "system",
                message: alert.message,
                priority: "high",
                timestamp: alert.timestamp,
              },
              imei,
              alarmType,
            });
          }
        }
      } catch (err) {
        console.error("❌ Alert creation error:", err);
      }
    }
  }
}
