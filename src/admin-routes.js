
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('./db');
const { setOrderPaid } = require('./services/orders');
const notifier = require('./services/notifier');

const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || 'change_admin_jwt_secret';

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'unauthorized' });
  const token = m[1];
  try {
    const payload = jwt.verify(token, ADMIN_SECRET);
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const r = await query('SELECT id, password_hash, name FROM admins WHERE username=$1', [username]);
    if (r.rowCount === 0) return res.status(401).json({ error: 'invalid credentials' });
    const row = r.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = jwt.sign({ id: row.id, username, name: row.name }, ADMIN_SECRET, { expiresIn: '12h' });
    res.json({ token });
  } catch (err) {
    console.error('admin login error', err);
    res.status(500).json({ error: 'server error' });
  }
});

router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT id, user_phone, amount, status, payment_ref, created_at FROM orders ORDER BY created_at DESC LIMIT 200');
    res.json({ orders: r.rows });
  } catch (err) {
    console.error('orders list error', err);
    res.status(500).json({ error: 'server error' });
  }
});

router.post('/orders/:id/confirm', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const payment_ref = req.body.payment_ref || null;
  if (!id) return res.status(400).json({ error: 'invalid id' });
  try {
    await setOrderPaid(id, payment_ref);
    // notify user if phone exists
    const r = await query('SELECT user_phone FROM orders WHERE id=$1', [id]);
    if (r.rowCount > 0) {
      const phone = r.rows[0].user_phone;
      try { await notifier.notifyUser(phone, `Aapka order #${id} verify hoj chuka hai. Shukriya.`); } catch(e){}
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('confirm order error', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
