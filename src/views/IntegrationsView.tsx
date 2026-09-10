import { useEffect, useState } from 'react';
import { supabase } from '../api';

type Status = {wordpressConfigured:boolean; snapshots:{provider:string;synced_at:string;record_count:number}[]};
type GoogleStatus = {configured:boolean;authorized:boolean;calendarId:string|null;lastSync:string|null;events:{id:string;summary?:string;start:{dateTime?:string;date?:string}}[]};
  async function googleRequest(action?:string,calendarId='') {
    const {data:{session}}=await supabase.auth.getSession();
    const response=await fetch('/api/google',{
      method:action?'POST':'GET',headers:{Authorization:`Bearer ${session?.access_token??''}`,'Content-Type':'application/json'},
      ...(action?{body:JSON.stringify({action,calendarId})}:{}),
    });
    if(!response.ok)throw new Error('Google request failed');
    return response.json();
  }

export default function IntegrationsView({onCatalogSync}: {onCatalogSync: <T>(operation: () => Promise<T>) => Promise<T>}) {
  const [status,setStatus] = useState<Status | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [google,setGoogle] = useState<GoogleStatus|null>(null);
  const [calendars,setCalendars] = useState<{id:string;summary:string}[]>([]);
  const [calendarId,setCalendarId] = useState('');
  async function request(method='GET') {
    const {data:{session}} = await supabase.auth.getSession();
    const response = await fetch('/api/integrations', {
      method, headers:{Authorization:`Bearer ${session?.access_token ?? ''}`,'Content-Type':'application/json'},
      ...(method === 'POST' ? {body:JSON.stringify({action:'sync-products'})} : {}),
    });
    if (!response.ok) throw new Error(response.status === 409 ? 'הקטלוג השתנה במקביל או שהחיבור טרם הוגדר. רענן את הנתונים ובדוק את החיבור.' : 'הסנכרון לא הושלם. יש לבדוק את הגדרת החיבור בשרת.');
    return response.json();
  }
  useEffect(() => {
    let cancelled=false;
    request().then(data=>{if(!cancelled)setStatus(data)}).catch(()=>{if(!cancelled)setMessage('תשתית החיבורים עדיין אינה זמינה בסביבה הזו.')});
    googleRequest().then(data=>{if(!cancelled){setGoogle(data);setCalendarId(data.calendarId??'')}}).catch(()=>{if(!cancelled)setMessage('חיבור Google דורש השלמת הגדרות בסביבת הבדיקה.')});
    return ()=>{cancelled=true};
  },[]);
  async function googleAction(action:string){
    setBusy(true);setMessage('');
    try{
      const result=await googleRequest(action,calendarId);
      if(action==='connect'){window.location.assign(result.url);return}
      if(action==='calendars')setCalendars(result.calendars);
      if(action==='sync'){setGoogle(await googleRequest());setMessage(`יובאו ${result.count} אירועים מהיומן.`)}
    }catch{setMessage('הפעולה מול Google נכשלה. בדוק את הגדרות החיבור וההרשאות שאישרת.')}
    finally{setBusy(false)}
  }
  async function sync() {
    setBusy(true);setMessage('');
    try {
      const result = await onCatalogSync(() => request('POST'));
      setMessage(`הקטלוג סונכרן: ${result.created} מוצרים חדשים, ${result.updated} עודכנו ו־${result.missing} מוצרים חסרים בחנות סומנו כלא פעילים. המוצרים זמינים ברשימת המוצרים.${result.historySaved ? '' : ' רישום מועד הסנכרון נכשל, אך המוצרים נשמרו.'}`);
      try { setStatus(await request()); } catch { /* Catalog commit already succeeded. */ }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'הסנכרון לא הושלם.'); }
    finally {setBusy(false)}
  }
  const woo=status?.snapshots.find(s=>s.provider==='woocommerce-products');
  return <section className="max-w-5xl mx-auto p-6 space-y-6" dir="rtl">
    <div><h1 className="text-3xl font-bold text-slate-900">החיבורים של העסק</h1><p className="text-slate-600 mt-2">מקורות המידע, מצב החיבור והייבוא האחרון במקום אחד.</p></div>
    {message && <p role="status" className="rounded-xl bg-blue-50 border border-blue-200 p-4">{message}</p>}
    <div className="grid md:grid-cols-2 gap-5">
      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-bold">Google Calendar</h2>
        <p className="text-slate-600">ייבוא לקריאה בלבד: 30 ימים אחורה ו־90 ימים קדימה.</p>
        <p className="text-sm">{google?.authorized?'הרשאת Google שמורה':google?.configured?'מוכן לאישור Google':'ממתין להגדרה בשרת'}</p>
        <div className="flex gap-3 flex-wrap">
          <button disabled={busy||!google?.configured} onClick={()=>googleAction('connect')} className="bg-blue-700 text-white rounded-xl px-4 py-2 disabled:opacity-40">אישור גישה ב־Google</button>
          <button disabled={busy||!google?.authorized} onClick={()=>googleAction('calendars')} className="border border-slate-300 rounded-xl px-4 py-2 disabled:opacity-40">בחר יומן</button>
        </div>
        {calendars.length>0&&<label className="block">היומן לייבוא<select value={calendarId} onChange={e=>setCalendarId(e.target.value)} className="w-full border rounded-lg p-2 mt-1"><option value="">בחר יומן</option>{calendars.map(c=><option key={c.id} value={c.id}>{c.summary}</option>)}</select></label>}
        <button disabled={busy||!google?.authorized||!calendarId} onClick={()=>googleAction('sync')} className="bg-teal-700 text-white rounded-xl px-4 py-2 disabled:opacity-40">{busy?'מבצע…':'ייבא אירועים'}</button>
        {google?.lastSync&&<p className="text-sm text-slate-500">ייבוא אחרון: {new Date(google.lastSync).toLocaleString('he-IL')} · {google.events.length} אירועים</p>}
      </article>
      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center"><h2 className="text-xl font-bold">WooCommerce</h2><span className="text-sm rounded-full bg-slate-100 px-3 py-1">{woo?'בוצע ייבוא':status?.wordpressConfigured?'מוכן לבדיקת חיבור':'ממתין להגדרה'}</span></div>
        <p className="text-slate-600">כל מוצר בחנות נוסף לרשימת המוצרים במערכת. סנכרון חוזר מעדכן שם, מחיר, תיאור ותמונה ושומר את שלבי הקליטה והמידע הפנימי.</p>
        <p className="text-sm text-slate-500">מוצרים שלא פורסמו או הוסרו מהחנות מסומנים כלא פעילים. הסנכרון מופעל בלחיצה.</p>
        {woo && <p className="text-sm text-slate-500">{woo.record_count} רשומות · עדכון אחרון: {new Date(woo.synced_at).toLocaleString('he-IL')}</p>}
        <button disabled={busy||!status?.wordpressConfigured} onClick={sync} className="bg-teal-700 hover:bg-teal-800 text-white rounded-xl px-5 py-3 disabled:opacity-40">{busy?'מסנכרן…':'סנכרן מוצרים'}</button>
      </article>
      {[
        ['Google Sheets','סנכרון דו־כיווני עדיין לא הופעל. נדרשים מיפוי עמודות וכללים לטיפול בשינויים משני הצדדים.'],
        ['LearnDash','ממתין לחיבור מאובטח לאתר ובדיקת הרשאות הקריאה להתקדמות התלמידים.'],
        ['SUMIT','החיבור בהמתנה בהתאם להחלטת בעל העסק.'],
      ].map(([name,description])=><article key={name} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3"><h2 className="text-xl font-bold">{name}</h2><p className="text-slate-600">{description}</p></article>)}
    </div>
    {!!google?.events.length&&<article className="bg-white rounded-2xl border p-6"><h2 className="text-xl font-bold mb-4">אירועים שיובאו מהיומן</h2><div className="max-h-96 overflow-auto"><table className="w-full text-right"><thead><tr><th className="p-2">אירוע</th><th className="p-2">מועד</th></tr></thead><tbody>{google.events.map(event=><tr key={event.id} className="border-t"><td className="p-2">{event.summary||'ללא כותרת'}</td><td className="p-2">{event.start.dateTime?new Date(event.start.dateTime).toLocaleString('he-IL'):event.start.date}</td></tr>)}</tbody></table></div></article>}
  </section>;
}
