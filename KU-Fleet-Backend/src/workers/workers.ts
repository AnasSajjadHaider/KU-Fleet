import { Worker } from "bullmq";
import { redisClient } from "../config/redis";

// Trip Worker
export const tripWorker = new Worker(
  "tripQueue",
  async (job) => {
    console.log("🚍 Processing Trip Job:", job.id);
    // your trip logic here...
  },
  { connection: redisClient }
);

// Analytics Worker
export const analyticsWorker = new Worker(
  "analyticsQueue",
  async (job) => {
    console.log("📊 Processing Analytics Job:", job.id);
    // analytics logic...
  },
  { connection: redisClient }
);

// Cleanup Worker
export const cleanupWorker = new Worker(
  "cleanupQueue",
  async (job) => {
    console.log("🧹 Processing Cleanup Job:", job.id);
    // cleanup logic...
  },
  { connection: redisClient }
);

// Log Events
const workers = [tripWorker, analyticsWorker, cleanupWorker];

workers.forEach((worker) => {
  worker.on("completed", (job) => {
    console.log(`✅ Worker ${worker.name} completed job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ Worker ${worker.name} failed job ${job?.id}:`, err);
  });
});
