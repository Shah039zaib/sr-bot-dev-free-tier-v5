require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const pino = require('pino')();
const path = require('path');
const helmet = require('helmet');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const { startWhatsApp } = require('./whatsapp');
const { query } = require('./db');
const { runSalesFlow } = require('./salesFlow');
const adminRoutes = require('./admin-routes');
const paymentRoutes = require('./payment');
const notifier = require('./services/notifier');
const { autoMigrate } = require('./db-init'); // ensure this file exists (provided earlier)

const app = express();
app.use(helmet());
app.use(bodyParser.json());
app.use(rateLimiter);

// static dirs
app.use('/admin-panel', express.static(path.join(__dirname, '..', 'admin-panel')));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const UPTIME_SECRET = process.env.UPTIME_SECRET || 'health_secret';

// health endpoint
app.get(`/health/${UPTIME_SECRET}`, (req, res) => { res.json({ status: 'ok', ts: new Date().toISOString() }); });

// root - small page
app.get('/', (req, res) => {
  res.send('✅ WhatsApp bot running — use /admin-panel or /qr to continue.');
});

// QR endpoint (returns JSON with txt and png path if exists)
app.get('/qr', (req, res) => {
  const txtPath = path.join(__dirname, '..', 'public', 'latest_qr.txt');
  const pngPath = '/public/latest_qr.png';
  const fs = require('fs');
  if (fs.existsSync(txtPath)) {
    const txt = fs.readFileSync(txtPath, 'utf8');
    return res.json({ qr: txt, png: pngPath });
  } else {
    return res.json({ qr: '', png: '' });
  }
});

// mount admin and payment routes
app.use('/admin', adminRoutes);
app.use('/payment', paymentRoutes);

// admin send webhook (keeps same behavior)
app.post('/admin/send', async (req, res) => {
  const { phone, text } = req.body;
  if (!phone || !text) return res.status(400).json({ error: 'phone & text required' });
  await query('INSERT INTO messages (conversation_id, direction, message_text, meta) VALUES ($1,$2,$3,$4)', [null, 'out', text, { admin: true, phone }]);
  res.json({ ok: true });
});

// message callback used by WhatsApp
async function onMessage({ from, text, raw, sock }) {
  try {
    pino.info({ from, text }, 'incoming');
    const phone = from.split('@')[0];
    const convRes = await query('SELECT id, context FROM conversations WHERE user_phone=$1', [phone]);
    let convId;
    let context = {};
    if (convRes.rowCount === 0) {
      const ins = await query('INSERT INTO conversations (user_phone, context) VALUES ($1,$2) RETURNING id, context', [phone, {}]);
      convId = ins.rows[0].id;
    } else {
      convId = convRes.rows[0].id;
      context = convRes.rows[0].context || {};
    }

    await query('INSERT INTO messages (conversation_id, direction, message_text) VALUES ($1,$2,$3)', [convId, 'in', text]);

    // quick paid handling
    if (/^paid$|^done$|ho gaya|complete/i.test(text)) {
      const ord = await query('SELECT id FROM orders WHERE user_phone=$1 AND status=$2 ORDER BY created_at DESC LIMIT 1', [phone, 'pending']);
      if (ord.rowCount > 0) {
        const id = ord.rows[0].id;
        await query('UPDATE orders SET status=$1, updated_at=now() WHERE id=$2', ['awaiting_verification', id]);
      }
      try { await sock.sendMessage(from, { text: 'Shukriya — admin ko notification bhej di gayi hai. Verification ke baad update milega.' }); } catch(e){}
      return;
    }

    const reply = await runSalesFlow({ from: phone, text, context });
    await query('UPDATE conversations SET context = $1, last_activity = now() WHERE id=$2', [reply.context, convId]);

    try {
      await sock.sendMessage(from, { text: reply.text });
      await query('INSERT INTO messages (conversation_id, direction, message_text) VALUES ($1,$2,$3)', [convId, 'out', reply.text]);
    } catch (sendErr) { pino.error({ sendErr }, 'failed to send message'); }
  } catch (err) { pino.error({ err }, 'onMessage top-level error'); }
}

// bootstrap: run auto-migrations then start WhatsApp and server
(async () => {
  try {
    // ensure DB schema exists (db-init.js must export autoMigrate)
    await autoMigrate();

    // start WhatsApp; startWhatsApp will manage reconnects itself
    const sock = await startWhatsApp(onMessage);
    notifier.setSocket(sock);

    app.listen(PORT, () => { console.log(`Server listening on port ${PORT}`); });

    process.on('SIGINT', () => { console.log('SIGINT, exiting'); process.exit(0); });
    process.on('SIGTERM', () => { console.log('SIGTERM, exiting'); process.exit(0); });
  } catch (err) {
    pino.error({ err }, 'startup failed');
    process.exit(1);
  }
})();
