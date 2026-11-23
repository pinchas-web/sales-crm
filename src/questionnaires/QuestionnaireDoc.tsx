/**
 * מסמך התשובות בעמודי A4 — בשביל ה-PDF.
 * בונים "בלוקים" (כותרת, שאלה+תשובה, ציונים...), מודדים את הגובה של כל אחד,
 * ומחלקים לעמודים כך ששום שאלה לא נחתכת באמצע. תשובה ארוכה מאוד מתפצלת לכמה בלוקים.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  QUESTIONNAIRES, SCALE_LABELS, LEVEL_LABELS, answerText, visibleQuestions,
  type Answers, type QuestionnaireId, type SectionScore,
} from '../../api/_lib/questionnaireDefs';
import './questionnaire.css';

export const PAGE_W = 794;
export const PAGE_H = 1123;
const PAD_X = 56;
const FIRST_TOP = 214;
const NEXT_TOP = 92;
const BOTTOM = 70;

type Block =
  | { k: 'scores'; scores: SectionScore[]; overall: number | null }
  | { k: 'summary-title' }
  | { k: 'summary-line'; text: string; head: boolean; bullet: boolean }
  | { k: 'section'; title: string; scale: boolean }
  | { k: 'qa'; label: string; text: string; cont: boolean }
  | { k: 'rate'; label: string; value?: number; polarity?: number }
  | { k: 'legend' };

export interface DocProps {
  qid: QuestionnaireId;
  name: string;
  date: string;
  answers: Answers;
  personal: boolean;
  scores?: SectionScore[];
  overall?: number | null;
  summary?: string;
  /** נקרא כשהעמודים מוכנים לצילום */
  onPages?: (pages: HTMLElement[]) => void;
}

function chunks(text: string, size = 900): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size);
    if (cut < size * 0.5) cut = rest.lastIndexOf(' ', size);
    if (cut < size * 0.5) cut = size;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

