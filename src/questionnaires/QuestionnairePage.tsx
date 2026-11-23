/**
 * הדף שהלקוח מקבל: /q/<token> (קישור אישי) או /q/strategy, /q/mental (קישור כללי).
 * שאלה אחת בכל מסך, פס התקדמות, שמירה אוטומטית במכשיר, ובסוף:
 * יוצרים PDF מעוצב → שולחים לשרת → נשמר בתיק הלקוח, נשלח לפנחס במייל ולדרייב.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  QUESTIONNAIRES, SCALE_LABELS, visibleQuestions, validateAnswer, scoreAnswers, overallScore,
  type Answers, type Question, type QuestionnaireDef, type QuestionnaireId, type Section,
} from '../../api/_lib/questionnaireDefs';
import QuestionnaireDoc from './QuestionnaireDoc';
import { pagesToPdfBase64 } from './pdf';
import './questionnaire.css';

type Mode = { token: string } | { qid: QuestionnaireId };

type Step =
  | { t: 'section'; sec: Section; num: number }
  | { t: 'scale' }
  | { t: 'q'; q: Question; sec: Section }
  | { t: 'submit' };

type Phase = 'loading' | 'notfound' | 'cancelled' | 'expired' | 'done' | 'welcome' | 'flow' | 'sending' | 'thanks';

interface Draft { answers: Answers; idx: number; startedAt: number }

const ERRORS: Record<string, string> = {
  too_fast: 'נראה שהשאלון מולא מהר מדי. אפשר לעבור שוב על התשובות ולשלוח.',
  invalid_answers: 'חסרות כמה תשובות חובה. חזור אחורה ובדוק.',
  rate_limited: 'נשלחו יותר מדי שאלונים מהמכשיר הזה היום. אפשר לנסות שוב מחר, או לפנות לפנחס.',
  already_submitted: 'השאלון הזה כבר נשלח. תודה!',
  expired: 'תוקף הקישור פג. כדאי לבקש מפנחס קישור חדש.',
  cancelled: 'הקישור בוטל. כדאי לפנות לפנחס.',
};

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d && typeof d === 'object' && d.answers ? d : null;
  } catch { return null; }
}
function writeDraft(key: string, d: Draft) {
  try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* מצב פרטי — ממשיכים בלי שמירה */ }
}
function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* */ }
}

function buildSteps(def: QuestionnaireDef, personal: boolean): Step[] {
  const visible = new Set(visibleQuestions(def, personal).map(q => q.id));
  const steps: Step[] = [];
  let num = 0;
  let scaleShown = false;
  for (const sec of def.sections) {
    const qs = sec.questions.filter(q => visible.has(q.id));
    if (!qs.length) continue;
    num++;
    if (qs[0].kind === 'scale7' && !scaleShown && def.scaleIntro) { steps.push({ t: 'scale' }); scaleShown = true; }
    steps.push({ t: 'section', sec, num });
    qs.forEach(q => steps.push({ t: 'q', q, sec }));
  }
  steps.push({ t: 'submit' });
  return steps;
}

// ─── אייקונים (קו פשוט, בלי אימוג'ים) ─────────────────────────────────────────

const Arrow = ({ back }: { back?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: back ? 'none' : 'scaleX(-1)' }}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Check = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#C7263A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const Lock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
const Clock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);

function Blobs() {
  return (
    <div className="qp-blobs" aria-hidden="true">
      <svg className="b1" viewBox="0 0 200 200"><path d="M160 18c34 22 42 74 18 112-25 40-80 62-118 42C22 152 6 104 26 66 46 26 120-8 160 18z" /></svg>
      <svg className="b2" viewBox="0 0 200 200"><path d="M150 30c30 26 36 70 12 104-24 34-74 50-108 30S8 98 28 62C48 26 120 4 150 30z" /></svg>
      <svg className="b3" viewBox="0 0 200 200"><path d="M40 40c30-30 100-30 130 6s24 92-12 116-96 20-122-14S10 70 40 40z" /></svg>
    </div>
  );
}

// ─── שדות ─────────────────────────────────────────────────────────────────────

