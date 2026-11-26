-- Personal chat-style notes (logged-in users): text, links, code and files, in time order.
-- Files themselves are stored in R2 under file_key; this table keeps their details.
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  file_key TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);
CREATE INDEX notes_user ON notes (user_id, id);
