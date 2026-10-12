import { useEffect, useState } from 'react';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { supabase } from '../api';

const scopeLabels: Record<string, string> = {
  openid: 'זיהוי המשתמש המחובר',
  profile: 'פרטי פרופיל בסיסיים',
  email: 'כתובת המייל שלך',
};

export default function OAuthConsent() {
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id') ?? '';
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState(() => authorizationId ? '' : 'בקשת החיבור אינה תקינה: חסר מזהה הרשאה.');
  const [working, setWorking] = useState<'approve' | 'deny' | null>(null);

  useEffect(() => {
    if (!authorizationId) return;

    let cancelled = false;
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: authError }) => {
      if (cancelled) return;
      if (authError || !data) {
        setError('לא הצלחנו לטעון את פרטי החיבור. ייתכן שהבקשה פגה.');
        return;
      }
      if ('redirect_url' in data) {
        window.location.assign(data.redirect_url);
        return;
      }
      setDetails(data);
    });

    return () => { cancelled = true; };
  }, [authorizationId]);

  async function decide(action: 'approve' | 'deny') {
    setWorking(action);
    setError('');
    const result = action === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (result.error || !result.data?.redirect_url) {
      setError(action === 'approve' ? 'אישור החיבור נכשל. נסה שוב.' : 'ביטול החיבור נכשל. נסה שוב.');
      setWorking(null);
      return;
    }
    window.location.assign(result.data.redirect_url);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 to-indigo-800 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-2xl">⚡</div>
            <div>
              <h1 className="text-lg font-bold">חיבור ה־CRM ל־ChatGPT</h1>
              <p className="text-sm text-white/65">הבית למטפלים ומאמנים</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

          {!error && !details && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-3xl animate-pulse mb-2">⏳</div>
              <p>טוען את פרטי החיבור…</p>
            </div>
          )}

          {details && (
            <>
              <div>
                <p className="text-gray-800 font-semibold">{details.client.name} מבקש להתחבר לחשבון שלך.</p>
                <p className="text-sm text-gray-500 mt-1">מחובר כ־{details.user.email}</p>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-blue-900 mb-2">החיבור יאפשר:</p>
                <ul className="text-sm text-blue-800 space-y-1.5">
                  {(details.scope || 'openid').split(' ').filter(Boolean).map((scope) => (
                    <li key={scope} className="flex gap-2"><span>✓</span><span>{scopeLabels[scope] ?? scope}</span></li>
                  ))}
                  <li className="flex gap-2"><span>✓</span><span>קריאת לידים, לקוחות, משימות ותהליכי קליטה בהתאם להרשאות שלך</span></li>
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                פעולות שמשנות מידע ב־CRM יוצגו לך לאישור ב־ChatGPT לפני הביצוע.
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => decide('approve')}
                  disabled={working !== null}
                  className="flex-1 rounded-xl bg-blue-700 text-white py-3 font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors"
                >
                  {working === 'approve' ? 'מאשר…' : 'אישור וחיבור'}
                </button>
                <button
                  type="button"
                  onClick={() => decide('deny')}
                  disabled={working !== null}
                  className="px-5 rounded-xl border border-gray-300 text-gray-700 py-3 font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {working === 'deny' ? 'מבטל…' : 'ביטול'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
