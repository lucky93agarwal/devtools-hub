-- Deleting a user removes their account (they can sign up again with the same email),
-- but the admin keeps this record of who was deleted, when and by whom.
CREATE TABLE deleted_users (
  id TEXT PRIMARY KEY,                -- the deleted account's id
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT NOT NULL,
  role TEXT NOT NULL,
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL,        -- when they had signed up
  last_login_at INTEGER,
  login_count INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER NOT NULL,
  deleted_by TEXT NOT NULL            -- the admin's email
);
CREATE INDEX deleted_users_deleted ON deleted_users (deleted_at);
CREATE INDEX deleted_users_email ON deleted_users (email);

-- The admin log keeps the target's email, so it still reads well after a user is deleted.
ALTER TABLE admin_log ADD COLUMN target_email TEXT;
