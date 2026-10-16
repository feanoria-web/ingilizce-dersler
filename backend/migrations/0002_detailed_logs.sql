ALTER TABLE events ADD COLUMN occurred_at TEXT;
CREATE TABLE assessment_results (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id),
  lesson TEXT NOT NULL, question_id TEXT NOT NULL,
  prompt TEXT NOT NULL, selected_answer TEXT NOT NULL, correct_answer TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('correct','incorrect','blank','ungraded')),
  assessment_kind TEXT NOT NULL, attempt INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX assessment_student_question ON assessment_results(student_id,lesson,question_id,attempt);
CREATE INDEX assessment_student_outcome ON assessment_results(student_id,outcome,created_at);
CREATE TABLE presence (
  session_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson TEXT NOT NULL, activity TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('active','idle','hidden')),
  seen_at TEXT NOT NULL
);
CREATE INDEX presence_seen ON presence(state,seen_at);
