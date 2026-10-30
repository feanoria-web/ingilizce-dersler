-- Students whose name must not appear in their own browser (session chip). The
-- teacher panel still shows the real name; only student-facing replies hide it.
ALTER TABLE students ADD COLUMN hide_name INTEGER NOT NULL DEFAULT 0 CHECK (hide_name IN (0,1));
