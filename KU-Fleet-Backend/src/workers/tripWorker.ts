// import { Worker } from "bullmq";
// import { redisClient } from "../config/redis";
// import { cacheHelpers } from "../config/redis";
// import TripLog from "../models/TripLog.model";
// import Bus from "../models/Bus.model";
// import Alert from "../models/Alert.model";
// import dotenv from "dotenv";
// dotenv.config();

// export const tripWorker = new Worker(
//   "tripQueue",
//   async (job) => {
//     console.log(`🚌 Processing trip job: ${job.name} at ${new Date().toISOString()}`);

//     try {
//       // ====================================================================================
//       //  SAVE TRIP SEGMENT
//       // ====================================================================================
//       if (job.name === "saveTripSegment") {
//         const { busId, coords, speed, timestamp } = job.data;
//         const ts = timestamp ? new Date(timestamp) : new Date();

//         if (!busId || !coords) {
//           console.warn("⚠️ Invalid saveTripSegment payload:", job.data);
//           return;
//         }

//         // Append coordinates to active trip
//         await TripLog.updateOne(
//           { bus: busId, endTime: null }, // Only active trip
//           {
//             $push: { coordinates: coords },
//             $set: {
//               lastUpdate: ts,
//               currentSpeed: speed ?? 0,
//             },
//           }
//         );

//         // Cache bus location
//         await cacheHelpers.setBusLocation(busId, {
//           coordinates: coords,
//           speed: speed ?? 0,
//           timestamp: ts,
//         });

//         // Generate overspeed alert
//         if (speed && speed > 80) {
//           await Alert.create({
//             bus: busId,
//             type: "overspeed",
//             message: `Bus exceeded speed limit: ${speed} km/h`,
//             priority: "high",
//             timestamp: ts,
//           });
//           console.log(`⚠️ Overspeed alert created for bus ${busId}: ${speed} km/h`);
//         }
//       }

//       // ====================================================================================
//       //  END TRIP
//       // ====================================================================================
//       if (job.name === "endTrip") {
//         const { busId, endCoords } = job.data;

//         if (!busId) {
//           console.warn("⚠️ endTrip called with missing busId");
//           return;
//         }

//         await TripLog.updateOne(
//           { bus: busId, endTime: null },
//           {
//             $set: {
//               endTime: new Date(),
//               endCoordinates: endCoords || null,
//             },
//           }
//         );

//         await cacheHelpers.clearBusLocation(busId);

//         console.log(`🛑 Trip ended for bus ${busId}`);
//       }

//       // ====================================================================================
//       //  DAILY TRIP CLEANUP
//       // ====================================================================================
//       if (job.name === "dailyCleanup") {
//         const retentionDays = parseInt(process.env.TRIP_RETENTION_DAYS || "7");
//         const cutoff = new Date();
//         cutoff.setDate(cutoff.getDate() - retentionDays);

//         const deleted = await TripLog.deleteMany({
//           createdAt: { $lt: cutoff },
//           endTime: { $ne: null }, // only completed trips
//         });

//         console.log(`🧹 Deleted ${deleted.deletedCount} old completed trip logs`);
//       }

//       // ====================================================================================
//       //  UPDATE BUS STATUS
//       // ====================================================================================
//       if (job.name === "updateBusStatus") {
//         const { busId, status, location } = job.data;

//         if (!busId) {
//           console.warn("⚠️ updateBusStatus called without busId");
//           return;
//         }

//         // Update bus last known info
//         await Bus.findByIdAndUpdate(busId, {
//           status: status ?? "inactive",
//           lastLocation: location || null,
//           lastUpdate: new Date(),
//         });

//         // Update cache if location exists
//         if (location) {
//           await cacheHelpers.setBusLocation(busId, {
//             ...location,
//             timestamp: new Date(),
//           });
//         }

//         console.log(`📍 Updated status for bus ${busId}:`, status);
//       }
//     } catch (error) {
//       console.error(`❌ Error processing trip job ${job.name}:`, error);
//       throw error; // ensures BullMQ retry system handles it
//     }
//   },
//   {
//     connection: redisClient,
//     concurrency: 5,
//     removeOnComplete: { count: 100 },
//     removeOnFail: { count: 50 },
//   }
// );
