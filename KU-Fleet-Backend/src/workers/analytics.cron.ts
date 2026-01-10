// src/workers/analytics.cron.ts
import cron from "node-cron";
import { generateDailyAnalytics } from "./analytics.service";

/* --------------------- Safety + Logging --------------------- */
let redisHealthy = true;
let lastRedisErrorTime = 0;
const HEALTH_CHECK_COOLDOWN = 1000 * 60 * 15; // 15 minutes

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
    console.log(`📊 Starting job: ${label} at ${new Date().toISOString()}`);
    await fn();
    console.log(`✅ Completed job: ${label} at ${new Date().toISOString()}`);
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes("Redis") || (err as any).code === "ECONNRESET")) {
      redisHealthy = false;
      lastRedisErrorTime = Date.now();
      console.error(`❌ Redis connection issue during ${label}:`, err.message);
    } else {
      console.error(`❌ Error running ${label}:`, err);
    }
  }
}

/* --------------------- Cron Schedule --------------------- */
// Daily analytics at 12:00 AM
cron.schedule("0 0 * * *", async () => {
  await safeJob(generateDailyAnalytics, "daily-analytics");
});

console.log("🕐 Daily analytics cron job initialized: runs at 00:00 every day");
