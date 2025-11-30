// src/server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const pino = require('pino')();
const path = require('path');
const helmet = require('helmet');
const rateLimiter = require('./middleware/rateLimiter'); // ensure exists or comment out
const errorHandler = require('./middleware/errorHandler'); // ensure exists or comment out
const { startWhatsApp } = require('./whatsapp');
const { query } = require('./db');
const { runSalesFlow } = require('./salesFlow'); // ensure exists or adapt
const adminRoutes = require('./admin-routes'); // optional, ensure exist
const paymentRoutes = require('./payment'); // optional, ensure exist
const notifier = require('./services/notifier');
const { autoMigrate } = require('./db-init'); // must exist

const app = express();
app.use(helmet());
app.use(bodyParser.json());
// if you don't have rateLimiter middleware, comment next line
if (rateLimiter) app.use(rateLimiter);

// static
app.use('/admin-panel', express.static(path.join(__dirname, '..', 'admin-panel')));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const UPTIME_SECRET = process.env.UPTIME_SECRET || 'health_secret';

app.get(`/health/${UPTIME_SECRET}`, (req, res) => { res.json({ status: 'ok', ts: new Date().toISOString() }); });

app.get('/', (req, res) => {
  res.send('✅ WhatsApp bot running — use /admin-panel or /qr to continue.');
});

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

// mount optional routes (wrap in try/catch if missing)
try { app.use('/admin', adminRoutes); } catch(e){}
try { app.use('/payment', paymentRoutes); } catch(e){}

app.post('/admin/send', async (req, res) => {
  const { phone, text } = req.body;
  if (!phone || !text) return res.status(400).json({ error: 'phone & text required' });
  await query('INSERT INTO messages (conversation_id, direction, message_text, meta) VALUES ($1,$2,$3,$4)', [null, 'out', text, { admin: true, phone }]);
  res.json({ ok: true });
});

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

(async () => {
  try {
    // create tables if not exist
    await autoMigrate();

    // start whatsapp
    const sock = await startWhatsApp(onMessage);
    // expose socket to notifier service
    try { notifier.setSocket(sock); } catch(e){}

    app.listen(PORT, () => { console.log(`Server listening on port ${PORT}`); });

    process.on('SIGINT', () => { console.log('SIGINT, exiting'); process.exit(0); });
    process.on('SIGTERM', () => { console.log('SIGTERM, exiting'); process.exit(0); });
  } catch (err) {
    pino.error({ err }, 'startup failed');
    process.exit(1);
  }
})();
