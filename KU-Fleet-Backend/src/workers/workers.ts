import { Worker, Job, WorkerOptions } from "bullmq";
import { redisClient, cacheHelpers } from "../config/redis";
import TripLog from "../models/TripLog.model";
import RFIDLog from "../models/RFIDLog.model";
import Alert from "../models/Alert.model";

/* ----------------------------------------------
 *  JOB PAYLOAD TYPES
 * ---------------------------------------------- */
export interface TripJobPayload {
  busId: string;
  coords?: { lat: number; lng: number };
  speed?: number;
  timestamp?: string | number | Date;
  endCoords?: { lat: number; lng: number };
}

export interface AnalyticsJobPayload {
  type:
    | "daily"
    | "bus"
    | "route"
    | "tripEnded";
  data?: any;
}

export interface CleanupJobPayload {
  force?: boolean;
}

/* ----------------------------------------------
 *  BASE WORKER OPTIONS
 * ---------------------------------------------- */
const baseWorkerOpts: WorkerOptions = {
  connection: redisClient,
  drainDelay: 5000,
  stalledInterval: 60000,
  removeOnComplete: { age: 3600_000, count: 10 },
  removeOnFail: { age: 3600_000, count: 5 },
};

/* ==============================================
 *  TRIP WORKER
 * ============================================== */
export const tripWorker = new Worker<TripJobPayload>(
  "tripQueue",
  async (job: Job<TripJobPayload>) => {
    const { busId, coords, speed, timestamp, endCoords } = job.data;
    const ts = timestamp ? new Date(timestamp) : new Date();

    /* ------------------------------
     *  SAVE TRIP SEGMENT
     * ------------------------------ */
    if (job.name === "saveTripSegment") {
      if (!coords) return;

      await TripLog.updateOne(
        { bus: busId, endTime: null },
        {
          $push: { coordinates: coords },
          $set: {
            lastUpdate: ts,
            currentSpeed: speed ?? 0,
          },
        }
      );

      await cacheHelpers.setBusLocation(busId, {
        lat: coords.lat,
        lng: coords.lng,
        speed: speed ?? 0,
        timestamp: ts,
      });
    }

    /* ------------------------------
     *  END TRIP (CRITICAL LOGIC)
     * ------------------------------ */
    
    if (job.name === "endTrip") {
      const { busId, endCoords } = job.data;
    
      if (!busId || !endCoords) return;
    
      const trip = await TripLog.findOne({
        bus: busId,
        endTime: null,
      });
    
      if (!trip) return;
    
      // Safety-net passenger reconciliation
      const boarded = await RFIDLog.countDocuments({
        trip: trip._id,
        eventType: "BOARD",
      });
    
      const exited = await RFIDLog.countDocuments({
        trip: trip._id,
        eventType: "EXIT",
      });
    
      const netPassengers = boarded - exited;
    
      trip.endTime = new Date();
      trip.status = "completed";

      trip.coordinates.push({
        lat: endCoords.lat,
        lng: endCoords.lng,
        timestamp: new Date(),
      });
      
    
      trip.passengerCount = Math.max(0, netPassengers);
    
      await trip.save();
    }
    
  },
  baseWorkerOpts
);

/* ==============================================
 *  ANALYTICS WORKER
 * ============================================== */
export const analyticsWorker = new Worker<AnalyticsJobPayload>(
  "analyticsQueue",
  async (job: Job<AnalyticsJobPayload>) => {
    const { type, data } = job.data;

    /* ------------------------------
     *  TRIP-ENDED ANALYTICS
     * ------------------------------ */
    if (type === "tripEnded") {
      const trip = await TripLog.findById(data.tripId);
      if (!trip) return;

      // Example: alert on empty trip
      if ((trip.passengerCount ?? 0) === 0) {
        await Alert.create({
          bus: trip.bus,
          type: "info",
          message: "Trip completed with zero passengers",
          priority: "low",
          timestamp: new Date(),
        });
      }
    }

    /* ------------------------------
     *  DAILY ANALYTICS (cron)
     * ------------------------------ */
    if (type === "daily") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const totalTrips = await TripLog.countDocuments({
        startTime: { $gte: today },
      });

      const completedTrips = await TripLog.countDocuments({
        startTime: { $gte: today },
        endTime: { $ne: null },
      });

      await cacheHelpers.setAnalyticsData(
        `daily:${today.toISOString().slice(0, 10)}`,
        {
          totalTrips,
          completedTrips,
          completionRate:
            totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0,
        },
        86400
      );
    }
  },
  baseWorkerOpts
);

/* ==============================================
 *  CLEANUP WORKER
 * ============================================== */
export const cleanupWorker = new Worker<CleanupJobPayload>(
  "cleanupQueue",
  async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    await TripLog.deleteMany({
      endTime: { $lt: cutoff },
    });
  },
  baseWorkerOpts
);

/* ==============================================
 *  LOGGING
 * ============================================== */
[tripWorker, analyticsWorker, cleanupWorker].forEach((worker) => {
  worker.on("completed", (job) => {
    console.log(`✅ ${worker.name} completed ${job.name}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ ${worker.name} failed ${job?.name}`, err);
  });
});
