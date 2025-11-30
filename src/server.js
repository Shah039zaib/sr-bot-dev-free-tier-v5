/* src/server.js — FINAL FIXED VERSION */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const bodyParser = require("body-parser");
const rateLimiter = require("./middleware/rateLimiter");
const { startWhatsApp } = require("./whatsapp");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(rateLimiter);

// Serve public QR folder
app.use("/public", express.static(path.join(__dirname, "..", "public")));

// Test route
app.get("/", (req, res) => {
  res.send("🚀 SR BOT FREE TIER — Running Successfully");
});

// Get latest QR
app.get("/qr", (req, res) => {
  const qrPath = path.join(__dirname, "..", "public", "latest_qr.png");
  if (!require("fs").existsSync(qrPath)) {
    return res.json({
      status: false,
      message: "QR not generated yet or already scanned."
    });
  }
  res.sendFile(qrPath);
});

// WhatsApp message handler
async function handleIncoming({ from, text, raw, sock }) {
  console.log("Incoming =>", from, ":", text);

  try {
    await sock.sendMessage(from, { text: `Auto Reply: ${text}` });
  } catch (e) {
    console.log("Send error:", e);
  }
}

// Start WhatsApp
startWhatsApp(handleIncoming);

// Dynamic PORT (Render requirement)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌍 Server running on port ${PORT}`);
});