function AutoTextarea({ value, onChange, placeholder, autoFocus, onSubmit }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; onSubmit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 150), window.innerHeight * 0.5)}px`;
  }, [value]);
  useEffect(() => { if (autoFocus && window.innerWidth > 700) ref.current?.focus(); }, [autoFocus]);
  return (
    <textarea ref={ref} className="qp-textarea" value={value} placeholder={placeholder ?? 'כתוב כאן…'} maxLength={8000}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit(); } }} />
  );
}

function List5({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const items = useMemo(() => {
    const arr = value.split('\n');
    return Array.from({ length: 5 }, (_, i) => arr[i] ?? '');
  }, [value]);
  return (
    <div className="qp-list5">
      {items.map((v, i) => (
        <label key={i} className="row">
          <span className="n">{i + 1}</span>
          <input value={v} maxLength={300} onChange={e => {
            const next = [...items]; next[i] = e.target.value.replace(/\n/g, ' ');
            onChange(next.join('\n').replace(/\n+$/, ''));
          }} />
        </label>
      ))}
    </div>
  );
}

function Multi({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  const opts = q.options ?? [];
  const parts = value ? value.split(' · ') : [];
  const selected = new Set(parts.filter(p => opts.includes(p)));
  const other = parts.filter(p => !opts.includes(p)).join(' · ').replace(/^אחר: /, '');
  const emit = (sel: Set<string>, oth: string) => {
    const list = opts.filter(o => sel.has(o));
    if (oth.trim()) list.push(`אחר: ${oth.trim()}`);
    onChange(list.join(' · '));
  };
  return (
    <div>
      <div className="qp-chips">
        {opts.map(o => (
          <button key={o} type="button" className={`chip${selected.has(o) ? ' on' : ''}`} aria-pressed={selected.has(o)}
            onClick={() => { const s = new Set(selected); if (s.has(o)) s.delete(o); else s.add(o); emit(s, other); }}>
            {selected.has(o) && <Check size={15} />}{o}
          </button>
        ))}
      </div>
      <input className="qp-input sm" placeholder="עוד משהו? כתוב כאן (לא חובה)" value={other} maxLength={300}
        onChange={e => emit(selected, e.target.value)} />
    </div>
  );
}

function Scale({ value, onPick }: { value?: number; onPick: (n: number) => void }) {
  return (
    <div className="qp-scale">
      <div className="nums" role="radiogroup" aria-label="דירוג מ-1 עד 7">
        {[1, 2, 3, 4, 5, 6, 7].map(n => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} – ${SCALE_LABELS[n - 1]}`}
            className={`num${value === n ? ' on' : ''}`} onClick={() => onPick(n)}>{n}</button>
        ))}
      </div>
      <div className="ends"><span>{SCALE_LABELS[0]}</span><span>{SCALE_LABELS[6]}</span></div>
      <div className="picked">{value ? SCALE_LABELS[value - 1] : ' '}</div>
    </div>
  );
}

function Field({ q, value, setValue, onNext }: {
  q: Question; value: string | number | undefined; setValue: (v: string | number) => void; onNext: () => void;
}) {
  const str = value === undefined ? '' : String(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (window.innerWidth > 700) ref.current?.focus(); }, [q.id]);
  switch (q.kind) {
    case 'long': return <AutoTextarea value={str} onChange={setValue} placeholder={q.placeholder} autoFocus onSubmit={onNext} />;
    case 'list5': return <List5 value={str} onChange={setValue} />;
    case 'multi': return <Multi q={q} value={str} onChange={setValue} />;
    case 'scale7': return <Scale value={typeof value === 'number' ? value : undefined} onPick={n => setValue(n)} />;
    default:
      return (
        <input ref={ref} className="qp-input" value={str} placeholder={q.placeholder}
          type={q.kind === 'email' ? 'email' : q.kind === 'phone' ? 'tel' : 'text'}
          inputMode={q.kind === 'number' ? 'numeric' : q.kind === 'phone' ? 'tel' : q.kind === 'email' ? 'email' : 'text'}
          autoComplete={q.contact === 'name' ? 'name' : q.contact === 'phone' ? 'tel' : q.contact === 'email' ? 'email' : 'off'}
          dir={q.kind === 'email' || q.kind === 'phone' ? 'ltr' : 'rtl'} maxLength={200}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onNext(); } }} />
      );
  }
}

// ─── הדף ──────────────────────────────────────────────────────────────────────

