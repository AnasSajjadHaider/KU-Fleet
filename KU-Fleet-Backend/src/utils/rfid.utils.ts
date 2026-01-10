import RFIDLog from "../models/RFIDLog.model";
import TripLogModel from "../models/TripLog.model";

export async function determineRfidEvent(
  studentId: string,
  busId: string
): Promise<"BOARD" | "EXIT"> {

  // 1️⃣ Find active trip
  const activeTrip = await TripLogModel.findOne({
    bus: busId,
    endTime: null,
  }).lean();

  // If no active trip → always BOARD
  if (!activeTrip) return "BOARD";

  // 2️⃣ Find last RFID event for this student in this trip
  const lastLog = await RFIDLog.findOne({
    student: studentId,
    trip: activeTrip._id,
  }).sort({ timestamp: -1 });

  // 3️⃣ Decide safely
  if (!lastLog || lastLog.eventType === "EXIT") {
    return "BOARD";
  }

  return "EXIT";
}
