-- Content is loaded separately from ignored private/teacher-guides-import.sql.
-- Zero metadata marks an import in progress, which readers reject.
CREATE TABLE teacher_guides (
  lesson_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes BETWEEN 0 AND 15728640),
  chunk_count INTEGER NOT NULL CHECK(chunk_count BETWEEN 0 AND 2048),
  payload_sha256 TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE teacher_guide_chunks (
  lesson_id TEXT NOT NULL REFERENCES teacher_guides(lesson_id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK(chunk_index BETWEEN 0 AND 2047),
  content TEXT NOT NULL CHECK(length(CAST(content AS BLOB)) BETWEEN 1 AND 48000),
  PRIMARY KEY(lesson_id,chunk_index)
);
