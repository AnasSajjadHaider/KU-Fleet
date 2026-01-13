// src/services/gpsBuffer.ts
import EventEmitter from "events";
import { redisClient } from "../config/redis";
import { BusCoordinates } from "./gpsHandler";

/**
 * GPSBuffer
 * Batches GPS points in memory before pushing to Redis.
 */

class GPSBuffer extends EventEmitter {
  private buffer: Map<string, BusCoordinates[]>;
  private flushInterval: NodeJS.Timeout;

  constructor() {
    super();
    this.buffer = new Map();

    // Flush every 10 seconds
    this.flushInterval = setInterval(() => {
      void this.flushAll();
    }, 10_000);

    console.log("📍 GPS Buffer initialized");
  }

  /**
   * Add a GPS coordinate for a bus
   */
  add(busId: string, coords: BusCoordinates): void {
    if (!this.buffer.has(busId)) {
      this.buffer.set(busId, []);
    }

    this.buffer.get(busId)!.push(coords);

    // Optional hook for analytics / live listeners
    this.emit("location_update", busId, coords);
  }

  /**
   * Flush buffered coordinates for a bus into Redis
   */
  async flush(busId: string): Promise<void> {
    const points = this.buffer.get(busId);
    if (!points || points.length === 0) return;

    const redisKey = `bus:gps_history:${busId}`;

    try {
      await redisClient.multi()
        .rpush(
          redisKey,
          ...points.map(p =>
            JSON.stringify({
              lat: p.lat,
              lng: p.lng,
              speed: p.speed,
              timestamp: p.timestamp.toISOString(),
            })
          )
        )
        .ltrim(redisKey, -500, -1)
        .expire(redisKey, 60 * 60 * 24) // keep 24h history
        .exec();

      this.buffer.set(busId, []);
    } catch (err) {
      console.error("❌ GPS Buffer flush error:", err);
    }
  }

  /**
   * Flush all buses (parallel, non-blocking)
   */
  async flushAll(): Promise<void> {
    await Promise.all(
      Array.from(this.buffer.keys()).map(busId =>
        this.flush(busId)
      )
    );
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flushAll();
    console.log("🛑 GPS Buffer shutdown completed");
  }
}

export const gpsBuffer = new GPSBuffer();

export const bufferCoordinate = (busId: string, coords: BusCoordinates): void => {
  gpsBuffer.add(busId, coords);
};

export const forceFlushBus = async (busId: string): Promise<void> => {
  await gpsBuffer.flush(busId);
};
