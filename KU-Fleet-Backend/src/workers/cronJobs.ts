import * as cron from "node-cron";
import { tripQueue, analyticsQueue, cleanupQueue } from "./queue";

// --- Internal Health + Rate Limit ---
let redisHealthy = true;
let lastRedisErrorTime = 0;
let HEALTH_CHECK_COOLDOWN = 1000 * 60 * 15; // 15 minutes cooldown after redis error

async function safeJob(fn: () => Promise<void>, label: string) {
  if (!redisHealthy) {
    const now = Date.now();
    if (now - lastRedisErrorTime < HEALTH_CHECK_COOLDOWN) {
      console.warn(`⏳ Skipping ${label} — Redis in cooldown mode`);
      return;
    }
    redisHealthy = true; // Try again after cooldown
  }

  try {
    await fn();
  } catch (err: any) {
    if (err?.code === "ECONNRESET" || err?.message?.includes("Redis")) {
      redisHealthy = false;
      lastRedisErrorTime = Date.now();
      console.error(`❌ Redis connection issue during ${label}:`, err.message);
    } else {
      console.error(`❌ Error running ${label}:`, err);
    }
  }
}

// --------------------- CRON JOBS ----------------------

// Daily cleanup job - 2 AM
cron.schedule("0 2 * * *", async () =>
  safeJob(async () => {
    console.log("🔄 Starting daily cleanup job...");

    await cleanupQueue.addBulk([
      {
        name: "cleanupOldTripLogs",
        data: {},
        opts: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      },
      {
        name: "cleanupOldAlerts",
        data: {},
        opts: { attempts: 3, delay: 1000, backoff: { type: "exponential", delay: 2000 } },
      },
      {
        name: "cleanupOldFeedback",
        data: {},
        opts: { attempts: 3, delay: 2000, backoff: { type: "exponential", delay: 2000 } },
      },
    ]);

    console.log("✅ Daily cleanup jobs scheduled");
  }, "daily-cleanup")
);

// Daily analytics job - 1 AM
cron.schedule("0 1 * * *", async () =>
  safeJob(async () => {
    console.log("📊 Starting daily analytics generation...");

    await analyticsQueue.add("generateDailyAnalytics", {}, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });

    console.log("✅ Daily analytics job scheduled");
  }, "daily-analytics")
);

// Cache cleanup - Every 6 hours
cron.schedule("0 */6 * * *", async () =>
  safeJob(async () => {
    console.log("🧹 Starting cache cleanup...");

    await cleanupQueue.add("clearExpiredCache", {}, {
      attempts: 2,
      backoff: { type: "exponential", delay: 1000 },
    });

    console.log("✅ Cache cleanup job scheduled");
  }, "cache-cleanup")
);

// Weekly data archiving - Sunday 3 AM
cron.schedule("0 3 * * 0", async () =>
  safeJob(async () => {
    console.log("📦 Starting weekly data archiving...");

    await cleanupQueue.add("archiveOldData", {}, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });

    console.log("✅ Data archiving job scheduled");
  }, "data-archiving")
);

// Health check — Every 15 minutes (reduced from 5 to minimize Redis calls)
// getJobCounts() makes multiple Redis calls, so reducing frequency saves operations
cron.schedule("*/15 * * * *", async () =>
  safeJob(async () => {
    // Only log if there are issues to reduce console noise
    const [trip, analytics, cleanup] = await Promise.all([
      tripQueue.getJobCounts(),
      analyticsQueue.getJobCounts(),
      cleanupQueue.getJobCounts(),
    ]);

    const failed = {
      trip: trip.failed ?? 0,
      analytics: analytics.failed ?? 0,
      cleanup: cleanup.failed ?? 0,
    };

    // Only log if there are actual issues (reduces log writes)
    if (failed.trip > 10 || failed.analytics > 5 || failed.cleanup > 5) {
      console.warn("⚠️ Queue Health Issues:", { trip, analytics, cleanup });
    }
  }, "health-check")
);

console.log("🕐 Cron jobs initialized safely:");
console.log("  - Daily cleanup: 2:00 AM");
console.log("  - Daily analytics: 1:00 AM");
console.log("  - Cache cleanup: Every 6 hours");
console.log("  - Data archiving: Sunday 3:00 AM");
console.log("  - Health check: Every 5 minutes (optimized + safe mode)");
