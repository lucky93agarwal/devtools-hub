-- Message assistant (logged-in users): saved defaults, and every generated message with favourites.

CREATE TABLE assistant_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',    -- JSON: yourName, managerName, signature, project, urls, favoriteTemplates
  updated_at INTEGER NOT NULL
);

CREATE TABLE assistant_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                 -- refine, prompt, reply, template
  title TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX assistant_history_user ON assistant_history (user_id, id);