function buildBlocks(p: DocProps): Block[] {
  const def = QUESTIONNAIRES[p.qid];
  const visible = new Set(visibleQuestions(def, p.personal).map(q => q.id));
  const blocks: Block[] = [];
  if (p.scores?.length) blocks.push({ k: 'scores', scores: p.scores, overall: p.overall ?? null });
  if (p.summary?.trim()) {
    blocks.push({ k: 'summary-title' });
    for (const raw of p.summary.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const head = line.startsWith('#');
      const bullet = line.startsWith('- ');
      blocks.push({ k: 'summary-line', head, bullet, text: line.replace(/^#+\s*/, '').replace(/^- /, '').replace(/\*\*/g, '') });
    }
  }
  let legendShown = false;
  for (const sec of def.sections) {
    const qs = sec.questions.filter(q => visible.has(q.id));
    if (!qs.length) continue;
    const scale = qs.some(q => q.kind === 'scale7');
    if (scale && !legendShown) { blocks.push({ k: 'legend' }); legendShown = true; }
    blocks.push({ k: 'section', title: sec.title, scale });
    for (const q of qs) {
      if (q.kind === 'scale7') {
        const v = Number(p.answers[q.id]);
        blocks.push({ k: 'rate', label: q.label, value: Number.isInteger(v) ? v : undefined, polarity: q.polarity });
        continue;
      }
      const text = answerText(q, p.answers[q.id]) || '—';
      chunks(text).forEach((t, i) => blocks.push({ k: 'qa', label: q.label, text: t, cont: i > 0 }));
    }
  }
  return blocks;
}

function ScoreBars({ scores, overall }: { scores: SectionScore[]; overall: number | null }) {
  return (
    <div className="qd-scores">
      <div className="qd-scores-head">
        <b>תמונת מצב לפי תחום</b>
        {overall != null && <span>ממוצע כללי <b>{overall}</b></span>}
      </div>
      {scores.map(s => (
        <div key={s.id} className="qd-bar">
          <span className="l">{s.label}</span>
          <span className="t"><i className={s.level} style={{ width: `${Math.max(3, s.pct)}%` }} /></span>
          <span className={`v ${s.level}`}>{s.pct}</span>
          <span className="lv">{LEVEL_LABELS[s.level]}</span>
        </div>
      ))}
      <p className="qd-note">0–100, גבוה = חוזקה. היגדים שבהם הסכמה מעידה על קושי מחושבים הפוך.</p>
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.k) {
    case 'scores': return <ScoreBars scores={b.scores} overall={b.overall} />;
    case 'summary-title': return <div className="qd-sum-title">סיכום הכנה לפגישה</div>;
    case 'summary-line':
      return b.head ? <div className="qd-sum-h">{b.text}</div>
        : <div className={`qd-sum-p${b.bullet ? ' bullet' : ''}`}>{b.text}</div>;
    case 'legend':
      return (
        <div className="qd-legend">
          {SCALE_LABELS.map((l, i) => <span key={l}><b>{i + 1}</b> {l}</span>)}
        </div>
      );
    case 'section': return <div className="qd-sec">{b.title}</div>;
    case 'qa':
      return (
        <div className="qd-qa">
          {!b.cont && <div className="q">{b.label}</div>}
          <div className="a">{b.cont ? '…' : ''}{b.text}</div>
        </div>
      );
    case 'rate':
      return (
        <div className="qd-rate">
          <span className="q">{b.label}{b.polarity === -1 && <em> (הפוך)</em>}</span>
          <span className={`v${b.value ? '' : ' empty'}`}>{b.value ?? '—'}</span>
        </div>
      );
  }
}

export default function QuestionnaireDoc(p: DocProps) {
  const { qid, answers, scores, overall, summary, personal } = p;
  const def = QUESTIONNAIRES[qid];
  const blocks = useMemo(
    () => buildBlocks({ qid, answers, scores, overall, summary, personal, name: '', date: '' }),
    [qid, answers, scores, overall, summary, personal],
  );
  const measureRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][] | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    (async () => {
      await document.fonts?.ready;
      const el = measureRef.current;
      if (!el || cancelled) return;
      const heights = Array.from(el.children).map(c => (c as HTMLElement).getBoundingClientRect().height + 10);
      const out: number[][] = [[]];
      let room = PAGE_H - FIRST_TOP - BOTTOM;
      heights.forEach((h, i) => {
        const cur = out[out.length - 1];
        // כותרת מקטע לא נשארת לבד בתחתית עמוד
        const isHeader = blocks[i].k === 'section' || blocks[i].k === 'summary-title' || blocks[i].k === 'legend';
        const need = isHeader ? h + (heights[i + 1] ?? 0) : h;
        if (cur.length && need > room) {
          out.push([]);
          room = PAGE_H - NEXT_TOP - BOTTOM;
        }
        out[out.length - 1].push(i);
        room -= h;
      });
      if (!cancelled) setPages(out);
    })();
    return () => { cancelled = true; };
  }, [blocks]);

  useLayoutEffect(() => {
    if (!pages || !pagesRef.current || !p.onPages) return;
    const els = Array.from(pagesRef.current.querySelectorAll<HTMLElement>('.qd-page'));
    // נותנים לדפדפן לצייר לפני הצילום
    const t = setTimeout(() => p.onPages?.(els), 60);
    return () => clearTimeout(t);
  }, [pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const dateText = new Date(p.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="qd-root" aria-hidden="true">
      <div ref={measureRef} className="qd-measure" style={{ width: PAGE_W - PAD_X * 2 }}>
        {blocks.map((b, i) => <div key={i} className="qd-block"><BlockView b={b} /></div>)}
      </div>
      {pages && (
        <div ref={pagesRef}>
          {pages.map((idxs, pi) => (
            <div key={pi} className="qd-page" style={{ width: PAGE_W, height: PAGE_H }}>
              <svg className="qd-blob" viewBox="0 0 200 200" aria-hidden="true">
                <path d="M160 18c34 22 42 74 18 112-25 40-80 62-118 42C22 152 6 104 26 66 46 26 120-8 160 18z" fill="#F1ECD3" />
              </svg>
              {pi === 0 ? (
                <div className="qd-head">
                  <img src="/contract/logo-crop.jpg" alt="" />
                  <div>
                    <div className="k">{def.title}</div>
                    <div className="n">{p.name}</div>
                    <div className="d">{dateText}</div>
                  </div>
                </div>
              ) : (
                <div className="qd-head small">
                  <span>{def.shortTitle} · {p.name}</span>
                  <span>פנחס הורביץ · הבית למטפלים ומאמנים</span>
                </div>
              )}
              <div className="qd-body" style={{ top: pi === 0 ? FIRST_TOP : NEXT_TOP, left: PAD_X, right: PAD_X }}>
                {idxs.map(i => <div key={i} className="qd-block"><BlockView b={blocks[i]} /></div>)}
              </div>
              <div className="qd-foot">
                <span>מסמך אישי וחסוי</span>
                <span>עמוד {pi + 1} מתוך {pages.length}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
