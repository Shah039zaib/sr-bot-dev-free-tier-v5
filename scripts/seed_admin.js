require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const argv = require('minimist')(process.argv.slice(2));
const username = argv.username || 'admin';
const password = argv.password || 'Admin123';
async function run() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO admins (username, password_hash, name) VALUES ($1,$2,$3) ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash', [username, hash, 'Admin']);
    console.log('Admin seeded:', username);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
run();
