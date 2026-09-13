# Seima Wallet API

Express + TypeScript backend for Seima Wallet.

## Setup

1. Copy `.env.example` to `.env` and completa la conexión Postgres:
   - `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
   - `PGSCHEMA` (ej. `public` o un schema propio)
   - `PGSSL=true` en Supabase / remoto
   - `JWT_SECRET`
2. `npm install`
3. `npm run migrate`
4. `npm run seed`
5. `npm run dev`

## Scripts

- `npm run migrate` — run Knex migrations
- `npm run seed` — seed Sebastian / Luis (password `123456`)
- `npm run build` / `npm start` — production
