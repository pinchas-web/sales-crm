/**
 * POST /api/storage/upload-url
 * מחזיר כתובת העלאה חתומה לקובץ אחד בדלי course-files.
 *
 * אחרי המיגרציה של שלב 1, משתמשים מחוברים כבר לא יכולים להעלות/לשנות/למחוק
 * קבצים ישירות עם המפתח הציבורי. ההעלאה עוברת רק דרך כאן, ורק למי שרשאי לערוך קורסים.
 * הקובץ עצמו עולה ישר מהדפדפן ל-Supabase (לא דרך Vercel — אין מגבלת 4.5MB).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from '../_lib/auth';
import { supabaseAdmin }   from '../_lib/supabaseAdmin';
import { permsFor }        from '../_lib/permissions';

const BUCKET = 'course-files';

/** תיקיות שהאפליקציה משתמשת בהן: lessons/<id>, thumbnails/<id>[/<id>], uploads */
const FOLDER_RE = /^(uploads|lessons\/[\w-]+|thumbnails\/[\w-]+(\/[\w-]+)?)$/;
const EXT_RE    = /^[a-z0-9]{1,8}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const crmUser = await validateRequest(req.headers.authorization);
  if (!crmUser) return res.status(401).json({ error: 'Unauthorized' });
  if (!permsFor(crmUser.role)?.editCourses) return res.status(403).json({ error: 'Not allowed' });

  const folder = typeof req.body?.folder === 'string' ? req.body.folder : 'uploads';
  const ext    = typeof req.body?.ext === 'string' ? req.body.ext.toLowerCase() : 'bin';
  if (!FOLDER_RE.test(folder) || !EXT_RE.test(ext)) {
    return res.status(400).json({ error: 'Invalid folder or extension' });
  }

  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[CRM upload-url] failed:', error?.message);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return res.status(200).json({ path, token: data.token, publicUrl: pub.publicUrl });
}
