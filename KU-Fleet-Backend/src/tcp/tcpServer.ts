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
      console.log("📦 RAW BUFFER (HEX):", data.toString("hex"));
      console.log("📨 RAW STRING (utf8):", data.toString());
      console.log("📏 Packet Length:", data.length);
      console.log("======================================================\n");

      let parsedByGt06 = true;

      // 🧠 Attempt GT06 parse (classic protocol)
      try {
        gt06.parse(data);
      } catch (e: any) {
        parsedByGt06 = false;

        console.error("❌ GT06 parse error (likely extended/vendor protocol):", {
          error: e?.message ?? e,
          rawHex: data.toString("hex"),
          length: data.length,
          time: new Date().toISOString(),
        });
      }

      // 📤 Respond to classic GT06 if required
      if (parsedByGt06 && gt06.expectsResponse && gt06.responseMsg) {
        console.log(
          "📤 Sending GT06 response (HEX):",
          Buffer.from(gt06.responseMsg).toString("hex")
        );
        client.write(gt06.responseMsg);
      }

      // 🧩 Handle classic parsed messages
      if (parsedByGt06 && gt06.msgBuffer?.length) {
        console.log(`📨 Parsed Messages Count: ${gt06.msgBuffer.length}`);

        for (const msg of gt06.msgBuffer as any[]) {
          console.log("\n------------- PARSED GT06 MESSAGE ----------------");
          console.dir(msg, { depth: null });

          if (msg?.imei) {
            console.log("🆔 IMEI:", msg.imei);
          }

          try {
            await handleParsedMessage(msg);
          } catch (err) {
            console.error("❌ Error handling parsed GT06 message:", err);
          }

          console.log("--------------------------------------------------\n");
        }

        gt06.clearMsgBuffer();
        return;
      }

      // 🔥 Handle EXTENDED / UNKNOWN packets (e.g. protocol 34)
      if (!parsedByGt06) {
        const extendedPayload = {
          protocol: "GT06_EXTENDED",
          rawHex: data.toString("hex"),
          rawBuffer: data,
          length: data.length,
          remoteAddress: client.remoteAddress,
          receivedAt: Date.now(),
        };

        console.log("🧩 Handling GT06 EXTENDED / VENDOR packet");
        console.dir(extendedPayload, { depth: null });

        try {
          await handleParsedMessage(extendedPayload);
        } catch (err) {
          console.error("❌ Error handling extended GT06 packet:", err);
        }
      }
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
