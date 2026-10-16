PRAGMA foreign_keys = ON;
CREATE TABLE students (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, group_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL, first_login TEXT, last_login TEXT, last_credited_at TEXT
);
CREATE TABLE student_aliases (
  alias TEXT NOT NULL, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY(alias,student_id)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('student','admin')),
  student_id TEXT REFERENCES students(id), created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, last_seen TEXT NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL, student_id TEXT NOT NULL REFERENCES students(id),
  type TEXT NOT NULL, lesson TEXT NOT NULL DEFAULT 'panel', activity TEXT NOT NULL DEFAULT '',
  active_seconds INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  UNIQUE(student_id,event_id)
);
CREATE INDEX events_student_time ON events(student_id,created_at);
CREATE INDEX events_time ON events(created_at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, reset_at TEXT NOT NULL);
