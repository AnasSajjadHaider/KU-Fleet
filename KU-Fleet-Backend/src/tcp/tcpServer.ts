// src/tcp/tcpServer.ts
import net from "net";
import Gt06 from "gt06";
import { handleParsedMessage } from "../services/gpsHandler";
import { app } from "../app";

export async function startTcpServer(port: number) {
  const server = net.createServer((client) => {
    const gt06 = new Gt06();

    console.log("📡 TCP client connected:", {
      ip: client.remoteAddress,
      port: client.remotePort,
      time: new Date().toISOString(),
    });

    client.on("data", async (data: Buffer) => {
      console.log("\n================= RAW TRACKER PACKET =================");
      console.log("🕒 Time:", new Date().toISOString());
      console.log("📡 From:", client.remoteAddress, client.remotePort);

      // 🔴 RAW DATA (ABSOLUTE TRUTH)
      console.log("📦 RAW BUFFER (HEX):", data.toString("hex"));
      console.log("📨 RAW STRING (utf8):", data.toString());

      console.log("📏 Packet Length:", data.length);
      console.log("======================================================\n");

      // 🧠 Attempt GT06 parse (preserve original logic)
      try {
        gt06.parse(data);
      } catch (e: any) {
        console.log("❌ GT06 parse error:", e?.message ?? e);
        return;
      }

      // 🔁 Log protocol expectations
      console.log("📥 GT06 expects response:", gt06.expectsResponse);

      if (gt06.expectsResponse && gt06.responseMsg) {
        console.log(
          "📤 Sending GT06 response (HEX):",
          Buffer.from(gt06.responseMsg).toString("hex")
        );
        client.write(gt06.responseMsg);
      }

      // 🧩 Parsed messages from GT06
      if (gt06.msgBuffer?.length) {
        console.log(`📨 Parsed Messages Count: ${gt06.msgBuffer.length}`);
      } else {
        console.log("⚠️ No parsed messages in buffer");
      }

      for (const msg of gt06.msgBuffer as any[]) {
        console.log("\n------------- PARSED GT06 MESSAGE ----------------");
        console.log("📄 Parsed Message (RAW OBJECT):");
        console.dir(msg, { depth: null });

        // 🔍 Try extracting IMEI if present
        if (msg?.imei) {
          console.log("🆔 IMEI:", msg.imei);
        }

        try {
          // Original behavior preserved
          await handleParsedMessage(msg);
          console.log(`✅ Message passed to handleParsedMessage for IMEI: ${msg.imei}, Event: ${msg.event?.string}`);

        } catch (err) {
          console.error("❌ Error handling parsed message:", err);
        }
        console.log("--------------------------------------------------\n");
      }

      // clear buffer (preserve original)
      gt06.clearMsgBuffer();
    });

    client.on("end", () => {
      console.log("❌ TCP client disconnected:", {
        ip: client.remoteAddress,
        time: new Date().toISOString(),
      });
    });

    client.on("error", (err) => {
      console.error("⚠️ TCP client error:", {
        ip: client.remoteAddress,
        error: err.message,
      });
    });
  });

  return new Promise<void>((resolve, reject) => {
    server.listen(port, () => {
      console.log(`✅ GT06 TCP server listening on port ${port}`);
      resolve();
    });

    server.on("error", (err) => {
      console.error("❌ TCP server error:", err);
      reject(err);
    });
  });
}
