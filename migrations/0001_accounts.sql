-- Accounts: sign up, log in, sessions, email links (verify, reset) and the admin panel.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mobile TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',          -- 'user' or 'admin'
  email_verified_at INTEGER,                  -- milliseconds since 1970, or NULL
  blocked_at INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  login_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX users_created ON users (created_at);

-- A session is stored by the SHA-256 of its cookie value, so a database leak does not leak sessions.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  user_agent TEXT,
  ip TEXT
);
CREATE INDEX sessions_user ON sessions (user_id);

-- One-time links sent by email ('verify' or 'reset'), stored by their SHA-256.
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX tokens_user ON tokens (user_id, purpose);

-- Counters for rate limits (failed logins, sign ups, reset emails).
CREATE TABLE attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

-- Emails. Without an email service (local testing) they are only kept here and shown in the admin panel.
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  sent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- What admins changed.
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  created_at INTEGER NOT NULL
);
