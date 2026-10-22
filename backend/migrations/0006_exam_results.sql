-- Content is loaded separately from ignored private/exam-results-import.sql.
-- Students read only their own row; payloads never ship with the static site.
CREATE TABLE exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  exam_date TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
  payload_json TEXT NOT NULL CHECK(length(CAST(payload_json AS BLOB)) BETWEEN 2 AND 48000),
  updated_at TEXT NOT NULL
);
CREATE TABLE exam_results (
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL CHECK(length(CAST(payload_json AS BLOB)) BETWEEN 2 AND 48000),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(exam_id,student_id)
);
CREATE INDEX exam_results_student ON exam_results(student_id);
