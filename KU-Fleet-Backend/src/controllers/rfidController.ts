import { Request, Response } from "express";
import User from "../models/User.model";
import Bus from "../models/Bus.model";
import RFIDLog from "../models/RFIDLog.model";
import TripLog from "../models/TripLog.model";
import { determineRfidEvent } from "../utils/rfid.utils";

export const handleRfidScan = async (req: Request, res: Response) => {
  try {
    const { rfidTag, busId } = req.body;

    // 1️⃣ Validate input
    if (!rfidTag || !busId) {
      return res.status(400).json({ message: "rfidTag and busId required" });
    }

    // 2️⃣ Normalize RFID UID: remove spaces, convert to uppercase
    const normalizedUID = rfidTag.replace(/\s+/g, "").toUpperCase();

    // 3️⃣ Validate bus
    const bus = await Bus.findById(busId);
    if (!bus) {
      return res.status(404).json({ message: "Bus not found" });
    }

    // 4️⃣ Find active student by RFID
    const student = await User.findOne({
      rfidCardUID: normalizedUID,
      role: "student",
      status: "active",
    });

    if (!student) {
      return res.status(404).json({ message: "Invalid RFID card" });
    }

    // 5️⃣ Determine BOARD / EXIT event
    const eventType = await determineRfidEvent(
      String(student._id),
      String(bus._id)
    );

    // 6️⃣ Find active trip (optional but recommended)
    const activeTrip = await TripLog.findOne({
      bus: bus._id,
      status: "active",
    });

    // 7️⃣ Save RFID log
    const log = await RFIDLog.create({
      rfidTag: normalizedUID,
      student: student._id,
      bus: bus._id,
      eventType,
      trip: activeTrip?._id,
    });

    // 8️⃣ Emit socket event for frontend/UI updates
    const io = req.app.get("io");
    io?.emit("rfid:event", {
      studentId: student._id,
      studentName: student.name,
      busId: bus._id,
      eventType,
      time: log.timestamp,
    });

    // 9️⃣ Respond success
    return res.status(200).json({
      message: "RFID processed",
      eventType,
      student: student.name,
      rfidTag: normalizedUID, // return normalized UID for clarity
    });
  } catch (error) {
    console.error("RFID ERROR:", error);
    return res.status(500).json({ message: "RFID scan failed" });
  }
};
