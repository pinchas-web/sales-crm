-- ════════════════════════════════════════════════════════
-- מיגרציה v2: הוספת sequence_order למסרים שיווקיים
-- הרץ ב-Supabase SQL Editor
-- ════════════════════════════════════════════════════════

ALTER TABLE marketing_messages
  ADD COLUMN IF NOT EXISTS sequence_order INTEGER NOT NULL DEFAULT 1;

-- עדכון מסרים קיימים (שנוצרו לפני המיגרציה) לסדר 1
UPDATE marketing_messages SET sequence_order = 1 WHERE sequence_order IS NULL;
