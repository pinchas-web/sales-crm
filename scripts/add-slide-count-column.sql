-- הוספת עמודה slide_count לטבלת content_items.
-- מאחסן את מספר השקופיות/העמודים האמיתי, כי thumbnails מכיל רק כיסוי אחד.
-- הרץ ב-Supabase SQL Editor (פעם אחת).

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS slide_count INTEGER;

COMMENT ON COLUMN content_items.slide_count IS
  'Real number of slides/pages in the source file. May exceed thumbnails.length when only a cover image is stored.';
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS slide_count INTEGER;