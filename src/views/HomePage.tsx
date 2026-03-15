/**
 * עמוד הבית — תמונת מצב מלאה של היום.
 * KPI cards, לידים חמים, משימות היום, פתקים ממוסמרים, ותקציר צ'אט.
 */
import { useState, useMemo } from 'react';
import type { AppState, Task, PinnedNote } from '../types';
import { TODAY, greeting, getL, getHotLeads, calcCommission, openGoogleCalendar, openWhatsApp, timeAgo, NOTE_COLORS, uid } from '../utils';
import { Btn, ScoreBadge, Textarea } from '../ui';

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCard({ icon, value, label, sub, color }: {
  icon: string; value: string | number; label: string; sub?: string; color: string;
}) {
  return (
    <div className={`rounded-2xl border px-5 py-4 flex items-center gap-4 ${color}`}>
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        <p className="text-xs font-medium opacity-75">{label}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
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
    <div className="bg-white rounded-2xl border p-6 flex flex-col items-center justify-center min-h-48">
      <span className="text-4xl mb-2">🎉</span>
      <p className="text-gray-500 text-sm font-medium">אין לידים חמים להיום!</p>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border overflow-hidden">
      <div className="px-4 py-3 bg-red-50 border-b flex items-center gap-2">
        <span className="text-base">🔥</span>
        <h3 className="font-bold text-red-700 text-sm">לידים חמים</h3>
        <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{myHot.length}</span>
      </div>
      <div className="divide-y overflow-y-auto max-h-72">
        {myHot.map(lead => {
          const status = state.statuses.find(s => s.id === lead.status);
          const user   = state.users.find(u => u.id === lead.assigned_to);
          const isNew  = lead.created_at.startsWith(TODAY);
          return (
            <div key={lead.id} onClick={() => onLeadClick()}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors">
              <ScoreBadge score={lead.score} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{lead.name}</p>
                  {isNew && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium shrink-0">חדש!</span>}
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {status?.label} · {user?.name}
                  {lead.lastActivityAt && ` · ${timeAgo(lead.lastActivityAt)}`}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={e => { e.stopPropagation(); openWhatsApp(lead.phone); }}
                  className="text-green-500 hover:text-green-700 text-base p-1 rounded hover:bg-green-50">💬</button>
                <button onClick={e => { e.stopPropagation(); window.location.href = `tel:${lead.phone}`; }}
                  className="text-blue-500 hover:text-blue-700 text-base p-1 rounded hover:bg-blue-50">☎️</button>
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
  const tasks = useMemo(() =>
    [...state.tasks.filter(t => t.assigned_to === state.currentUserId && t.due_date === TODAY)]
      .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99')),
    [state.tasks, state.currentUserId]
  );
  const done  = tasks.filter(t => t.done).length;
  const pct   = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  function handleAdd() {
    if (!note.trim()) return;
    onAddTask({ id: uid(), due_date: TODAY, time: time || undefined, note: note.trim(), assigned_to: state.currentUserId, done: false });
    setNote(''); setTime('');
  }

  return (
    <div className="bg-white rounded-2xl border flex flex-col overflow-hidden">
      <div className="bg-indigo-600 px-4 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-white font-bold text-sm">✅ משימות היום</span>
          <span className="text-indigo-200 text-xs font-medium">{done}/{tasks.length}</span>
        </div>
        <div className="w-full bg-indigo-400/40 rounded-full h-1.5 overflow-hidden">
          <div className="bg-white h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex-1 divide-y overflow-y-auto max-h-64">
        {tasks.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">אין משימות להיום 🎉</p>}
        {tasks.map((t, i) => {
          const lead = t.lead_id ? state.leads.find(l => l.id === t.lead_id) : null;
          return (
            <div key={t.id} className={`flex items-start gap-2 px-3 py-2 ${t.done ? 'bg-gray-50' : ''} transition-colors`}>
              <span className="text-xs text-gray-300 font-mono w-5 text-center mt-0.5 shrink-0">{i + 1}</span>
              <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)}
                className="mt-0.5 w-3.5 h-3.5 cursor-pointer shrink-0" />
              <div className="flex-1 min-w-0">
                <p className={`text-xs ${t.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.note}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {t.time && <span className="text-xs text-indigo-600 font-mono">⏰ {t.time}</span>}
                  {lead && (
                    <button onClick={() => onLeadClick()} className="text-xs text-blue-500 hover:underline truncate max-w-[8rem]">
                      🔗 {lead.name}
                    </button>
                  )}
                </div>
              </div>
              <button onClick={() => openGoogleCalendar(t, lead ?? undefined)}
                className="text-gray-200 hover:text-blue-400 text-sm shrink-0">📅</button>
            </div>
          );
        })}
      </div>
      <div className="border-t p-2 bg-gray-50">
        <div className="flex gap-1">
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="border rounded px-2 py-1 text-xs w-20 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <input value={note} onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="הוסף משימה..." className="flex-1 border rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <Btn size="xs" onClick={handleAdd} disabled={!note.trim()}>+</Btn>
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
    <div className="space-y-5">
      {/* Greeting */}
      <div className="bg-gradient-to-l from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-1">
          {hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙'}{' '}
          {greeting(currentUser.name, state.labels)}!
        </h1>
        <p className="text-blue-200 text-sm">{sub}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
