-- A visible, rendered exam-results page visit. No exam payload or client-supplied
-- student identity is stored. The page UUID makes transport retries idempotent.
CREATE TABLE exam_result_views (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  view_id TEXT NOT NULL CHECK(length(view_id)=36),
  created_at TEXT NOT NULL,
  PRIMARY KEY(student_id,view_id)
);
