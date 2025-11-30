/* src/server.js — FINAL PRODUCTION VERSION */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimiter = require("./middleware/rateLimiter");
const { startWhatsApp } = require("./whatsapp");
const adminRoutes = require("./admin-routes");
const bodyParser = require("body-parser");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(rateLimiter);

// Serve public folder for QR
app.use("/public", express.static(path.join(__dirname, "..", "public")));

// Admin panel routes
app.use("/admin", adminRoutes);

// Healthcheck
app.get("/", (req, res) => {
  res.send("🚀 SR BOT DEV FREE TIER — Running Successfully");
});

// QR endpoint
app.get("/qr", (req, res) => {
  try {
    const qrFile = path.join(__dirname, "..", "public", "latest_qr.png");

    if (!require("fs").existsSync(qrFile)) {
      return res.json({
        status: false,
        message: "QR not generated yet or already scanned."
      });
    }

    res.sendFile(qrFile);
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

// WhatsApp message handler
async function handleIncoming({ from, text, raw, sock }) {
  console.log("Incoming:", from, "->", text);

  // Test reply
  try {
    await sock.sendMessage(from, { text: `Auto Reply: ${text}` });
  } catch (e) {
    console.log("Reply error:", e);
  }
}

// Start WhatsApp
startWhatsApp(handleIncoming);

// Dynamic PORT for Render
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
