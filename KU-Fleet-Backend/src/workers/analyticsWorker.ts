import { Worker } from "bullmq";
import { redisClient } from "../config/redis";
import { cacheHelpers } from "../config/redis";
import TripLog from "../models/TripLog.model";
import Bus from "../models/Bus.model";
import Alert from "../models/Alert.model";

// Utility to safely format YYYY-MM-DD
function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

export const analyticsWorker = new Worker(
  "analyticsQueue",
  async (job) => {
    console.log(`📊 Processing analytics job: ${job.name} at ${new Date().toISOString()}`);

    try {
      // ----- Generate Daily Analytics -----
      if (job.name === "generateDailyAnalytics") {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const dateKey = formatDate(startOfDay);

        const [totalTrips, completedTrips, activeBuses, totalBuses, alertsToday] =
          await Promise.all([
            TripLog.countDocuments({ startTime: { $gte: startOfDay, $lte: endOfDay } }),
            TripLog.countDocuments({
              startTime: { $gte: startOfDay, $lte: endOfDay },
              endTime: { $ne: null },
            }),
            Bus.countDocuments({ status: "active" }),
            Bus.countDocuments(),
            Alert.countDocuments({ timestamp: { $gte: startOfDay, $lte: endOfDay } }),
          ]);

        const analytics = {
          date: dateKey,
          totalTrips,
          completedTrips,
          alertsToday,
          activeBuses,
          totalBuses,
          completionRate: totalTrips ? (completedTrips / totalTrips) * 100 : 0,
          utilizationRate: totalBuses ? (activeBuses / totalBuses) * 100 : 0,
        };

        await cacheHelpers.setAnalyticsData(`daily:${dateKey}`, analytics, 86400);
        console.log("✅ Daily analytics generated:", analytics);
      }

      // ----- Generate Bus Analytics -----
      if (job.name === "generateBusAnalytics") {
        const { busId } = job.data;

        const bus = await Bus.findById(busId).populate("route");
        if (!bus) {
          console.warn("⚠️ Bus not found for analytics:", busId);
          return;
        }

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const dateKey = formatDate(startOfDay);

        const tripsToday = await TripLog.find({
          bus: busId,
          startTime: { $gte: startOfDay, $lte: endOfDay },
        });

        const totalDistance = tripsToday.reduce((sum, trip) => sum + (trip.distance || 0), 0);
        const avgSpeed =
          tripsToday.length > 0
            ? tripsToday.reduce((sum, t) => sum + (t.avgSpeed || 0), 0) / tripsToday.length
            : 0;

        const alertsToday = await Alert.countDocuments({
          bus: busId,
          timestamp: { $gte: startOfDay, $lte: endOfDay },
        });

        const analytics = {
          busId,
          date: dateKey,
          tripsCount: tripsToday.length,
          totalDistance,
          averageSpeed: avgSpeed,
          alertsCount: alertsToday,
        };

        await cacheHelpers.setAnalyticsData(
          `bus:${busId}:${dateKey}`,
          analytics,
          86400
        );

        console.log("🚍 Bus analytics generated:", analytics);
      }

      // ----- Generate Route Analytics -----
      if (job.name === "generateRouteAnalytics") {
        const { routeId } = job.data;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const dateKey = formatDate(startOfDay);

        const routeTrips = await TripLog.find({
          route: routeId,
          startTime: { $gte: startOfDay, $lte: endOfDay },
        }).populate("bus");

        const totalPassengers = routeTrips.reduce(
          (sum, t) => sum + (t.passengerCount || 0),
          0
        );
        const totalDistance = routeTrips.reduce(
          (sum, t) => sum + (t.distance || 0),
          0
        );

        const analytics = {
          routeId,
          date: dateKey,
          tripsCount: routeTrips.length,
          totalPassengers,
          totalDistance,
          averagePassengers:
            routeTrips.length > 0 ? totalPassengers / routeTrips.length : 0,
        };

        await cacheHelpers.setAnalyticsData(
          `route:${routeId}:${dateKey}`,
          analytics,
          86400
        );

        console.log("🛣️ Route analytics generated:", analytics);
      }
    } catch (error) {
      console.error(`❌ Error processing analytics job ${job.name}:`, error);
      throw error;
    }
  },
  {
    connection: redisClient,
    concurrency: 1, // Analytics jobs are infrequent, no need for high concurrency
    removeOnComplete: { count: 20 }, // Reduced retention
    removeOnFail: { count: 10 },
  }
);
