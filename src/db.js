require('dotenv').config();
const { Pool } = require('pg');
const pino = require('pino');
const logger = pino();
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
pool.on('error', (err) => { logger.error({ err }, 'Unexpected Postgres error'); });
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    logger.info({ text, duration: Date.now() - start }, 'db query');
    return res;
  } catch (err) {
    logger.error({ err, text }, 'db query failed');
    throw err;
  }
}
module.exports = { pool, query };
