/**
 * עמוד הבית — תמונת מצב מלאה של היום.
 * KPI cards, לידים חמים, משימות היום, פתקים ממוסמרים, ותקציר צ'אט.
 */
import { useState, useMemo } from 'react';
import type { AppState, Task, PinnedNote } from '../types';
import { TODAY, greeting, getL, getHotLeads, calcCommission, openGoogleCalendar, openWhatsApp, timeAgo, NOTE_COLORS, uid } from '../utils';
import { Btn, ScoreBadge, Textarea } from '../ui';

// ─── KPI Cards ────────────────────────────────────────────────────────────────

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCard({ icon, value, label, sub, color: _color }: {
  icon: string; value: string | number; label: string; sub?: string; color: string;
}) {
  return (
    <div className="brand-kpi-card p-4 sm:p-5 flex items-center gap-4 cursor-default select-none">
      <div className="w-12 h-12 rounded-2xl bg-amber-50/80 border border-amber-200/50 flex items-center justify-center text-2xl shadow-xs flex-shrink-0 transition-transform group-hover:scale-110">
        <span className="transition-transform hover:scale-125 duration-200 inline-block">{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 leading-none mb-1">
          {value}
        </p>
        <p className="text-xs font-semibold text-gray-500 truncate">{label}</p>
        {sub && <p className="text-[11px] font-medium text-amber-700/90 mt-1 bg-amber-50 inline-block px-1.5 py-0.5 rounded-md border border-amber-200/50">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Hot Leads Table ──────────────────────────────────────────────────────────

function HotLeadsTable({ state, onLeadClick }: { state: AppState; onLeadClick: () => void }) {
  const hot = useMemo(() => getHotLeads(state), [state]);
  const myHot = state.users.find(u => u.id === state.currentUserId)?.role === 'admin'
    ? hot
    : hot.filter(l => l.assigned_to === state.currentUserId);

  if (myHot.length === 0) return (
    <div className="bg-white rounded-2xl border border-gray-200/80 p-6 flex flex-col items-center justify-center min-h-48 shadow-sm">
      <span className="text-4xl mb-2 animate-bounce">🎉</span>
      <p className="text-gray-500 text-sm font-medium">אין לידים חמים להיום — מעולה!</p>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden transition-all hover:shadow-md">
      <div className="px-4 py-3 bg-gradient-to-r from-red-50 to-orange-50/50 border-b border-red-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg brand-hot-flame">🔥</span>
          <h3 className="font-bold text-red-800 text-sm">לידים חמים לטיפול</h3>
        </div>
        <span className="bg-red-600 text-white text-xs font-extrabold px-2.5 py-0.5 rounded-full shadow-xs brand-hot-badge">{myHot.length}</span>
      </div>
      <div className="divide-y divide-gray-100 overflow-y-auto max-h-72">
        {myHot.map(lead => {
          const status = state.statuses.find(s => s.id === lead.status);
          const user   = state.users.find(u => u.id === lead.assigned_to);
          const isNew  = lead.created_at.startsWith(TODAY);
          return (
            <div key={lead.id} onClick={() => onLeadClick()}
              className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50/40 cursor-pointer transition-all duration-150 group">
              <ScoreBadge score={lead.score} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-gray-900 group-hover:text-red-700 transition-colors truncate">{lead.name}</p>
                  {isNew && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold shrink-0 border border-red-200">חדש!</span>}
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {status?.label} · {user?.name}
                  {lead.lastActivityAt && ` · ${timeAgo(lead.lastActivityAt)}`}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={e => { e.stopPropagation(); openWhatsApp(lead.phone); }}
                  title="שלח WhatsApp"
                  className="brand-action-circle w-8 h-8 flex items-center justify-center bg-green-50 text-green-600 hover:bg-green-600 hover:text-white border border-green-200/60 shadow-xs">
                  💬
                </button>
                <button onClick={e => { e.stopPropagation(); window.location.href = `tel:${lead.phone}`; }}
                  title="חייג עכשיו"
                  className="brand-action-circle w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-200/60 shadow-xs">
                  ☎️
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Task Checklist ───────────────────────────────────────────────────────────

function TaskChecklist({ state, onToggle, onAddTask, onLeadClick }: {
  state: AppState; onToggle: (id: string) => void;
  onAddTask: (t: Task) => void; onLeadClick: () => void;
}) {
  const [note, setNote] = useState('');
  const [time, setTime] = useState('');
  const [justChecked, setJustChecked] = useState<string | null>(null);

  const tasks = useMemo(() =>
    [...state.tasks.filter(t => t.assigned_to === state.currentUserId && t.due_date === TODAY)]
      .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99')),
    [state.tasks, state.currentUserId]
  );
  const done  = tasks.filter(t => t.done).length;
  const pct   = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const isAllDone = tasks.length > 0 && done === tasks.length;

  function handleAdd() {
    if (!note.trim()) return;
    onAddTask({ id: uid(), due_date: TODAY, time: time || undefined, note: note.trim(), assigned_to: state.currentUserId, done: false });
    setNote(''); setTime('');
  }

  function handleCheck(id: string) {
    setJustChecked(id);
    onToggle(id);
    setTimeout(() => setJustChecked(null), 500);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 flex flex-col overflow-hidden shadow-sm transition-all hover:shadow-md">
      {/* Header with high-tech progress */}
      <div className="bg-gradient-to-l from-red-900 via-red-800 to-red-700 px-5 py-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <span className="font-extrabold text-sm flex items-center gap-2">
            <span>✅</span>
            <span>משימות להיום</span>
          </span>
          <span className="text-xs font-bold bg-white/20 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-white/20">
            {done} מתוך {tasks.length} ({pct}%)
          </span>
        </div>
        {/* Animated Progress Bar */}
        <div className="w-full bg-black/25 rounded-full h-2 overflow-hidden p-0.5 border border-white/15">
          <div
            className="h-full rounded-full transition-all duration-500 brand-progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 100% Celebration banner when completed! */}
      {isAllDone && (
        <div className="brand-celebrate-box p-3 text-center border-b border-amber-200/60 flex items-center justify-center gap-2">
          <span className="text-xl">🏆</span>
          <span className="text-xs font-extrabold text-amber-900">כל הכבוד! כל משימות היום הושלמו בהצלחה!</span>
          <span className="text-xl">✨</span>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 divide-y divide-gray-100 overflow-y-auto max-h-64">
        {tasks.length === 0 && (
          <div className="text-center py-8">
            <span className="text-3xl block mb-1">🎯</span>
            <p className="text-gray-400 text-sm font-medium">אין משימות פתוחות להיום</p>
          </div>
        )}
        {tasks.map((t, i) => {
          const lead = t.lead_id ? state.leads.find(l => l.id === t.lead_id) : null;
          const isAnimating = justChecked === t.id;
          return (
            <div key={t.id}
              className={`flex items-start gap-3 px-4 py-2.5 brand-task-item ${t.done ? 'bg-gray-50/80 opacity-70' : 'hover:bg-amber-50/20'} ${isAnimating ? 'brand-task-checked' : ''} transition-all`}>
              <span className="text-xs text-gray-300 font-mono w-4 text-center mt-0.5 shrink-0">{i + 1}</span>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => handleCheck(t.id)}
                className="mt-1 w-4 h-4 rounded cursor-pointer shrink-0 accent-red-700 transition-transform hover:scale-110 active:scale-95"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium transition-all ${t.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {t.note}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {t.time && (
                    <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md">
                      ⏰ {t.time}
                    </span>
                  )}
                  {lead && (
                    <button onClick={() => onLeadClick()} className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[9rem] flex items-center gap-1">
                      <span>👤</span>
                      <span>{lead.name}</span>
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => openGoogleCalendar(t, lead ?? undefined)}
                title="הוסף ליומן Google"
                className="brand-action-circle w-7 h-7 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg shrink-0 text-sm">
                📅
              </button>
            </div>
          );
        })}
      </div>

      {/* Add task bar */}
      <div className="border-t border-gray-100 p-2.5 bg-gray-50/70">
        <div className="flex gap-1.5">
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="border border-gray-300 rounded-xl px-2 py-1.5 text-xs w-20 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 shadow-xs" />
          <input value={note} onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="הוסף משימה חדשה להיום..."
            className="flex-1 border border-gray-300 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 shadow-xs" />
          <Btn size="xs" onClick={handleAdd} disabled={!note.trim()} className="px-3 rounded-xl">+ הוסף</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Pinned Notes Panel ───────────────────────────────────────────────────────

function PinnedNotesPanel({ state, onAdd, onDelete }: {
  state: AppState;
  onAdd: (note: PinnedNote) => void;
  onDelete: (id: string) => void;
}) {
  const [content, setContent] = useState('');
  const [color, setColor] = useState<PinnedNote['color']>('yellow');
  const notes = state.pinnedNotes.filter(n => n.userId === state.currentUserId || state.users.find(u => u.id === state.currentUserId)?.role === 'admin');

  const COLORS: PinnedNote['color'][] = ['yellow', 'blue', 'pink', 'green', 'purple'];
  const EMOJIS: Record<string, string> = { yellow: '⭐', blue: '💙', pink: '🩷', green: '💚', purple: '💜' };

  function handleAdd() {
    if (!content.trim()) return;
    onAdd({ id: uid(), userId: state.currentUserId, content: content.trim(), createdAt: new Date().toISOString(), color });
    setContent('');
  }

  return (
    <div className="bg-white rounded-2xl border overflow-hidden">
      <div className="px-4 py-3 border-b bg-amber-50">
        <h3 className="font-bold text-amber-700 text-sm flex items-center gap-2">📌 פתקים חשובים</h3>
      </div>
      <div className="p-3 space-y-2 max-h-52 overflow-y-auto">
        {notes.length === 0 && <p className="text-gray-400 text-xs text-center py-4">עוד אין פתקים — הוסף למטה</p>}
        {notes.map(n => (
          <div key={n.id} className={`${NOTE_COLORS[n.color] ?? 'bg-yellow-100 border-yellow-300'} border rounded-xl p-3 flex items-start gap-2`}>
            <p className="flex-1 text-sm text-gray-800 whitespace-pre-line">{n.content}</p>
            <button onClick={() => onDelete(n.id)} className="text-gray-300 hover:text-red-400 text-xs shrink-0">✕</button>
          </div>
        ))}
      </div>
      <div className="border-t p-2 bg-gray-50 space-y-1.5">
        <Textarea value={content} onChange={setContent} placeholder="כתוב פתק..." rows={2} />
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full text-xs flex items-center justify-center ${NOTE_COLORS[c]?.split(' ')[0]} border ${color === c ? 'ring-2 ring-offset-1 ring-gray-500' : ''}`}>
                {color === c ? EMOJIS[c] : ''}
              </button>
            ))}
          </div>
          <Btn size="xs" onClick={handleAdd} disabled={!content.trim()} className="mr-auto">+ הוסף</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Mini Chat Preview ────────────────────────────────────────────────────────

function MiniChat({ state, onOpenChat }: { state: AppState; onOpenChat: () => void }) {
  const msgs = [...state.chatMessages]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5);
  const unread = state.chatMessages.filter(m =>
    m.fromUserId !== state.currentUserId && !m.readBy.includes(state.currentUserId)
  ).length;

  return (
    <div className="bg-white rounded-2xl border overflow-hidden">
      <div className="px-4 py-3 border-b bg-green-50 flex items-center justify-between">
        <h3 className="font-bold text-green-700 text-sm flex items-center gap-2">
          💬 צ'אט צוות
          {unread > 0 && <span className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">{unread}</span>}
        </h3>
        <button onClick={onOpenChat} className="text-xs text-green-600 hover:underline">כל הצ'אט →</button>
      </div>
      <div className="p-3 space-y-2 max-h-40 overflow-y-auto">
        {msgs.length === 0 && <p className="text-gray-400 text-xs text-center py-4">אין הודעות</p>}
        {msgs.map(m => {
          const sender = state.users.find(u => u.id === m.fromUserId);
          const isMe   = m.fromUserId === state.currentUserId;
          return (
            <div key={m.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${isMe ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-700'}`}>
                {sender?.name.charAt(0)}
              </div>
              <div className={`max-w-[80%] rounded-xl px-2.5 py-1.5 text-xs ${isMe ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
                {m.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────

export default function HomePage({
  state, onNavigate, onUpdateTask, onAddTask, onAddNote, onDeleteNote, onUpdateNote: _onUpdateNote,
}: {
  state: AppState;
  onNavigate: (tab: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onAddTask: (t: Task) => void;
  onAddNote: (n: PinnedNote) => void;
  onDeleteNote: (id: string) => void;
  onUpdateNote: (id: string, updates: Partial<PinnedNote>) => void;
}) {
  const currentUser = state.users.find(u => u.id === state.currentUserId)!;
  const isAdmin     = currentUser.role === 'admin';

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const myLeads    = isAdmin ? state.leads : state.leads.filter(l => l.assigned_to === state.currentUserId);
  const active     = myLeads.filter(l => !state.statuses.find(s => s.id === l.status)?.isFinal).length;
  const wonMonth   = myLeads.filter(l =>
    state.statuses.find(s => s.id === l.status)?.isWon && new Date(l.updated_at) >= monthStart
  ).length;
  const todayTasks = state.tasks.filter(t => t.assigned_to === state.currentUserId && t.due_date === TODAY && !t.done).length;
  const { commission } = calcCommission(state, state.currentUserId);

  const hour = new Date().getHours();
  const sub  = getL('home.sub', state.labels);

  const kpis = [
    { icon: '🔄', value: active,   label: getL('kpi.active_leads', state.labels),  color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { icon: '✅', value: wonMonth, label: getL('kpi.won_month', state.labels),       color: 'bg-green-50 border-green-200 text-green-700' },
    { icon: '📋', value: todayTasks, label: getL('kpi.today_tasks', state.labels),  color: 'bg-amber-50 border-amber-200 text-amber-700' },
    ...(!isAdmin ? [{ icon: '💰', value: `₪${commission.toLocaleString('he-IL')}`, label: getL('kpi.commission', state.labels), color: 'bg-purple-50 border-purple-200 text-purple-700', sub: `${currentUser.commissionRate * 100}% עמלה` }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Greeting Banner */}
      <div className="relative overflow-hidden bg-gradient-to-l from-[#5A0F1B] via-[#821828] to-[#A31F31] rounded-3xl p-6 sm:p-7 text-white shadow-xl border border-amber-400/25">
        <div className="absolute top-0 left-0 -mt-8 -ml-8 w-40 h-40 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-amber-200 text-xs font-semibold mb-2 border border-white/10">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>מרכז שליטה פעיל</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1 flex items-center gap-2">
              <span>{hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙'}</span>
              <span>{greeting(currentUser.name, state.labels)}!</span>
            </h1>
            <p className="text-amber-100/80 text-sm max-w-xl">{sub}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-left sm:text-right bg-black/20 backdrop-blur-sm px-4 py-2.5 rounded-2xl border border-white/10">
              <p className="text-[11px] font-medium text-amber-200">סטטוס צוות</p>
              <p className="text-sm font-bold text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
                {state.leads.length} לידים במערכת
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left col: hot leads */}
        <div className="lg:col-span-1 space-y-4">
          <HotLeadsTable state={state} onLeadClick={() => onNavigate('leads')} />
        </div>

        {/* Center: task checklist */}
        <div className="lg:col-span-1 space-y-4">
          <TaskChecklist state={state}
            onToggle={id => { const t = state.tasks.find(x => x.id === id); if (t) onUpdateTask(id, { done: !t.done }); }}
            onAddTask={onAddTask}
            onLeadClick={() => onNavigate('leads')} />
        </div>

        {/* Right: pinned notes + mini chat */}
        <div className="lg:col-span-1 space-y-4">
          <PinnedNotesPanel state={state} onAdd={onAddNote} onDelete={onDeleteNote} />
          <MiniChat state={state} onOpenChat={() => onNavigate('chat')} />
        </div>
      </div>
    </div>
  );
}
