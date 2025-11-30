// src/admin-init.js
const bcrypt = require('bcrypt');
const { query } = require('./db');

(async () => {
  try {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const name = 'Super Admin';
    const hash = await bcrypt.hash(password, 10);
    await query(
      'INSERT INTO admins (username, password_hash, name) VALUES ($1,$2,$3) ON CONFLICT (username) DO NOTHING',
      [username, hash, name]
    );
    console.log('✅ Admin created:', { username, password });
    process.exit(0);
  } catch (err) {
    console.error('admin-init error', err);
    process.exit(1);
  }
})();
