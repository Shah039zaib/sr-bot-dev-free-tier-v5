import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import { startWhatsApp } from "./whatsapp.js";

const app = express();

app.use(bodyParser.json());
app.use("/public", express.static(path.join(process.cwd(), "public")));

app.get("/", (req, res) => {
  res.send("SR BOT — Running Successfully!");
});

app.get("/qr", (req, res) => {
  const png = path.join(process.cwd(), "public/latest_qr.png");
  if (!fs.existsSync(png)) return res.json({ qr: null });
  res.sendFile(png);
});

function onIncomingMessage({ from, text, sock }) {
  console.log("Incoming:", from, text);
  sock.sendMessage(from, { text: "Received: " + text });
}

startWhatsApp(onIncomingMessage);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
