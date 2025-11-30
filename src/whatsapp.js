const fs = require('fs');
const path = require('path');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");  // ← FIXED (not pino(), not pino = ...)

const { saveSessionToDB, restoreSessionsFromDB } = require("./sessionSync");

async function startWhatsApp(onMessage) {
  try {
    const authDir = path.join(__dirname, "..", "sessions");
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir);

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      printQRInTerminal: false,
      browser: ["Chrome", "Desktop", "125"],
      auth: state,
      logger: pino({ level: "silent" })  // ← FIXED
    });

    // save creds
    sock.ev.on("creds.update", async () => {
      await saveCreds();
      await saveSessionToDB(authDir);
    });

    // incoming messages
    sock.ev.on("messages.upsert", async (msg) => {
      const m = msg.messages[0];
      if (!m || !m.message) return;
      if (m.key.fromMe) return;

      const from = m.key.remoteJid;
      const text = m.message.conversation || m.message.extendedTextMessage?.text || "";

      await onMessage({ from, text, raw: m, sock });
    });

    // connection
    sock.ev.on("connection.update", async (u) => {
      const { connection, lastDisconnect } = u;

      if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;

        if (reason === DisconnectReason.loggedOut) {
          fs.rmSync(authDir, { recursive: true, force: true });
        }

        console.log("Connection closed, reconnecting…");
        setTimeout(() => startWhatsApp(onMessage), 2000);
      }

      if (connection === "open") console.log("WhatsApp connected!");
    });

    return sock;

  } catch (err) {
    console.error("WhatsApp startup failed:", err);
    throw err;
  }
}

module.exports = { startWhatsApp };
