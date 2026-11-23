/**
 * לשונית "שאלונים" בתיק הליד/הלקוח:
 * יוצרים קישור אישי → שולחים בוואטסאפ/מייל → רואים מתי נפתח ומתי מולא →
 * צופים בתשובות, בציונים ובסיכום → מורידים PDF → שולחים שוב למייל/דרייב.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Lead } from '../types';
import { Btn } from '../ui';
import {
  apiListLeadQuestionnaires, apiCreateQuestionnaire, apiCancelQuestionnaire, apiRetryQuestionnaire,
  apiAttachQuestionnairePdf, apiDeleteQuestionnaire, apiQuestionnairePdfUrl, apiQuestionnaireConfig,
} from '../api';
import {
  QUESTIONNAIRES, LEVEL_LABELS, answerText, visibleQuestions, type QuestionnaireId,
} from '../../api/_lib/questionnaireDefs';
import type { QRecord, DeliveryStatus } from '../../api/_lib/questionnaireTypes';
import QuestionnaireDoc from './QuestionnaireDoc';
import { pagesToPdfBase64, downloadBase64Pdf } from './pdf';

const qLink = (token: string) => `${window.location.origin}/q/${token}`;
const generalLink = (qid: QuestionnaireId) => `${window.location.origin}/q/${qid}`;

function heDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}
function heDateTime(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function waLink(phone: string | undefined, text: string) {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
function inviteText(qid: QuestionnaireId, name: string, link: string) {
  const first = name.split(' ')[0] || '';
  return qid === 'mental'
    ? `היי ${first}, לפני שאנחנו מתחילים הכנתי לך אבחון אישי. כדאי למלא אותו בשקט, בלי הפרעות, ולענות בכנות ובפירוט. זה הקישור: ${link}`
    : `היי ${first}, לקראת פגישת האסטרטגיה שלנו הכנתי לך שאלון קצר. כך נוכל לנצל את הפגישה עד הסוף: ${link}`;
}

function StatusChip({ r }: { r: QRecord }) {
  const expired = r.status === 'sent' && r.expiresAt && r.expiresAt < new Date().toISOString();
  const s = r.status === 'submitted' ? { t: `מולא · ${heDate(r.submittedAt)}`, c: 'bg-green-100 text-green-700' }
    : r.status === 'cancelled' ? { t: 'בוטל', c: 'bg-gray-100 text-gray-500' }
    : expired ? { t: 'פג תוקף', c: 'bg-gray-100 text-gray-500' }
    : r.viewedAt ? { t: `נפתח · ${heDate(r.viewedAt)}`, c: 'bg-amber-100 text-amber-800' }
    : { t: 'ממתין למילוי', c: 'bg-blue-100 text-blue-700' };
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${s.c}`}>{s.t}</span>;
}

const DELIVERY: Record<DeliveryStatus, { t: string; c: string }> = {
  sent: { t: 'בוצע', c: 'text-green-700' },
  pending: { t: 'בתהליך…', c: 'text-amber-700' },
  not_configured: { t: 'עוד לא מחובר', c: 'text-gray-400' },
  failed: { t: 'נכשל', c: 'text-red-600' },
  skipped: { t: 'אין קובץ', c: 'text-gray-400' },
};

function Delivery({ label, s }: { label: string; s?: DeliveryStatus }) {
  const d = DELIVERY[s ?? 'pending'];
  return <span className="text-xs text-gray-500">{label}: <b className={`font-medium ${d.c}`}>{d.t}</b></span>;
}

const LEVEL_COLOR = { strong: 'bg-emerald-600', mid: 'bg-amber-500', focus: 'bg-red-600' } as const;
const LEVEL_TEXT = { strong: 'text-emerald-700', mid: 'text-amber-700', focus: 'text-red-700' } as const;

function SummaryText({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed text-gray-800">
      {text.split('\n').map((raw, i) => {
        const line = raw.trim();
        if (!line) return null;
        if (line.startsWith('#')) return <h4 key={i} className="font-bold text-red-700 pt-2">{line.replace(/^#+\s*/, '')}</h4>;
        if (line.startsWith('- ')) return <p key={i} className="pr-4 relative before:content-[''] before:absolute before:right-0 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-500">{line.slice(2).replace(/\*\*/g, '')}</p>;
        return <p key={i}>{line.replace(/\*\*/g, '')}</p>;
      })}
    </div>
  );
}

