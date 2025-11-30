STEP-BY-STEP DEPLOYMENT (SHORT)
1. Create Neon Postgres and copy NEON_DATABASE_URL.
2. Set env vars (.env or Render secrets):
   - NEON_DATABASE_URL, ADMIN_JWT_SECRET, UPTIME_SECRET, PAYMENT_NUMBER, PAYMENT_NAME
3. Run migrations:
   NODE_ENV=production NEON_DATABASE_URL="<url>" node scripts/run_migrations.js
4. Seed admin:
   NEON_DATABASE_URL="<url>" node scripts/seed_admin.js --username admin --password Admin123
5. Push repo to GitHub -> Connect to Render -> Deploy (npm install, npm start).
6. Scan QR: visit /qr or check Render logs; configure UptimeRobot to ping /health/<UPTIME_SECRET>.
