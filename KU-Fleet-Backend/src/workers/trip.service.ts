// src/services/trip.service.ts
import { cacheHelpers } from "../config/redis";
import TripLog from "../models/TripLog.model";
import Bus from "../models/Bus.model";
import Alert from "../models/Alert.model";
import dotenv from "dotenv";
dotenv.config();

/* ----------------------------------------------
 * TYPES
 * ---------------------------------------------- */

export interface ICoords {
  lat: number;
  lng: number;
}

export interface ISaveTripSegmentPayload {
  busId: string;
  coords: ICoords;
  speed?: number;
  timestamp?: string | number | Date;
}

export interface IEndTripPayload {
  busId: string;
  endCoords?: ICoords | null;
}

export interface IBusStatusLocation {
  lat: number;
  lng: number;
  speed?: number;
}

export interface IUpdateBusStatusPayload {
  busId: string;
  status?: string;
  location?: IBusStatusLocation | null;
}

/* ----------------------------------------------
 * Local in-process cache throttle (reduces Redis ops)
 * ---------------------------------------------- */

const REDIS_LOCATION_THROTTLE_SEC = Number(process.env.REDIS_LOCATION_THROTTLE_SEC ?? 10); // secs
const BUS_CACHE_TTL = Number(process.env.BUS_CACHE_TTL_SEC ?? 180); // seconds

// Track last write times and last values per bus to avoid redundant writes
const lastCacheWriteAt: Map<string, number> = new Map();
const lastCacheValue: Map<string, { lat: number; lng: number; speed?: number }> = new Map();

function shouldWriteCache(busId: string, coords: { lat: number; lng: number; speed?: number }) {
  const now = Date.now();
  const lastAt = lastCacheWriteAt.get(busId) ?? 0;
  const elapsed = now - lastAt;
  if (elapsed < REDIS_LOCATION_THROTTLE_SEC * 1000) return false;

  const lastVal = lastCacheValue.get(busId);
  if (!lastVal) return true;
  // Small threshold to avoid micro-movements causing writes
  const moved =
    Math.abs((lastVal.lat ?? 0) - coords.lat) > 0.0001 ||
    Math.abs((lastVal.lng ?? 0) - coords.lng) > 0.0001 ||
    Math.abs((lastVal.speed ?? 0) - (coords.speed ?? 0)) > 5;

  return moved;
}

/* ----------------------------------------------
 * SERVICE
 * ---------------------------------------------- */

export const TripService = {
  /**
   * SAVE TRIP SEGMENT
   */
  async saveTripSegment({
    busId,
    coords,
    speed,
    timestamp,
  }: ISaveTripSegmentPayload): Promise<void> {
    const ts = timestamp ? new Date(timestamp) : new Date();

    if (!busId || !coords) {
      console.warn("⚠️ Invalid saveTripSegment payload");
      return;
    }

    // Persist coordinate to DB (append) - required for trip history
    try {
      await TripLog.updateOne(
        { bus: busId, endTime: null },
        {
          $push: { coordinates: coords },
          $set: {
            lastUpdate: ts,
            currentSpeed: speed ?? 0,
          },
        }
      );
    } catch (err) {
      console.error("❌ TripLog updateOne failed:", err);
      // continue - DB failing is serious but we still try to preserve other flows
    }

    // Throttled cache write (non-blocking)
    try {
      const cachePayload = { lat: coords.lat, lng: coords.lng, speed: speed ?? 0, timestamp: ts };
      if (shouldWriteCache(busId, cachePayload)) {
        // Fire-and-forget to avoid blocking; capture errors
        cacheHelpers.setBusLocation(busId, cachePayload, BUS_CACHE_TTL)
          .then(() => {
            lastCacheWriteAt.set(busId, Date.now());
            lastCacheValue.set(busId, { lat: cachePayload.lat, lng: cachePayload.lng, speed: cachePayload.speed });
          })
          .catch((err) => {
            console.warn("⚠️ setBusLocation non-fatal error:", err);
          });
      }
    } catch (err) {
      console.warn("⚠️ Cache throttle check failed:", err);
    }

    // Overspeed alert (keeps original behavior)
    if (speed && speed > 80) {
      try {
        await Alert.create({
          bus: busId,
          type: "overspeed",
          message: `Bus exceeded speed limit: ${speed} km/h`,
          priority: "high",
          timestamp: ts,
        });
        console.log(`⚠️ Overspeed alert created for bus ${busId}: ${speed} km/h`);
      } catch (err) {
        console.error("❌ Alert.create failed:", err);
      }
    }
  },

  /**
   * END TRIP
   */
  async endTrip({ busId, endCoords }: IEndTripPayload): Promise<void> {
    if (!busId) {
      console.warn("⚠️ endTrip without busId");
      return;
    }

    try {
      await TripLog.updateOne(
        { bus: busId, endTime: null },
        {
          $set: {
            endTime: new Date(),
            endCoordinates: endCoords || null,
          },
        }
      );
    } catch (err) {
      console.error("❌ TripLog endTrip update failed:", err);
    }

    // Clear cache in a safe non-blocking way
    try {
      cacheHelpers.clearBusLocation(busId).catch((err) => {
        console.warn("⚠️ clearBusLocation non-fatal error:", err);
      });
      lastCacheWriteAt.delete(busId);
      lastCacheValue.delete(busId);
    } catch (err) {
      console.warn("⚠️ Clearing in-memory throttle failed:", err);
    }

    console.log(`🛑 Trip ended for bus ${busId}`);
  },

  /**
   * DAILY CLEANUP
   */
  async dailyCleanup(): Promise<void> {
    const retentionDays = parseInt(process.env.TRIP_RETENTION_DAYS || "7");
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    try {
      const deleted = await TripLog.deleteMany({
        createdAt: { $lt: cutoff },
        endTime: { $ne: null },
      });

      console.log(`🧹 Deleted ${deleted.deletedCount} old trip logs`);
    } catch (err) {
      console.error("❌ dailyCleanup deleteMany failed:", err);
    }
  },

  /**
   * UPDATE BUS STATUS
   */
  async updateBusStatus({
    busId,
    status,
    location,
  }: IUpdateBusStatusPayload): Promise<void> {
    if (!busId) {
      console.warn("⚠️ updateBusStatus without busId");
      return;
    }

    try {
      await Bus.findByIdAndUpdate(busId, {
        status: status ?? "inactive",
        lastLocation: location || null,
        lastUpdate: new Date(),
      });
    } catch (err) {
      console.error("❌ Bus.findByIdAndUpdate failed:", err);
    }

    // Throttled cache write if location exists
    if (location) {
      try {
        const cachePayload = { lat: location.lat, lng: location.lng, speed: location.speed ?? 0, timestamp: new Date() };
        if (shouldWriteCache(busId, cachePayload)) {
          cacheHelpers.setBusLocation(busId, cachePayload, BUS_CACHE_TTL)
            .then(() => {
              lastCacheWriteAt.set(busId, Date.now());
              lastCacheValue.set(busId, { lat: cachePayload.lat, lng: cachePayload.lng, speed: cachePayload.speed });
            })
            .catch((err) => {
              console.warn("⚠️ setBusLocation non-fatal error:", err);
            });
        }
      } catch (err) {
        console.warn("⚠️ updateBusStatus cache path failed:", err);
      }
    }

    console.log(`📍 Updated bus ${busId} status → ${status}`);
  },
};
