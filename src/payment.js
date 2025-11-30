// lightweight payment route for manual verification flow
const express = require('express');
const router = express.Router();
const { query } = require('./db');

router.post('/create', async (req, res) => {
  const { phone, amount } = req.body;
  if (!phone || !amount) return res.status(400).json({ error: 'phone and amount required' });
  const ins = await query('INSERT INTO orders (user_phone, amount) VALUES ($1,$2) RETURNING *', [phone, amount]);
  res.json(ins.rows[0]);
});

module.exports = router;
