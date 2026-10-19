/**
 * לוח גאנט שיווקי — חשוון עד ניסן תשפ״ז, עברי ולועזי.
 * ערוצים = שורות, פעילויות = פסים. לחיצה על שורה ריקה יוצרת פעילות,
 * גרירה מזיזה, גרירת הקצוות משנה אורך. נשמר דרך onUpdate כמו שאר ה-CRM.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { AppState, MarketingPlan, MarketingPlanItem, MarketingPlanStatus } from '../../types';
import { Btn, ConfirmDialog, Input, Modal, SelectInput, Textarea } from '../../ui';
import { uid } from '../../utils';
import {
  HEB_DAY, HEB_MONTH, PLAN_DAYS, PLAN_EVENTS, PLAN_MAX_ISO, PLAN_MIN_ISO, STATUS_LABELS, TRACK_COLORS, WEEKDAY_LABELS,
  assignLanes, clampDay, dayOf, gematria, gregMonthKey, gregMonthLabel, gregShort, hebDate, isoOf, readPlan,
  todayIndex, weekday, writePlan,
} from './marketingPlan';
import './marketingPlan.css';

interface Props {
  state: AppState;
  onUpdate: (s: AppState) => void;
}

type ItemDraft = Omit<MarketingPlanItem, 'id'> & { id: string | null };
type TrackDraft = { id: string | null; name: string; color: number };
type DragMode = 'move' | 'start' | 'end';
type Drag = { id: string; mode: DragMode; x0: number; s0: number; e0: number; s: number; e: number; moved: boolean; tipX: number; tipY: number };

const ZOOMS = [
  { w: 7,  label: 'חודשים' },
  { w: 14, label: 'שבועות' },
  { w: 28, label: 'ימים' },
];

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch { return fallback; }
}
function writePref(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

/** קטעים רציפים של ימים עם אותו מפתח (חודש עברי / חודש לועזי / שבוע) */
function segments(keyOf: (i: number) => string | number) {
  const out: { start: number; len: number }[] = [];
  for (let i = 0; i < PLAN_DAYS;) {
    let j = i + 1;
    while (j < PLAN_DAYS && keyOf(j) === keyOf(i)) j++;
    out.push({ start: i, len: j - i });
    i = j;
  }
  return out;
}
const HEB_MONTH_SEGS = segments(i => HEB_MONTH[i]);
const GREG_MONTH_SEGS = segments(gregMonthKey);
// שבוע מתחיל ביום א׳: מספר השבוע = כמה ימי ראשון עברו עד היום
const WEEK_NO: number[] = [];
for (let i = 0, n = 0; i < PLAN_DAYS; i++) { if (i > 0 && weekday(i) === 0) n++; WEEK_NO.push(n); }
const WEEK_SEGS = segments(i => WEEK_NO[i]);

const rangeHeb = (s: number, e: number) => (s === e ? hebDate(s) : `${hebDate(s)} – ${hebDate(e)}`);
const rangeGreg = (s: number, e: number) => (s === e ? gregShort(s, true) : `${gregShort(s, true)} – ${gregShort(e, true)}`);

