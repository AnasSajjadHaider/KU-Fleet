import { Queue } from "bullmq";
import { redisClient } from "../config/redis";
import { TripJobPayload, AnalyticsJobPayload, CleanupJobPayload } from "./workers";

/* ----------------------------------------
 *  QUEUES WITH STRONG TYPES
 * ---------------------------------------- */

// Trip queue for GPS/trip-related jobs
export const tripQueue = new Queue<TripJobPayload>("tripQueue", {
  connection: redisClient,
});

// Analytics queue for generating reports, metrics, etc.
export const analyticsQueue = new Queue<AnalyticsJobPayload>("analyticsQueue", {
  connection: redisClient,
});

// Cleanup queue for deleting old data / clearing caches
export const cleanupQueue = new Queue<CleanupJobPayload>("cleanupQueue", {
  connection: redisClient,
});
