import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { apiForgotPassword, apiRegister, supabase } from '../api';

type LoginMode = 'login' | 'register' | 'forgot' | 'sent' | 'registered';

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function InfoBox({ message }: { message: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
      {message}
    </div>
  );
}

function Spinner({ text }: { text: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="animate-spin inline-block">⏳</span> {text}
    </span>
  );
}

export default function LoginScreen({ initialMessage = '' }: { initialMessage?: string }) {
  const [mode, setMode] = useState<LoginMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialMessage);
  const [loading, setLoading] = useState(false);
  const googleEnabled = import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === 'true';

  useEffect(() => setNotice(initialMessage), [initialMessage]);

  const inputCls = `w-full border border-gray-300 rounded-xl px-4 py-3 text-sm
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    placeholder:text-gray-400 transition-all bg-white`;

  function switchMode(next: LoginMode) {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    setNotice('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      if (authError.message.includes('Invalid login credentials')) {
        setError('מייל או סיסמה שגויים. נסה שוב.');
      } else if (authError.message.includes('Email not confirmed')) {
        setError('יש לאשר את כתובת המייל לפני הכניסה.');
      } else {
        setError('שגיאת כניסה. פנה למנהל המערכת.');
      }
    } else if (!rememberMe) {
      window.addEventListener('beforeunload', () => {
        void supabase.auth.signOut();
      }, { once: true });
    }

    setLoading(false);
  }

  async function handleGoogleLogin() {
    if (!googleEnabled) {
      setError('כניסה עם Google עדיין לא מחוברת במערכת. כרגע נכנסים עם מייל וסיסמה.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true,
      },
    });
    if (oauthError) {
      setError('שגיאה בכניסה עם Google. ודא שהספק מוגדר ב-Supabase.');
      setLoading(false);
      return;
    }

    if (data.url) window.location.assign(data.url);
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');

    const result = await apiForgotPassword(email.trim().toLowerCase());
    if ('error' in result) {
      if (result.error.includes('not approved')) {
        setError('המייל הזה עדיין לא מאושר במערכת. מנהל צריך להוסיף אותו במסך המשתמשים.');
      } else {
        setError('לא הצלחנו לשלוח מייל איפוס כרגע. בדוק את הגדרות המייל ב-Supabase או פנה למנהל.');
      }
    } else {
      setMode('sent');
    }

    setLoading(false);
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;
    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים.');
      return;
    }
    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות.');
      return;
    }

    setLoading(true);
    setError('');
    const result = await apiRegister({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);

    if ('error' in result) {
      setError(result.error.includes('already') ? 'המייל כבר רשום. נסה להתחבר או פנה למנהל.' : result.error);
      return;
    }

    setPassword('');
    setConfirmPassword('');
    setMode('registered');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 to-indigo-700 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">⚡</div>
          <h1 className="text-2xl font-bold text-white">מערכת CRM</h1>
          <p className="text-white/70 text-sm mt-1">
            {mode === 'login' && 'כניסה למשתמשים מאושרים בלבד'}
            {mode === 'register' && 'בקשת גישה למערכת'}
            {mode === 'forgot' && 'איפוס סיסמה'}
            {mode === 'sent' && 'בדוק את תיבת הדואר שלך'}
            {mode === 'registered' && 'הבקשה נשלחה'}
          </p>
        </div>

        {mode === 'sent' && (
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center space-y-4">
            <div className="text-5xl">📧</div>
            <p className="text-gray-800 font-semibold">שלחנו מייל לאיפוס סיסמה</p>
            <p className="text-gray-500 text-sm">
              שלחנו ל-<span className="font-medium text-gray-700" dir="ltr">{email}</span>
              קישור לקביעת סיסמה חדשה.
            </p>
            <button onClick={() => switchMode('login')} className="text-blue-600 text-sm font-medium hover:underline">
              חזרה לדף הכניסה
            </button>
          </div>
        )}

        {mode === 'registered' && (
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center space-y-4">
            <div className="text-5xl">✅</div>
            <p className="text-gray-800 font-semibold">בקשת הגישה נקלטה</p>
            <p className="text-gray-500 text-sm">
              מנהל צריך לאשר את המייל שלך במסך המשתמשים. אחרי האישור תוכל להיכנס עם מייל וסיסמה או עם Google.
            </p>
            <button onClick={() => switchMode('login')} className="text-blue-600 text-sm font-medium hover:underline">
              חזרה לכניסה
            </button>
          </div>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="bg-white rounded-2xl shadow-2xl p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">כתובת המייל שלך</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com" required autoComplete="email" className={inputCls} dir="ltr" />
              <p className="text-xs text-gray-400 mt-1.5">האיפוס נשלח רק למשתמשים שמנהל אישר.</p>
            </div>
            {error && <ErrorBox message={error} />}
            <button type="submit" disabled={loading || !email}
              className="w-full bg-gradient-to-l from-blue-600 to-indigo-600 text-white rounded-xl py-3 text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md">
              {loading ? <Spinner text="שולח..." /> : 'שלח קישור לאיפוס'}
            </button>
            <button type="button" onClick={() => switchMode('login')}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors">
              חזרה לכניסה
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="bg-white rounded-2xl shadow-2xl p-8 space-y-4">
            <InfoBox message="ההרשמה לא פותחת גישה אוטומטית. מנהל חייב לאשר את המייל במסך המשתמשים." />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">שם מלא</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="שם מלא" required autoComplete="name" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">כתובת מייל</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com" required autoComplete="email" className={inputCls} dir="ltr" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">סיסמה</label>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="לפחות 6 תווים" required autoComplete="new-password" className={inputCls} dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">אימות</label>
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="שוב" required autoComplete="new-password" className={inputCls} dir="ltr" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />
              הצג סיסמה
            </label>
            {error && <ErrorBox message={error} />}
            <button type="submit" disabled={loading || !name.trim() || !email.trim() || password.length < 6}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md">
              {loading ? <Spinner text="שולח בקשה..." /> : 'שלח בקשת גישה'}
            </button>
            <button type="button" onClick={() => switchMode('login')}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors">
              כבר יש לי משתמש
            </button>
          </form>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-2xl p-8 space-y-4">
            {notice && <InfoBox message={notice} />}
            <button type="button" onClick={handleGoogleLogin} disabled={loading || !googleEnabled}
              className="w-full flex items-center justify-center gap-3 border-2 border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50">
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {googleEnabled ? 'כניסה עם Google' : 'Google לא מחובר עדיין'}
            </button>
            {!googleEnabled && (
              <p className="text-xs text-gray-400 text-center">
                כרגע הכניסה הפעילה היא עם מייל וסיסמה. Google יופיע רק אחרי חיבור אמיתי.
              </p>
            )}

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-gray-200" />
              <span className="bg-white px-3 text-xs text-gray-400">או עם מייל</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">כתובת מייל</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com" required autoComplete="email" className={inputCls} dir="ltr" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">סיסמה</label>
                <button type="button" onClick={() => switchMode('forgot')}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                  שכחתי סיסמה
                </button>
              </div>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password" className={inputCls + ' pr-12'} dir="ltr" />
                <button type="button" onClick={() => setShowPassword(p => !p)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                  tabIndex={-1}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
              זכור אותי במחשב הזה
            </label>

            {error && <ErrorBox message={error} />}

            <button type="submit" disabled={loading || !email || !password}
              className="w-full bg-gradient-to-l from-blue-600 to-indigo-600 text-white rounded-xl py-3 text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg">
              {loading ? <Spinner text="מתחבר..." /> : 'כניסה למערכת'}
            </button>

            <button type="button" onClick={() => switchMode('register')}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors">
              אין לי משתמש, שלח בקשת גישה
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const inputCls = `w-full border border-gray-300 rounded-xl px-4 py-3 text-sm
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    placeholder:text-gray-400 transition-all bg-white`;

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('הסיסמאות אינן תואמות.'); return; }
    if (password.length < 6) { setError('הסיסמה חייבת להכיל לפחות 6 תווים.'); return; }

    setLoading(true);
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError('שגיאה בעדכון הסיסמה. נסה שוב.');
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(async () => {
      await supabase.auth.signOut();
      onDone();
    }, 2000);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 to-indigo-700 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-white">מערכת CRM</h1>
          <p className="text-white/70 text-sm mt-1">בחר סיסמה חדשה</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {success ? (
            <div className="text-center space-y-3">
              <div className="text-4xl">✅</div>
              <p className="text-gray-800 font-semibold">הסיסמה עודכנה בהצלחה!</p>
              <p className="text-gray-500 text-sm">מועבר למסך הכניסה...</p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">סיסמה חדשה</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="לפחות 6 תווים" required autoComplete="new-password" className={inputCls + ' pr-12'} dir="ltr" />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                    tabIndex={-1}>
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">אימות סיסמה</label>
                <input type={showPass ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="הזן שוב את הסיסמה" required autoComplete="new-password" className={inputCls} dir="ltr" />
              </div>
              {error && <ErrorBox message={error} />}
              <button type="submit" disabled={loading || !password || !confirm}
                className="w-full bg-gradient-to-l from-blue-600 to-indigo-600 text-white rounded-xl py-3 text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg">
                {loading ? <Spinner text="מעדכן..." /> : 'שמור סיסמה חדשה'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
