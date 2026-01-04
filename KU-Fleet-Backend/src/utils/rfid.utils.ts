import RFIDLog from "../models/RFIDLog.model";

export const determineRfidEvent = async (
  studentId: string,
  busId: string
): Promise<"BOARD" | "EXIT"> => {
  const lastLog = await RFIDLog.findOne({
    student: studentId,
    bus: busId,
  }).sort({ timestamp: -1 });

  if (!lastLog) return "BOARD";

  return lastLog.eventType === "BOARD" ? "EXIT" : "BOARD";
};
