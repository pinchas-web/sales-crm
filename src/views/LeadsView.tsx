/**
 * ניהול לידים — לב המערכת.
 * שתי תצוגות: טבלה (ברירת מחדל) וקנבן עם drag-and-drop.
 * כרטיס ליד מכיל: פרטים, לוג פעילות (שיחה/מייל/פגישה), משימות, וזיהוי כפולים.
 */
import { useState, useRef, useEffect } from 'react';
import {
  DragDropContext, Droppable, Draggable,
} from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import type { AppState, Lead, Activity, Task, CustomField } from '../types';
import {
  TODAY, SOURCE_LABELS, PROFESSION_LABELS, AUDIENCE_LABELS,
  ACTIVITY_ICONS, ACTIVITY_LABELS,
  uid, formatDate, formatDateTime, openGoogleCalendar, openWhatsApp, findDuplicates,
} from '../utils';
import { Btn, Input, SelectInput, Modal, Badge, ScoreBadge, ConfirmDialog, Textarea, EmptyState } from '../ui';

// ─── Activity type selector ───────────────────────────────────────────────────

const ACT_TYPES = ['note', 'call', 'email', 'whatsapp', 'meeting'] as const;

function ActivityTypePicker({ value, onChange }: { value: Activity['type']; onChange: (v: Activity['type']) => void }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {ACT_TYPES.map(t => (
        <button key={t} onClick={() => onChange(t)}
          className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors border ${value === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          {ACTIVITY_ICONS[t]} {ACTIVITY_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

// ─── Lead Form Fields ─────────────────────────────────────────────────────────

type LeadFormData = Partial<Lead> & { custom_fields: Record<string, string | number | boolean> };

function LeadFormFields({ form, onChange, state }: {
  form: LeadFormData; onChange: (k: string, v: string | boolean | string[]) => void; state: AppState;
}) {
  const { dropdownOptions, statuses, users, products } = state;
  const srcOpts  = dropdownOptions.sources.map(s => ({ value: s, label: SOURCE_LABELS[s] ?? s }));
  const profOpts = dropdownOptions.professions.map(s => ({ value: s, label: PROFESSION_LABELS[s] ?? s }));
  const audOpts  = dropdownOptions.audience_types.map(s => ({ value: s, label: AUDIENCE_LABELS[s] ?? s }));
  const stOpts   = [...statuses].sort((a, b) => a.order - b.order).map(s => ({ value: s.id, label: s.label }));
  const uOpts    = users.map(u => ({ value: u.id, label: u.name }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div><label className="field-label">שם *</label>
        <Input value={form.name ?? ''} onChange={v => onChange('name', v)} placeholder="שם מלא" /></div>
      <div><label className="field-label">טלפון *</label>
        <Input value={form.phone ?? ''} onChange={v => onChange('phone', v)} placeholder="05X-XXXXXXX" /></div>
      <div><label className="field-label">מייל</label>
        <Input value={form.email ?? ''} onChange={v => onChange('email', v)} type="email" /></div>
      <div><label className="field-label">ערך עסקה (₪)</label>
        <Input value={form.dealValue ? String(form.dealValue) : ''} onChange={v => onChange('dealValue', v)} type="number" placeholder="0" /></div>
      <div><label className="field-label">מקור</label>
        <SelectInput value={form.source ?? ''} onChange={v => onChange('source', v)} options={srcOpts} placeholder="בחר מקור" /></div>
      <div><label className="field-label">מקצוע</label>
        <SelectInput value={form.profession ?? ''} onChange={v => onChange('profession', v)} options={profOpts} placeholder="בחר מקצוע" /></div>
      <div><label className="field-label">קהל יעד</label>
        <SelectInput value={form.audience_type ?? ''} onChange={v => onChange('audience_type', v)} options={audOpts} placeholder="בחר קהל" /></div>
      <div><label className="field-label">סטטוס</label>
        <SelectInput value={form.status ?? ''} onChange={v => onChange('status', v)} options={stOpts} placeholder="בחר סטטוס" /></div>
      <div><label className="field-label">אחראי</label>
        <SelectInput value={form.assigned_to ?? ''} onChange={v => onChange('assigned_to', v)} options={uOpts} placeholder="בחר אחראי" /></div>
      <div><label className="field-label">פולואפ הבא</label>
        <input type="datetime-local" value={(form.followUpAt ?? '').slice(0, 16)}
          onChange={e => onChange('followUpAt', e.target.value ? new Date(e.target.value).toISOString() : '')}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" /></div>
      <div className="sm:col-span-2"><label className="field-label">מתעניין ב (מוצרים)</label>
        <div className="flex flex-wrap gap-2">
          {products.filter(p => p.active).map(p => {
            const checked = (form.interestedIn ?? []).includes(p.id);
            return (
              <label key={p.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer text-xs transition-colors select-none ${checked ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-600'}`}>
                <input type="checkbox" className="w-3 h-3" checked={checked}
                  onChange={e => {
                    const cur = form.interestedIn ?? [];
                    onChange('interestedIn', e.target.checked ? [...cur, p.id] : cur.filter(x => x !== p.id));
                  }} />
                {p.name}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Lead Detail Drawer ───────────────────────────────────────────────────────

function LeadDetailDrawer({ lead, state, onClose, onUpdateLead, onAddActivity, onAddTask, onToggleTask, onDeleteLead }: {
  lead: Lead | null; state: AppState; onClose: () => void;
  onUpdateLead: (id: string, updates: Partial<Lead>) => void;
  onAddActivity: (a: Activity) => void; onAddTask: (t: Task) => void;
  onToggleTask: (id: string) => void; onDeleteLead: (id: string) => void;
}) {
  const [editing,       setEditing      ] = useState(false);
  const [form,          setForm         ] = useState<LeadFormData>({ custom_fields: {} });
  const [actNote,       setActNote      ] = useState('');
  const [actType,       setActType      ] = useState<Activity['type']>('note');
  const [taskNote,      setTaskNote     ] = useState('');
  const [taskDate,      setTaskDate     ] = useState(TODAY);
  const [taskTime,      setTaskTime     ] = useState('');
  const [taskAssignee,  setTaskAssignee ] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab,           setTab         ] = useState<'info' | 'activity' | 'tasks'>('info');

  useEffect(() => {
    if (lead) {
      setForm({ ...lead, custom_fields: { ...(lead.custom_fields ?? {}) } });
      setEditing(false);
    }
  }, [lead?.id]);

  if (!lead) return null;

  const activities = state.activities.filter(a => a.lead_id === lead.id).sort((a, b) => b.date.localeCompare(a.date));
  const tasks      = state.tasks.filter(t => t.lead_id === lead.id).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const status     = state.statuses.find(s => s.id === lead.status);
  const assignedU  = state.users.find(u => u.id === lead.assigned_to);
  const currentU   = state.users.find(u => u.id === state.currentUserId)!;

  function handleChange(k: string, v: string | boolean | string[]) {
    if (k.startsWith('cf_')) { const key = k.slice(3); setForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [key]: v as string } })); }
    else setForm(f => ({ ...f, [k]: v }));
  }
  function handleSave() {
    const { custom_fields, ...rest } = form;
    onUpdateLead(lead!.id, { ...rest, custom_fields, updated_at: new Date().toISOString() });
    setEditing(false);
  }
  function handleAddActivity() {
    if (!actNote.trim()) return;
    const now = new Date().toISOString();
    onAddActivity({ id: uid(), lead_id: lead!.id, date: now, note: actNote.trim(), created_by: state.currentUserId, type: actType });
    onUpdateLead(lead!.id, { lastActivityAt: now, updated_at: now });
    setActNote('');
  }
  function handleAddTask() {
    if (!taskNote.trim()) return;
    const t: Task = { id: uid(), lead_id: lead!.id, due_date: taskDate, time: taskTime || undefined, note: taskNote.trim(), assigned_to: taskAssignee || state.currentUserId, done: false };
    onAddTask(t);
    setTaskNote(''); setTaskDate(TODAY); setTaskTime('');
  }

  const TABS = [{ id: 'info', label: 'פרטים' }, { id: 'activity', label: `פעילות (${activities.length})` }, { id: 'tasks', label: `משימות (${tasks.length})` }] as const;

  return (
    <div className="fixed inset-0 z-40 flex" dir="rtl">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-5 py-3 z-10">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{lead.name}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {status && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: status.color, color: status.textColor }}>{status.label}</span>}
                <ScoreBadge score={lead.score} />
                <span className="text-xs text-gray-400">{assignedU?.name}</span>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={() => openWhatsApp(lead.phone)} className="text-green-500 hover:text-green-700 text-xl p-1">💬</button>
              <a href={`tel:${lead.phone}`} className="text-blue-500 hover:text-blue-700 text-xl p-1">☎️</a>
              {lead.email && <a href={`mailto:${lead.email}`} className="text-gray-400 hover:text-gray-700 text-xl p-1">📧</a>}
              {currentU.role === 'admin' && <Btn variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>מחק</Btn>}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100">&times;</button>
            </div>
          </div>
          <div className="flex gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 flex-1 space-y-5">
          {/* Info tab */}
          {tab === 'info' && (
            <section>
              {editing ? (
                <>
                  <LeadFormFields form={form} onChange={handleChange} state={state} />
                  <div className="flex gap-2 mt-4">
                    <Btn onClick={handleSave}>שמור שינויים</Btn>
                    <Btn variant="secondary" onClick={() => setEditing(false)}>ביטול</Btn>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    {([
                      ['📞 טלפון', lead.phone],
                      ['📧 מייל', lead.email || '—'],
                      ['🏷 מקור', SOURCE_LABELS[lead.source] ?? lead.source],
                      ['👤 מקצוע', PROFESSION_LABELS[lead.profession] ?? lead.profession],
                      ['🎯 קהל', AUDIENCE_LABELS[lead.audience_type] ?? lead.audience_type],
                      ['📅 נוצר', formatDate(lead.created_at)],
                      ['💰 ערך עסקה', lead.dealValue ? `₪${lead.dealValue.toLocaleString('he-IL')}` : '—'],
                      ['🕐 פולואפ', lead.followUpAt ? formatDateTime(lead.followUpAt) : '—'],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k}><span className="text-gray-500">{k}: </span><span className="font-medium text-gray-800">{v}</span></div>
                    ))}
                  </div>
                  {lead.interestedIn.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">📦 מתעניין ב:</p>
                      <div className="flex flex-wrap gap-1">
                        {lead.interestedIn.map(pid => {
                          const p = state.products.find(x => x.id === pid);
                          return p ? <Badge key={pid} label={p.name} colorClass="bg-indigo-100 text-indigo-700" /> : null;
                        })}
                      </div>
                    </div>
                  )}
                  <Btn size="sm" variant="ghost" onClick={() => setEditing(true)}>✏️ ערוך פרטים</Btn>
                </>
              )}
            </section>
          )}

          {/* Activity tab */}
          {tab === 'activity' && (
            <section className="space-y-3">
              <div className="bg-gray-50 rounded-xl border p-3 space-y-3">
                <ActivityTypePicker value={actType} onChange={setActType} />
                <Textarea value={actNote} onChange={setActNote} placeholder="תוכן הפעילות..." rows={2} />
                <Btn size="sm" onClick={handleAddActivity} disabled={!actNote.trim()}>+ הוסף פעילות</Btn>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {activities.length === 0 && <EmptyState icon="📭" title="אין פעילות עדיין" subtitle="הוסף את הפעילות הראשונה למעלה" />}
                {activities.map(a => {
                  const creator = state.users.find(u => u.id === a.created_by);
                  return (
                    <div key={a.id} className="bg-white border rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span>{ACTIVITY_ICONS[a.type] ?? '📝'}</span>
                        <span className="text-xs font-medium text-gray-600">{ACTIVITY_LABELS[a.type]}</span>
                        <span className="text-xs text-gray-400 mr-auto">{formatDateTime(a.date)} · {creator?.name}</span>
                      </div>
                      <p className="text-sm text-gray-800">{a.note}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Tasks tab */}
          {tab === 'tasks' && (
            <section className="space-y-3">
              <div className="space-y-2">
                {tasks.length === 0 && <EmptyState icon="✅" title="אין משימות" subtitle="הוסף משימה למטה" />}
                {tasks.map(t => {
                  const overdue  = !t.done && t.due_date < TODAY;
                  const dueToday = !t.done && t.due_date === TODAY;
                  return (
                    <div key={t.id} className={`flex items-start gap-2 p-2.5 rounded-xl border ${t.done ? 'bg-gray-50 opacity-60' : overdue ? 'bg-red-50 border-red-200' : dueToday ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200'}`}>
                      <input type="checkbox" checked={t.done} onChange={() => onToggleTask(t.id)} className="mt-0.5 w-4 h-4" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${t.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.note}</p>
                        <p className="text-xs text-gray-400">{t.due_date}{t.time ? ` ${t.time}` : ''}</p>
                      </div>
                      <button onClick={() => openGoogleCalendar(t, lead)} className="text-gray-300 hover:text-blue-400 text-base">📅</button>
                    </div>
                  );
                })}
              </div>
              <div className="bg-gray-50 rounded-xl border p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600">➕ הוסף משימה</p>
                <Input value={taskNote} onChange={setTaskNote} placeholder="תיאור המשימה" />
                <div className="flex gap-2">
                  <Input value={taskDate} onChange={setTaskDate} type="date" className="flex-1" />
                  <input type="time" value={taskTime} onChange={e => setTaskTime(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                </div>
                <SelectInput value={taskAssignee} onChange={setTaskAssignee}
                  options={state.users.map(u => ({ value: u.id, label: u.name }))} placeholder="אחראי" />
                <Btn size="sm" onClick={handleAddTask} disabled={!taskNote.trim()}>+ הוסף משימה</Btn>
              </div>
            </section>
          )}
        </div>
      </div>

      <ConfirmDialog open={confirmDelete} message={`למחוק את "${lead.name}"?`}
        onConfirm={() => { onDeleteLead(lead.id); onClose(); }} onCancel={() => setConfirmDelete(false)} />
    </div>
  );
}

// ─── Add Lead Modal (with dup detection) ─────────────────────────────────────

function AddLeadModal({ open, onClose, state, onSave, initialStatus }: {
  open: boolean; onClose: () => void; state: AppState;
  onSave: (lead: Lead) => void; initialStatus?: string;
}) {
  const blank = (): LeadFormData => ({
    name: '', phone: '', email: '', source: '', profession: '', audience_type: '',
    program: '', interestedIn: [],
    status: initialStatus ?? state.statuses[0]?.id ?? '',
    assigned_to: state.currentUserId, custom_fields: {}, score: 50,
  });
  const [form, setForm]         = useState<LeadFormData>(blank);
  const [duplicates, setDups]   = useState<Lead[]>([]);
  const [showDups, setShowDups] = useState(false);

  useEffect(() => { if (open) { setForm(blank()); setDups([]); setShowDups(false); } }, [open]);

  function handleChange(k: string, v: string | boolean | string[]) {
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'phone' || k === 'email' || k === 'name') {
      const updated = { ...form, [k]: v as string };
      const dups = findDuplicates(state.leads, updated.name ?? '', updated.phone ?? '', updated.email ?? '');
      setDups(dups);
    }
  }

  function handleSave() {
    if (!form.name?.trim() || !form.phone?.trim()) return;
    if (duplicates.length > 0 && !showDups) { setShowDups(true); return; }
    const now = new Date().toISOString();
    onSave({
      id: uid(), name: form.name!, phone: form.phone!, email: form.email,
      source: form.source ?? '', profession: form.profession ?? '',
      audience_type: form.audience_type ?? '', program: form.program ?? '',
      interestedIn: form.interestedIn ?? [],
      status: form.status ?? '', assigned_to: form.assigned_to ?? state.currentUserId,
      created_at: now, updated_at: now, custom_fields: form.custom_fields,
      score: 50, dealValue: form.dealValue ? Number(form.dealValue) : undefined,
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="הוסף ליד חדש">
      {showDups && duplicates.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-semibold text-amber-700 mb-2">⚠️ נמצאו לידים דומים!</p>
          {duplicates.map(d => (
            <div key={d.id} className="text-xs text-amber-800 bg-white border border-amber-200 rounded-lg p-2 mb-1">
              {d.name} · {d.phone} · {d.email ?? ''}
            </div>
          ))}
          <p className="text-xs text-amber-600 mt-2">האם בכל זאת ליצור ליד חדש?</p>
        </div>
      )}
      <LeadFormFields form={form} onChange={handleChange} state={state} />
      {duplicates.length > 0 && !showDups && (
        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">⚠️ נמצאו {duplicates.length} לידים דומים</p>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="secondary" onClick={onClose}>ביטול</Btn>
        <Btn onClick={handleSave} disabled={!form.name?.trim() || !form.phone?.trim()}>
          {showDups && duplicates.length > 0 ? 'הוסף בכל זאת' : 'שמור'}
        </Btn>
      </div>
    </Modal>
  );
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

const CRM_FIELDS: { key: string; label: string }[] = [
  { key: 'name',           label: 'שם' },
  { key: 'phone',          label: 'טלפון' },
  { key: 'email',          label: 'מייל' },
  { key: 'source',         label: 'מקור' },
  { key: 'sourceCampaign', label: 'קמפיין מקור' },
  { key: 'profession',     label: 'מקצוע' },
  { key: 'audience_type',  label: 'קהל יעד' },
  { key: 'status',         label: 'סטטוס' },
  { key: 'assigned_to',    label: 'אחראי' },
  { key: 'dealValue',      label: 'ערך עסקה (₪)' },
  { key: 'followUpAt',     label: 'פולואפ' },
];

const FIELD_ALIASES: Record<string, string[]> = {
  name:           ['שם', 'שם מלא', 'name', 'fullname', 'full name', 'שם לקוח', 'client name', 'שם איש קשר'],
  phone:          ['טלפון', 'נייד', 'פלאפון', 'phone', 'mobile', 'cell', 'tel', 'telephone', 'מספר טלפון'],
  email:          ['מייל', 'אימייל', 'email', 'e-mail', 'mail', 'דואל', 'כתובת מייל', 'דוא"ל'],
  source:         ['מקור', 'source', 'lead source', 'מקור ליד'],
  sourceCampaign: ['קמפיין', 'campaign', 'מקור קמפיין', 'source campaign', 'שם קמפיין'],
  profession:     ['מקצוע', 'profession', 'job', 'תפקיד', 'occupation'],
  audience_type:  ['קהל', 'קהל יעד', 'audience', 'segment', 'סגמנט'],
  status:         ['סטטוס', 'status', 'stage', 'שלב', 'מצב'],
  assigned_to:    ['אחראי', 'נציג', 'assigned', 'owner', 'rep', 'מנהל', 'agent', 'salesperson', 'נציג מכירות'],
  dealValue:      ['ערך', 'ערך עסקה', 'מחיר', 'deal value', 'dealvalue', 'deal_value', 'value', 'price', 'תמחור'],
  followUpAt:     ['פולואפ', 'followup', 'follow_up', 'follow up', 'next contact', 'תאריך פולואפ', 'פולו-אפ'],
};

function autoDetectField(header: string, samples: string[]): string {
  const h = header.toLowerCase().trim();
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some(a => a.toLowerCase() === h)) return key;
  }
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some(a => h.includes(a.toLowerCase()) || a.toLowerCase().includes(h))) return key;
  }
  const nonEmpty = samples.filter(s => s.trim());
  if (nonEmpty.length >= 2) {
    if (nonEmpty.every(s => /^[\d+\-()\s]{7,}$/.test(s))) return 'phone';
    if (nonEmpty.every(s => s.includes('@'))) return 'email';
  }
  return 'ignore';
}

function parseCsvText(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const sample = lines.slice(0, 5).join('');
  const delimiter = sample.split(';').length > sample.split(',').length ? ';' : ',';
  return lines.filter(l => l.trim()).map(line => {
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === delimiter && !inQ) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

type ColMapping = {
  csvHeader: string;
  samples: string[];
  target: string;       // 'ignore' | CRM field key | 'cf:id' | 'new'
  newFieldName: string; // used when target === 'new'
};

// A fixed value applied to ALL imported leads (may or may not come from a CSV column)
type DefaultValue = {
  id: string;
  target: string;       // CRM field key | 'cf:id' | 'new'
  value: string;
  newFieldName: string; // used when target === 'new'
};

type CsvPreviewRow = { lead: Lead; errors: string[]; isDuplicate: boolean };

function CSVImportModal({ open, onClose, state, onImport }: {
  open: boolean; onClose: () => void; state: AppState;
  onImport: (leads: Lead[], newCustomFields: CustomField[]) => void;
}) {
  const [step, setStep]             = useState<'upload' | 'mapping'>('upload');
  const [matrix, setMatrix]         = useState<string[][]>([]);
  const [mappings, setMappings]     = useState<ColMapping[]>([]);
  const [defaultValues, setDefaults] = useState<DefaultValue[]>([]);
  const [skipped, setSkipped]       = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep('upload'); setMatrix([]); setMappings([]); setDefaults([]); setSkipped(new Set()); setParseError('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [open]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const m = parseCsvText(reader.result as string);
        if (m.length < 2) { setParseError('הקובץ ריק או חסרה שורת נתונים.'); return; }
        const headers = m[0].map(h => h.replace(/"/g, '').trim());
        const dataRows = m.slice(1, 4);
        const maps: ColMapping[] = headers.map((hdr, i) => {
          const samples = dataRows.map(r => (r[i] ?? '').replace(/"/g, '').trim()).filter(Boolean);
          return { csvHeader: hdr, samples, target: autoDetectField(hdr, samples), newFieldName: hdr };
        });
        setMatrix(m); setMappings(maps); setSkipped(new Set()); setParseError(''); setStep('mapping');
      } catch { setParseError('שגיאה בקריאת הקובץ.'); }
    };
    reader.readAsText(file, 'utf-8');
  }

  function buildPreviewRow(cells: string[]): CsvPreviewRow {
    const raw: Record<string, string> = {};
    const customRaw: Record<string, string> = {};
    // 1. Apply CSV column mappings
    mappings.forEach((m, i) => {
      const val = (cells[i] ?? '').replace(/"/g, '').trim();
      if (!val || m.target === 'ignore') return;
      if (m.target === 'new') {
        customRaw[m.newFieldName.trim() || m.csvHeader] = val;
      } else if (m.target.startsWith('cf:')) {
        const cf = state.customFields.find(f => f.id === m.target.slice(3));
        if (cf) customRaw[cf.name] = val;
      } else {
        raw[m.target] = val;
      }
    });
    // 2. Apply default values on top (override CSV for same field)
    defaultValues.forEach(dv => {
      if (!dv.value.trim() || dv.target === 'ignore') return;
      if (dv.target === 'new') {
        const key = dv.newFieldName.trim() || 'שדה חדש';
        customRaw[key] = dv.value;
      } else if (dv.target.startsWith('cf:')) {
        const cf = state.customFields.find(f => f.id === dv.target.slice(3));
        if (cf) customRaw[cf.name] = dv.value;
      } else {
        raw[dv.target] = dv.value;
      }
    });
    const errors: string[] = [];
    if (!raw.name?.trim()) errors.push('שם חסר');
    if (!raw.phone?.trim()) errors.push('טלפון חסר');
    const matchedStatus = state.statuses.find(s => s.id === raw.status || s.label.toLowerCase() === (raw.status ?? '').toLowerCase());
    const matchedUser   = state.users.find(u => u.id === raw.assigned_to || u.name.toLowerCase() === (raw.assigned_to ?? '').toLowerCase());
    const now = new Date().toISOString();
    const lead: Lead = {
      id: uid(), name: raw.name ?? '', phone: raw.phone ?? '',
      email: raw.email || undefined, source: raw.source ?? '',
      sourceCampaign: raw.sourceCampaign || undefined,
      profession: raw.profession ?? '', audience_type: raw.audience_type ?? '',
      program: '', interestedIn: [],
      status: matchedStatus?.id ?? state.statuses[0]?.id ?? '',
      assigned_to: matchedUser?.id ?? state.currentUserId,
      created_at: now, updated_at: now, custom_fields: customRaw, score: 50,
      dealValue: raw.dealValue ? (Number(raw.dealValue) || undefined) : undefined,
      followUpAt: raw.followUpAt ? (() => { try { return new Date(raw.followUpAt).toISOString(); } catch { return undefined; } })() : undefined,
    };
    return { lead, errors, isDuplicate: findDuplicates(state.leads, lead.name, lead.phone, lead.email ?? '').length > 0 };
  }

  const previewRows = matrix.slice(1).map(cells => buildPreviewRow(cells));

  function toggleSkip(i: number) {
    setSkipped(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  function handleImport() {
    const toImport = previewRows.filter((r, i) => r.errors.length === 0 && !skipped.has(i)).map(r => r.lead);
    const seen = new Set<string>();
    // Collect new custom field names from both column mappings and default values
    const newFieldSources = [
      ...mappings.filter(m => m.target === 'new').map(m => m.newFieldName.trim()),
      ...defaultValues.filter(d => d.target === 'new').map(d => d.newFieldName.trim()),
    ].filter(Boolean);
    const newCFs: CustomField[] = newFieldSources
      .filter(name => { if (seen.has(name)) return false; seen.add(name); return true; })
      .filter(name => !state.customFields.some(cf => cf.name === name))
      .map((name, i) => ({ id: uid(), name, type: 'text' as const, hidden: false, order: state.customFields.length + i + 1 }));
    onImport(toImport, newCFs);
    onClose();
  }

  function downloadTemplate() {
    const content = '\uFEFF' + 'שם,טלפון,מייל,מקור,מקצוע,קהל יעד,סטטוס,אחראי,ערך עסקה\nישראל ישראלי,050-1234567,israel@example.com,facebook,therapist,secular,,,';
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'leads_template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function updateMapping(i: number, patch: Partial<ColMapping>) {
    setMappings(ms => ms.map((m, j) => j === i ? { ...m, ...patch } : m));
  }

  const validCount = previewRows.filter((r, i) => r.errors.length === 0 && !skipped.has(i)).length;
  const dupCount   = previewRows.filter((r, i) => r.isDuplicate && r.errors.length === 0 && !skipped.has(i)).length;
  const errCount   = previewRows.filter(r => r.errors.length > 0).length;

  const mappingOptions = [
    { value: 'ignore', label: '— התעלם —' },
    ...CRM_FIELDS.map(f => ({ value: f.key, label: f.label })),
    ...state.customFields.map(cf => ({ value: `cf:${cf.id}`, label: `📋 ${cf.name}` })),
    { value: 'new', label: '✨ שדה חדש' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="ייבוא לידים מ-CSV">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5 text-xs">
        {(['upload', 'mapping'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-300">›</span>}
            <span className={`px-2.5 py-1 rounded-full font-medium ${step === s ? 'bg-blue-600 text-white' : step === 'mapping' && s === 'upload' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              {i + 1}. {s === 'upload' ? 'העלאת קובץ' : 'שיוך עמודות'}
            </span>
          </div>
        ))}
      </div>

      {/* ── Step 1: Upload ── */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}>
            <p className="text-4xl mb-3">📂</p>
            <p className="text-sm font-medium text-gray-700">לחץ לבחירת קובץ CSV</p>
            <p className="text-xs text-gray-400 mt-1">תומך בפסיק ונקודה-פסיק כמפריד • כל סדר עמודות נתמך</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
          </div>
          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>עמודות חובה: <strong>שם, טלפון</strong> · שאר אופציונלי</span>
            <button onClick={downloadTemplate} className="text-blue-600 hover:underline font-medium">⬇ הורד תבנית</button>
          </div>
          {parseError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{parseError}</div>}
          <div className="flex justify-end"><Btn variant="secondary" onClick={onClose}>סגור</Btn></div>
        </div>
      )}

      {/* ── Step 2: Column Mapping + Preview ── */}
      {step === 'mapping' && (
        <div className="space-y-4">
          {/* Mapping table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">שיוך עמודות CSV → שדות CRM</p>
              <span className="text-xs text-gray-400">זיהוי אוטומטי בוצע · ניתן לשנות</span>
            </div>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">עמודה בקובץ</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">דוגמאות</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-44">שדה ב-CRM</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m, i) => (
                    <tr key={i} className={`border-t ${m.target === 'ignore' ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2 font-medium text-sm text-gray-800 whitespace-nowrap">{m.csvHeader}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {m.samples.slice(0, 2).map((s, j) => (
                            <span key={j} className="bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 text-xs max-w-[100px] truncate" title={s}>{s}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <select value={m.target} onChange={e => updateMapping(i, { target: e.target.value })}
                            className={`border rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 w-full ${m.target === 'ignore' ? 'border-gray-200 text-gray-400' : m.target === 'new' ? 'border-blue-300 text-blue-700' : 'border-gray-300 text-gray-800'}`}>
                            {mappingOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {m.target === 'new' && (
                            <input value={m.newFieldName} onChange={e => updateMapping(i, { newFieldName: e.target.value })}
                              placeholder="שם השדה החדש..."
                              className="border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 w-full bg-blue-50" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Default values section */}
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b px-3 py-2 flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-gray-700">ערכים קבועים לכל הלידים</span>
                <span className="text-xs text-gray-400 mr-2">יחולו על כל שורה, בנוסף לנתוני הקובץ</span>
              </div>
              <button onClick={() => setDefaults(d => [...d, { id: uid(), target: 'source', value: '', newFieldName: '' }])}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                + הוסף ערך
              </button>
            </div>
            {defaultValues.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">לחץ "+ הוסף ערך" להגדרת ערך קבוע (מקור, אחראי, שדה חדש...)</p>
            ) : (
              <div className="divide-y">
                {defaultValues.map((dv, i) => {
                  const inputClass = 'border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';
                  const updateDv = (patch: Partial<DefaultValue>) =>
                    setDefaults(ds => ds.map((d, j) => j === i ? { ...d, ...patch } : d));
                  const dvOpts = [
                    ...CRM_FIELDS.map(f => ({ value: f.key, label: f.label })),
                    ...state.customFields.map(cf => ({ value: `cf:${cf.id}`, label: `📋 ${cf.name}` })),
                    { value: 'new', label: '✨ שדה חדש' },
                  ];
                  let valueInput: React.ReactNode;
                  if (dv.target === 'status') {
                    valueInput = <select value={dv.value} onChange={e => updateDv({ value: e.target.value })} className={inputClass}>
                      <option value="">בחר סטטוס</option>
                      {[...state.statuses].sort((a, b) => a.order - b.order).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>;
                  } else if (dv.target === 'assigned_to') {
                    valueInput = <select value={dv.value} onChange={e => updateDv({ value: e.target.value })} className={inputClass}>
                      <option value="">בחר אחראי</option>
                      {state.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>;
                  } else if (dv.target === 'source') {
                    valueInput = <select value={dv.value} onChange={e => updateDv({ value: e.target.value })} className={inputClass}>
                      <option value="">בחר מקור</option>
                      {state.dropdownOptions.sources.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>)}
                    </select>;
                  } else if (dv.target === 'profession') {
                    valueInput = <select value={dv.value} onChange={e => updateDv({ value: e.target.value })} className={inputClass}>
                      <option value="">בחר מקצוע</option>
                      {state.dropdownOptions.professions.map(s => <option key={s} value={s}>{PROFESSION_LABELS[s] ?? s}</option>)}
                    </select>;
                  } else if (dv.target === 'audience_type') {
                    valueInput = <select value={dv.value} onChange={e => updateDv({ value: e.target.value })} className={inputClass}>
                      <option value="">בחר קהל</option>
                      {state.dropdownOptions.audience_types.map(s => <option key={s} value={s}>{AUDIENCE_LABELS[s] ?? s}</option>)}
                    </select>;
                  } else {
                    valueInput = <input value={dv.value} onChange={e => updateDv({ value: e.target.value })} placeholder="הקלד ערך..." className={`${inputClass} w-32`} />;
                  }
                  return (
                    <div key={dv.id} className="flex items-center gap-2 px-3 py-2 flex-wrap">
                      <select value={dv.target} onChange={e => updateDv({ target: e.target.value, value: '' })} className={inputClass}>
                        {dvOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <span className="text-gray-400 text-xs">=</span>
                      {valueInput}
                      {dv.target === 'new' && (
                        <input value={dv.newFieldName} onChange={e => updateDv({ newFieldName: e.target.value })}
                          placeholder="שם השדה..." className={`${inputClass} w-28`} />
                      )}
                      <button onClick={() => setDefaults(ds => ds.filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-500 text-sm font-bold leading-none">✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">תצוגה מקדימה ({previewRows.length} שורות)</span>
              <div className="flex gap-1.5 text-xs">
                <span className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-2 py-0.5">✅ {validCount}</span>
                {dupCount > 0 && <span className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-2 py-0.5">⚠️ {dupCount} כפולים</span>}
                {errCount > 0 && <span className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-2 py-0.5">❌ {errCount}</span>}
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0 border-b">
                  <tr>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-500">דלג</th>
                    <th className="px-2 py-1.5"></th>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-500">שם</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-500">טלפון</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-500">מייל</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className={`border-t ${skipped.has(i) ? 'opacity-40' : row.errors.length > 0 ? 'bg-red-50' : row.isDuplicate ? 'bg-amber-50' : ''}`}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={skipped.has(i)} onChange={() => toggleSkip(i)} />
                      </td>
                      <td className="px-2 py-1.5">
                        {row.errors.length > 0
                          ? <span title={row.errors.join(', ')}>❌</span>
                          : row.isDuplicate ? <span title="ליד דומה קיים">⚠️</span>
                          : <span>✅</span>}
                      </td>
                      <td className="px-2 py-1.5 font-medium">{row.lead.name || <span className="text-red-400 italic">חסר</span>}</td>
                      <td className="px-2 py-1.5">{row.lead.phone || <span className="text-red-400 italic">חסר</span>}</td>
                      <td className="px-2 py-1.5 text-gray-400">{row.lead.email ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between">
            <Btn variant="secondary" onClick={() => { setStep('upload'); if (fileRef.current) fileRef.current.value = ''; }}>← חזור</Btn>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={onClose}>ביטול</Btn>
              <Btn onClick={handleImport} disabled={validCount === 0}>ייבא {validCount} לידים</Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ lead, state, onClick, isDragging, dragProps }: {
  lead: Lead; state: AppState; onClick: () => void;
  isDragging?: boolean; dragProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const nextTask = state.tasks.filter(t => t.lead_id === lead.id && !t.done)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const user = state.users.find(u => u.id === lead.assigned_to);
  const products = lead.interestedIn.map(pid => state.products.find(p => p.id === pid)).filter(Boolean);
  return (
    <div onClick={onClick} {...dragProps}
      className={`bg-white rounded-xl border shadow-sm p-3 cursor-pointer hover:shadow-md transition-all select-none ${isDragging ? 'shadow-xl rotate-1 scale-105 opacity-90' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="font-semibold text-gray-900 text-sm truncate flex-1">{lead.name}</p>
        <ScoreBadge score={lead.score} />
      </div>
      <p className="text-xs text-gray-500 mb-2">📞 {lead.phone}</p>
      <div className="flex flex-wrap gap-1 mb-2">
        {products.map(p => p && <Badge key={p.id} label={p.name} colorClass="bg-indigo-100 text-indigo-700" />)}
        {lead.dealValue && <Badge label={`₪${lead.dealValue.toLocaleString()}`} colorClass="bg-green-100 text-green-700" />}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{user?.name}</span>
        {nextTask && (
          <span className={`font-medium ${nextTask.due_date < TODAY ? 'text-red-500' : nextTask.due_date === TODAY ? 'text-amber-500' : ''}`}>
            📅 {nextTask.due_date}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

function KanbanBoard({ state, onLeadClick, onStatusChange, onAddLead }: {
  state: AppState; onLeadClick: (l: Lead) => void;
  onStatusChange: (id: string, status: string) => void;
  onAddLead: (statusId: string) => void;
}) {
  const currentUser = state.users.find(u => u.id === state.currentUserId)!;
  const sorted  = [...state.statuses].sort((a, b) => a.order - b.order);
  const visible = currentUser.role === 'admin'
    ? state.leads
    : state.leads.filter(l => l.assigned_to === state.currentUserId);

  function onDragEnd(r: DropResult) {
    if (!r.destination) return;
    onStatusChange(r.draggableId, r.destination.droppableId);
  }
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 items-start overflow-x-auto pb-4" dir="ltr">
        {sorted.map(status => {
          const cards = visible.filter(l => l.status === status.id);
          return (
            <div key={status.id} className="flex-shrink-0 w-60" dir="rtl">
              <div className="rounded-t-xl px-3 py-2.5 flex items-center justify-between" style={{ backgroundColor: status.color }}>
                <span className="font-bold text-sm truncate" style={{ color: status.textColor }}>{status.label}</span>
                <span className="text-xs rounded-full px-2 py-0.5 font-bold" style={{ backgroundColor: 'rgba(255,255,255,0.25)', color: status.textColor }}>{cards.length}</span>
              </div>
              <Droppable droppableId={status.id}>
                {(prov, snap) => (
                  <div ref={prov.innerRef} {...prov.droppableProps}
                    className={`min-h-16 rounded-b-xl p-2 space-y-2 transition-colors ${snap.isDraggingOver ? 'bg-blue-50 border-2 border-dashed border-blue-300' : 'bg-gray-100/80'}`}>
                    {cards.map((lead, index) => (
                      <Draggable key={lead.id} draggableId={lead.id} index={index}>
                        {(dp, ds) => (
                          <div ref={dp.innerRef} {...dp.draggableProps}>
                            <KanbanCard lead={lead} state={state} onClick={() => onLeadClick(lead)}
                              isDragging={ds.isDragging} dragProps={dp.dragHandleProps ?? undefined} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {prov.placeholder}
                    <button onClick={() => onAddLead(status.id)}
                      className="w-full text-xs text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg py-1.5 transition-colors">
                      + ליד חדש
                    </button>
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}

// ─── Bulk Edit Modal ──────────────────────────────────────────────────────────

type BulkFieldState = { enabled: boolean; value: string };

function BulkEditModal({ open, onClose, count, state, onApply }: {
  open: boolean; onClose: () => void; count: number;
  state: AppState; onApply: (updates: Partial<Lead>) => void;
}) {
  const blank = () => ({
    status:         { enabled: false, value: [...state.statuses].sort((a, b) => a.order - b.order)[0]?.id ?? '' },
    assigned_to:    { enabled: false, value: state.users[0]?.id ?? '' },
    source:         { enabled: false, value: state.dropdownOptions.sources[0] ?? '' },
    sourceCampaign: { enabled: false, value: '' },
    profession:     { enabled: false, value: state.dropdownOptions.professions[0] ?? '' },
    audience_type:  { enabled: false, value: state.dropdownOptions.audience_types[0] ?? '' },
    dealValue:      { enabled: false, value: '' },
    followUpAt:     { enabled: false, value: '' },
  });
  const [fields, setFields] = useState<Record<string, BulkFieldState>>(blank);
  useEffect(() => { if (open) setFields(blank()); }, [open]);
  const toggle = (k: string) => setFields(f => ({ ...f, [k]: { ...f[k], enabled: !f[k].enabled } }));
  const setVal = (k: string, v: string) => setFields(f => ({ ...f, [k]: { ...f[k], value: v } }));

  function handleApply() {
    const u: Partial<Lead> = {};
    if (fields.status?.enabled)         u.status         = fields.status.value;
    if (fields.assigned_to?.enabled)    u.assigned_to    = fields.assigned_to.value;
    if (fields.source?.enabled)         u.source         = fields.source.value;
    if (fields.sourceCampaign?.enabled) u.sourceCampaign = fields.sourceCampaign.value || undefined;
    if (fields.profession?.enabled)     u.profession     = fields.profession.value;
    if (fields.audience_type?.enabled)  u.audience_type  = fields.audience_type.value;
    if (fields.dealValue?.enabled)      u.dealValue      = fields.dealValue.value ? Number(fields.dealValue.value) : undefined;
    if (fields.followUpAt?.enabled)     u.followUpAt     = fields.followUpAt.value ? new Date(fields.followUpAt.value).toISOString() : undefined;
    onApply(u); onClose();
  }

  const inp = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 w-full disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed';
  const enabledCount = Object.values(fields).filter(f => f.enabled).length;

  const ROWS: { key: string; label: string; render: () => React.ReactNode }[] = [
    { key: 'status',         label: 'סטטוס',
      render: () => <select value={fields.status?.value} onChange={e => setVal('status', e.target.value)} disabled={!fields.status?.enabled} className={inp}>
        {[...state.statuses].sort((a, b) => a.order - b.order).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select> },
    { key: 'assigned_to',    label: 'אחראי',
      render: () => <select value={fields.assigned_to?.value} onChange={e => setVal('assigned_to', e.target.value)} disabled={!fields.assigned_to?.enabled} className={inp}>
        {state.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select> },
    { key: 'source',         label: 'מקור',
      render: () => <select value={fields.source?.value} onChange={e => setVal('source', e.target.value)} disabled={!fields.source?.enabled} className={inp}>
        {state.dropdownOptions.sources.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>)}
      </select> },
    { key: 'sourceCampaign', label: 'קמפיין מקור',
      render: () => <input value={fields.sourceCampaign?.value} onChange={e => setVal('sourceCampaign', e.target.value)} disabled={!fields.sourceCampaign?.enabled} placeholder="שם קמפיין..." className={inp} /> },
    { key: 'profession',     label: 'מקצוע',
      render: () => <select value={fields.profession?.value} onChange={e => setVal('profession', e.target.value)} disabled={!fields.profession?.enabled} className={inp}>
        {state.dropdownOptions.professions.map(s => <option key={s} value={s}>{PROFESSION_LABELS[s] ?? s}</option>)}
      </select> },
    { key: 'audience_type',  label: 'קהל יעד',
      render: () => <select value={fields.audience_type?.value} onChange={e => setVal('audience_type', e.target.value)} disabled={!fields.audience_type?.enabled} className={inp}>
        {state.dropdownOptions.audience_types.map(s => <option key={s} value={s}>{AUDIENCE_LABELS[s] ?? s}</option>)}
      </select> },
    { key: 'dealValue',      label: 'ערך עסקה (₪)',
      render: () => <input type="number" value={fields.dealValue?.value} onChange={e => setVal('dealValue', e.target.value)} disabled={!fields.dealValue?.enabled} placeholder="0" className={inp} /> },
    { key: 'followUpAt',     label: 'פולואפ הבא',
      render: () => <input type="datetime-local" value={(fields.followUpAt?.value ?? '').slice(0, 16)} onChange={e => setVal('followUpAt', e.target.value)} disabled={!fields.followUpAt?.enabled} className={inp} /> },
  ];

  return (
    <Modal open={open} onClose={onClose} title={`עריכת ${count} לידים`}>
      <p className="text-xs text-gray-500 mb-3">סמן את השדות שברצונך לשנות — שדות לא מסומנים לא ישתנו.</p>
      <div className="space-y-2">
        {ROWS.map(row => (
          <div key={row.key}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${fields[row.key]?.enabled ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 hover:bg-gray-100'}`}
            onClick={() => { if (!fields[row.key]?.enabled) toggle(row.key); }}>
            <input type="checkbox" checked={fields[row.key]?.enabled ?? false}
              onChange={() => toggle(row.key)} onClick={e => e.stopPropagation()}
              className="w-4 h-4 cursor-pointer flex-shrink-0 rounded" />
            <span className={`text-sm font-medium w-28 flex-shrink-0 ${fields[row.key]?.enabled ? 'text-blue-700' : 'text-gray-500'}`}>
              {row.label}
            </span>
            <div className="flex-1" onClick={e => e.stopPropagation()}>{row.render()}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
        <Btn variant="secondary" onClick={onClose}>ביטול</Btn>
        <Btn onClick={handleApply} disabled={enabledCount === 0}>החל על {count} לידים</Btn>
      </div>
    </Modal>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────

const TABLE_COLS: { key: string; label: string; sortable?: boolean }[] = [
  { key: 'name',         label: 'שם',            sortable: true  },
  { key: 'phone',        label: 'טלפון'                           },
  { key: 'email',        label: 'מייל'                            },
  { key: 'status',       label: 'סטטוס',         sortable: true  },
  { key: 'assigned_to',  label: 'אחראי',          sortable: true  },
  { key: 'source',       label: 'מקור',           sortable: true  },
  { key: 'profession',   label: 'מקצוע',          sortable: true  },
  { key: 'interestedIn', label: 'מתעניין ב'                       },
  { key: 'dealValue',    label: 'ערך עסקה',       sortable: true  },
  { key: 'score',        label: 'ניקוד',          sortable: true  },
  { key: 'followUpAt',   label: 'פולואפ הבא',     sortable: true  },
  { key: 'created_at',   label: 'תאריך יצירה',   sortable: true  },
];

function TableViewLeads({ state, onLeadClick, onUpdateLead, onAddLead, onBulkUpdateLeads, onBulkDeleteLeads }: {
  state: AppState; onLeadClick: (l: Lead) => void;
  onUpdateLead: (id: string, u: Partial<Lead>) => void;
  onAddLead: () => void;
  onBulkUpdateLeads: (ids: string[], updates: Partial<Lead>) => void;
  onBulkDeleteLeads: (ids: string[]) => void;
}) {
  const currentUser = state.users.find(u => u.id === state.currentUserId)!;
  const [filterStatus,   setFilterStatus  ] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterProgram,  setFilterProgram ] = useState('');
  const [filterSearch,   setFilterSearch  ] = useState('');
  const [filterHot,      setFilterHot     ] = useState(false);
  const [sortKey,        setSortKey       ] = useState('created_at');
  const [sortDir,        setSortDir       ] = useState<'asc' | 'desc'>('desc');
  const [visCols,        setVisCols       ] = useState<Record<string, boolean>>(Object.fromEntries(TABLE_COLS.map(c => [c.key, true])));
  const [editCell,       setEditCell      ] = useState<{ leadId: string; col: string } | null>(null);
  const [editVal,        setEditVal       ] = useState('');
  const [selected,       setSelected      ] = useState<Set<string>>(new Set());
  const [lastClicked,    setLastClicked   ] = useState<string | null>(null);
  const [showBulkModal,  setShowBulkModal ] = useState(false);
  const [showDelConfirm, setShowDelConfirm] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editCell && editRef.current) editRef.current.focus(); }, [editCell]);

  let leads = currentUser.role === 'admin' ? state.leads : state.leads.filter(l => l.assigned_to === state.currentUserId);
  if (filterStatus)   leads = leads.filter(l => l.status === filterStatus);
  if (filterAssignee) leads = leads.filter(l => l.assigned_to === filterAssignee);
  if (filterSearch) {
    const q = filterSearch.toLowerCase();
    leads = leads.filter(l => l.name.toLowerCase().includes(q) || l.phone.includes(q) || (l.email ?? '').toLowerCase().includes(q));
  }
  if (filterHot) {
    leads = leads.filter(l => {
      const st = state.statuses.find(s => s.id === l.status);
      return !st?.isFinal;
    });
  }
  leads = [...leads].sort((a, b) => {
    const av = String((a as unknown as Record<string, unknown>)[sortKey] ?? '');
    const bv = String((b as unknown as Record<string, unknown>)[sortKey] ?? '');
    return sortDir === 'asc' ? av.localeCompare(bv, 'he') : bv.localeCompare(av, 'he');
  });

  function commitEdit() {
    if (!editCell) return;
    onUpdateLead(editCell.leadId, { [editCell.col]: editVal, updated_at: new Date().toISOString() });
    setEditCell(null);
  }

  function handleCheckboxClick(id: string, e: React.MouseEvent) {
    if (e.shiftKey && lastClicked) {
      // Range select: find indices in current visible leads array
      const ids = leads.map(l => l.id);
      const from = ids.indexOf(lastClicked);
      const to   = ids.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        const rangeIds = ids.slice(start, end + 1);
        setSelected(s => { const n = new Set(s); rangeIds.forEach(rid => n.add(rid)); return n; });
        return;
      }
    }
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setLastClicked(id);
  }
  function toggleSelectAll() {
    setSelected(s => s.size === leads.length ? new Set() : new Set(leads.map(l => l.id)));
  }

  const cols = TABLE_COLS.filter(c => visCols[c.key] !== false);
  const stOpts = [...state.statuses].sort((a, b) => a.order - b.order).map(s => ({ value: s.id, label: s.label }));
  const selOpts: Record<string, { value: string; label: string }[]> = {
    status:      stOpts,
    assigned_to: state.users.map(u => ({ value: u.id, label: u.name })),
    source:      state.dropdownOptions.sources.map(s => ({ value: s, label: SOURCE_LABELS[s] ?? s })),
    profession:  state.dropdownOptions.professions.map(s => ({ value: s, label: PROFESSION_LABELS[s] ?? s })),
  };

  function display(lead: Lead, k: string): string {
    switch (k) {
      case 'status':       return state.statuses.find(s => s.id === lead.status)?.label ?? lead.status;
      case 'assigned_to':  return state.users.find(u => u.id === lead.assigned_to)?.name ?? '—';
      case 'source':       return SOURCE_LABELS[lead.source] ?? lead.source;
      case 'profession':   return PROFESSION_LABELS[lead.profession] ?? lead.profession;
      case 'interestedIn': return lead.interestedIn.map(pid => state.products.find(p => p.id === pid)?.name ?? pid).join(', ') || '—';
      case 'created_at':   return formatDate(lead.created_at);
      case 'followUpAt':   return lead.followUpAt ? formatDateTime(lead.followUpAt) : '—';
      case 'dealValue':    return lead.dealValue ? `₪${lead.dealValue.toLocaleString()}` : '—';
      case 'score':        return String(lead.score);
      default:             return String((lead as unknown as Record<string, unknown>)[k] ?? '');
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-32">
            <label className="field-label">חיפוש</label>
            <Input value={filterSearch} onChange={setFilterSearch} placeholder="שם / טלפון / מייל..." />
          </div>
          <div className="min-w-36">
            <label className="field-label">סטטוס</label>
            <SelectInput value={filterStatus} onChange={setFilterStatus} options={stOpts} placeholder="כל הסטטוסים" />
          </div>
          {currentUser.role === 'admin' && (
            <div className="min-w-32">
              <label className="field-label">אחראי</label>
              <SelectInput value={filterAssignee} onChange={setFilterAssignee}
                options={state.users.map(u => ({ value: u.id, label: u.name }))} placeholder="כולם" />
            </div>
          )}
          <div className="min-w-36">
            <label className="field-label">מוצר</label>
            <SelectInput value={filterProgram} onChange={setFilterProgram}
              options={state.products.map(p => ({ value: p.id, label: p.name }))} placeholder="כל המוצרים" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none self-end pb-1">
            <input type="checkbox" checked={filterHot} onChange={e => setFilterHot(e.target.checked)} className="w-4 h-4" />
            🔥 פעילים בלבד
          </label>
          <Btn onClick={onAddLead} className="self-end">+ ליד חדש</Btn>
        </div>
        <div className="pt-2 border-t flex flex-wrap gap-3">
          {TABLE_COLS.map(c => (
            <label key={c.key} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={visCols[c.key] !== false}
                onChange={e => setVisCols(v => ({ ...v, [c.key]: e.target.checked }))} />
              {c.label}
            </label>
          ))}
        </div>
      </div>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-blue-600 text-white rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap shadow-md">
          <span className="font-semibold text-sm">{selected.size} לידים נבחרו</span>
          <span className="opacity-40">|</span>
          <div className="flex gap-2 flex-1 flex-wrap">
            <Btn onClick={() => setShowBulkModal(true)}
              className="bg-white text-blue-700 hover:bg-blue-50 border-0 text-xs px-3 py-1.5">
              ✏️ עריכה מרובה
            </Btn>
            <Btn onClick={() => setShowDelConfirm(true)}
              className="bg-red-500 hover:bg-red-600 text-white border-0 text-xs px-3 py-1.5">
              🗑️ מחיקה ({selected.size})
            </Btn>
          </div>
          <button onClick={() => setSelected(new Set())} className="text-white/70 hover:text-white text-xs font-medium">
            ✕ בטל בחירה
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-3 text-center w-8">
                  <input type="checkbox"
                    checked={leads.length > 0 && leads.every(l => selected.has(l.id))}
                    ref={el => { if (el) el.indeterminate = selected.size > 0 && !leads.every(l => selected.has(l.id)); }}
                    onChange={toggleSelectAll} className="w-4 h-4 cursor-pointer" />
                </th>
                {cols.map(col => (
                  <th key={col.key}
                    className={`px-3 py-3 text-right font-semibold text-gray-600 whitespace-nowrap ${col.sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}`}
                    onClick={() => col.sortable && (sortKey === col.key ? setSortDir(d => d === 'asc' ? 'desc' : 'asc') : (setSortKey(col.key), setSortDir('asc')))}>
                    {col.label}{sortKey === col.key && <span className="mr-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 && <tr><td colSpan={cols.length + 1} className="text-center py-10 text-gray-400">אין לידים להצגה</td></tr>}
              {leads.map(lead => (
                <tr key={lead.id} className={`border-b transition-colors ${selected.has(lead.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-3 py-2.5 text-center cursor-pointer select-none"
                    onClick={e => handleCheckboxClick(lead.id, e)}>
                    <input type="checkbox" checked={selected.has(lead.id)} onChange={() => {}}
                      className="w-4 h-4 pointer-events-none" />
                  </td>
                  {cols.map(col => {
                    const isEd = editCell?.leadId === lead.id && editCell?.col === col.key;
                    const opts = selOpts[col.key];
                    const raw  = String((lead as unknown as Record<string, unknown>)[col.key] ?? '');
                    return (
                      <td key={col.key} className="px-3 py-2.5 whitespace-nowrap"
                        onDoubleClick={() => { if (col.key === 'name' || col.key === 'phone' || opts) { setEditCell({ leadId: lead.id, col: col.key }); setEditVal(raw); } }}>
                        {isEd && !opts ? (
                          <input ref={editRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                            onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); }}
                            className="border rounded px-2 py-0.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        ) : isEd && opts ? (
                          <select value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} autoFocus
                            className="border rounded px-1 py-0.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : col.key === 'name' ? (
                          <button onClick={() => onLeadClick(lead)} className="font-medium text-blue-600 hover:underline text-right">{lead.name}</button>
                        ) : col.key === 'status' ? (
                          (() => {
                            const st = state.statuses.find(s => s.id === lead.status);
                            return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: st?.color ?? '#9ca3af', color: st?.textColor ?? '#ffffff' }}>{st?.label ?? lead.status}</span>;
                          })()
                        ) : col.key === 'score' ? (
                          <ScoreBadge score={lead.score} />
                        ) : (
                          <span>{display(lead, col.key)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 border-t flex justify-between">
          <span>{leads.length} לידים · לחץ פעמיים על תא לעריכה מהירה · Shift+לחיצה לבחירת טווח</span>
          {selected.size > 0 && <span className="text-blue-600 font-medium">{selected.size} נבחרו</span>}
        </div>
      </div>

      <BulkEditModal open={showBulkModal} onClose={() => setShowBulkModal(false)}
        count={selected.size} state={state}
        onApply={updates => { onBulkUpdateLeads(Array.from(selected), updates); setSelected(new Set()); }} />
      <ConfirmDialog open={showDelConfirm}
        message={`האם למחוק את ${selected.size} הלידים הנבחרים? פעולה זו אינה הפיכה.`}
        danger
        onConfirm={() => { onBulkDeleteLeads(Array.from(selected)); setSelected(new Set()); setShowDelConfirm(false); }}
        onCancel={() => setShowDelConfirm(false)} />
    </div>
  );
}

// ─── Leads View ───────────────────────────────────────────────────────────────

type ViewMode = 'table' | 'kanban';

export default function LeadsView({
  state, onUpdateLead, onAddLead, onBulkAddLeads, onBulkUpdateLeads, onBulkDeleteLeads, onDeleteLead, onAddActivity, onDeleteActivity: _onDeleteActivity, onAddTask, onUpdateTask, onDeleteTask: _onDeleteTask,
}: {
  state: AppState;
  onUpdateLead: (id: string, u: Partial<Lead>) => void;
  onAddLead: (lead: Lead) => void;
  onBulkAddLeads: (leads: Lead[], newCustomFields: CustomField[]) => void;
  onBulkUpdateLeads: (ids: string[], updates: Partial<Lead>) => void;
  onBulkDeleteLeads: (ids: string[]) => void;
  onDeleteLead: (id: string) => void;
  onAddActivity: (a: Activity) => void;
  onDeleteActivity?: (id: string) => void;
  onAddTask: (t: Task) => void;
  onUpdateTask?: (id: string, u: Partial<Task>) => void;
  onDeleteTask?: (id: string) => void;
}) {
  const [mode, setMode] = useState<ViewMode>('table');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addStatus, setAddStatus] = useState<string | undefined>();
  const [csvOpen, setCsvOpen] = useState(false);

  function openAdd(statusId?: string) { setAddStatus(statusId); setAddOpen(true); }
  function handleStatusChange(id: string, status: string) { onUpdateLead(id, { status }); }
  function handleToggleTask(id: string) {
    const task = state.tasks.find(t => t.id === id);
    if (task) onUpdateTask ? onUpdateTask(id, { done: !task.done }) : onAddTask({ ...task, done: !task.done });
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-800">לידים</h1>
          <span className="text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{state.leads.length}</span>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border overflow-hidden bg-white">
            {(['table', 'kanban'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {m === 'table' ? '📋 טבלה' : '🗂️ קנבן'}
              </button>
            ))}
          </div>
          <Btn variant="secondary" onClick={() => setCsvOpen(true)}>📂 ייבוא CSV</Btn>
          <Btn onClick={() => openAdd()}>+ ליד חדש</Btn>
        </div>
      </div>

      {mode === 'table' ? (
        <TableViewLeads state={state} onLeadClick={setSelectedLead} onUpdateLead={onUpdateLead} onAddLead={() => openAdd()} onBulkUpdateLeads={onBulkUpdateLeads} onBulkDeleteLeads={onBulkDeleteLeads} />
      ) : (
        <KanbanBoard state={state} onLeadClick={setSelectedLead} onStatusChange={handleStatusChange} onAddLead={openAdd} />
      )}

      <LeadDetailDrawer lead={selectedLead} state={state} onClose={() => setSelectedLead(null)}
        onUpdateLead={onUpdateLead} onAddActivity={onAddActivity} onAddTask={onAddTask}
        onToggleTask={handleToggleTask} onDeleteLead={onDeleteLead} />
      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} state={state}
        onSave={lead => { onAddLead(lead); setAddOpen(false); }} initialStatus={addStatus} />
      <CSVImportModal open={csvOpen} onClose={() => setCsvOpen(false)} state={state}
        onImport={onBulkAddLeads} />
    </div>
  );
}

export { AddLeadModal, LeadDetailDrawer };
