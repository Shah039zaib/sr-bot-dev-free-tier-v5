// src/middleware/rateLimiter.js
const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 15 * 1000, // 15 seconds
  max: 50,
  standardHeaders: true,
  legacyHeaders: false
});
