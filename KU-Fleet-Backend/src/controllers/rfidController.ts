import { Request, Response } from "express";
import User from "../models/User.model";
import Bus from "../models/Bus.model";
import RFIDLog from "../models/RFIDLog.model";
import TripLog from "../models/TripLog.model";
import { determineRfidEvent } from "../utils/rfid.utils";

export const handleRfidScan = async (req: Request, res: Response) => {
  try {
    const { rfidTag, busId } = req.body;

    if (!rfidTag || !busId) {
      return res.status(400).json({ message: "rfidTag and busId required" });
    }

    // 1️⃣ Validate bus
    const bus = await Bus.findById(busId);
    if (!bus) {
      return res.status(404).json({ message: "Bus not found" });
    }

    // 2️⃣ Find student by RFID
    const student = await User.findOne({
      rfidCardUID: rfidTag,
      role: "student",
      status: "active",
    });

    if (!student) {
      return res.status(404).json({ message: "Invalid RFID card" });
    }

    // 3️⃣ Determine BOARD / EXIT
    const eventType = await determineRfidEvent(
      String(student._id),
      String(bus._id)
    );

    // 4️⃣ Find active trip (optional but recommended)
    const activeTrip = await TripLog.findOne({
      bus: bus._id,
      status: "active",
    });

    // 5️⃣ Save RFID log
    const log = await RFIDLog.create({
      rfidTag,
      student: student._id,
      bus: bus._id,
      eventType,
      trip: activeTrip?._id,
    });

    // 6️⃣ Emit socket event (UI only)
    const io = req.app.get("io");
    io?.emit("rfid:event", {
      studentId: student._id,
      studentName: student.name,
      busId: bus._id,
      eventType,
      time: log.timestamp,
    });

    return res.status(200).json({
      message: "RFID processed",
      eventType,
      student: student.name,
    });
  } catch (error) {
    console.error("RFID ERROR:", error);
    return res.status(500).json({ message: "RFID scan failed" });
  }
};
