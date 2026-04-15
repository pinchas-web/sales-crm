-- ════════════════════════════════════════════════════════
-- מיגרציה: מודול קורסים
-- הרץ ב-Supabase SQL Editor
-- ════════════════════════════════════════════════════════

-- 1. טבלת קורסים
CREATE TABLE IF NOT EXISTS courses (
  id          TEXT PRIMARY KEY,
  title       TEXT         NOT NULL DEFAULT '',
  description TEXT                  DEFAULT '',
  color       TEXT                  DEFAULT '#6366f1',
  "order"     INTEGER               DEFAULT 0,
  created_at  TEXT
);

-- 2. טבלת שיעורים
CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY,
  course_id   TEXT         REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT         NOT NULL DEFAULT '',
  "order"     INTEGER               DEFAULT 0,
  date        TEXT,
  description TEXT
);

-- 3. טבלת פריטי תוכן
CREATE TABLE IF NOT EXISTS content_items (
  id               TEXT PRIMARY KEY,
  lesson_id        TEXT         REFERENCES lessons(id) ON DELETE CASCADE,
  type             TEXT         NOT NULL DEFAULT 'pdf',  -- pdf | pptx | docx | video | image
  title            TEXT         NOT NULL DEFAULT '',
  file_key         TEXT,
  file_url         TEXT,
  thumbnails       JSONB                 DEFAULT '[]',
  video_url        TEXT,
  video_thumbnail  TEXT,
  "order"          INTEGER               DEFAULT 0
);

-- ════════════════════════════════════════════════════════
-- Storage Buckets — צור ידנית ב-Storage → New Bucket
-- ════════════════════════════════════════════════════════
--
-- שם: course-files
-- Public: true
--
-- Bucket זה ישמור את כל הקבצים שמועלים (PDF, PPTX, DOCX, תמונות)

-- ════════════════════════════════════════════════════════
-- Storage Policies — הרשאות העלאה לbucket course-files
-- הרץ לאחר יצירת הbucket!
-- ════════════════════════════════════════════════════════

-- קריאה ציבורית (כולם יכולים לראות קבצים)
CREATE POLICY "Public read course files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'course-files');

-- העלאה למשתמשים מחוברים
CREATE POLICY "Authenticated upload course files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'course-files');

-- עדכון קבצים קיימים
CREATE POLICY "Authenticated update course files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'course-files');

-- מחיקת קבצים
CREATE POLICY "Authenticated delete course files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'course-files');

-- ════════════════════════════════════════════════════════
-- עדכון: הוסף column_config לטבלת lessons
-- הרץ אם כבר יצרת את הטבלאות קודם
-- ════════════════════════════════════════════════════════
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS column_config JSONB DEFAULT '{}';
