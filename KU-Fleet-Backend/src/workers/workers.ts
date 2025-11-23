import { Worker, Job, WorkerOptions } from "bullmq";
import { redisClient } from "../config/redis";

/* ----------------------------------------------
 *  JOB PAYLOAD TYPES
 * ---------------------------------------------- */
export interface TripJobPayload {
  busId?: string;
  coords?: { lat: number; lng: number };
  speed?: number;
  timestamp?: string | number | Date;
  endCoords?: { lat: number; lng: number };
}

export interface AnalyticsJobPayload {
  type: string;
  data?: unknown;
}

export interface CleanupJobPayload {
  force?: boolean;
}

/* ----------------------------------------------
 *  BASE WORKER OPTIONS (correct KeepJobs format)
 * ---------------------------------------------- */
const baseWorkerOpts: WorkerOptions = {
  connection: redisClient,

  // Reduce Redis commands
  drainDelay: 5000,          // Poll every 5 seconds instead of every tick
  stalledInterval: 60000,    // Check stalled only every 60s

  // Correct types for BullMQ v5+
  removeOnComplete: {
    age: 3600_000, // Keep for 1 hour
    count: 10,     // Keep last 10 jobs max
  },
  removeOnFail: {
    age: 3600_000, // Keep failed jobs 1 hour
    count: 5,
  },
};

/* ----------------------------------------------
 *  TRIP WORKER
 * ---------------------------------------------- */
export const tripWorker = new Worker<TripJobPayload>(
  "tripQueue",
  async (job: Job<TripJobPayload>) => {
    console.log("🚍 Processing Trip Job:", job.name, job.id);
  },
  baseWorkerOpts
);

/* ----------------------------------------------
 *  ANALYTICS WORKER
 * ---------------------------------------------- */
export const analyticsWorker = new Worker<AnalyticsJobPayload>(
  "analyticsQueue",
  async (job: Job<AnalyticsJobPayload>) => {
    console.log("📊 Processing Analytics Job:", job.name, job.id);
  },
  baseWorkerOpts
);

/* ----------------------------------------------
 *  CLEANUP WORKER
 * ---------------------------------------------- */
export const cleanupWorker = new Worker<CleanupJobPayload>(
  "cleanupQueue",
  async (job: Job<CleanupJobPayload>) => {
    console.log("🧹 Processing Cleanup Job:", job.name, job.id);
  },
  baseWorkerOpts
);

/* ----------------------------------------------
 *  EVENT LOGS
 * ---------------------------------------------- */
const workers = [tripWorker, analyticsWorker, cleanupWorker];

workers.forEach((worker) => {
  worker.on("completed", (job: Job) => {
    console.log(`✅ Worker ${worker.name} completed job ${job.id}`);
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    console.error(`❌ Worker ${worker.name} failed job ${job?.id}:`, err);
  });
});
