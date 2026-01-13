import RFIDLog from "../models/RFIDLog.model";

export async function determineRfidEvent(
  studentId: string,
  busId: string
): Promise<"BOARD" | "EXIT"> {

  // 1️⃣ Find last RFID log for this student on this bus
  const lastLog = await RFIDLog.findOne({
    student: studentId,
    bus: busId,
  }).sort({ createdAt: -1 }); // latest first

  // 2️⃣ If no log or last was EXIT → BOARD, else EXIT
  if (!lastLog || lastLog.eventType === "EXIT") {
    return "BOARD";
  }

  return "EXIT";
}