export default function MarketingPlanPanel({ state, onUpdate }: Props) {
  const plan = useMemo(() => readPlan(state), [state]);
  const save = (next: MarketingPlan) => onUpdate(writePlan(state, next));

  const TODAY = useMemo(() => todayIndex(), []);
  const [W, setW] = useState<number>(() => {
    const z = readPref('mp-zoom', 14);
    return ZOOMS.some(o => o.w === z) ? z : 14;
  });
  const [showChabad, setShowChabad] = useState<boolean>(() => readPref('mp-chabad', true));
  const [showGlobal, setShowGlobal] = useState<boolean>(() => readPref('mp-global', true));
  const [itemDraft, setItemDraft] = useState<ItemDraft | null>(null);
  const [trackDraft, setTrackDraft] = useState<TrackDraft | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const pendingScrollDay = useRef<number>(Math.max(0, TODAY - 3));

  const TW = PLAN_DAYS * W;
  const x = (i: number) => i * W;

  // גלילה ליום — בגלילה RTL ה-scrollLeft שלילי
  function scrollToDay(i: number) {
    const el = chartRef.current;
    if (!el) return;
    el.scrollLeft = -Math.max(0, x(i) - el.clientWidth * 0.35);
  }
  useEffect(() => {
    scrollToDay(pendingScrollDay.current);
  }, [W]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeZoom(w: number) {
    const el = chartRef.current;
    if (el) pendingScrollDay.current = clampDay(Math.round((-el.scrollLeft + el.clientWidth * 0.35) / W));
    setW(w);
    writePref('mp-zoom', w);
  }

  // ── פעילויות ──────────────────────────────────────────────────────────────

  function openNewItem(preset?: Partial<ItemDraft>) {
    if (!plan.tracks.length) { setTrackDraft({ id: null, name: '', color: 0 }); return; }
    const d0 = clampDay(TODAY);
    setItemDraft({
      id: null, track: plan.tracks[0].id, title: '', status: 'planned', notes: '',
      start: isoOf(d0), end: isoOf(clampDay(d0 + 6)), ...preset,
    });
  }

  function openItem(id: string) {
    const it = plan.items.find(i => i.id === id);
    if (it) setItemDraft({ ...it });
  }

  function saveItem() {
    if (!itemDraft || !itemDraft.start || !itemDraft.end) return;
    let s = clampDay(dayOf(itemDraft.start));
    let e = clampDay(dayOf(itemDraft.end));
    if (e < s) [s, e] = [e, s];
    const data = {
      title: itemDraft.title.trim() || 'ללא שם',
      track: itemDraft.track,
      status: itemDraft.status,
      notes: itemDraft.notes.trim(),
      start: isoOf(s),
      end: isoOf(e),
    };
    const items = itemDraft.id
      ? plan.items.map(i => (i.id === itemDraft.id ? { ...i, ...data } : i))
      : [...plan.items, { id: uid(), ...data }];
    save({ ...plan, items });
    setItemDraft(null);
  }

  function deleteItem(id: string) {
    setConfirm({
      message: 'למחוק את הפעילות?',
      run: () => { save({ ...plan, items: plan.items.filter(i => i.id !== id) }); setItemDraft(null); },
    });
  }

  // ── ערוצים ───────────────────────────────────────────────────────────────

  function saveTrack() {
    if (!trackDraft) return;
    const name = trackDraft.name.trim();
    if (!name) return;
    const tracks = trackDraft.id
      ? plan.tracks.map(t => (t.id === trackDraft.id ? { ...t, name, color: trackDraft.color } : t))
      : [...plan.tracks, { id: uid(), name, color: trackDraft.color }];
    save({ ...plan, tracks });
    setTrackDraft(null);
  }

  function moveTrack(id: string, dir: -1 | 1) {
    const i = plan.tracks.findIndex(t => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= plan.tracks.length) return;
    const tracks = [...plan.tracks];
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    save({ ...plan, tracks });
  }

  function deleteTrack(id: string) {
    const n = plan.items.filter(i => i.track === id).length;
    setConfirm({
      message: n ? `למחוק את הערוץ ואת ${n} הפעילויות שבו?` : 'למחוק את הערוץ?',
      run: () => {
        save({ tracks: plan.tracks.filter(t => t.id !== id), items: plan.items.filter(i => i.track !== id) });
        setTrackDraft(null);
      },
    });
  }

  // ── גרירה ────────────────────────────────────────────────────────────────

  function onBarPointerDown(e: React.PointerEvent<HTMLDivElement>, it: MarketingPlanItem) {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    const mode: DragMode = t.classList.contains('hd') ? (t.classList.contains('r') ? 'start' : 'end') : 'move';
    const s0 = clampDay(dayOf(it.start));
    const e0 = clampDay(dayOf(it.end));
    dragRef.current = { id: it.id, mode, x0: e.clientX, s0, e0, s: s0, e: e0, moved: false, tipX: e.clientX, tipY: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onBarPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 4) return;
    // RTL: תזוזה שמאלה = קדימה בזמן
    const dd = Math.round((d.x0 - e.clientX) / W);
    let s = d.s0, en = d.e0;
    if (d.mode === 'move') { const len = en - s; s = Math.max(0, Math.min(PLAN_DAYS - 1 - len, s + dd)); en = s + len; }
    else if (d.mode === 'start') s = Math.min(en, clampDay(s + dd));
    else en = Math.max(s, clampDay(en + dd));
    const next = { ...d, s, e: en, moved: true, tipX: e.clientX, tipY: e.clientY };
    dragRef.current = next;
    setDrag(next);
  }

  function onBarPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved) { if (e.type === 'pointerup') openItem(d.id); return; }
    if (d.s === d.s0 && d.e === d.e0) return;
    save({ ...plan, items: plan.items.map(i => (i.id === d.id ? { ...i, start: isoOf(d.s), end: isoOf(d.e) } : i)) });
  }

  function onRowClick(e: React.MouseEvent<HTMLDivElement>, trackId: string) {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    const d = clampDay(Math.floor((r.right - e.clientX) / W));
    openNewItem({ track: trackId, start: isoOf(d), end: isoOf(clampDay(d + 6)) });
  }

  // ── שורות מועדים ─────────────────────────────────────────────────────────

  const eventLanes: { label: string; kinds: string[] }[] = [{ label: 'מועדים וראשי חודשים', kinds: ['j', 'r'] }];
  if (showChabad) eventLanes.push({ label: 'ימי חב״ד', kinds: ['c'] });
  if (showGlobal) eventLanes.push({ label: 'אזרחי ומסחרי', kinds: ['g'] });

  const sortedItems = useMemo(
    () => [...plan.items].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)),
    [plan.items],
  );
  const trackById = (id: string) => plan.tracks.find(t => t.id === id);

  const draftS = itemDraft?.start ? dayOf(itemDraft.start) : NaN;
  const draftE = itemDraft?.end ? dayOf(itemDraft.end) : NaN;
  const hebHint = (i: number) =>
    Number.isNaN(i) ? '' : i < 0 || i >= PLAN_DAYS ? 'מחוץ לטווח הלוח' : `יום ${WEEKDAY_LABELS[weekday(i)]} · ${hebDate(i)} תשפ״ז`;

  return (
    <div className="mp" dir="rtl">
      {/* סרגל כלים */}
      <div className="flex flex-wrap items-center gap-2">
        <Btn onClick={() => openNewItem()} className="!bg-[#C7263A] hover:!bg-[#A31F31]">+ פעילות חדשה</Btn>
        <Btn variant="secondary" onClick={() => setTrackDraft({ id: null, name: '', color: plan.tracks.length % TRACK_COLORS.length })}>+ ערוץ / שורה</Btn>
        <Btn variant="ghost" onClick={() => scrollToDay(Math.max(0, TODAY))}>היום</Btn>
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showChabad} onChange={e => { setShowChabad(e.target.checked); writePref('mp-chabad', e.target.checked); }} />
          ימי חב״ד
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showGlobal} onChange={e => { setShowGlobal(e.target.checked); writePref('mp-global', e.target.checked); }} />
          מועדים אזרחיים
        </label>
        <div className="mp-seg" role="group" aria-label="זום">
          {ZOOMS.map(z => (
            <button key={z.w} type="button" aria-pressed={W === z.w} onClick={() => changeZoom(z.w)}>{z.label}</button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500 -mt-1">
        א׳ בחשוון – ל׳ בניסן תשפ״ז · 12.10.2026 – 7.5.2027 · שנה מעוברת: אדר א׳ ואדר ב׳
      </p>

      {/* הגאנט */}
      <div className="mp-chart" ref={chartRef}>
        <div className="mp-sheet" style={{ width: `calc(var(--mp-label) + ${TW}px)` }}>
          <div className="mp-head">
            <div className="mp-row mp-hrow mp-hm">
              <div className="mp-lab">חודש עברי</div>
              <div className="mp-tl" style={{ width: TW }}>
                {HEB_MONTH_SEGS.map(s => (
                  <div key={s.start} className="mp-hcell" style={{ right: x(s.start), width: s.len * W }}
                    title={`${HEB_MONTH[s.start]} תשפ״ז · ${rangeGreg(s.start, s.start + s.len - 1)}`}>
                    {HEB_MONTH[s.start]}{s.len * W > 110 && <small>תשפ״ז</small>}
                  </div>
                ))}
              </div>
            </div>
            <div className="mp-row mp-hrow mp-gm">
              <div className="mp-lab">חודש לועזי</div>
              <div className="mp-tl" style={{ width: TW }}>
                {GREG_MONTH_SEGS.map(s => (
                  <div key={s.start} className="mp-hcell" style={{ right: x(s.start), width: s.len * W }}>{gregMonthLabel(s.start)}</div>
                ))}
              </div>
            </div>
            <div className="mp-row mp-hrow mp-wk">
              <div className="mp-lab">{W >= 28 ? 'יום' : 'שבוע מיום א׳'}</div>
              <div className="mp-tl" style={{ width: TW }}>
                {W >= 28
                  ? Array.from({ length: PLAN_DAYS }, (_, i) => (
                      <div key={i} className="mp-hcell" style={{ right: x(i), width: W }} title={`${WEEKDAY_LABELS[weekday(i)]} · ${hebDate(i)}`}>
                        <b>{gregShort(i)}</b><span>{gematria(HEB_DAY[i])}</span>
                      </div>
                    ))
                  : WEEK_SEGS.map(s => (
                      <div key={s.start} className="mp-hcell" style={{ right: x(s.start), width: s.len * W }}
                        title={`שבוע ${rangeGreg(s.start, s.start + s.len - 1)} · ${rangeHeb(s.start, s.start + s.len - 1)}`}>
                        {s.len * W >= 40 && <>
                          <b>{gregShort(s.start)}</b>
                          <span>{gematria(HEB_DAY[s.start])}{W >= 14 ? ` ${HEB_MONTH[s.start]}` : ''}</span>
                        </>}
                      </div>
                    ))}
              </div>
            </div>
            {eventLanes.map(lane => (
              <div key={lane.label} className="mp-row mp-hol">
                <div className="mp-lab">{lane.label}</div>
                <div className="mp-tl" style={{ width: TW }}>
                  {PLAN_EVENTS.filter(ev => lane.kinds.includes(ev.k)).map(ev => {
                    const s = dayOf(ev.d);
                    const en = ev.e ? dayOf(ev.e) : s;
                    return (
                      <div key={ev.d + ev.t} className={`mp-ev k-${ev.k} ${ev.e ? 'span' : 'pt'}`}
                        style={{ right: x(s), ...(ev.e ? { width: (en - s + 1) * W } : {}) }}
                        title={`${ev.t} · ${rangeHeb(s, en)} · ${rangeGreg(s, en)}\n${ev.x}`}>
                        <span className="t">{ev.t}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mp-body">
            <div className="mp-overlay" style={{ right: 'var(--mp-label)', width: TW }}>
              {Array.from({ length: PLAN_DAYS }, (_, i) => {
                const wd = weekday(i);
                return (
                  <Fragment key={i}>
                    {wd === 6 && <div className="sh" style={{ right: x(i), width: W }} />}
                    {HEB_DAY[i] === 1
                      ? <div className="ml" style={{ right: x(i) }} />
                      : (wd === 0 || W >= 28) && <div className="wl" style={{ right: x(i) }} />}
                  </Fragment>
                );
              })}
              {PLAN_EVENTS.filter(ev => ev.fest && ev.e).map(ev => {
                const s = dayOf(ev.d);
                return <div key={ev.d} className="fs" style={{ right: x(s), width: (dayOf(ev.e!) - s + 1) * W }} />;
              })}
              {TODAY >= 0 && TODAY < PLAN_DAYS && <div className="td" style={{ right: x(TODAY) + W / 2 - 1 }} />}
            </div>
            {TODAY >= 0 && TODAY < PLAN_DAYS && (
              <div className="mp-todaytag" style={{ right: `calc(var(--mp-label) + ${x(TODAY) + W / 2}px)` }}>היום · {hebDate(TODAY)}</div>
            )}

            {!plan.tracks.length && (
              <div className="p-8 text-gray-500 sticky right-0 max-w-xl">
                <p className="font-bold text-gray-800 text-lg">הלוח ריק</p>
                מתחילים מ״+ ערוץ / שורה״: כל שורה היא ערוץ שיווק. אחר כך לוחצים על השורה כדי לשבץ פעילות.
              </div>
            )}

            {plan.tracks.map(tr => {
              const items = plan.items.filter(i => i.track === tr.id);
              const { lane, count } = assignLanes(items);
              const color = TRACK_COLORS[tr.color] ?? TRACK_COLORS[0];
              return (
                <div key={tr.id} className="mp-row mp-trk" style={{ height: count * 32 + 12 }}>
                  <div className="mp-lab" role="button" tabIndex={0} title="עריכת הערוץ" aria-label={`עריכת הערוץ ${tr.name}`}
                    onClick={() => setTrackDraft({ ...tr })}
                    onKeyDown={e => { if (e.key === 'Enter') setTrackDraft({ ...tr }); }}>
                    <span className="mp-tname"><i className="mp-sw" style={{ background: color }} /><span>{tr.name}</span></span>
                    <span className="mp-tcount">{items.length || ''}</span>
                  </div>
                  <div className="mp-tl" style={{ width: TW }} onClick={e => onRowClick(e, tr.id)}>
                    {items.map(it => {
                      const live = drag?.id === it.id ? drag : null;
                      const s = live ? live.s : clampDay(dayOf(it.start));
                      const en = live ? live.e : clampDay(dayOf(it.end));
                      return (
                        <div key={it.id} role="button" tabIndex={0}
                          className={`mp-bar s-${it.status}${live ? ' dragging' : ''}`}
                          style={{
                            right: x(s) + 1, width: Math.max((en - s + 1) * W - 2, 6), top: 6 + lane[it.id] * 32,
                            background: color, color: it.status === 'idea' ? color : '#fff',
                          }}
                          title={`${it.title}\n${rangeHeb(s, en)} · ${rangeGreg(s, en)}\n${STATUS_LABELS[it.status]}${it.notes ? '\n' + it.notes : ''}`}
                          onPointerDown={e => onBarPointerDown(e, it)}
                          onPointerMove={onBarPointerMove}
                          onPointerUp={onBarPointerUp}
                          onPointerCancel={onBarPointerUp}
                          onKeyDown={e => { if (e.key === 'Enter') openItem(it.id); }}>
                          <span className="bt">{it.title || 'ללא שם'}</span>
                          <span className="hd r" /><span className="hd l" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {drag?.moved && (
        <div className="mp-dragtip" style={{ left: drag.tipX + 12, top: drag.tipY + 14 }}>
          {rangeHeb(drag.s, drag.e)} · {rangeGreg(drag.s, drag.e)}
        </div>
      )}

      <div className="mp-legend">
        <span><i className="mp-lg idea" />רעיון</span>
        <span><i className="mp-lg" />מתוכנן</span>
        <span><i className="mp-lg doing" />בביצוע</span>
        <span><i className="mp-lg done" />בוצע</span>
        <span><i className="mp-lg sh" />שבת</span>
        <span><i className="mp-lg fs" />חג</span>
        <span>לחיצה על שורה ריקה יוצרת פעילות · גרירה מזיזה · גרירת הקצוות משנה אורך</span>
      </div>

      {/* רשימה כרונולוגית */}
      <div>
        <h3 className="text-base font-bold text-gray-800 mb-2">כל הפעילויות לפי תאריך</h3>
        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white">
          <table className="mp-table">
            <thead><tr><th>פעילות</th><th>ערוץ</th><th>תאריך לועזי</th><th>תאריך עברי</th><th>סטטוס</th></tr></thead>
            <tbody>
              {!sortedItems.length && (
                <tr><td colSpan={5} className="text-gray-500">עדיין אין פעילויות. לחיצה על שורה בגאנט, או ״+ פעילות חדשה״, מוסיפה את הראשונה.</td></tr>
              )}
              {sortedItems.map((it, idx) => {
                const s = clampDay(dayOf(it.start));
                const en = clampDay(dayOf(it.end));
                const prev = idx > 0 ? HEB_MONTH[clampDay(dayOf(sortedItems[idx - 1].start))] : '';
                const tr = trackById(it.track);
                return [
                  HEB_MONTH[s] !== prev && (
                    <tr key={'m' + it.id} className="sep"><td colSpan={5}>{HEB_MONTH[s]} · {gregMonthLabel(s)}</td></tr>
                  ),
                  <tr key={it.id} className="it" onClick={() => openItem(it.id)}>
                    <td><b>{it.title || 'ללא שם'}</b>{it.notes && <div className="text-xs text-gray-500 whitespace-pre-line">{it.notes}</div>}</td>
                    <td>{tr && <span className="inline-flex items-center gap-1.5"><i className="mp-sw" style={{ background: TRACK_COLORS[tr.color] }} />{tr.name}</span>}</td>
                    <td className="d">{rangeGreg(s, en)}<small>{WEEKDAY_LABELS[weekday(s)]}{en !== s ? ` עד ${WEEKDAY_LABELS[weekday(en)]}` : ''} · {en - s + 1} ימים</small></td>
                    <td className="d">{rangeHeb(s, en)}</td>
                    <td><span className={`mp-pill ${it.status}`}>{STATUS_LABELS[it.status]}</span></td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* עריכת פעילות */}
      <Modal open={!!itemDraft} onClose={() => setItemDraft(null)} title={itemDraft?.id ? 'עריכת פעילות' : 'פעילות חדשה'}>
        {itemDraft && (
          <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); saveItem(); }}>
            <label className="flex flex-col gap-1 text-sm text-gray-600">שם הפעילות
              <Input autoFocus value={itemDraft.title} onChange={v => setItemDraft({ ...itemDraft, title: v })} placeholder="למשל: וובינר השקה לביזנסתרפיה" />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-600">ערוץ
                <SelectInput value={itemDraft.track} onChange={v => setItemDraft({ ...itemDraft, track: v })}
                  options={plan.tracks.map(t => ({ value: t.id, label: t.name }))} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-600">סטטוס
                <SelectInput value={itemDraft.status} onChange={v => setItemDraft({ ...itemDraft, status: v as MarketingPlanStatus })}
                  options={(Object.keys(STATUS_LABELS) as MarketingPlanStatus[]).map(k => ({ value: k, label: STATUS_LABELS[k] }))} />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-600">מתאריך
                <input type="date" min={PLAN_MIN_ISO} max={PLAN_MAX_ISO} required value={itemDraft.start}
                  className="border border-gray-300 rounded-xl px-3 py-2 text-sm"
                  onChange={e => {
                    const start = e.target.value;
                    setItemDraft({ ...itemDraft, start, end: itemDraft.end && itemDraft.end < start ? start : itemDraft.end });
                  }} />
                <span className="text-xs text-[#A8234A] min-h-[1em]">{hebHint(draftS)}</span>
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-600">עד תאריך
                <input type="date" min={PLAN_MIN_ISO} max={PLAN_MAX_ISO} required value={itemDraft.end}
                  className="border border-gray-300 rounded-xl px-3 py-2 text-sm"
                  onChange={e => setItemDraft({ ...itemDraft, end: e.target.value })} />
                <span className="text-xs text-[#A8234A] min-h-[1em]">{hebHint(draftE)}</span>
              </label>
            </div>
            {!Number.isNaN(draftS) && !Number.isNaN(draftE) && (
              <p className="text-xs text-gray-500">{draftE >= draftS ? `${draftE - draftS + 1} ימים` : 'תאריך הסיום לפני תאריך ההתחלה'}</p>
            )}
            <label className="flex flex-col gap-1 text-sm text-gray-600">הערות, יעד, אחראי
              <Textarea value={itemDraft.notes} onChange={v => setItemDraft({ ...itemDraft, notes: v })} placeholder="מה המטרה? מי אחראי? מה התקציב?" />
            </label>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Btn type="submit" className="!bg-[#C7263A] hover:!bg-[#A31F31]">שמירה</Btn>
              <Btn variant="secondary" onClick={() => setItemDraft(null)}>ביטול</Btn>
              <span className="flex-1" />
              {itemDraft.id && <Btn variant="ghost" className="!text-red-700" onClick={() => deleteItem(itemDraft.id!)}>מחיקה</Btn>}
            </div>
          </form>
        )}
      </Modal>

      {/* עריכת ערוץ */}
      <Modal open={!!trackDraft} onClose={() => setTrackDraft(null)} title={trackDraft?.id ? 'עריכת ערוץ' : 'ערוץ חדש'}>
        {trackDraft && (
          <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); saveTrack(); }}>
            <label className="flex flex-col gap-1 text-sm text-gray-600">שם הערוץ
              <Input autoFocus value={trackDraft.name} onChange={v => setTrackDraft({ ...trackDraft, name: v })} placeholder="למשל: וובינרים" />
            </label>
            <div className="flex flex-col gap-1 text-sm text-gray-600">צבע
              <div className="mp-colors">
                {TRACK_COLORS.map((c, i) => (
                  <button key={c} type="button" aria-label={`צבע ${i + 1}`} aria-pressed={trackDraft.color === i}
                    style={{ background: c }} onClick={() => setTrackDraft({ ...trackDraft, color: i })} />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Btn type="submit" className="!bg-[#C7263A] hover:!bg-[#A31F31]">שמירה</Btn>
              <Btn variant="secondary" onClick={() => setTrackDraft(null)}>ביטול</Btn>
              {trackDraft.id && <>
                <Btn variant="ghost" title="הזזה למעלה" onClick={() => moveTrack(trackDraft.id!, -1)}>↑</Btn>
                <Btn variant="ghost" title="הזזה למטה" onClick={() => moveTrack(trackDraft.id!, 1)}>↓</Btn>
              </>}
              <span className="flex-1" />
              {trackDraft.id && <Btn variant="ghost" className="!text-red-700" onClick={() => deleteTrack(trackDraft.id!)}>מחיקה</Btn>}
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog open={!!confirm} message={confirm?.message ?? ''}
        onConfirm={() => { confirm?.run(); setConfirm(null); }}
        onCancel={() => setConfirm(null)} />
    </div>
  );
}
