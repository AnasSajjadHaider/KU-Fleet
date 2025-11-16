import { Server } from "socket.io";

export const socketHandler = (io: Server) => {
  io.on("connection", (socket) => {
    console.log(`🧠 Client connected: ${socket.id}`);

    socket.on("joinRoom", (role: string) => {
      if (role === "admin") socket.join("admins");
      if (role === "student") socket.join("students");
      console.log(`👥 ${socket.id} joined ${role} room`);
    });

    socket.on("disconnect", () => {
      console.log(`❌ Socket ${socket.id} disconnected`);
    });
  });
};
