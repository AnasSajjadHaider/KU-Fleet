import TripLog from "../models/TripLog.model";
import Bus from "../models/Bus.model";
import Alert from "../models/Alert.model";
import { cacheHelpers } from "../config/redis";

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

export async function generateDailyAnalytics() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const dateKey = formatDate(start);

  const [totalTrips, completedTrips, activeBuses, totalBuses, alertsToday] =
    await Promise.all([
      TripLog.countDocuments({ startTime: { $gte: start, $lte: end } }),
      TripLog.countDocuments({ startTime: { $gte: start, $lte: end }, endTime: { $ne: null } }),
      Bus.countDocuments({ status: "active" }),
      Bus.countDocuments(),
      Alert.countDocuments({ timestamp: { $gte: start, $lte: end } }),
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
  console.log("Daily analytics saved:", analytics);
}

export async function generateBusAnalytics(busId: string) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const dateKey = formatDate(start);

  const trips = await TripLog.find({ bus: busId, startTime: { $gte: start, $lte: end } });

  const totalDistance = trips.reduce((a, t) => a + (t.distance || 0), 0);
  const avgSpeed = trips.length
    ? trips.reduce((a, t) => a + (t.avgSpeed || 0), 0) / trips.length
    : 0;

  const alertsCount = await Alert.countDocuments({
    bus: busId,
    timestamp: { $gte: start, $lte: end },
  });

  const analytics = {
    busId,
    date: dateKey,
    tripsCount: trips.length,
    totalDistance,
    averageSpeed: avgSpeed,
    alertsCount,
  };

  await cacheHelpers.setAnalyticsData(`bus:${busId}:${dateKey}`, analytics, 86400);
}

export async function generateRouteAnalytics(routeId: string) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const dateKey = formatDate(start);

  const trips = await TripLog.find({
    route: routeId,
    startTime: { $gte: start, $lte: end },
  });

  const totalPassengers = trips.reduce((a, t) => a + (t.passengerCount || 0), 0);
  const totalDistance = trips.reduce((a, t) => a + (t.distance || 0), 0);

  const analytics = {
    routeId,
    date: dateKey,
    tripsCount: trips.length,
    totalPassengers,
    totalDistance,
    averagePassengers: trips.length ? totalPassengers / trips.length : 0,
  };

  await cacheHelpers.setAnalyticsData(`route:${routeId}:${dateKey}`, analytics, 86400);
}