export default function QuestionnairePage({ mode }: { mode: Mode }) {
  const token = 'token' in mode ? mode.token : '';
  const personal = !!token;
  const [qid, setQid] = useState<QuestionnaireId | null>('qid' in mode ? mode.qid : null);
  const [firstName, setFirstName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phase, setPhase] = useState<Phase>(personal ? 'loading' : 'welcome');
  const [answers, setAnswers] = useState<Answers>({});
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [error, setError] = useState('');
  const [sendMsg, setSendMsg] = useState('');
  const [hp, setHp] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [docOn, setDocOn] = useState(false);
  const startedAt = useRef(Date.now());
  const pdfResolve = useRef<((pages: HTMLElement[]) => void) | null>(null);
  const draftKey = `hq-draft:${token || qid}`;

  const def = qid ? QUESTIONNAIRES[qid] : null;
  const steps = useMemo(() => (def ? buildSteps(def, personal) : []), [def, personal]);
  const qSteps = useMemo(() => steps.filter(s => s.t === 'q').length, [steps]);
  const step = steps[idx];
  const qNumber = steps.slice(0, idx + 1).filter(s => s.t === 'q').length;

  // טעינה
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex, nofollow';
    const ref = document.createElement('meta');
    ref.name = 'referrer'; ref.content = 'no-referrer';
    document.head.append(meta, ref);
    return () => { meta.remove(); ref.remove(); };
  }, []);

  useEffect(() => {
    if (!personal) return;
    fetch(`/api/questionnaires?public=${encodeURIComponent(token)}`)
      .then(async r => {
        if (!r.ok) return setPhase('notfound');
        const d = await r.json() as { qid: QuestionnaireId; status: string; firstName: string; name?: string };
        setQid(d.qid);
        setFirstName(d.firstName);
        setFullName(d.name ?? d.firstName);
        setPhase(d.status === 'ready' ? 'welcome' : (d.status as Phase));
      })
      .catch(() => setPhase('notfound'));
  }, [personal, token]);

  useEffect(() => {
    if (def) document.title = `${def.title} – פנחס הורביץ`;
  }, [def]);

  useEffect(() => {
    if (phase === 'welcome' && qid) setDraft(readDraft(draftKey));
  }, [phase, qid, draftKey]);

  // שמירה אוטומטית
  useEffect(() => {
    if (phase !== 'flow') return;
    const t = setTimeout(() => writeDraft(draftKey, { answers, idx, startedAt: startedAt.current }), 300);
    return () => clearTimeout(t);
  }, [answers, idx, phase, draftKey]);

  const go = useCallback((to: number) => {
    setError('');
    setDir(to > idx ? 'fwd' : 'back');
    setIdx(Math.max(0, Math.min(steps.length - 1, to)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [idx, steps.length]);

  const next = useCallback(() => {
    if (!step) return;
    if (step.t === 'q') {
      const err = validateAnswer(step.q, answers[step.q.id]);
      if (err) { setError(err); return; }
    }
    go(idx + 1);
  }, [step, answers, idx, go]);

  const setValue = useCallback((id: string, v: string | number) => {
    setError('');
    setAnswers(a => ({ ...a, [id]: v }));
  }, []);

  const pick = useCallback((n: number) => {
    if (!step || step.t !== 'q') return;
    setValue(step.q.id, n);
    setTimeout(() => go(idx + 1), 260);
  }, [step, setValue, go, idx]);

  useEffect(() => {
    if (phase !== 'flow' || !step) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
      if (step.t === 'q' && step.q.kind === 'scale7' && /^[1-7]$/.test(e.key)) pick(Number(e.key));
      else if (e.key === 'Enter' && step.t !== 'submit') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, step, pick, next]);

  function start(resume: boolean) {
    if (resume && draft) {
      setAnswers(draft.answers);
      setIdx(Math.min(draft.idx, steps.length - 1));
      startedAt.current = draft.startedAt || Date.now();
    } else {
      clearDraft(draftKey);
      setAnswers({});
      setIdx(0);
      startedAt.current = Date.now();
    }
    setDir('fwd');
    setPhase('flow');
  }

  async function makePdf(): Promise<string | undefined> {
    try {
      const pages = await Promise.race([
        new Promise<HTMLElement[]>(resolve => { pdfResolve.current = resolve; setDocOn(true); }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 25_000)),
      ]);
      return await pagesToPdfBase64(pages);
    } catch (err) {
      console.warn('PDF failed, sending without file', err);
      return undefined;
    } finally {
      setDocOn(false);
      pdfResolve.current = null;
    }
  }

  async function submit() {
    if (!def) return;
    // בדיקה אחרונה של כל שאלות החובה
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.t === 'q' && validateAnswer(s.q, answers[s.q.id])) {
        go(i);
        setTimeout(() => setError(validateAnswer(s.q, answers[s.q.id])), 50);
        return;
      }
    }
    setPhase('sending');
    setSendMsg('מכין עבורך את הקובץ…');
    const clean: Answers = {};
    for (const [k, v] of Object.entries(answers)) {
      clean[k] = typeof v === 'string' ? v.split('\n').map(l => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim() : v;
    }
    const pdfBase64 = await makePdf();
    setSendMsg('שולח לפנחס…');
    try {
      const r = await fetch('/api/questionnaires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit', token: token || undefined, qid: token ? undefined : qid,
          answers: clean, pdfBase64, hp, elapsedMs: Date.now() - startedAt.current,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPhase('flow');
        setError(ERRORS[body.error] ?? 'משהו השתבש בשליחה. התשובות שמורות, אפשר לנסות שוב.');
        return;
      }
      clearDraft(draftKey);
      setPhase('thanks');
      window.scrollTo({ top: 0 });
    } catch {
      setPhase('flow');
      setError('אין חיבור לאינטרנט כרגע. התשובות שמורות במכשיר, אפשר לנסות שוב בעוד רגע.');
    }
  }

  const docScores = useMemo(() => (qid === 'mental' && def ? scoreAnswers(def, answers) : undefined), [qid, def, answers]);

  // ─── מסכים ───

  const shell = (children: React.ReactNode, cls = '') => (
    <div className={`qp ${cls}`} dir="rtl" lang="he">
      <Blobs />
      {children}
    </div>
  );

  if (phase === 'loading') return shell(<div className="qp-center"><div className="qp-spinner" /></div>);

  if (phase === 'notfound' || phase === 'cancelled' || phase === 'expired' || phase === 'done') {
    const msg = {
      notfound: ['הקישור לא נמצא', 'ייתכן שהוא הועתק חלקית. כדאי לבקש מפנחס קישור חדש.'],
      cancelled: ['הקישור בוטל', 'כדאי לפנות לפנחס לקבלת קישור מעודכן.'],
      expired: ['תוקף הקישור פג', 'כדי לשמור על הפרטיות שלך, קישורים אישיים פעילים לזמן מוגבל. אפשר לבקש מפנחס קישור חדש.'],
      done: ['השאלון כבר נשלח', 'התשובות שלך הגיעו לפנחס. תודה רבה!'],
    }[phase];
    return shell(
      <div className="qp-center">
        <img className="qp-logo" src="/contract/logo-crop.jpg" alt="פנחס הורביץ – הבית למטפלים ומאמנים" />
        <h1 className="qp-h1">{msg[0]}</h1>
        <p className="qp-lead">{msg[1]}</p>
        <p className="qp-contact">052-7117224 · pinchashorvitz.co.il</p>
      </div>,
    );
  }

  if (!def) return null;

  if (phase === 'welcome') {
    return shell(
      <div className="qp-welcome qp-anim">
        <img className="qp-logo" src="/contract/logo-crop.jpg" alt="פנחס הורביץ – הבית למטפלים ומאמנים" />
        <p className="qp-kicker">{def.title}</p>
        <h1 className="qp-h1">{firstName ? `${firstName}, ` : ''}{def.greeting}</h1>
        {def.intro.map((p, i) => <p key={i} className="qp-lead">{p}</p>)}
        {def.tips && (
          <ul className="qp-tips">
            {def.tips.map((t, i) => <li key={i}><span>{i + 1}</span>{t}</li>)}
          </ul>
        )}
        <div className="qp-meta">
          <span><Clock /> {def.minutes}</span>
          <span><Lock /> התשובות נשלחות רק לפנחס, ונשמרות בצורה מאובטחת</span>
        </div>
        {draft && Object.keys(draft.answers).length > 0 ? (
          <div className="qp-resume">
            <button className="qp-btn" onClick={() => start(true)}>ממשיכים מאיפה שעצרתי <Arrow /></button>
            <button className="qp-link" onClick={() => start(false)}>להתחיל מההתחלה</button>
          </div>
        ) : (
          <button className="qp-btn big" onClick={() => start(false)}>בוא נתחיל <Arrow /></button>
        )}
        <p className="qp-sign">{personal ? 'מחכה לתשובות שלך,' : 'בהצלחה,'} פנחס</p>
      </div>,
      'is-welcome',
    );
  }

  if (phase === 'thanks') {
    return shell(
      <div className="qp-center qp-thanks qp-anim">
        <div className="qp-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>
        <div className="qp-check"><Check size={44} /></div>
        <h1 className="qp-h1">{def.outroTitle}</h1>
        <p className="qp-lead">{def.outro}</p>
        <p className="qp-sign">פנחס הורביץ<br /><small>הבית למטפלים ומאמנים</small></p>
        <p className="qp-contact">052-7117224 · pinchashorvitz.co.il</p>
      </div>,
    );
  }

  // flow / sending
  const pct = Math.round((qNumber / Math.max(1, qSteps)) * 100);
  const sectionTitle = step?.t === 'q' ? step.sec.title : step?.t === 'section' ? step.sec.title : step?.t === 'scale' ? 'האבחון' : 'סיום';

  return shell(
    <>
      <div className="qp-top">
        <div className="row">
          <img src="/contract/logo-crop.jpg" alt="פנחס הורביץ" />
          <span className="sec">{sectionTitle}</span>
          <span className="cnt">{qNumber}/{qSteps}</span>
        </div>
        <div className="qp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="qp-stage">
        {phase === 'sending' ? (
          <div className="qp-center qp-anim">
            <div className="qp-spinner" />
            <p className="qp-lead">{sendMsg}</p>
            <p className="qp-small">זה לוקח כמה שניות. לא לסגור את הדף.</p>
          </div>
        ) : step && (
          <div key={idx} className={`qp-card qp-anim ${dir}`}>
            {step.t === 'section' && (
              <div className="qp-sectioncard">
                <span className="num">{String(step.num).padStart(2, '0')}</span>
                <h2 className="qp-h1">{step.sec.title}</h2>
                {step.sec.intro && <p className="qp-lead">{step.sec.intro}</p>}
                <p className="qp-small">{(n => (n === 1 ? 'שאלה אחת' : `${n} שאלות`))(step.sec.questions.filter(q => visibleQuestions(def, personal).some(v => v.id === q.id)).length)}</p>
              </div>
            )}

            {step.t === 'scale' && def.scaleIntro && (
              <div className="qp-sectioncard">
                <h2 className="qp-h1">{def.scaleIntro.title}</h2>
                <p className="qp-lead">{def.scaleIntro.text}</p>
                <ol className="qp-scale-legend">
                  {def.scaleIntro.labels.map((l, i) => <li key={l}><b>{i + 1}</b>{l}</li>)}
                </ol>
                <p className="qp-small">טיפ: במחשב אפשר להקיש על המספרים במקלדת.</p>
              </div>
            )}

            {step.t === 'q' && (
              <>
                <h2 className={`qp-q${step.q.kind === 'scale7' ? ' statement' : ''}`}>
                  {step.q.label}
                  {step.q.required && step.q.kind !== 'scale7' && <span className="req" aria-label="חובה"> *</span>}
                </h2>
                {step.q.hint && <p className="qp-hint">{step.q.hint}</p>}
                <Field q={step.q} value={answers[step.q.id]} setValue={v => setValue(step.q.id, v)} onNext={next} />
              </>
            )}

            {step.t === 'submit' && (
              <div className="qp-sectioncard">
                <div className="qp-check"><Check /></div>
                <h2 className="qp-h1">הכל מוכן</h2>
                <p className="qp-lead">ענית על {Object.keys(answers).filter(k => answers[k] !== '' && answers[k] !== undefined).length} שאלות. אפשר לחזור אחורה ולעבור על התשובות, או לשלוח עכשיו לפנחס.</p>
                <p className="qp-privacy"><Lock /> התשובות נשלחות בצורה מאובטחת ומגיעות רק לפנחס.</p>
                <input className="qp-hp" tabIndex={-1} autoComplete="off" value={hp} onChange={e => setHp(e.target.value)} aria-hidden="true" name="website" />
                <button className="qp-btn big" onClick={submit}>שליחה לפנחס <Arrow /></button>
              </div>
            )}

            {error && <p className="qp-err" role="alert">{error}</p>}
          </div>
        )}
      </div>

      {phase === 'flow' && step && step.t !== 'submit' && (
        <nav className="qp-nav">
          <button className="qp-back" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="חזרה"><Arrow back /></button>
          {!(step.t === 'q' && step.q.kind === 'scale7') ? (
            <button className="qp-btn" onClick={next}>
              {step.t === 'q' ? 'המשך' : step.t === 'section' && step.num === 1 ? 'יוצאים לדרך' : 'ממשיכים'} <Arrow />
            </button>
          ) : (
            <button className="qp-btn ghost" onClick={next}>המשך <Arrow /></button>
          )}
          {step.t === 'q' && step.q.kind === 'long' && <span className="qp-kbd">Ctrl + Enter</span>}
        </nav>
      )}
      {phase === 'flow' && step?.t === 'submit' && (
        <nav className="qp-nav"><button className="qp-back" onClick={() => go(idx - 1)} aria-label="חזרה"><Arrow back /></button></nav>
      )}

      {docOn && (
        <QuestionnaireDoc qid={def.id} name={String(answers.name ?? fullName ?? '')} date={new Date().toISOString()}
          answers={answers} personal={personal} scores={docScores} overall={docScores ? overallScore(docScores) : undefined}
          onPages={pages => pdfResolve.current?.(pages)} />
      )}
    </>,
    'is-flow',
  );
}
