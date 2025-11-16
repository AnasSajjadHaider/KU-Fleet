import { Server } from "socket.io";
import http from "http";

let io: Server;

// ⚡ Initialize Socket.IO with Express server
export function initSocket(server: http.Server) {
  io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    console.log(`🟢 Socket connected: ${socket.id}`);

    // Admins and Students join different rooms
    socket.on("joinRoom", (role: "admin" | "student") => {
      socket.join(role);
      console.log(`📡 ${socket.id} joined ${role} room`);
    });

    socket.on("disconnect", () => {
      console.log(`🔴 Socket disconnected: ${socket.id}`);
    });
  });

  console.log("✅ Socket.IO initialized");
  return io;
}

// For other modules (e.g., TCP server) to emit messages
export function getIO() {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}
