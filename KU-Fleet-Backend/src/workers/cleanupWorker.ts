import { Worker } from "bullmq";
import { redisClient } from "../config/redis";
import TripLog from "../models/TripLog.model";
import Alert from "../models/Alert.model";
import Feedback from "../models/Feedback.model";
import dotenv from "dotenv";
dotenv.config();

/* --------------------- Safety Controls ---------------------- */

let redisHealthy = true;
let lastRedisError = 0;
const REDIS_COOLDOWN = 1000 * 60 * 10; // 10 minutes cooldown

function handleRedisError(err: any, jobName: string) {
  console.error(`❌ Redis error in cleanup worker (${jobName}):`, err.message);
  redisHealthy = false;
  lastRedisError = Date.now();
}

function isRedisInCooldown() {
  if (!redisHealthy) {
    if (Date.now() - lastRedisError < REDIS_COOLDOWN) return true;
    redisHealthy = true; // Try again after cooldown
  }
  return false;
}

/* --------------------- Helper: Safe SCAN ---------------------- */

// Safe SCAN wrapper (never use KEYS in production)
async function scanKeys(pattern: string) {
  const found: string[] = [];
  let cursor = "0";

  try {
    do {
      const reply = await redisClient.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = reply[0];
      found.push(...reply[1]);
    } while (cursor !== "0");
  } catch (err) {
    console.error("❌ Error scanning Redis keys:", err);
    throw err;
  }

  return found;
}

/* --------------------- Worker Definition ---------------------- */

export const cleanupWorker = new Worker(
  "cleanupQueue",
  async (job) => {
    console.log(`🧽 Processing cleanup job: ${job.name}`);

    if (isRedisInCooldown()) {
      console.warn(`⏳ Skipping ${job.name} — Redis in cooldown mode`);
      return;
    }

    try {
      /* ---------------- Cleanup 1: Old Trip Logs ---------------- */
      if (job.name === "cleanupOldTripLogs") {
        const retention = parseInt(process.env.TRIP_RETENTION_DAYS || "7");
        const cutoff = new Date(Date.now() - retention * 86400000);

        const deleted = await TripLog.deleteMany({
          createdAt: { $lt: cutoff },
          endTime: { $ne: null }
        });

        console.log(`🗑️ Deleted ${deleted.deletedCount} old trip logs`);
      }

      /* ---------------- Cleanup 2: Old Alerts ---------------- */
      if (job.name === "cleanupOldAlerts") {
        const retention = parseInt(process.env.ALERT_RETENTION_DAYS || "30");
        const cutoff = new Date(Date.now() - retention * 86400000);

        const deleted = await Alert.deleteMany({
          createdAt: { $lt: cutoff },
          resolved: true
        });

        console.log(`🗑️ Deleted ${deleted.deletedCount} resolved alerts`);
      }

      /* ---------------- Cleanup 3: Old Feedback ---------------- */
      if (job.name === "cleanupOldFeedback") {
        const retention = parseInt(process.env.FEEDBACK_RETENTION_DAYS || "90");
        const cutoff = new Date(Date.now() - retention * 86400000);

        const deleted = await Feedback.deleteMany({
          createdAt: { $lt: cutoff }
        });

        console.log(`🗑️ Deleted ${deleted.deletedCount} old feedback`);
      }

      /* ---------------- Cleanup 4: Cache Keys ---------------- */
      if (job.name === "clearExpiredCache") {
        const keys = await scanKeys("analytics:*");
        let cleared = 0;

        // Batch TTL checks to reduce Redis calls
        if (keys.length > 0) {
          const pipeline = redisClient.pipeline();
          keys.forEach(key => pipeline.ttl(key));
          const results = await pipeline.exec();
          
          const keysToDelete: string[] = [];
          results?.forEach((result, index) => {
            if (result && result[1] === -1 && keys[index]) {
              keysToDelete.push(keys[index]);
            }
          });

          // Batch delete expired keys
          if (keysToDelete.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < keysToDelete.length; i += chunkSize) {
              const chunk = keysToDelete.slice(i, i + chunkSize).filter((k): k is string => k !== undefined);
              if (chunk.length > 0) {
                await redisClient.del(...chunk);
                cleared += chunk.length;
              }
            }
          }
        }

        console.log(`🧹 Cleared ${cleared} expired cache keys`);
      }

      /* ---------------- Cleanup 5: Data Archiving ---------------- */
      if (job.name === "archiveOldData") {
        const days = parseInt(process.env.ARCHIVE_DAYS || "30");
        const cutoff = new Date(Date.now() - days * 86400000);

        const archived = await TripLog.updateMany(
          {
            createdAt: { $lt: cutoff },
            endTime: { $ne: null }
          },
          { $set: { archived: true } }
        );

        console.log(`📦 Archived ${archived.modifiedCount} trip logs`);
      }

    } catch (err: any) {
      if (err?.code === "ECONNRESET" || err?.message?.includes("Redis")) {
        handleRedisError(err, job.name);
      }
      console.error(`❌ Error in cleanup job ${job.name}:`, err);
      throw err; // Allow BullMQ to retry
    }
  },
  {
    connection: redisClient,
    concurrency: 2,
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 10 }
  }
);

/* --------------------- Worker Monitoring ---------------------- */

cleanupWorker.on("completed", (job) => {
  console.log(`✔️ Cleanup job completed: ${job.name}`);
});

cleanupWorker.on("failed", (job, err) => {
  console.error(`❌ Cleanup job failed: ${job?.name}`, err.message);
});

cleanupWorker.on("error", (err) => {
  console.error("💥 Worker-level error:", err.message);
  redisHealthy = false;
  lastRedisError = Date.now();
});
