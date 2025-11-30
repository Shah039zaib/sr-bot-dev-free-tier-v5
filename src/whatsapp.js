const fs = require('fs');
const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require('pino')();
const { saveSessionToDB, restoreSessionsFromDB } = require("./sessionSync");

async function startWhatsApp(onMessage) {
  try {

    // restore sessions from DB
    const restored = await restoreSessionsFromDB();

    const authDir = path.join(__dirname, "..", "sessions");

    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir);

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      printQRInTerminal: false,
      auth: state,
      browser: ["Chrome", "Desktop", "125"],
      logger: pino({ level: "silent" })
    });

    sock.ev.on("creds.update", async () => {
      await saveCreds();
      await saveSessionToDB(authDir);
    });

    sock.ev.on("messages.upsert", async (msg) => {
      const m = msg.messages[0];
      if (!m.message) return;
      if (m.key.fromMe) return;
      const from = m.key.remoteJid;
      const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
      await onMessage({ from, text, raw: m, sock });
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        if (reason === DisconnectReason.loggedOut) {
          pino.error("WhatsApp logged out. Clearing sessions.");
          fs.rmSync(authDir, { recursive: true, force: true });
        }
        pino.error("Connection closed. Reconnecting…");
        setTimeout(() => startWhatsApp(onMessage), 2000);
      } else if (connection === "open") {
        pino.info("WhatsApp connected");
      }
    });

    return sock;

  } catch (err) {
    console.error("WhatsApp startup failed:", err);
    throw err;
  }
}

module.exports = { startWhatsApp };
