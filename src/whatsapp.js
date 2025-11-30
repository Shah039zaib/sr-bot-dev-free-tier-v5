// src/whatsapp.js
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");

const pino = require("pino"); // import pino factory
const logger = pino({ level: "silent" });

// keep track of single running socket to avoid multiple concurrent restarts
let _currentSock = null;
let _reconnectTimer = null;
let _backoff = 2000; // ms

async function startWhatsApp(onMessage) {
  // If a socket already exists and appears active, return it
  if (_currentSock && !_currentSock.destroyed) return _currentSock;

  try {
    const authDir = path.join(__dirname, "..", "whatsapp_auth");
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      printQRInTerminal: false,
      auth: state,
      logger,
      browser: Browsers.macOS("Safari")
    });

    _currentSock = sock;

    // Save creds on update
    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        console.log("Creds updated & saved.");
      } catch (e) {
        console.error("Failed to save creds:", e);
      }
    });

    // Connection updates: QR generation, open, close, logout handling
    sock.ev.on("connection.update", async (update) => {
      try {
        const { connection, lastDisconnect, qr } = update;

        // QR handling: write txt + PNG into /public for easy scanning
        if (qr) {
          try {
            const txtPath = path.join(__dirname, "..", "public", "latest_qr.txt");
            const pngPath = path.join(__dirname, "..", "public", "latest_qr.png");

            fs.mkdirSync(path.dirname(txtPath), { recursive: true });
            fs.writeFileSync(txtPath, qr, "utf8");

            // write PNG (async) but don't block
            qrcode.toFile(pngPath, qr, { width: 400 })
              .then(() => console.log("QR PNG saved"))
              .catch((err) => console.error("QR PNG write error:", err));
            console.log("QR text saved to public/latest_qr.txt");
          } catch (e) {
            console.error("Failed to write QR files:", e);
          }
        }

        if (connection === "open") {
          console.log("WhatsApp connected!");
          // clear QR files on successful connect
          try { fs.unlinkSync(path.join(__dirname, "..", "public", "latest_qr.txt")); } catch(e){}
          try { fs.unlinkSync(path.join(__dirname, "..", "public", "latest_qr.png")); } catch(e){}
          // reset backoff
          _backoff = 2000;
          if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
        }

        if (connection === "close") {
          const reasonCode = lastDisconnect?.error?.output?.statusCode;
          console.log("Connection closed, reason code:", reasonCode);

          // If logged out, delete auth dir so a fresh QR is generated
          if (reasonCode === DisconnectReason.loggedOut) {
            console.log("Logged out — clearing local auth and QR so fresh QR appears.");
            try { fs.rmSync(authDir, { recursive: true, force: true }); } catch(e){}
            try { fs.unlinkSync(path.join(__dirname, "..", "public", "latest_qr.txt")); } catch(e){}
            try { fs.unlinkSync(path.join(__dirname, "..", "public", "latest_qr.png")); } catch(e){}
            _backoff = 2000;
          }

          // schedule reconnect with exponential backoff (cap 60s)
          const delay = Math.min(_backoff, 60_000);
          console.log(`Reconnecting WhatsApp in ${delay} ms`);
          if (_reconnectTimer) clearTimeout(_reconnectTimer);
          _reconnectTimer = setTimeout(() => {
            _reconnectTimer = null;
            // clear current sock reference to allow new start
            try { _currentSock = null; } catch (e) {}
            startWhatsApp(onMessage).catch(err => console.error("Reconnect error:", err));
          }, delay);
          _backoff = Math.min(Math.floor(_backoff * 1.8), 60_000);
        }
      } catch (err) {
        console.error("connection.update handler error:", err);
      }
    });

    // Message handler
    sock.ev.on("messages.upsert", async (m) => {
      try {
        const msg = m.messages && m.messages[0];
        if (!msg) return;
        if (msg.key && msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

        // call callback
        try { await onMessage({ from, text, raw: msg, sock }); } 
        catch (e) { console.error("onMessage handler error:", e); }
      } catch (e) {
        console.error("messages.upsert handler error:", e);
      }
    });

    return sock;
  } catch (err) {
    console.error("WhatsApp startup failed:", err);
    // retry with backoff
    const delay = Math.min(_backoff, 60_000);
    console.log(`Startup retry in ${delay} ms`);
    setTimeout(() => {
      _backoff = Math.min(Math.floor(_backoff * 1.8), 60_000);
      startWhatsApp(onMessage).catch(e => console.error("retry startWhatsApp error:", e));
    }, delay);
    throw err;
  }
}

module.exports = { startWhatsApp };
