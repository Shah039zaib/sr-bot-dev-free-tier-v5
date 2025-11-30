// src/sessionSync.js
const { query } = require('./db');

async function restoreSessionsFromDB() {
  try {
    const res = await query('SELECT name, data FROM sessions');
    if (res.rowCount === 0) return {};
    const sessions = {};
    res.rows.forEach(r => { sessions[r.name] = r.data; });
    return sessions;
  } catch (err) {
    console.error('restoreSessionsFromDB error', err);
    return {};
  }
}

module.exports = { restoreSessionsFromDB };
