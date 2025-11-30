const P = require('pino')();
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { saveAllSessionsToDB, restoreSessionsFromDB, SESS_DIR } = require('./sessionSync');
const { createOrder } = require('./services/orders');

async function startWhatsApp(onMessageCallback) {
  await restoreSessionsFromDB();
  if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(SESS_DIR);
  async function persistSessions() {
    try { await saveAllSessionsToDB(); } catch (err) { P().error({ err }, 'persistSessions failed'); }
  }
  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    auth: state,
    printQRInTerminal: true,
  });
  sock.ev.on('creds.update', async () => {
    try { await saveCreds(); await persistSessions(); } catch (err) { P().error(err, 'creds.update handler error'); }
  });
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      try {
        const qrFile = path.resolve(__dirname, '..', 'public', 'latest_qr.txt');
        if (!fs.existsSync(path.dirname(qrFile))) fs.mkdirSync(path.dirname(qrFile), { recursive: true });
        fs.writeFileSync(qrFile, qr, 'utf8');
        const pngFile = path.resolve(__dirname, '..', 'public', 'latest_qr.png');
        await qrcode.toFile(pngFile, qr);
        console.log('QR written to public/latest_qr.txt and .png');
      } catch (e) { console.error('Failed to write QR', e); }
    }
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      console.log('connection closed. reconnect?', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(async () => { try { await startWhatsApp(onMessageCallback); } catch (e) { console.error('reconnect failed', e); } }, 3000);
      } else { console.log('Logged out. Need to re-scan QR.'); }
    } else if (connection === 'open') { console.log('WhatsApp connection open'); }
  });
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message) return;
      const from = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message?.extendedTextMessage?.text || '';
      // quick auto-order: if user sends a numeric budget and stage not set -> create order
      const phone = from.split('@')[0];
      if (/^\d+$/.test(text.trim())) {
        try {
          const amount = parseInt(text.trim(),10);
          const ord = await createOrder(phone, amount);
          await onMessageCallback({ from, text: `Order created for ${amount} PKR. Admin will verify payment.`, raw: msg, sock });
        } catch(e){ console.error('order create failed', e); }
        return;
      }
      await onMessageCallback({ from, text, raw: msg, sock });
    } catch (err) { console.error('message handler error', err); }
  });
  const saver = setInterval(() => persistSessions().catch(()=>{}), 60_000);
  sock._stopSessionSaver = () => clearInterval(saver);
  return sock;
}
module.exports = { startWhatsApp };
