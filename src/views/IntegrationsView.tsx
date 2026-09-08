import { useEffect, useState } from 'react';
import { supabase } from '../api';

type Status = {wordpressConfigured:boolean; snapshots:{provider:string;synced_at:string;record_count:number}[]};
export default function IntegrationsView() {
  const [status,setStatus] = useState<Status | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  async function request(method='GET') {
    const {data:{session}} = await supabase.auth.getSession();
    const response = await fetch('/api/integrations', {
      method, headers:{Authorization:`Bearer ${session?.access_token ?? ''}`,'Content-Type':'application/json'},
      ...(method === 'POST' ? {body:JSON.stringify({action:'sync-wordpress'})} : {}),
    });
    if (!response.ok) throw new Error('הפעולה לא הושלמה. יש לבדוק את הגדרת החיבור בשרת.');
    return response.json();
  }
  useEffect(() => {
    let cancelled=false;
    request().then(data=>{if(!cancelled)setStatus(data)}).catch(()=>{if(!cancelled)setMessage('תשתית החיבורים עדיין אינה זמינה בסביבה הזו.')});
    return ()=>{cancelled=true};
  },[]);
  async function sync() {
    setBusy(true);setMessage('');
    try {
      const result = await request('POST');
      setStatus(await request());
      setMessage(`הייבוא הושלם: ${result.products} מוצרים ו־${result.orders} הזמנות.`);
    } catch { setMessage('הייבוא נכשל. נתוני הייבוא הקודם נשמרו.'); }
    finally {setBusy(false)}
  }
  const woo=status?.snapshots.find(s=>s.provider==='woocommerce');
  return <section className="max-w-5xl mx-auto p-6 space-y-6" dir="rtl">
    <div><h1 className="text-3xl font-bold text-slate-900">החיבורים של העסק</h1><p className="text-slate-600 mt-2">מקורות המידע, מצב החיבור והייבוא האחרון במקום אחד.</p></div>
    {message && <p role="status" className="rounded-xl bg-blue-50 border border-blue-200 p-4">{message}</p>}
    <div className="grid md:grid-cols-2 gap-5">
      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center"><h2 className="text-xl font-bold">WooCommerce</h2><span className="text-sm rounded-full bg-slate-100 px-3 py-1">{woo?'בוצע ייבוא':status?.wordpressConfigured?'מוכן לבדיקת חיבור':'ממתין להגדרה'}</span></div>
        <p className="text-slate-600">מוצרים והזמנות מהאתר של העסק. הייבוא קורא מידע מהאתר ושומר עותק במערכת.</p>
        {woo && <p className="text-sm text-slate-500">{woo.record_count} רשומות · עדכון אחרון: {new Date(woo.synced_at).toLocaleString('he-IL')}</p>}
        <button disabled={busy||!status?.wordpressConfigured} onClick={sync} className="bg-teal-700 hover:bg-teal-800 text-white rounded-xl px-5 py-3 disabled:opacity-40">{busy?'מייבא…':'ייבא עכשיו'}</button>
      </article>
      {[
        ['Google Calendar','נדרשת העברת חיבור היומן לפרויקט הזה ואישור גישה.'],
        ['Google Sheets','סנכרון דו־כיווני עדיין לא הופעל. נדרשים מיפוי עמודות וכללים לטיפול בשינויים משני הצדדים.'],
        ['LearnDash','ממתין לחיבור מאובטח לאתר ובדיקת הרשאות הקריאה להתקדמות התלמידים.'],
        ['SUMIT','החיבור בהמתנה בהתאם להחלטת בעל העסק.'],
      ].map(([name,description])=><article key={name} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3"><h2 className="text-xl font-bold">{name}</h2><p className="text-slate-600">{description}</p></article>)}
    </div>
  </section>;
}
