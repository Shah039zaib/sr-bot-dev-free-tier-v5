// src/whatsapp.js (FINAL ESM VERSION — No 405)
import fs from "fs";
import path from "path";
import qrcode from "qrcode";
import makeWASocket, {
  useMultiFileAuthState,
  Browsers,
  DisconnectReason
} from "baileys";

let sock;

export async function startWhatsApp(onMessage) {
  const authDir = path.join(process.cwd(), "whatsapp_auth");
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  sock = makeWASocket({
    printQRInTerminal: true,
    browser: Browsers.macOS("Safari"),
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const png = path.join(process.cwd(), "public/latest_qr.png");
      await qrcode.toFile(png, qr);
      console.log("QR Saved");
    }

    if (connection === "open") {
      console.log("WhatsApp Connected");
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("WA closed:", reason);

      if (reason === DisconnectReason.loggedOut) {
        fs.rmSync(authDir, { recursive: true, force: true });
      }

      setTimeout(() => startWhatsApp(onMessage), 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const text =
      msg.message.conversation ??
      msg.message.extendedTextMessage?.text ??
      "";

    const from = msg.key.remoteJid;

    onMessage({ from, text, sock });
  });

  return sock;
}
