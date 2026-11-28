-- D1 schema for My Future Self. Safe to run again.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,          -- Google account id ("sub")
  email TEXT,
  name TEXT,
  picture TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,  -- SHA-256 of the cookie value; the cookie value itself is never stored
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS docs (
  user_id TEXT PRIMARY KEY,     -- one saved document per account
  data TEXT NOT NULL,           -- JSON
  version INTEGER NOT NULL,
  updated_at INTEGER,
  save_day INTEGER NOT NULL DEFAULT 0,  -- UTC day number of the last save (daily save limit, worker/quota.js)
  saves INTEGER NOT NULL DEFAULT 0      -- saves on that day
);

-- Daily call counts per account ("u:<id>") or per address before sign-in ("ip:<address>"). One row each, reused every day.
CREATE TABLE IF NOT EXISTS usage (
  key TEXT PRIMARY KEY,
  day INTEGER NOT NULL,         -- UTC day number
  n INTEGER NOT NULL            -- calls on that day
);
