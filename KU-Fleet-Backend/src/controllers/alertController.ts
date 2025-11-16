// src/controllers/alertController.ts
// Alert CRUD operations with proper error handling

import { Request, Response } from "express";
import { Types } from "mongoose";
import Alert from "../models/Alert.model";
import Bus from "../models/Bus.model";
import { getSocketIO, ROOMS, EVENTS } from "../utils/socketHelper";
import { wrapAsync, AppError } from "../middleware/errorHandler";
import { validateRequired } from "../utils/validation";

// GET /api/alerts — Get all alerts
// PERFORMANCE: Use lean() for read-only queries, validate pagination
export const getAlerts = wrapAsync(async (req: Request, res: Response) => {
  const { type, priority, resolved, busId, page = 1, limit = 20 } = req.query;
  
  // SECURITY: Validate and sanitize filter inputs
  const filter: any = {};
  const allowedTypes = ["panic", "overspeed", "routeDeviation", "system", "other"];
  if (type && allowedTypes.includes(type as string)) {
    filter.type = type;
  }
  
  const allowedPriorities = ["low", "medium", "high"];
  if (priority && allowedPriorities.includes(priority as string)) {
    filter.priority = priority;
  }
  
  if (resolved !== undefined) {
    filter.resolved = resolved === "true";
  }
  
  // SECURITY: Validate ObjectId if busId provided
  if (busId) {
    if (!Types.ObjectId.isValid(busId as string)) {
      throw new AppError("Invalid bus ID format", 400);
    }
    filter.bus = busId;
  }

  // SECURITY: Validate pagination parameters
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20)); // Max 100 per page
  const skip = (pageNum - 1) * limitNum;
  
  // PERFORMANCE: Use lean() for read-only queries, parallel execution
  const [alerts, total] = await Promise.all([
    Alert.find(filter)
      .populate("bus", "busNumber plateNumber route")
      .populate("bus.route", "routeName")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(), // PERFORMANCE: Use lean() for read-only
    Alert.countDocuments(filter)
  ]);

  res.status(200).json({
    success: true,
    count: alerts.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    alerts
  });
});

// GET /api/alerts/:id — Get single alert
// PERFORMANCE: Use lean() for read-only query
export const getAlertById = wrapAsync(async (req: Request, res: Response) => {
  const alert = await Alert.findById(req.params.id)
    .populate("bus", "busNumber plateNumber route driver")
    .populate("bus.route", "routeName")
    .populate("bus.driver", "name email")
    .lean(); // PERFORMANCE: Use lean() for read-only

  if (!alert) {
    throw new AppError("Alert not found", 404);
  }

  res.status(200).json({ success: true, alert });
});

// POST /api/alerts — Create new alert
// SECURITY: Validate inputs, prevent invalid alert types
export const createAlert = wrapAsync(async (req: Request, res: Response) => {
  const { busId, type, message, priority = "medium" } = req.body;

  // SECURITY: Validate required fields
  const missing = validateRequired({ busId, type }, ["busId", "type"]);
  if (missing.length > 0) {
    throw new AppError(`Missing required fields: ${missing.join(", ")}`, 400);
  }

  // SECURITY: Validate alert type
  const allowedTypes = ["panic", "overspeed", "routeDeviation", "system", "other"];
  if (!allowedTypes.includes(type)) {
    throw new AppError(`Invalid alert type. Allowed: ${allowedTypes.join(", ")}`, 400);
  }

  // SECURITY: Validate priority
  const allowedPriorities = ["low", "medium", "high"];
  const alertPriority = allowedPriorities.includes(priority) ? priority : "medium";

  // SECURITY: Validate ObjectId format
  if (!Types.ObjectId.isValid(busId)) {
    throw new AppError("Invalid bus ID format", 400);
  }

  // PERFORMANCE: Use lean() for existence check
  const bus = await Bus.findById(busId).lean();
  if (!bus) {
    throw new AppError("Bus not found", 404);
  }

  const alert = await Alert.create({
    bus: busId,
    type,
    message,
    priority: alertPriority, // Use validated priority
    timestamp: new Date()
  });

  const populatedAlert = await Alert.findById(alert._id)
    .populate("bus", "busNumber plateNumber route")
    .populate("bus.route", "routeName");

  // Emit socket event for alert creation
  const io = getSocketIO();
  if (io) {
    io.to(ROOMS.ADMINS).emit(EVENTS.ALERT_CREATED, {
      alert: populatedAlert
    });
    if (busId) {
      io.to(ROOMS.bus(String(busId))).emit(EVENTS.ALERT_CREATED, {
        alert: populatedAlert
      });
    }
  }

  res.status(201).json({ 
    success: true, 
    message: "Alert created successfully",
    alert: populatedAlert 
  });
});

