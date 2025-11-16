// src/tcp/tcpServer.ts
import net from "net";
import Gt06 from "gt06";
import { handleParsedMessage } from "../services/gpsHandler";
import { app } from "../app";

export async function startTcpServer(port: number) {
  const server = net.createServer((client) => {
    const gt06 = new Gt06();
    console.log("📡 TCP client connected:", client.remoteAddress, client.remotePort);

    client.on("data", async (data: Buffer) => {
      try {
        gt06.parse(data);
      } catch (e: any) {
        console.log("❌ GT06 parse error:", e?.message ?? e);
        return;
      }

      // Preserve original behavior: respond when required
      if (gt06.expectsResponse && gt06.responseMsg) {
        client.write(gt06.responseMsg);
      }

      // Process parsed messages (gt06.msgBuffer)
      for (const msg of gt06.msgBuffer as any[]) {
        try {
          // handleParsedMessage does caching, trips, alerts, socket emits
          await handleParsedMessage(msg);
        } catch (err) {
          console.error("❌ Error handling parsed message:", err);
        }
      }

      // clear buffer (preserve original)
      gt06.clearMsgBuffer();
    });

    client.on("end", () => {
      console.log("❌ TCP client disconnected:", client.remoteAddress);
    });

    client.on("error", (err) => {
      console.error("⚠️ TCP client error:", err);
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
