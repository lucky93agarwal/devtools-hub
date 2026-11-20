-- Log in with Google or Facebook. A user can have a password, linked Google / Facebook
-- accounts, or both. Users who came only through Google / Facebook have no password
-- (password_hash is '') and may have no mobile number.
ALTER TABLE users ADD COLUMN signup_method TEXT NOT NULL DEFAULT 'password';   -- password, google, facebook
ALTER TABLE users ADD COLUMN last_login_method TEXT;                            -- password, google, facebook

CREATE TABLE oauth_accounts (
  provider TEXT NOT NULL,             -- google, facebook
  provider_user_id TEXT NOT NULL,     -- the id Google / Facebook gives this person
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX oauth_accounts_user ON oauth_accounts (user_id);

-- Existing users who have logged in did so with a password.
UPDATE users SET last_login_method = 'password' WHERE last_login_at IS NOT NULL;

ALTER TABLE deleted_users ADD COLUMN signup_method TEXT;
