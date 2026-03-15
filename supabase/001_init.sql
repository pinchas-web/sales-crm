-- ════════════════════════════════════════════════════════════════════════════
-- Sales CRM — יצירת טבלאות ראשונית
-- הרץ קובץ זה ב: Supabase Dashboard → SQL Editor → New Query → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. crm_users — מיפוי בין Supabase Auth ל-CRM ───────────────────────────
-- כל משתמש WP הופך למשתמש Supabase + שורה כאן
CREATE TABLE IF NOT EXISTS crm_users (
  auth_user_id  uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_user_id   text        NOT NULL UNIQUE,   -- 'u1', 'u2', 'u3' ...
  email         text        NOT NULL,
  role          text        NOT NULL CHECK (role IN ('admin', 'salesperson')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. crm_config — קונפיגורציה משותפת (admin בלבד לכתיבה) ─────────────────
CREATE TABLE IF NOT EXISTS crm_config (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  users               jsonb       NOT NULL DEFAULT '[]',
  statuses            jsonb       NOT NULL DEFAULT '[]',
  products            jsonb       NOT NULL DEFAULT '[]',
  dropdown_options    jsonb       NOT NULL DEFAULT '{}',
  custom_fields       jsonb       NOT NULL DEFAULT '[]',
  labels              jsonb       NOT NULL DEFAULT '{}',
  nav_config          jsonb       NOT NULL DEFAULT '[]',
  sales_targets       jsonb       NOT NULL DEFAULT '{}',
  automation_rules    jsonb       NOT NULL DEFAULT '[]',
  table_column_prefs  jsonb       NOT NULL DEFAULT '{}',
  daily_summary_email text        NOT NULL DEFAULT '',
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. leads ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id               text        PRIMARY KEY,
  name             text        NOT NULL DEFAULT '',
  phone            text        NOT NULL DEFAULT '',
  email            text,
  source           text        NOT NULL DEFAULT '',
  source_campaign  text,
  profession       text        NOT NULL DEFAULT '',
  audience_type    text        NOT NULL DEFAULT '',
  program          text        NOT NULL DEFAULT '',
  interested_in    jsonb       NOT NULL DEFAULT '[]',  -- text[]
  status           text        NOT NULL DEFAULT 'new',
  assigned_to      text        NOT NULL DEFAULT '',    -- crm_user_id
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  custom_fields    jsonb       NOT NULL DEFAULT '{}',
  follow_up_at     timestamptz,
  score            int         NOT NULL DEFAULT 0,
  last_activity_at timestamptz,
  deal_value       numeric
);

CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS leads_status_idx       ON leads(status);

-- ─── 4. activities ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id         text        PRIMARY KEY,
  lead_id    text        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  date       timestamptz NOT NULL DEFAULT now(),
  note       text        NOT NULL DEFAULT '',
  created_by text        NOT NULL DEFAULT '',    -- crm_user_id
  type       text        NOT NULL DEFAULT 'note'
             CHECK (type IN ('note','call','email','whatsapp','meeting'))
);

CREATE INDEX IF NOT EXISTS activities_lead_id_idx ON activities(lead_id);

-- ─── 5. tasks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          text    PRIMARY KEY,
  lead_id     text    REFERENCES leads(id) ON DELETE SET NULL,
  due_date    date    NOT NULL,
  time        text,
  note        text    NOT NULL DEFAULT '',
  assigned_to text    NOT NULL DEFAULT '',    -- crm_user_id
  done        boolean NOT NULL DEFAULT false,
  type        text    DEFAULT 'note'
              CHECK (type IN ('note','call','email','whatsapp','meeting'))
);

CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx    ON tasks(due_date);

-- ─── 6. clients ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                   text        PRIMARY KEY,
  lead_id              text        REFERENCES leads(id) ON DELETE SET NULL,
  product_id           text        NOT NULL DEFAULT '',
  deal_value           numeric     NOT NULL DEFAULT 0,
  closed_at            timestamptz NOT NULL DEFAULT now(),
  assigned_to          text        NOT NULL DEFAULT '',    -- crm_user_id
  onboarding_progress  jsonb       NOT NULL DEFAULT '{}',
  custom_steps         jsonb       NOT NULL DEFAULT '[]',
  notes                text
);

CREATE INDEX IF NOT EXISTS clients_assigned_to_idx ON clients(assigned_to);

-- ─── 7. chat_messages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id           text        PRIMARY KEY,
  from_user_id text        NOT NULL DEFAULT '',   -- crm_user_id
  to_user_id   text,                              -- null = broadcast
  content      text        NOT NULL DEFAULT '',
  timestamp    timestamptz NOT NULL DEFAULT now(),
  read_by      jsonb       NOT NULL DEFAULT '[]'  -- text[]
);

