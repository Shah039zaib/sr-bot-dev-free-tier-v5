const fs = require('fs');
const path = require('path');
const { query } = require('./db');
const pino = require('pino');
const logger = pino();
const SESS_DIR = path.resolve(__dirname, '..', 'sessions');
async function saveAllSessionsToDB() {
  if (!fs.existsSync(SESS_DIR)) return;
  const files = fs.readdirSync(SESS_DIR);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const full = path.join(SESS_DIR, f);
    try {
      const raw = fs.readFileSync(full, 'utf8');
      const data = JSON.parse(raw);
      await query(
        `INSERT INTO sessions (name, data, updated_at) VALUES ($1,$2,now())
         ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [f, data]
      );
      logger.info({ file: f }, 'saved session to DB');
    } catch (err) {
      logger.error({ err, file: f }, 'failed saving session to DB');
    }
  }
}
async function restoreSessionsFromDB() {
  const res = await query('SELECT name, data FROM sessions');
  if (res.rowCount === 0) return;
  if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR, { recursive: true });
  for (const row of res.rows) {
    const full = path.join(SESS_DIR, row.name);
    try {
      fs.writeFileSync(full, JSON.stringify(row.data, null, 2), 'utf8');
      logger.info({ file: row.name }, 'restored session from DB');
    } catch (err) {
      logger.error({ err, file: row.name }, 'failed restoring session from DB');
    }
  }
}
module.exports = { saveAllSessionsToDB, restoreSessionsFromDB, SESS_DIR };
