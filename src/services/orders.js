const { query } = require('../db');
async function createOrder(user_phone, amount) {
  const res = await query('INSERT INTO orders (user_phone, amount) VALUES ($1,$2) RETURNING *', [user_phone, amount]);
  return res.rows[0];
}
async function setOrderPaid(id, payment_ref) {
  await query('UPDATE orders SET status=$1, payment_ref=$2, updated_at=now() WHERE id=$3', ['paid', payment_ref, id]);
}
module.exports = { createOrder, setOrderPaid };
