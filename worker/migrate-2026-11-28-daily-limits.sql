-- One-time upgrade of the live D1 database for the daily limits (run once, before deploying that Worker):
--   npx wrangler d1 execute my-future-self --remote --file worker/migrate-2026-11-28-daily-limits.sql
-- New databases get the same columns and table from schema.sql.
ALTER TABLE docs ADD COLUMN save_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE docs ADD COLUMN saves INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS usage (
  key TEXT PRIMARY KEY,
  day INTEGER NOT NULL,
  n INTEGER NOT NULL
);
