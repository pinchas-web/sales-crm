-- ════════════════════════════════════════════════════════
-- מיגרציה: מודול שיווק
-- הרץ ב-Supabase SQL Editor
-- ════════════════════════════════════════════════════════

-- 1. מאגר ידע שיווקי (הגדרה חד-פעמית)
CREATE TABLE IF NOT EXISTS marketing_knowledge (
  id          TEXT PRIMARY KEY,
  category    TEXT NOT NULL,   -- 'products' | 'audience' | 'style' | 'ctas'
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TEXT
);

-- 2. מסרים שיווקיים שבועיים
CREATE TABLE IF NOT EXISTS marketing_messages (
  id              TEXT PRIMARY KEY,
  week_date       TEXT NOT NULL,   -- תאריך ראשון של השבוע (YYYY-MM-DD)
  platform        TEXT NOT NULL,   -- 'whatsapp_status' | 'whatsapp_group' | 'email' | 'blog' | 'youtube'
  content         TEXT NOT NULL DEFAULT '',
  cta_type        TEXT NOT NULL,   -- 'webinar' | 'strategy_call' | 'course' | 'nurture'
  status          TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'approved' | 'sent'
  source_content  TEXT,
  created_at      TEXT,
  updated_at      TEXT
);

-- ════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════

ALTER TABLE marketing_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_messages  ENABLE ROW LEVEL SECURITY;

-- גישה מלאה דרך service_role (Vercel functions)
CREATE POLICY "Service role full access knowledge"
ON marketing_knowledge FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access messages"
ON marketing_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
