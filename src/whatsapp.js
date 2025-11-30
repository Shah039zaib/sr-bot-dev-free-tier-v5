/* src/whatsapp.js — FINAL STABLE VERSION */

const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const pino = require("pino");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const logger = pino({ level: "silent" });

const AUTH_DIR = path.join(__dirname, "..", "auth_info");
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const QR_TXT = path.join(PUBLIC_DIR, "latest_qr.txt");
const QR_PNG = path.join(PUBLIC_DIR, "latest_qr.png");

// Ensure folders exist
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

let sock = null;
let reconnecting = false;

async function startWhatsApp(onMessage) {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

        sock = makeWASocket({
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: Browsers.macOS("Desktop"), // safest browser
            syncFullHistory: false
        });

        // Save updated creds
        sock.ev.on("creds.update", saveCreds);

        // Connection update handler
        sock.ev.on("connection.update", async (update) => {
            const { connection, qr, lastDisconnect } = update;

            if (qr) {
                fs.writeFileSync(QR_TXT, qr);
                try {
                    await QRCode.toFile(QR_PNG, qr);
                } catch (e) {
                    console.log("QR PNG failed:", e);
                }
                console.log("📲 New QR generated");
            }

            if (connection === "open") {
                console.log("✅ WhatsApp Connected");
            }

            if (connection === "close") {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log("❌ WA Closed:", reason);

                // Logged-out → clear session + restart
                if (reason === DisconnectReason.loggedOut || reason === 401) {
                    console.log("⚠ Session expired. Resetting...");
                    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                    return startWhatsApp(onMessage);
                }

                // Render sleep fix — Prevent repeat loops
                if (!reconnecting) {
                    reconnecting = true;
                    console.log("🔁 Reconnecting in 4 seconds…");
                    setTimeout(() => {
                        reconnecting = false;
                        startWhatsApp(onMessage);
                    }, 4000);
                }
            }
        });

        // Handle incoming messages
        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg?.message) return;

            const from = msg.key.remoteJid;
            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message?.templateButtonReplyMessage?.selectedDisplayText ||
                "";

            try {
                await onMessage({ from, text, raw: msg, sock });
            } catch (e) {
                console.log("❌ onMessage error:", e);
            }
        });

        return sock;
    } catch (err) {
        console.log("WHATSAPP INIT ERROR:", err);
        console.log("Restarting in 5 seconds...");
        setTimeout(() => startWhatsApp(onMessage), 5000);
    }
}

module.exports = { startWhatsApp };
