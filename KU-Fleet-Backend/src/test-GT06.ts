import net from "net";

const client = new net.Socket();

client.connect(5050, "127.0.0.1", () => {
  console.log("📡 Connected to TCP server (simulated GT06)");

  // 1️⃣ Send login packet
  const loginPacket = Buffer.from([
    0x78, 0x78, 0x05, 0x01, 0x00, 0x01, 0xd9, 0xdc, 0x0d, 0x0a
  ]);

  console.log("➡️ Sending LOGIN packet...");
  client.write(loginPacket);

  setTimeout(() => {
    // 2️⃣ Send status packet
    const statusPacket = Buffer.from([
      0x78, 0x78, 0x05, 0x13, 0x00, 0x01, 0xe9, 0xf1, 0x0d, 0x0a
    ]);

    console.log("➡️ Sending STATUS packet...");
    client.write(statusPacket);

  }, 1500);
});

client.on("data", (data) => {
  console.log("⬅️ Server responded:", data);
});

client.on("close", () => {
  console.log("❌ Connection closed");
});
