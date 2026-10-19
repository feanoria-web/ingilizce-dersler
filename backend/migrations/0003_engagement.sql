-- A page/tab is independent of the login session: opening another tab must not
-- overwrite the first tab's location, visibility or inactivity signal.
CREATE TABLE tab_presence (
  session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  tab_id TEXT NOT NULL, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson TEXT NOT NULL, activity TEXT NOT NULL,
  page_path TEXT NOT NULL, page_title TEXT NOT NULL,
  screen_id TEXT NOT NULL, screen_title TEXT NOT NULL, section TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('visible','hidden')),
  focused INTEGER NOT NULL CHECK(focused IN (0,1)),
  idle_seconds INTEGER NOT NULL CHECK(idle_seconds BETWEEN 0 AND 86400),
  last_interaction_at TEXT, interaction TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('working','reading','background','unfocused','left_open','leaving')),
  sequence INTEGER NOT NULL DEFAULT 0 CHECK(sequence BETWEEN 0 AND 2147483647),
  seen_at TEXT NOT NULL,
  PRIMARY KEY(session_hash,tab_id)
);
CREATE INDEX tab_presence_seen ON tab_presence(seen_at);
CREATE TABLE event_contexts (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  tab_id TEXT NOT NULL, page_path TEXT NOT NULL, page_title TEXT NOT NULL,
  screen_id TEXT NOT NULL, screen_title TEXT NOT NULL, section TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('visible','hidden')),
  focused INTEGER NOT NULL CHECK(focused IN (0,1)),
  idle_seconds INTEGER NOT NULL CHECK(idle_seconds BETWEEN 0 AND 86400),
  last_interaction_at TEXT, interaction TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('working','reading','background','unfocused','left_open','leaving'))
);
