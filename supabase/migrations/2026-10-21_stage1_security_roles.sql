-- ════════════════════════════════════════════════════════════════════════════
-- שלב 1 — אבטחה + ארבעה תפקידים
-- הרץ פעם אחת: Supabase Dashboard → SQL Editor → New Query → הדבק → Run
--
-- ⚠ להריץ רק אחרי שהגרסה החדשה של האפליקציה עלתה לאוויר
--   (אחרת העלאת קבצים לקורסים תפסיק לעבוד עד שהיא תעלה).
--
-- בטוח להריץ שוב: כל פעולה בודקת קודם את המצב הקיים.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. ארבעה תפקידים ───────────────────────────────────────────────────────
-- היום המסד מתיר רק admin / salesperson. מחליפים את החוק בחוק שמתיר ארבעה,
-- ודוחה כל מילה אחרת (כך שטעות הקלדה לא תיצור תפקיד "לא מוכר").
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.crm_users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.crm_users DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.crm_users
  ADD CONSTRAINT crm_users_role_check
  CHECK (role IN ('admin', 'office_manager', 'salesperson', 'secretary'));


-- ─── 2. הגנת שורות (RLS) על כל הטבלאות ──────────────────────────────────────
-- האפליקציה ניגשת לטבלאות רק דרך השרת (מפתח service role, שעוקף RLS).
-- הפעלת RLS בלי שום מדיניות = המפתח הציבורי שבדפדפן לא יכול לקרוא או לכתוב כלום.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_users', 'crm_config', 'leads', 'activities', 'tasks', 'clients',
    'chat_messages', 'pinned_notes', 'courses', 'lessons', 'content_items',
    'marketing_knowledge', 'marketing_messages'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;


-- ─── 3. קבצי קורסים — רק השרת כותב ─────────────────────────────────────────
-- עד היום כל משתמש מחובר (גם כזה שאף אחד לא אישר) יכול היה להעלות, לשנות ולמחוק.
-- מעכשיו ההעלאה עוברת דרך /api/storage/upload-url, ורק למי שרשאי לערוך קורסים.
-- הקריאה הציבורית נשארת (הקישורים ארוכים וקשים לניחוש).
DROP POLICY IF EXISTS "Authenticated upload course files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update course files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete course files" ON storage.objects;


-- ─── 4. מחיקת סיסמאות ישנות מההגדרות ────────────────────────────────────────
-- בגרסה ישנה נשמר שדה password בתוך רשימת המשתמשים. מוחקים אותו אם נשאר.
UPDATE public.crm_config
SET users = COALESCE(
  (SELECT jsonb_agg(u - 'password') FROM jsonb_array_elements(users) AS u),
  '[]'::jsonb
)
WHERE users::text LIKE '%"password"%';


-- ════════════════════════════════════════════════════════════════════════════
-- בדיקה — אחרי ההרצה, הרץ את שלוש השאילתות האלה. כולן אמורות להחזיר 0 שורות.
-- ════════════════════════════════════════════════════════════════════════════

-- א. טבלאות בלי הגנת שורות (אמור להיות ריק):
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;

-- ב. מדיניות שפותחת טבלה למשתמשים מחוברים או לאורחים (אמור להיות ריק):
--   SELECT tablename, policyname, roles FROM pg_policies
--   WHERE schemaname = 'public' AND (roles && ARRAY['anon','authenticated','public']::name[]);

-- ג. סיסמאות שנשארו בהגדרות (אמור להיות ריק):
--   SELECT id FROM public.crm_config WHERE users::text LIKE '%"password"%';
