import { Request, Response } from "express";
import User from "../models/User.model";
import Bus from "../models/Bus.model";
import RFIDLog from "../models/RFIDLog.model";
import TripLog from "../models/TripLog.model";
import { determineRfidEvent } from "../utils/rfid.utils";

/**
 * Handle a student RFID scan (boarding/exiting a bus)
 */
export const handleRfidScan = async (req: Request, res: Response) => {
  try {
    const { rfidTag, busId } = req.body;

    if (!rfidTag || !busId) {
      return res.status(400).json({ message: "rfidTag and busId are required" });
    }

    const normalizedUID = rfidTag.replace(/\s+/g, "").toUpperCase();

    const bus = await Bus.findById(busId);
    if (!bus) return res.status(404).json({ message: "Bus not found" });

    const student = await User.findOne({
      rfidCardUID: normalizedUID,
      role: "student",
      status: "active",
    });
    if (!student) return res.status(404).json({ message: "Invalid RFID card" });

    // ✅ Simplified: just flip last event on this bus
    const eventType = await determineRfidEvent(String(student._id), String(bus._id));

    // Save log
    const log = await RFIDLog.create({
      rfidTag: normalizedUID,
      student: student._id,
      bus: bus._id,
      eventType,
    });

    // Update passenger count if active trip exists
    const activeTrip = await TripLog.findOne({ bus: bus._id, status: "active" });
    if (activeTrip) {
      const delta = eventType === "BOARD" ? 1 : -1;
      await TripLog.findByIdAndUpdate(activeTrip._id, { $inc: { passengerCount: delta } });
    }

    // Emit real-time event
    const io = req.app.get("io");
    io?.emit("rfid:event", {
      studentId: student._id,
      studentName: student.name,
      busId: bus._id,
      eventType,
      timestamp: log.createdAt,
    });

    return res.status(200).json({
      message: "RFID processed successfully",
      eventType,
      student: { id: student._id, name: student.name, rfidCardUID: student.rfidCardUID },
    });

  } catch (error: any) {
    console.error("RFID ERROR:", error);
    return res.status(500).json({ message: "RFID scan failed", error: error.message });
  }
};

/**
 * Get all RFID logs (admin use)
 */
export const getAllRfidLogs = async (_req: Request, res: Response) => {
  try {
    const logs = await RFIDLog.find()
      .populate("student", "name rfidCardUID")
      .populate("bus", "busNumber busNumberPlate")
      .populate("trip", "startTime endTime status")
      .sort({ createdAt: -1 });

    return res.status(200).json({ logs });
  } catch (error: any) {
    console.error("RFID GET ALL ERROR:", error);
    return res.status(500).json({ message: "Failed to fetch RFID logs", error: error.message });
  }
};

/**
 * Get logs for a single student by studentId or rfidCardUID
 */
export const getStudentRfidLogs = async (req: Request, res: Response) => {
  try {
    const { studentId, rfidCardUID } = req.query;

    if (!studentId && !rfidCardUID)
      return res.status(400).json({ message: "studentId or rfidCardUID required" });

    const student = studentId
      ? await User.findById(studentId)
      : await User.findOne({ rfidCardUID: String(rfidCardUID).toUpperCase() });

    if (!student) return res.status(404).json({ message: "Student not found" });

    const logs = await RFIDLog.find({ student: student._id })
      .populate("bus", "busNumber busNumberPlate")
      .populate("trip", "startTime endTime status")
      .sort({ createdAt: -1 });

    return res.status(200).json({ student: { id: student._id, name: student.name }, logs });
  } catch (error: any) {
    console.error("RFID STUDENT LOGS ERROR:", error);
    return res.status(500).json({ message: "Failed to fetch student RFID logs", error: error.message });
  }
};

/**
 * Get detailed bus info including last RFID events
 */
export const getBusRfidLogs = async (req: Request, res: Response) => {
  try {
    const { busId } = req.params;
    if (!busId) return res.status(400).json({ message: "busId required" });

    const bus = await Bus.findById(busId);
    if (!bus) return res.status(404).json({ message: "Bus not found" });

    const logs = await RFIDLog.find({ bus: bus._id })
      .populate("student", "name rfidCardUID")
      .populate("trip", "startTime endTime status")
      .sort({ createdAt: -1 });

    return res.status(200).json({ bus: { id: bus._id, busNumber: bus.busNumber }, logs });
  } catch (error: any) {
    console.error("RFID BUS LOGS ERROR:", error);
    return res.status(500).json({ message: "Failed to fetch bus RFID logs", error: error.message });
  }
};
