const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { query } = require("./db");

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// ---------------------- Login Route ----------------------
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await query(
    "SELECT id, password_hash, name FROM admins WHERE username=$1",
    [username]
  );

  if (result.rowCount === 0) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const admin = result.rows[0];
  const match = await bcrypt.compare(password, admin.password_hash);

  if (!match) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: admin.id }, JWT_SECRET, { expiresIn: "1h" });

  res.json({ token, name: admin.name });
});

// ---------------------- Protected check ----------------------
router.get("/me", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ ok: true, user: decoded });
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;