// PUT /api/alerts/:id — Update alert
export const updateAlert = async (req: Request, res: Response) => {
  try {
    const { resolved, priority, message } = req.body;
    
    const updateData: any = {};
    if (resolved !== undefined) updateData.resolved = resolved;
    if (priority) updateData.priority = priority;
    if (message) updateData.message = message;

    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate("bus", "busNumber plateNumber route")
     .populate("bus.route", "routeName");

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    // Emit socket event for alert update
    const io = getSocketIO();
    if (io) {
      io.to(ROOMS.ADMINS).emit(EVENTS.ALERT_UPDATED, {
        alert
      });
      if (alert.bus) {
        io.to(ROOMS.bus(String(alert.bus))).emit(EVENTS.ALERT_UPDATED, {
          alert
        });
      }
    }

    res.status(200).json({ 
      success: true, 
      message: "Alert updated successfully",
      alert 
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update alert", error });
  }
};

// DELETE /api/alerts/:id — Delete alert
export const deleteAlert = async (req: Request, res: Response) => {
  try {
    const alert = await Alert.findByIdAndDelete(req.params.id);

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    res.status(200).json({ 
      success: true, 
      message: "Alert deleted successfully" 
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete alert", error });
  }
};

// PUT /api/alerts/:id/resolve — Resolve alert
export const resolveAlert = async (req: Request, res: Response) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { resolved: true },
      { new: true, runValidators: true }
    ).populate("bus", "busNumber plateNumber route")
     .populate("bus.route", "routeName");

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    // Emit socket event for alert resolution
    const io = getSocketIO();
    if (io) {
      io.to(ROOMS.ADMINS).emit(EVENTS.ALERT_RESOLVED, {
        alert
      });
      if (alert.bus) {
        io.to(ROOMS.bus(String(alert.bus))).emit(EVENTS.ALERT_RESOLVED, {
          alert
        });
      }
    }

    res.status(200).json({ 
      success: true, 
      message: "Alert resolved successfully",
      alert 
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to resolve alert", error });
  }
};

// GET /api/alerts/bus/:busId — Get alerts for specific bus
export const getBusAlerts = async (req: Request, res: Response) => {
  try {
    const { busId } = req.params;
    const { resolved, limit = 50 } = req.query;

    const filter: any = { bus: busId };
    if (resolved !== undefined) filter.resolved = resolved === "true";

    const alerts = await Alert.find(filter)
      .populate("bus", "busNumber plateNumber")
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: alerts.length,
      alerts
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch bus alerts", error });
  }
};

// GET /api/alerts/stats — Get alert statistics
export const getAlertStats = async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(days));

    const totalAlerts = await Alert.countDocuments({
      timestamp: { $gte: cutoff }
    });

    const resolvedAlerts = await Alert.countDocuments({
      timestamp: { $gte: cutoff },
      resolved: true
    });

    const alertsByType = await Alert.aggregate([
      { $match: { timestamp: { $gte: cutoff } } },
      { $group: { _id: "$type", count: { $sum: 1 } } }
    ]);

    const alertsByPriority = await Alert.aggregate([
      { $match: { timestamp: { $gte: cutoff } } },
      { $group: { _id: "$priority", count: { $sum: 1 } } }
    ]);

    const recentAlerts = await Alert.find({
      timestamp: { $gte: cutoff }
    })
      .populate("bus", "busNumber plateNumber")
      .sort({ timestamp: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      stats: {
        totalAlerts,
        resolvedAlerts,
        unresolvedAlerts: totalAlerts - resolvedAlerts,
        resolutionRate: totalAlerts > 0 ? (resolvedAlerts / totalAlerts) * 100 : 0,
        alertsByType,
        alertsByPriority,
        recentAlerts
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch alert statistics", error });
  }
};
