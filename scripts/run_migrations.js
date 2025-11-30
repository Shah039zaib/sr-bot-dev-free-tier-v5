require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
async function run() {
  const sql = fs.readFileSync('./sql/neon_schema.sql', 'utf8');
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
  try {
    await pool.query(sql);
    console.log('Migrations executed.');
  } catch (err) {
    console.error('Migrations failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
run();
