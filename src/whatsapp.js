const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino"); // ensure used as function when creating logger below

const logger = pino({ level: "silent" });

/*
  startWhatsApp(onMessage)
  - onMessage({ from, text, raw, sock })
*/
async function startWhatsApp(onMessage) {
  // exponential reconnect backoff state (keeps inside this module)
  if (!startWhatsApp._backoff) startWhatsApp._backoff = 2000;

  try {
    const authDir = path.join(__dirname, "..", "whatsapp_auth");
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    // multi-file auth state
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      printQRInTerminal: false,
      auth: state,
      logger,
      browser: ["Chrome", "Desktop", "1.0"]
    });

    // save creds when updated
    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        console.log("Creds updated & saved.");
      } catch (e) {
        console.error("Failed saving creds:", e);
      }
    });

    // connection updates (QR, open, close)
    sock.ev.on("connection.update", async (update) => {
      try {
        const { connection, lastDisconnect, qr } = update;

        // QR received -> save txt + png (for easy mobile scan)
        if (qr) {
          try {
            const txtPath = path.join(__dirname, "..", "public", "latest_qr.txt");
            const pngPath = path.join(__dirname, "..", "public", "latest_qr.png");
            fs.writeFileSync(txtPath, qr, "utf8");
            // generate PNG file (synchronous-ish via Promise)
            await qrcode.toFile(pngPath, qr, { width: 400 });
            console.log("QR generated & saved to public/latest_qr.*");
          } catch (e) {
            console.error("Failed to write QR files:", e);
          }
        }

        // handle close / logout
        if (connection === "close") {
          const reasonCode = lastDisconnect?.error?.output?.statusCode;
          console.log("Connection closed, reason code:", reasonCode);

          // if logged out -> clear auth folder and QR so new QR appears
          if (reasonCode === DisconnectReason.loggedOut) {
            console.log("WhatsApp logged out — clearing session and QR.");
            try {
              fs.rmSync(authDir, { recursive: true, force: true });
            } catch (e) {}
            // remove QR files
            try { fs.unlinkSync(path.join(__dirname, "..", "public", "latest_qr.txt")); } catch(e){}
            try { fs.unlinkSync(path.join(__dirname, "..", "public", "latest_qr.png")); } catch(e){}
            // reset local backoff so fresh connect tries quickly
            startWhatsApp._backoff = 2000;
          }

          // schedule reconnect with backoff
          const delay = Math.min(startWhatsApp._backoff, 60_000);
          console.log(`Reconnecting WhatsApp in ${delay} ms`);
          setTimeout(() => {
            startWhatsApp(onMessage).catch(err => console.error("Reconnect failed:", err));
          }, delay);
          // increase backoff for next time
          startWhatsApp._backoff = Math.min(startWhatsApp._backoff * 1.8, 60_000);
        }

        // on successful open -> remove QR files and reset backoff
        if (connection === "open") {
          console.log("WhatsApp connected!");
          try { fs.unlinkSync(path.join(__dirname, "..", "public", "latest_qr.txt")); } catch (e) {}
          try { fs.unlinkSync(path.join(__dirname, "..", "public", "latest_qr.png")); } catch (e) {}
          startWhatsApp._backoff = 2000;
        }
      } catch (err) {
        console.error("connection.update handler error:", err);
      }
    });

    // incoming messages
    sock.ev.on("messages.upsert", async (m) => {
      try {
        const msg = m.messages && m.messages[0];
        if (!msg) return;
        if (msg.key && msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        // call provided callback
        await onMessage({ from, text, raw: msg, sock });
      } catch (e) {
        console.error("messages.upsert handler error:", e);
      }
    });

    return sock;
  } catch (err) {
    console.error("WhatsApp startup failed:", err);
    // try reconnect with backoff
    const delay = startWhatsApp._backoff || 2000;
    console.log(`Startup failure — retrying in ${delay} ms`);
    setTimeout(() => {
      startWhatsApp(onMessage).catch(e => console.error("retry startWhatsApp error:", e));
    }, delay);
    // escalate error so caller knows (startup path may catch and exit)
    throw err;
  }
}

module.exports = { startWhatsApp };
