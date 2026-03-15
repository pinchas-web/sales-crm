/**
 * מסך הכניסה — מוצג לכל מי שאינו מחובר.
 * משתמש ב-Supabase Auth (email + password).
 * לאחר כניסה מוצלחת — App.tsx מזהה את השינוי אוטומטית ומציג את האפליקציה.
 */
import { useState } from 'react';
import { supabase } from '../api';

export default function LoginScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      // הודעת שגיאה ידידותית בעברית
      if (authError.message.includes('Invalid login credentials')) {
        setError('מייל או סיסמה שגויים. נסה שוב.');
      } else if (authError.message.includes('Email not confirmed')) {
        setError('יש לאשר את כתובת המייל תחילה.');
      } else {
        setError('שגיאת כניסה. פנה למנהל המערכת.');
      }
    }
    // אם הצלחה — supabase.auth.onAuthStateChange ב-App.tsx מגיב אוטומטית

    setLoading(false);
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-blue-700 to-indigo-700 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        {/* לוגו / כותרת */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">⚡</div>
          <h1 className="text-2xl font-bold text-white">מערכת CRM</h1>
          <p className="text-white/70 text-sm mt-1">הכנס את פרטי הכניסה שלך</p>
        </div>

        {/* טופס */}
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl shadow-2xl p-8 space-y-5"
        >
          {/* שדה מייל */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              כתובת מייל
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         placeholder:text-gray-400 transition-all"
              dir="ltr"
            />
          </div>

          {/* שדה סיסמה */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              סיסמה
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         placeholder:text-gray-400 transition-all"
              dir="ltr"
            />
          </div>

          {/* הודעת שגיאה */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* כפתור כניסה */}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-gradient-to-l from-blue-600 to-indigo-600 text-white
                       rounded-xl py-3 text-sm font-semibold
                       hover:from-blue-700 hover:to-indigo-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all shadow-md hover:shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> מתחבר...
              </span>
            ) : (
              'כניסה למערכת'
            )}
          </button>
        </form>

        {/* הערת תחתית */}
        <p className="text-center text-white/50 text-xs mt-6">
          אין לך גישה? פנה למנהל המערכת.
        </p>
      </div>
    </div>
  );
}
