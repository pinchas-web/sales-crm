/**
 * שכבת API — Supabase Auth + Vercel Serverless Functions.
 *
 * Auth: supabase.auth.signInWithPassword() → JWT
 * Data: fetch('/api/state') עם Authorization: Bearer <jwt>
 *
 * שני endpoints עיקריים:
 *   GET  /api/state  → קבלת AppState מסונן לפי תפקיד
 *   POST /api/state  → שמירת AppState עם ולידציית בעלות
 */
import { createClient } from '@supabase/supabase-js';

// ── Supabase client ──────────────────────────────────────────────────────────
// VITE_* משתנים נחשפים לדפדפן — anon key בלבד (לא service role!)

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnon);

// ── Headers עם Bearer JWT ────────────────────────────────────────────────────

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
  };
}

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * טוען את ה-AppState מהשרת.
 * הServerless function מחזיר state מסונן לפי תפקיד המשתמש המחובר.
 * מחזיר null בהפעלה ראשונה — caller ישתמש ב-SEED_STATE.
 */
export async function apiLoadState(): Promise<unknown | null> {
  const res = await fetch('/api/state', {
    method: 'GET',
    headers: await authHeaders(),
  });

  if (!res.ok) {
    throw new Error(`CRM API: GET /api/state failed — ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * שומר את ה-AppState לשרת.
 * הServerless function מאמת בעלות — נציג לא יכול לשמור נתונים של אחרים.
 */
export async function apiSaveState(state: unknown): Promise<void> {
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(state),
  });

  if (!res.ok) {
    console.error(`CRM API: POST /api/state failed — ${res.status}`);
  }
}

/**
 * מחזיר את פרטי המשתמש המחובר לפי ה-JWT.
 * { crm_user_id, name, role }
 */
export async function apiGetCurrentUser(): Promise<{ crm_user_id: string; name: string; role: string } | null> {
  try {
    const res = await fetch('/api/auth/me', {
      headers: await authHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * יצירת משתמש חדש (מנהל בלבד) — יוצר ב-Supabase Auth ו-crm_users.
 */
export async function apiCreateUser(params: {
  email: string;
  password: string;
  crm_user_id: string;
  role: 'admin' | 'salesperson';
}): Promise<{ auth_user_id: string } | { error: string }> {
  const res = await fetch('/api/users/create', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  return res.json();
}

/**
 * מחיקת משתמש (מנהל בלבד) — מוחק מ-Supabase Auth ו-crm_users.
 */
export async function apiDeleteUser(crm_user_id: string): Promise<{ ok: boolean } | { error: string }> {
  const res = await fetch('/api/users/delete', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ crm_user_id }),
  });
  return res.json();
}

// ── Course file storage ────────────────────────────────────────────────────────

const COURSE_FILES_BUCKET   = 'course-files';

/**
 * מעלה קובץ ל-Supabase Storage (bucket: course-files).
 * מחזיר { fileKey, fileUrl } — או זורק שגיאה.
 */
export async function apiUploadCourseFile(
  file: File,
  folder = 'uploads',
): Promise<{ fileKey: string; fileUrl: string }> {
  const ext     = file.name.split('.').pop() ?? 'bin';
  const fileKey = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from(COURSE_FILES_BUCKET)
    .upload(fileKey, file, { upsert: false });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage
    .from(COURSE_FILES_BUCKET)
    .getPublicUrl(fileKey);

  return { fileKey, fileUrl: data.publicUrl };
}

/**
 * מוחק קובץ מ-Supabase Storage.
 */
export async function apiDeleteCourseFile(fileKey: string): Promise<void> {
  const { error } = await supabase.storage
    .from(COURSE_FILES_BUCKET)
    .remove([fileKey]);
  if (error) console.error('Delete file error:', error);
}
