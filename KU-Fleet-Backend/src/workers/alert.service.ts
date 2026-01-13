// src/services/alert.service.ts
import Alert from "../models/Alert.model";
import Bus from "../models/Bus.model";
import { Types } from "mongoose";
import { getSocketIO, ROOMS, EVENTS } from "../utils/socketHelper";
import { cacheHelpers } from "../config/redis";

export const AlertService = {
  async createAlert(payload: { busId: string; type: string; message?: string; priority?: string }) {
    const { busId, type, message, priority = "medium" } = payload;

    const bus = await Bus.findById(busId).lean();
    if (!bus) throw new Error("Bus not found");

    const alert = await Alert.create({
      bus: busId,
      type,
      message,
      priority,
      timestamp: new Date(),
    });

    const populatedAlert = await Alert.findById(alert._id)
      .populate("bus", "busNumber plateNumber route")
      .populate("bus.route", "routeName");

    const io = getSocketIO();
    if (io) {
      io.to(ROOMS.ADMINS).emit(EVENTS.ALERT_CREATED, { alert: populatedAlert });
      io.to(ROOMS.bus(String(busId))).emit(EVENTS.ALERT_CREATED, { alert: populatedAlert });
    }

    return populatedAlert;
  },

  async updateAlert(alertId: string, data: { resolved?: boolean; priority?: string; message?: string }) {
    const alert = await Alert.findByIdAndUpdate(alertId, data, { new: true, runValidators: true })
      .populate("bus", "busNumber plateNumber route")
      .populate("bus.route", "routeName");

    if (!alert) throw new Error("Alert not found");

    const io = getSocketIO();
    if (io) {
      io.to(ROOMS.ADMINS).emit(EVENTS.ALERT_UPDATED, { alert });
      if (alert.bus) io.to(ROOMS.bus(String(alert.bus))).emit(EVENTS.ALERT_UPDATED, { alert });
    }

    return alert;
  },

  async resolveAlert(alertId: string) {
    const alert = await Alert.findByIdAndUpdate(alertId, { resolved: true }, { new: true, runValidators: true })
      .populate("bus", "busNumber plateNumber route")
      .populate("bus.route", "routeName");

    if (!alert) throw new Error("Alert not found");

    const io = getSocketIO();
    if (io) {
      io.to(ROOMS.ADMINS).emit(EVENTS.ALERT_RESOLVED, { alert });
      if (alert.bus) io.to(ROOMS.bus(String(alert.bus))).emit(EVENTS.ALERT_RESOLVED, { alert });
    }

    return alert;
  },

  async getAlertStats(days = 7) {
    const cacheKey = `alerts:stats:${days}`;
    const cached = await cacheHelpers.getAnalyticsData(cacheKey);
    if (cached) return cached;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const totalAlerts = await Alert.countDocuments({ timestamp: { $gte: cutoff } });
    const resolvedAlerts = await Alert.countDocuments({ timestamp: { $gte: cutoff }, resolved: true });
    const alertsByType = await Alert.aggregate([
      { $match: { timestamp: { $gte: cutoff } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);
    const alertsByPriority = await Alert.aggregate([
      { $match: { timestamp: { $gte: cutoff } } },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]);
    const recentAlerts = await Alert.find({ timestamp: { $gte: cutoff } })
      .populate("bus", "busNumber plateNumber")
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    const stats = {
      totalAlerts,
      resolvedAlerts,
      unresolvedAlerts: totalAlerts - resolvedAlerts,
      resolutionRate: totalAlerts > 0 ? (resolvedAlerts / totalAlerts) * 100 : 0,
      alertsByType,
      alertsByPriority,
      recentAlerts,
    };

    await cacheHelpers.setAnalyticsData(cacheKey, stats, 600); // Cache 10 min
    return stats;
  },

  async getBusAlerts(busId: string, resolved?: boolean, limit = 50) {
    const filter: any = { bus: busId };
    if (resolved !== undefined) filter.resolved = resolved;

    return Alert.find(filter)
      .populate("bus", "busNumber plateNumber")
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  },
};
