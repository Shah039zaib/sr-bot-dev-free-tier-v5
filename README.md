SR Bot Dev - Free Tier SaaS (v5) - Final Full SaaS Product

IMPORTANT:
- This repo is a comprehensive, free-tier optimized WhatsApp Sales SaaS.
- It includes backend (Express + Baileys), services, admin panel, migrations, seed script.
- You must set environment variables and run migrations/seed locally or on Render.
- See STEP_BY_STEP.md for deployment instructions.

Quick local test:
  cp .env.example .env
  npm install
  node scripts/run_migrations.js
  node scripts/seed_admin.js --username admin --password Admin123
  npm start

Notes:
- I cannot run integration tests in this environment. Please run the quick local test and report any runtime errors.
