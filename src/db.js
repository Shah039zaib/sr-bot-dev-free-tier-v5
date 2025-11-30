// src/db.js
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // set env
  // for neon? ensure ssl on, depending on provider
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // optional console log
  // console.log('Executed query', { text, duration });
  return res;
}

module.exports = { query, pool };
