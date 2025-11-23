// gpsBuffer.ts
import EventEmitter from "events";
import { cacheHelpers } from "../config/redis";   // <-- using your helpers
import { redisClient } from "../config/redis";

/**
 * GPSBuffer
 * Stores & batches GPS packets for each bus before pushing it to Redis.
 */

class GPSBuffer extends EventEmitter {
  private buffer: Map<string, any[]>;
  private flushInterval: NodeJS.Timeout;

  constructor() {
    super();
    this.buffer = new Map();

    // Flush every 10 seconds (adjust as needed)
    this.flushInterval = setInterval(() => this.flushAll(), 10_000);

    console.log("📍 GPS Buffer initialized");
  }

  /**
   * Add a new GPS packet for a bus
   */
  add(busId: string, gpsData: any) {
    if (!this.buffer.has(busId)) {
      this.buffer.set(busId, []);
    }

    this.buffer.get(busId)!.push({
      ...gpsData,
      timestamp: Date.now(),
    });

    // Update the latest bus location cache immediately
    cacheHelpers.setBusLocation(busId, gpsData).catch(console.error);

    // Emit an event for UI updates or analytics
    this.emit("location_update", busId, gpsData);
  }

  /**
   * Flush local buffer into Redis as a batch list
   */
  async flush(busId: string) {
    const points = this.buffer.get(busId);
    if (!points || points.length === 0) return;

    try {
      const redisKey = `bus:gps_history:${busId}`;

      // Push all points to Redis list
      await redisClient.rpush(redisKey, ...points.map(p => JSON.stringify(p)));

      // Keep list from growing too large
      await redisClient.ltrim(redisKey, -500, -1); // keep last 500 points

      // Clear in-memory buffer
      this.buffer.set(busId, []);

      console.log(`📤 Flushed ${points.length} GPS points for bus ${busId}`);
    } catch (err) {
      console.error("❌ GPS Buffer flush error:", err);
    }
  }

  /**
   * Flush all buses
   */
  async flushAll() {
    for (const busId of this.buffer.keys()) {
      await this.flush(busId);
    }
  }

  /**
   * Clean up before shutdown
   */
  async shutdown() {
    clearInterval(this.flushInterval);
    await this.flushAll();
    console.log("🛑 GPS Buffer shutdown completed");
  }
}

export const gpsBuffer = new GPSBuffer();
export const bufferCoordinate = (busId: string, coords: any) => {
  gpsBuffer.add(busId, coords);
};

export const forceFlushBus = async (busId: string) => {
  await gpsBuffer.flush(busId);
};
 