CREATE INDEX IF NOT EXISTS chat_from_idx      ON chat_messages(from_user_id);
CREATE INDEX IF NOT EXISTS chat_to_idx        ON chat_messages(to_user_id);
CREATE INDEX IF NOT EXISTS chat_timestamp_idx ON chat_messages(timestamp);

-- ─── 8. pinned_notes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pinned_notes (
  id         text        PRIMARY KEY,
  user_id    text        NOT NULL DEFAULT '',   -- crm_user_id
  content    text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  color      text        NOT NULL DEFAULT 'yellow'
             CHECK (color IN ('yellow','blue','pink','green','purple'))
);

CREATE INDEX IF NOT EXISTS pinned_notes_user_idx ON pinned_notes(user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- הכנסת קונפיגורציה ראשונית (seed)
-- עדכן את הנתונים לפי הצוות שלך
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO crm_config (
  id,
  users,
  statuses,
  products,
  dropdown_options,
  custom_fields,
  labels,
  nav_config,
  sales_targets,
  automation_rules,
  table_column_prefs,
  daily_summary_email
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '[
    {"id":"u1","name":"פנחס","role":"admin","commissionRate":0,"email":"pinchas@yourteam.com"},
    {"id":"u2","name":"שרה","role":"salesperson","commissionRate":0.10,"email":"sara@yourteam.com"},
    {"id":"u3","name":"משה","role":"salesperson","commissionRate":0.10,"email":"moshe@yourteam.com"}
  ]',
  '[
    {"id":"new","label":"לא נוצר קשר","color":"#94a3b8","textColor":"#ffffff","isFinal":false,"isWon":false,"order":0},
    {"id":"no_answer","label":"לא ענה","color":"#9ca3af","textColor":"#ffffff","isFinal":false,"isWon":false,"order":1},
    {"id":"in_proc","label":"בתהליך","color":"#3b82f6","textColor":"#ffffff","isFinal":false,"isWon":false,"order":2},
    {"id":"laser","label":"נקבעה פגישה עם פנחס","color":"#6366f1","textColor":"#ffffff","isFinal":false,"isWon":false,"order":3},
    {"id":"followup","label":"פולואפ","color":"#f59e0b","textColor":"#ffffff","isFinal":false,"isWon":false,"order":4},
    {"id":"warmup","label":"משימות חימום","color":"#fb923c","textColor":"#ffffff","isFinal":false,"isWon":false,"order":5},
    {"id":"won","label":"סגר!!!","color":"#22c55e","textColor":"#ffffff","isFinal":true,"isWon":true,"order":6},
    {"id":"lost","label":"נפל ❌","color":"#f87171","textColor":"#ffffff","isFinal":true,"isWon":false,"order":7},
    {"id":"future","label":"עתיד 🕐","color":"#22d3ee","textColor":"#ffffff","isFinal":false,"isWon":false,"order":8}
  ]',
  '[]',
  '{"sources":["facebook","whatsapp","organic","referral","other"],"professions":["therapist","coach","psychologist","other"],"audience_types":["secular","religious","haredi"],"programs":["biznes_therapy","premium_coaching","other"]}',
  '[]',
  '{}',
  '[
    {"id":"home","visible":true,"order":0},
    {"id":"leads","visible":true,"order":1},
    {"id":"clients","visible":true,"order":2},
    {"id":"products","visible":true,"order":3},
    {"id":"tasks","visible":true,"order":4},
    {"id":"data","visible":true,"order":5},
    {"id":"chat","visible":true,"order":6},
    {"id":"settings","visible":true,"order":7}
  ]',
  '{"u2":5,"u3":4}',
  '[]',
  '{}',
  ''
) ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- לאחר הרצת קובץ זה:
-- 1. לך ל: Authentication → Users → Add User
-- 2. צור משתמש עבור כל אחד מהצוות (Email + Password)
-- 3. הרץ את ה-SQL הבא עם ה-UUID שנוצר לכל משתמש:
--
-- INSERT INTO crm_users (auth_user_id, crm_user_id, email, role) VALUES
--   ('UUID-של-פנחס', 'u1', 'pinchas@yourteam.com', 'admin'),
--   ('UUID-של-שרה',  'u2', 'sara@yourteam.com',    'salesperson'),
--   ('UUID-של-משה',  'u3', 'moshe@yourteam.com',   'salesperson');
-- ════════════════════════════════════════════════════════════════════════════
