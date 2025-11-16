// src/utils/imeiCache.ts
import Bus from "../models/Bus.model";
import { redisClient } from "../config/redis";

const memoryCache: Map<string, string | null> = new Map();
const IMEI_TTL = 300; // seconds

export async function getBusIdForIMEI(imei: string): Promise<string | null> {
  if (memoryCache.has(imei)) return memoryCache.get(imei) || null;

  const key = `imei:bus:${imei}`;
  try {
    const cached = await redisClient.get(key);
    if (cached && cached !== "null") {
      memoryCache.set(imei, cached);
      setTimeout(() => memoryCache.delete(imei), IMEI_TTL * 1000);
      return cached;
    }

    // DB fallback
    const bus = await Bus.findOne({ trackerIMEI: imei }).select("_id").lean();
    const id = bus?._id?.toString() ?? null;
    await redisClient.setex(key, IMEI_TTL, id ?? "null");
    memoryCache.set(imei, id);
    setTimeout(() => memoryCache.delete(imei), IMEI_TTL * 1000);
    return id;
  } catch (err) {
    console.warn("⚠️ imeiCache error, falling back to DB:", err);
    const bus = await Bus.findOne({ trackerIMEI: imei }).select("_id").lean();
    const id = bus?._id?.toString() ?? null;
    memoryCache.set(imei, id);
    return id;
  }
}
