const fs = require("fs");
const path = require("path");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");

async function startWhatsApp(onMessage) {
  try {
    // AUTH DIRECTORY (Render-safe)
    const authDir = path.join(__dirname, "..", "whatsapp_auth");
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir);

    // MULTI AUTH
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // SOCKET INSTANCE
    const sock = makeWASocket({
      printQRInTerminal: false,
      browser: ["Chrome", "Desktop", "125"],
      auth: state,
      logger: pino({ level: "silent" }) // FIXED
    });

    // AUTO SAVE CREDS
    sock.ev.on("creds.update", async () => {
      await saveCreds();
    });

    // QR SAVE FOR PANEL
    sock.ev.on("connection.update", (update) => {
      const { qr, connection, lastDisconnect } = update;

      // SAVE QR TO PUBLIC FOLDER
      if (qr) {
        const qrPath = path.join(__dirname, "..", "public", "latest_qr.txt");
        fs.writeFileSync(qrPath, qr);
        console.log("New QR generated");
      }

      // HANDLE LOGOUT
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (statusCode === DisconnectReason.loggedOut) {
          console.log("Session invalid → resetting session…");
          fs.rmSync(authDir, { recursive: true, force: true });
        }

        console.log("Reconnecting WhatsApp…");
        setTimeout(() => startWhatsApp(onMessage), 2000);
      }

      if (connection === "open") {
        console.log("WhatsApp connected successfully!");
      }
    });

    // MESSAGE HANDLER
    sock.ev.on("messages.upsert", async (msg) => {
      const m = msg.messages[0];
      if (!m || !m.message) return;
      if (m.key.fromMe) return;

      const from = m.key.remoteJid;
      const text =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        "";

      await onMessage({ from, text, raw: m, sock });
    });

    return sock;
  } catch (err) {
    console.error("WhatsApp startup failed:", err);
    throw err;
  }
}

module.exports = { startWhatsApp };
