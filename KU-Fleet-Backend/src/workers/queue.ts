import { Queue } from "bullmq";
import { redisClient } from "../config/redis";

// Create Queues
export const tripQueue = new Queue("tripQueue", {
  connection: redisClient,
});

export const analyticsQueue = new Queue("analyticsQueue", {
  connection: redisClient,
});

export const cleanupQueue = new Queue("cleanupQueue", {
  connection: redisClient,
});
