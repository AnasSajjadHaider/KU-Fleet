// src/workers/queue.ts
import { Queue } from "bullmq";
import { redisClient } from "../config/redis";
import { TripJobPayload, AnalyticsJobPayload, CleanupJobPayload } from "./workers";

/* ----------------------------------------
 *  QUEUES WITH STRONG TYPES
 * ---------------------------------------- */

// Trip queue: GPS / trip segment / end trip jobs
export const tripQueue = new Queue<TripJobPayload>("tripQueue", {
  connection: redisClient,
});

// Analytics queue: daily / bus / route / trip-ended metrics
export const analyticsQueue = new Queue<AnalyticsJobPayload>("analyticsQueue", {
  connection: redisClient,
});

// Cleanup queue: delete old trips, clear cache, etc.
export const cleanupQueue = new Queue<CleanupJobPayload>("cleanupQueue", {
  connection: redisClient,
});

// Optional: export all queues together
export const Queues = {
  tripQueue,
  analyticsQueue,
  cleanupQueue,
};
