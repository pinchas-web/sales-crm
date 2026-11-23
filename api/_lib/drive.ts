/**
 * העלאת קבצים לגוגל דרייב של פנחס, דרך "גשר" קטן של Google Apps Script שרץ בחשבון שלו
 * (הקוד והוראות ההתקנה: docs/questionnaires/drive-bridge.gs + docs/questionnaires/README.md).
 *
 * משתני סביבה ב-Vercel:
 *   DRIVE_BRIDGE_URL     — כתובת ה-Web App של הסקריפט (מסתיימת ב-/exec)
 *   DRIVE_BRIDGE_SECRET  — סיסמה משותפת ארוכה, זהה לזו שבסקריפט
 * אם לא הוגדר — לא מעלים, ומחזירים not_configured (שאר התהליך ממשיך כרגיל).
 *
 * למה גשר ולא חיבור ישיר: אין צורך בפרויקט Google Cloud, והסקריפט יכול לגעת רק בתיקייה
 * הראשית שהוא עצמו יוצר ("לקוחות - שאלונים").
 */

export function driveConfigured(): boolean {
  return !!(process.env.DRIVE_BRIDGE_URL && process.env.DRIVE_BRIDGE_SECRET);
}

export async function uploadToDrive(input: {
  folderName: string;
  fileName: string;
  pdf: Buffer;
}): Promise<{ status: 'sent'; url?: string } | { status: 'not_configured' }> {
  if (!driveConfigured()) return { status: 'not_configured' };
  const url = process.env.DRIVE_BRIDGE_URL as string;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
    throw new Error('DRIVE_BRIDGE_URL לא תקין');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret: process.env.DRIVE_BRIDGE_SECRET,
        folderName: input.folderName.slice(0, 120),
        fileName: input.fileName.slice(0, 180),
        base64: input.pdf.toString('base64'),
      }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body: { ok?: boolean; url?: string; error?: string } = {};
    try { body = JSON.parse(text); } catch { /* תשובה לא צפויה */ }
    if (!res.ok || !body.ok) throw new Error(`drive bridge: ${body.error ?? `HTTP ${res.status}`}`);
    return { status: 'sent', url: typeof body.url === 'string' && body.url.startsWith('https://') ? body.url : undefined };
  } finally {
    clearTimeout(timer);
  }
}