// ─── תצוגת תוצאות ────────────────────────────────────────────────────────────

function Results({ r, lead, canDelete, onBack, onChange, onDeleted }: {
  r: QRecord; lead: Lead; canDelete: boolean;
  onBack: () => void; onChange: (r: QRecord) => void; onDeleted: () => void;
}) {
  const def = QUESTIONNAIRES[r.qid];
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [docFor, setDocFor] = useState<null | 'download' | 'attach'>(null);
  const personal = r.source === 'personal';
  const sections = useMemo(() => {
    const visible = new Set(visibleQuestions(def, personal).map(q => q.id));
    return def.sections.map(sec => ({ sec, qs: sec.questions.filter(q => visible.has(q.id)) })).filter(x => x.qs.length);
  }, [def, personal]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setErr('');
    try { await fn(); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  }

  async function onPages(pages: HTMLElement[]) {
    const mode = docFor;
    try {
      const b64 = await pagesToPdfBase64(pages);
      const kind = r.qid === 'mental' ? 'אבחון מנטלי' : 'שאלון אסטרטגיה';
      if (mode === 'download') downloadBase64Pdf(b64, `${kind} - ${r.name} - כולל סיכום.pdf`);
      if (mode === 'attach') {
        const updated = await apiAttachQuestionnairePdf(r.token, b64);
        onChange(await apiRetryQuestionnaire(updated.token, ['email', 'drive']));
      }
    } catch (e) { setErr((e as Error).message); }
    setDocFor(null); setBusy('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Btn variant="secondary" size="sm" onClick={onBack}>→ חזרה לרשימה</Btn>
        <span className="text-xs text-gray-400">מולא {heDateTime(r.submittedAt)}{r.source === 'general' ? ' · דרך הקישור הכללי' : ''}</span>
      </div>

      <div>
        <p className="text-xs font-semibold text-red-700">{def.shortTitle}</p>
        <h3 className="text-xl font-bold text-gray-900">{r.name}</h3>
        {r.match === 'new_lead' && <p className="text-xs text-gray-500 mt-0.5">נפתח ליד חדש אוטומטית מהשאלון.</p>}
        {(r.match === 'phone' || r.match === 'email') && <p className="text-xs text-gray-500 mt-0.5">שויך לליד הזה לפי {r.match === 'phone' ? 'מספר הטלפון' : 'כתובת המייל'}. כדאי לוודא שזה אותו אדם.</p>}
      </div>

      {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-2.5">{err}</div>}

      <div className="flex flex-wrap gap-2">
        {r.pdfPath && <Btn size="sm" onClick={() => run('pdf', async () => { window.open(await apiQuestionnairePdfUrl(r.token), '_blank'); })}>הורדת ה-PDF</Btn>}
        <Btn size="sm" variant="secondary" disabled={!!busy} onClick={() => { setBusy('doc'); setDocFor('download'); }}>
          {busy === 'doc' && docFor === 'download' ? 'מכין קובץ…' : 'PDF מלא כולל סיכום'}
        </Btn>
        {!r.pdfPath && (
          <Btn size="sm" variant="secondary" disabled={!!busy} onClick={() => { setBusy('doc'); setDocFor('attach'); }}>
            {docFor === 'attach' ? 'שומר…' : 'יצירת PDF ושליחה למייל ולדרייב'}
          </Btn>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-gray-50 border rounded-xl px-3 py-2">
        <Delivery label="מייל" s={r.emailStatus} />
        <Delivery label="דרייב" s={r.driveStatus} />
        <Delivery label="סיכום" s={r.summaryStatus} />
        {r.driveUrl && <a href={r.driveUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">פתיחה בדרייב</a>}
        <span className="flex-1" />
        <Btn size="xs" variant="ghost" disabled={!!busy} onClick={() => run('email', async () => onChange(await apiRetryQuestionnaire(r.token, ['email'])))}>{busy === 'email' ? 'שולח…' : 'שליחה חוזרת למייל'}</Btn>
        <Btn size="xs" variant="ghost" disabled={!!busy || !r.pdfPath} onClick={() => run('drive', async () => onChange(await apiRetryQuestionnaire(r.token, ['drive'])))}>{busy === 'drive' ? 'מעלה…' : 'העלאה לדרייב'}</Btn>
      </div>
      {r.lastError && <p className="text-xs text-red-600 -mt-2">{r.lastError}</p>}

      {r.scores && r.scores.length > 0 && (
        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="font-bold text-gray-900">תמונת מצב לפי תחום</h4>
            {r.overall != null && <span className="text-sm text-gray-500">ממוצע <b className="text-lg text-red-700">{r.overall}</b></span>}
          </div>
          <div className="space-y-2">
            {[...r.scores].sort((a, b) => b.pct - a.pct).map(s => (
              <div key={s.id} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] sm:grid-cols-[11rem_1fr_2.5rem_3.5rem] items-center gap-2 text-sm">
                <span className="text-gray-700 truncate" title={s.label}>{s.label}</span>
                <span className="h-2.5 rounded-full bg-gray-100 overflow-hidden"><span className={`block h-full rounded-full ${LEVEL_COLOR[s.level]}`} style={{ width: `${Math.max(3, s.pct)}%` }} /></span>
                <b className={`text-center ${LEVEL_TEXT[s.level]}`}>{s.pct}</b>
                <span className="hidden sm:inline text-xs text-gray-400">{LEVEL_LABELS[s.level]}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">0–100, גבוה = חוזקה. היגדים שבהם הסכמה מעידה על קושי (מסומנים "הפוך") מחושבים הפוך. את הכיוון של כל היגד אפשר לשנות בקובץ השאלונים.</p>
        </section>
      )}

      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h4 className="font-bold text-gray-900">סיכום הכנה לפגישה</h4>
          <Btn size="xs" variant="ghost" disabled={!!busy} onClick={() => run('summary', async () => onChange(await apiRetryQuestionnaire(r.token, ['summary'])))}>
            {busy === 'summary' ? 'כותב סיכום… (עד דקה)' : r.summary?.text ? 'כתיבה מחדש' : 'יצירת סיכום'}
          </Btn>
        </div>
        {r.summary?.text ? <SummaryText text={r.summary.text} />
          : <p className="text-sm text-gray-500">{r.summaryStatus === 'pending' ? 'הסיכום נכתב עכשיו. רעננו בעוד כדקה.' : r.summaryStatus === 'not_configured' ? 'הסיכום האוטומטי עוד לא מחובר (חסר מפתח לבינה המלאכותית).' : 'אין עדיין סיכום. אפשר ליצור אותו בלחיצה.'}</p>}
        {r.summary?.text && <p className="text-[11px] text-gray-400 mt-2">נכתב אוטומטית על סמך התשובות בלבד. כדאי לקרוא גם את התשובות המלאות.</p>}
      </section>

      <section className="space-y-4">
        {sections.map(({ sec, qs }) => {
          const scale = qs[0].kind === 'scale7';
          return (
            <div key={sec.id} className="rounded-2xl border bg-white">
              <h4 className="font-bold text-gray-900 px-4 pt-3 pb-2 border-b">{sec.title}</h4>
              <div className={scale ? 'divide-y' : 'p-4 space-y-3'}>
                {qs.map(q => {
                  const v = r.answers?.[q.id];
                  if (scale) {
                    return (
                      <div key={q.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                        <span className="flex-1 text-gray-700">{q.label}{q.polarity === -1 && <span className="text-[11px] text-gray-400"> (הפוך)</span>}</span>
                        <b className="shrink-0 w-7 h-7 rounded-full bg-amber-50 text-red-700 flex items-center justify-center">{v ?? '—'}</b>
                      </div>
                    );
                  }
                  return (
                    <div key={q.id}>
                      <p className="text-xs font-semibold text-red-800">{q.label}</p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{answerText(q, v) || <span className="text-gray-300">—</span>}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {canDelete && (
        <div className="pt-3 border-t">
          <Btn size="sm" variant="danger" disabled={!!busy} onClick={() => {
            if (!confirm('למחוק את השאלון והתשובות לצמיתות? (למשל לבקשת הלקוח). העותק שנשלח במייל ובדרייב לא יימחק.')) return;
            run('delete', async () => { await apiDeleteQuestionnaire(r.token); onDeleted(); });
          }}>מחיקת השאלון והתשובות</Btn>
        </div>
      )}

      {docFor && (
        <QuestionnaireDoc qid={r.qid} name={r.name || lead.name} date={r.submittedAt ?? r.createdAt} answers={r.answers ?? {}}
          personal={personal} scores={r.scores} overall={r.overall} summary={r.summary?.text} onPages={onPages} />
      )}
    </div>
  );
}

// ─── הלשונית ──────────────────────────────────────────────────────────────────

export default function QuestionnairePanel({ lead, clientId, canDelete }: { lead: Lead; clientId?: string; canDelete: boolean }) {
  const [list, setList] = useState<QRecord[] | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<QRecord | null>(null);
  const [creating, setCreating] = useState<QuestionnaireId | null>(null);
  const [copied, setCopied] = useState('');
  const [config, setConfig] = useState<{ mail: boolean; drive: boolean; ai: boolean } | null>(null);

  const [reload, setReload] = useState(0);
  const load = () => setReload(n => n + 1);
  useEffect(() => {
    let alive = true;
    apiListLeadQuestionnaires(lead.id)
      .then(items => { if (alive) { setList(items); setError(''); } })
      .catch(e => { if (alive) setError(String(e.message ?? e)); });
    return () => { alive = false; };
  }, [lead.id, reload]);
  useEffect(() => { apiQuestionnaireConfig().then(setConfig).catch(() => {}); }, []);

  // שאלון שמעבדים אותו ברקע — מרעננים לבד
  const pending = (list ?? []).some(r => r.status === 'submitted' && [r.emailStatus, r.driveStatus, r.summaryStatus].includes('pending'));
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(load, 8000);
    return () => clearTimeout(t);
  }, [pending, list]);

  async function create(qid: QuestionnaireId) {
    setCreating(qid); setError('');
    try {
      const r = await apiCreateQuestionnaire({ leadId: lead.id, clientId, qid });
      setList(l => [r, ...(l ?? [])]);
    } catch (e) { setError((e as Error).message); }
    setCreating(null);
  }
  async function cancel(token: string) {
    if (!confirm('לבטל את הקישור? הלקוח לא יוכל למלא דרכו.')) return;
    try {
      const r = await apiCancelQuestionnaire(token);
      setList(l => (l ?? []).map(x => (x.token === token ? r : x)));
    } catch (e) { setError((e as Error).message); }
  }
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); });
  }
  function replace(r: QRecord) {
    setList(l => (l ?? []).map(x => (x.token === r.token ? r : x)));
    setView(r);
  }

  if (view) {
    return <Results r={view} lead={lead} canDelete={canDelete} onBack={() => { setView(null); load(); }} onChange={replace}
      onDeleted={() => { setList(l => (l ?? []).filter(x => x.token !== view.token)); setView(null); }} />;
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-2.5">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(['strategy', 'mental'] as QuestionnaireId[]).map(qid => {
          const def = QUESTIONNAIRES[qid];
          return (
            <div key={qid} className="rounded-xl border-2 border-gray-100 p-3 bg-white">
              <p className="font-bold text-gray-900">{def.shortTitle}</p>
              <p className="text-xs text-gray-500 mb-2">{qid === 'mental' ? 'לפני תחילת תהליך, פגישת מיפוי או אסטרטגיה' : 'לפני פגישת אסטרטגיה לעסק'} · {def.minutes}</p>
              <Btn size="sm" disabled={!!creating} onClick={() => create(qid)}>{creating === qid ? 'יוצר…' : '+ קישור אישי ללקוח'}</Btn>
            </div>
          );
        })}
      </div>

      {config && (!config.mail || !config.drive || !config.ai) && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          התשובות נשמרות כאן בכל מקרה.
          {!config.mail && ' שליחה למייל עוד לא מחוברת.'}
          {!config.drive && ' שמירה בדרייב עוד לא מחוברת.'}
          {!config.ai && ' סיכום אוטומטי עוד לא מחובר.'}
          {' '}ההוראות לחיבור: docs/questionnaires/README.md
        </p>
      )}

      {list === null && !error && <p className="text-center text-gray-400 py-6">טוען…</p>}
      {list && list.length === 0 && (
        <div className="text-center py-8 border border-dashed rounded-xl">
          <p className="font-semibold text-gray-700">עוד לא נשלח שאלון</p>
          <p className="text-sm text-gray-400 mt-1">יוצרים קישור אישי, שולחים בוואטסאפ, והתשובות יגיעו לכאן ברגע שהלקוח יסיים.</p>
        </div>
      )}

      {(list ?? []).map(r => {
        const def = QUESTIONNAIRES[r.qid];
        const link = qLink(r.token);
        const msg = inviteText(r.qid, lead.name, link);
        const active = r.status === 'sent' && !(r.expiresAt && r.expiresAt < new Date().toISOString());
        return (
          <div key={r.token} className={`rounded-xl border p-3.5 ${r.status === 'cancelled' ? 'opacity-50' : 'bg-white'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-800">{def.shortTitle}</p>
                <p className="text-xs text-gray-400">
                  {r.source === 'general' ? 'מולא דרך הקישור הכללי' : `נוצר ${heDate(r.createdAt)}`}
                  {active && r.expiresAt ? ` · בתוקף עד ${heDate(r.expiresAt)}` : ''}
                </p>
              </div>
              <StatusChip r={r} />
            </div>

            {r.status === 'submitted' && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Btn size="sm" onClick={() => setView(r)}>צפייה בתשובות{r.qid === 'mental' && r.overall != null ? ` · ציון ${r.overall}` : ''}</Btn>
                <Delivery label="מייל" s={r.emailStatus} />
                <Delivery label="דרייב" s={r.driveStatus} />
                <Delivery label="סיכום" s={r.summaryStatus} />
              </div>
            )}

            {active && (
              <div className="flex flex-wrap gap-2 mt-3">
                <Btn size="sm" onClick={() => copy(link, r.token)}>{copied === r.token ? 'הקישור הועתק ✓' : 'העתקת קישור'}</Btn>
                <a href={waLink(lead.phone, msg)} target="_blank" rel="noreferrer" className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700">שליחה בוואטסאפ</a>
                {lead.email && (
                  <a href={`mailto:${lead.email}?subject=${encodeURIComponent(def.title)}&body=${encodeURIComponent(msg)}`}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">שליחה במייל</a>
                )}
                <a href={link} target="_blank" rel="noreferrer" className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">איך זה נראה</a>
                <Btn size="sm" variant="danger" onClick={() => cancel(r.token)}>ביטול</Btn>
              </div>
            )}
          </div>
        );
      })}

      <details className="text-sm text-gray-500 border-t pt-3">
        <summary className="cursor-pointer font-medium text-gray-700">קישורים כלליים (לפרסום, בלי תיק לקוח)</summary>
        <p className="text-xs mt-2 mb-2">מי שממלא קישור כללי נכנס ל-CRM לפי הטלפון או המייל שלו. אם הוא לא קיים, נפתח ליד חדש.</p>
        <div className="space-y-2">
          {(['strategy', 'mental'] as QuestionnaireId[]).map(qid => (
            <div key={qid} className="flex flex-wrap items-center gap-2">
              <span className="w-40">{QUESTIONNAIRES[qid].shortTitle}</span>
              <code className="text-xs bg-gray-100 rounded px-2 py-1" dir="ltr">{generalLink(qid)}</code>
              <Btn size="xs" variant="secondary" onClick={() => copy(generalLink(qid), qid)}>{copied === qid ? 'הועתק ✓' : 'העתקה'}</Btn>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
