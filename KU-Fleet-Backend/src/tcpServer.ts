import net from "net";
import { getIO } from "./socket";

// Mocked GT06 parser (replace later with your working one)
function parseGt06Packet(data: Buffer) {
  try {
    // Simulate parsed data
    return {
      imei: "352312094917773",
      lat: 24.946,
      lng: 67.005,
      speed: 40,
      timestamp: new Date(),
    };
  } catch {
    return null;
  }
}

export async function startTcpServer(port: number) {
  const server = net.createServer((socket) => {
    console.log("📶 Tracker connected:", socket.remoteAddress);

    socket.on("data", (data) => {
      const parsed = parseGt06Packet(data);
      if (parsed) {
        console.log("📍 Parsed GPS:", parsed);
        const io = getIO();
        // Emit to both rooms for now (admins get extra data later)
        io.to("admin").emit("busLocationUpdate", parsed);
        io.to("student").emit("busLocationUpdate", parsed);
      }
    });

    socket.on("close", () => {
      console.log("📴 Tracker disconnected");
    });

    socket.on("error", (err) => {
      console.error("⚠️ TCP Error:", err.message);
    });
  });

  return new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`🚦 TCP Server running on port ${port}`);
      resolve();
    });
  });
}
