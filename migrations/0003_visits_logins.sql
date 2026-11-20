-- Every time the site is opened (logged in or not), and every login attempt, with where it
-- came from (IP, city, GPS if allowed) and the device. Kept for 90 days.

CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,           -- random id kept in the visitor's browser
  user_id TEXT,                       -- set when the visitor was logged in
  created_at INTEGER NOT NULL,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  gps_status TEXT NOT NULL DEFAULT 'asked',   -- asked, allowed, denied, unavailable
  gps_lat REAL,
  gps_lon REAL,
  gps_accuracy REAL,                  -- metres
  device_type TEXT,                   -- Computer, Phone, Tablet
  os TEXT,
  browser TEXT,
  platform TEXT,                      -- Web, Android, iOS
  user_agent TEXT,
  page TEXT,
  referrer TEXT,
  language TEXT,
  timezone TEXT,
  screen TEXT
);
CREATE INDEX visits_created ON visits (created_at);
CREATE INDEX visits_visitor ON visits (visitor_id, created_at);
CREATE INDEX visits_user ON visits (user_id, created_at);

CREATE TABLE login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,                       -- empty when the email has no account
  email TEXT NOT NULL,
  success INTEGER NOT NULL,
  method TEXT NOT NULL,               -- password, signup, reset
  reason TEXT,                        -- for failures: wrong-password, blocked, paused, captcha
  new_device INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  visitor_id TEXT,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  gps_lat REAL,
  gps_lon REAL,
  gps_accuracy REAL,
  device_type TEXT,
  os TEXT,
  browser TEXT,
  platform TEXT,
  user_agent TEXT
);
CREATE INDEX login_events_created ON login_events (created_at);
CREATE INDEX login_events_user ON login_events (user_id, created_at);

-- Devices (browsers) each user has logged in from, to email them about a new one.
CREATE TABLE known_devices (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_key TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_key)
);

-- Which browser a session belongs to, for the user's Login activity page.
ALTER TABLE sessions ADD COLUMN visitor_id TEXT;
