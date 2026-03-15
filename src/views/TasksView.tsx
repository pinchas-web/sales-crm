/**
 * מרכז משימות — כל המשימות מקובצות לפי ליד, עם סינון וסימון הושלם.
 * הצגה: היום / השבוע / הכל / הושלם. מנהל רואה משימות של כולם.
 */
import { useState } from 'react';
import type { AppState, Task } from '../types';
import { uid, TODAY, ACTIVITY_ICONS, ACTIVITY_LABELS, formatDate, openGoogleCalendar, openWhatsApp } from '../utils';
import { Btn, SelectInput } from '../ui';

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, leadPhone, onToggle, onDelete }: {
  task: Task;
  leadPhone?: string;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isOverdue = !task.done && task.due_date < TODAY;
  const isToday   = task.due_date === TODAY;
  const icon = ACTIVITY_ICONS[task.type ?? 'note'];

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all group ${task.done ? 'bg-gray-50 opacity-60' : isOverdue ? 'bg-red-50 border-red-200' : isToday ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${task.done ? 'bg-green-500 border-green-500 text-white' : isOverdue ? 'border-red-400 hover:border-red-500' : 'border-gray-300 hover:border-blue-400'}`}>
        {task.done && <span className="text-xs">✓</span>}
      </button>

      {/* Icon */}
      <span className="text-base shrink-0">{icon}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.note}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {isOverdue && !task.done && <span className="text-xs text-red-500 font-medium">⚠ פג תוקף</span>}
          {isToday && !task.done && <span className="text-xs text-blue-600 font-medium">● היום</span>}
          <span className="text-xs text-gray-400">{formatDate(task.due_date)}{task.time ? ` ${task.time}` : ''}</span>
          {task.type && (
            <span className="text-xs text-gray-400">• {ACTIVITY_LABELS[task.type]}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {leadPhone && task.type === 'call' && (
          <Btn size="xs" variant="ghost" onClick={() => openWhatsApp(leadPhone)} title="פתח וואצאפ">💬</Btn>
        )}
        <Btn size="xs" variant="ghost" onClick={() => openGoogleCalendar(task)} title="הוסף ליומן">📅</Btn>
        <Btn size="xs" variant="danger" onClick={onDelete}>✕</Btn>
      </div>
    </div>
  );
}

// ─── Lead Group ───────────────────────────────────────────────────────────────

function LeadGroup({ leadName, leadPhone, tasks, onToggle, onDelete }: {
  leadName: string;
  leadPhone?: string;
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const done = tasks.filter(t => t.done).length;
  const overdue = tasks.filter(t => !t.done && t.due_date < TODAY).length;

  return (
    <div className="mb-4">
      {/* Group header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 py-2 px-1 hover:bg-gray-50 rounded-lg transition-colors">
        <span className="text-gray-400 text-xs">{collapsed ? '▶' : '▼'}</span>
        <span className="font-semibold text-gray-800">{leadName}</span>
        <span className="text-xs text-gray-500">({done}/{tasks.length})</span>
        {overdue > 0 && (
          <span className="text-xs bg-red-100 text-red-600 font-medium px-2 py-0.5 rounded-full">{overdue} באיחור</span>
        )}
        {done === tasks.length && <span className="text-xs text-green-600 font-medium">✓ הכל הושלם</span>}
      </button>

      {/* Tasks */}
      {!collapsed && (
        <div className="space-y-1.5 mt-1">
          {tasks.map(t => (
            <TaskRow key={t.id} task={t} leadPhone={leadPhone}
              onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add Task Form ─────────────────────────────────────────────────────────────

function AddTaskForm({ state, onAdd }: {
  state: AppState;
  onAdd: (task: Task) => void;
}) {
  const [note, setNote]         = useState('');
  const [date, setDate]         = useState(TODAY);
  const [time, setTime]         = useState('');
  const [leadId, setLeadId]     = useState('');
  const [assignTo, setAssignTo] = useState(state.currentUserId);
  const [type, setType]         = useState('note');
  const [show, setShow]         = useState(false);

  const currentUser = state.users.find(u => u.id === state.currentUserId);
  const isAdmin = currentUser?.role === 'admin';

  function handleAdd() {
    if (!note.trim()) return;
    onAdd({
      id: uid(),
      lead_id: leadId || undefined,
      due_date: date,
      time: time || undefined,
      note: note.trim(),
      assigned_to: assignTo,
      done: false,
      type: type as Task['type'],
    });
    setNote(''); setTime(''); setLeadId('');
    setShow(false);
  }

  if (!show) {
    return (
      <Btn onClick={() => setShow(true)} variant="secondary" size="sm">+ הוסף משימה</Btn>
    );
  }

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-3 mb-4">
      <p className="text-sm font-semibold text-gray-700">משימה חדשה</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="תיאור המשימה *"
          className="col-span-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <SelectInput
          value={type}
          onChange={setType}
          options={[
            { value: 'note', label: '📝 הערה' },
            { value: 'call', label: '☎️ שיחה' },
            { value: 'email', label: '📧 מייל' },
            { value: 'whatsapp', label: '💬 וואצאפ' },
            { value: 'meeting', label: '📅 פגישה' },
          ]}
        />
        <SelectInput
          value={leadId}
          onChange={setLeadId}
          placeholder="ליד (אופציונלי)"
          options={state.leads
            .filter(l => !state.statuses.find(s => s.id === l.status)?.isFinal)
            .map(l => ({ value: l.id, label: l.name }))}
        />
        {isAdmin && (
          <SelectInput
            value={assignTo}
            onChange={setAssignTo}
            options={state.users.map(u => ({ value: u.id, label: u.name }))}
          />
        )}
      </div>
      <div className="flex gap-2">
        <Btn onClick={handleAdd} disabled={!note.trim()}>+ הוסף משימה</Btn>
        <Btn variant="secondary" onClick={() => setShow(false)}>ביטול</Btn>
      </div>
    </div>
  );
}

// ─── Tasks View ───────────────────────────────────────────────────────────────

export default function TasksView({
  state, onUpdateTask, onAddTask, onDeleteTask,
}: {
  state: AppState;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onAddTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
}) {
  const [filter, setFilter] = useState<'today' | 'week' | 'all' | 'done'>('today');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const currentUser = state.users.find(u => u.id === state.currentUserId);
  const isAdmin = currentUser?.role === 'admin';

  // Date helpers
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  function matchesFilter(t: Task): boolean {
    if (assigneeFilter && t.assigned_to !== assigneeFilter) return false;
    if (!isAdmin && t.assigned_to !== state.currentUserId) return false;
    if (filter === 'today') return t.due_date === TODAY && !t.done;
    if (filter === 'week')  return t.due_date <= weekEndStr && !t.done;
    if (filter === 'done')  return t.done;
    return true; // 'all'
  }

  const filtered = state.tasks.filter(matchesFilter)
    .sort((a, b) => {
      // Sort: overdue first, then today, then future; within same date by time
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
      return (a.time ?? '').localeCompare(b.time ?? '');
    });

  // Group by lead
  const groups = new Map<string, Task[]>();
  const noLead: Task[] = [];
  for (const t of filtered) {
    if (t.lead_id) {
      const arr = groups.get(t.lead_id) ?? [];
      arr.push(t);
      groups.set(t.lead_id, arr);
    } else {
      noLead.push(t);
    }
  }

  const totalToday = state.tasks.filter(t =>
    t.due_date === TODAY && !t.done &&
    (!isAdmin ? t.assigned_to === state.currentUserId : true)
  ).length;
  const totalDone = state.tasks.filter(t => t.done).length;
  const totalOverdue = state.tasks.filter(t =>
    !t.done && t.due_date < TODAY &&
    (!isAdmin ? t.assigned_to === state.currentUserId : true)
  ).length;

  const FILTER_TABS = [
    { id: 'today', label: `היום (${totalToday})` },
    { id: 'week',  label: 'השבוע' },
    { id: 'all',   label: 'הכל' },
    { id: 'done',  label: `הושלם (${totalDone})` },
  ] as const;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">✅ משימות</h1>
        <div className="flex items-center gap-2">
          {totalOverdue > 0 && (
            <span className="text-xs bg-red-100 text-red-600 font-medium px-3 py-1 rounded-full">
              ⚠ {totalOverdue} משימות באיחור
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {FILTER_TABS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${filter === f.id ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {f.label}
            </button>
          ))}
        </div>
        {isAdmin && (
          <SelectInput
            value={assigneeFilter}
            onChange={setAssigneeFilter}
            placeholder="כל הנציגים"
            options={state.users.map(u => ({ value: u.id, label: u.name }))}
            className="w-40"
          />
        )}
      </div>

      {/* Add task form */}
      <AddTaskForm state={state} onAdd={onAddTask} />

      {/* Tasks grouped by lead */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-3">✅</span>
          <p className="text-gray-700 font-semibold">אין משימות להצגה</p>
          <p className="text-gray-400 text-sm mt-1">
            {filter === 'today' ? 'כל משימות היום הושלמו!' : 'אין משימות בטווח הזמן שנבחר'}
          </p>
        </div>
      ) : (
        <div>
          {/* Lead groups */}
          {Array.from(groups.entries()).map(([leadId, tasks]) => {
            const lead = state.leads.find(l => l.id === leadId);
            return (
              <LeadGroup key={leadId}
                leadName={lead?.name ?? 'ליד לא ידוע'}
                leadPhone={lead?.phone}
                tasks={tasks}
                onToggle={id => onUpdateTask(id, { done: !state.tasks.find(t => t.id === id)?.done })}
                onDelete={onDeleteTask}
              />
            );
          })}
          {/* No-lead tasks */}
          {noLead.length > 0 && (
            <LeadGroup
              leadName="📌 משימות כלליות"
              tasks={noLead}
              onToggle={id => onUpdateTask(id, { done: !state.tasks.find(t => t.id === id)?.done })}
              onDelete={onDeleteTask}
            />
          )}
        </div>
      )}
    </div>
  );
}
