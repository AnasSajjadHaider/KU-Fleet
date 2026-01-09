// src/core/server.ts
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
// Workers are imported in app.ts - no need to import here
import { app } from "./app";
import { startTcpServer } from "./tcp/tcpServer";
import { setSocketIO, ROOMS, EVENTS } from "./utils/socketHelper";
import { getValidMtxToken } from "./utils/getValidMtxToken";

dotenv.config();

const HTTP_PORT = Number(process.env.PORT) || 3000;
const TCP_PORT = Number(process.env.TCP_PORT || 5050);

async function start() {
  await connectDB();
  
  // 🔐 Initialize MTX token immediately on startup
  try {
    await getValidMtxToken();
    console.log("✅ MTX token initialized");
  } catch (e) {
    console.error("❌ MTX token init failed", e);
  }

  // 🔁 Keep MTX token alive (every hour)
  setInterval(async () => {
    try {
      await getValidMtxToken();
      console.log("🔁 MTX token refreshed");
    } catch (e) {
      console.error("❌ MTX keep-alive failed", e);
    }
  }, 60 * 60 * 1000); // every 1 hour

  // Create HTTP server from Express app
  const server = http.createServer(app);

  // Initialize Socket.IO
  const io = new SocketIOServer(server, {
    cors: { origin: "*" }, // restrict in production 
  });

  // Set Socket.IO in centralized helper
  setSocketIO(io);
  
  // Also expose via app for backward compatibility
  (app as any).set("io", io);

  // Basic room join handlers (admins/students + per-bus)
  io.on("connection", (socket) => {
    console.log("🧠 Socket connected:", socket.id);

    socket.on("joinRoom", (data: string | { role?: string; busId?: string; imei?: string }) => {
      // Support both string (legacy) and object format
      if (typeof data === "string") {
        const role = data;
        if (role === "admin" || role === "admins") socket.join(ROOMS.ADMINS);
        if (role === "student" || role === "students") socket.join(ROOMS.STUDENTS);
        if (role.startsWith("bus:")) socket.join(role);
        if (role.startsWith("imei:")) socket.join(role);
        console.log(`👥 ${socket.id} joined ${role}`);
      } else {
        // Object format for better type safety
        if (data.role === "admin" || data.role === "admins") socket.join(ROOMS.ADMINS);
        if (data.role === "student" || data.role === "students") socket.join(ROOMS.STUDENTS);
        if (data.busId) socket.join(ROOMS.bus(data.busId));
        if (data.imei) socket.join(ROOMS.imei(data.imei));
        console.log(`👥 ${socket.id} joined rooms:`, data);
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected:", socket.id);
    });
  });

  // Start HTTP server
  server.listen(HTTP_PORT, () => {
    console.log(`🚀 HTTP + Socket.IO running on port ${HTTP_PORT}`);
  });

  // Start TCP server which will use app.get('io') to emit messages
  await startTcpServer(TCP_PORT);

  console.log(`✅ TCP Server started on port ${TCP_PORT}`);
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
