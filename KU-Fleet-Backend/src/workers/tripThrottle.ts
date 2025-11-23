import { cacheHelpers } from "../config/redis";
import { IBusStatusLocation } from "./trip.service";

// Adjust as needed. 5000ms = 5 writes per minute per bus.
const THROTTLE_INTERVAL_MS = 5000;

const lastUpdateMap: Map<string, number> = new Map();

/**
 * Throttles Redis writes for bus location
 */
export async function setBusLocationThrottled(
  busId: string,
  location: IBusStatusLocation
) {
  const now = Date.now();
  const last = lastUpdateMap.get(busId) || 0;

  if (now - last < THROTTLE_INTERVAL_MS) {
    // Skip write
    return;
  }

  lastUpdateMap.set(busId, now);

  // Write as usual using your existing helper
  await cacheHelpers.setBusLocation(busId, {
    ...location,
    timestamp: new Date(),
  });
}
