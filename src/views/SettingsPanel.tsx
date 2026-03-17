/**
 * לוח הגדרות — מנהל בלבד.
 * 7 לשוניות: סטטוסים, רשימות בחירה, שדות מותאמים,
 * משתמשים, אוטומציות, ממשק, עיצוב.
 */
import { useState } from 'react';
import type { AppState, Status, User, AutomationRule, CustomField } from '../types';
import { uid, DEFAULT_LABELS } from '../utils';
import { Btn, Input, SelectInput, ConfirmDialog, Toggle } from '../ui';
import { apiCreateUser, apiDeleteUser } from '../api';
import DesignEditor from './DesignEditor';

// ─── Statuses Tab ──────────────────────────────────────────────────────────────

function StatusesTab({ state, onUpdate }: { state: AppState; onUpdate: (s: AppState) => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [newTextColor, setNewTextColor] = useState('#ffffff');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const sorted = [...state.statuses].sort((a, b) => a.order - b.order);

  function addStatus() {
    if (!newLabel.trim()) return;
    const s: Status = {
      id: uid(), label: newLabel.trim(), color: newColor, textColor: newTextColor,
      isFinal: false, order: state.statuses.length,
    };
    onUpdate({ ...state, statuses: [...state.statuses, s] });
    setNewLabel(''); setNewColor('#6366f1'); setNewTextColor('#ffffff');
  }

  function updateStatus(id: string, patch: Partial<Status>) {
    onUpdate({ ...state, statuses: state.statuses.map(s => s.id === id ? { ...s, ...patch } : s) });
  }

  function deleteStatus(id: string) {
    onUpdate({ ...state, statuses: state.statuses.filter(s => s.id !== id) });
    setConfirmDel(null);
  }

  function moveStatus(id: string, dir: 'up' | 'down') {
    const idx = sorted.findIndex(s => s.id === id);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === sorted.length - 1) return;
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    const updated = state.statuses.map(s =>
      s.id === id ? { ...s, order: sorted[swap].order }
      : s.id === sorted[swap].id ? { ...s, order: sorted[idx].order }
      : s
    );
    onUpdate({ ...state, statuses: updated });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {sorted.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 bg-white rounded-xl border p-2.5">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: s.color, color: s.textColor }}>{s.label}</span>
            {editId === s.id ? (
              <>
                <Input value={s.label} onChange={v => updateStatus(s.id, { label: v })} className="flex-1" />
                <input type="color" value={s.color} onChange={e => updateStatus(s.id, { color: e.target.value })} className="w-8 h-8 rounded cursor-pointer" title="צבע רקע" />
                <input type="color" value={s.textColor} onChange={e => updateStatus(s.id, { textColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer" title="צבע טקסט" />
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input type="checkbox" checked={!!s.isWon} onChange={e => updateStatus(s.id, { isWon: e.target.checked, isFinal: e.target.checked ? true : s.isFinal })} />
                  סגירה
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input type="checkbox" checked={s.isFinal} onChange={e => updateStatus(s.id, { isFinal: e.target.checked })} />
                  סופי
                </label>
                <Btn size="xs" variant="success" onClick={() => setEditId(null)}>✓</Btn>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-700 truncate">{s.label}</span>
                {s.isWon && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">סגירה</span>}
                {s.isFinal && !s.isWon && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">סופי</span>}
                <Btn size="xs" variant="ghost" onClick={() => moveStatus(s.id, 'up')} disabled={i === 0}>↑</Btn>
                <Btn size="xs" variant="ghost" onClick={() => moveStatus(s.id, 'down')} disabled={i === sorted.length - 1}>↓</Btn>
                <Btn size="xs" variant="ghost" onClick={() => setEditId(s.id)}>✏️</Btn>
                <Btn size="xs" variant="danger" onClick={() => setConfirmDel(s.id)}>✕</Btn>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="border border-dashed border-gray-300 rounded-xl p-3 space-y-2">
        <p className="text-xs font-medium text-gray-600">+ סטטוס חדש</p>
        <div className="flex gap-2">
          <Input value={newLabel} onChange={setNewLabel} placeholder="שם הסטטוס *" />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border border-gray-300" title="צבע רקע" />
          <input type="color" value={newTextColor} onChange={e => setNewTextColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border border-gray-300" title="צבע טקסט" />
        </div>
        <Btn size="sm" onClick={addStatus} disabled={!newLabel.trim()}>+ הוסף סטטוס</Btn>
      </div>
      <ConfirmDialog open={!!confirmDel} message="למחוק סטטוס זה?" onConfirm={() => confirmDel && deleteStatus(confirmDel)} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}

// ─── Dropdowns Tab ─────────────────────────────────────────────────────────────

function DropdownsTab({ state, onUpdate }: { state: AppState; onUpdate: (s: AppState) => void }) {
  const [activeList, setActiveList] = useState<keyof typeof state.dropdownOptions>('sources');
  const [newItem, setNewItem] = useState('');

  const LISTS: { key: keyof typeof state.dropdownOptions; label: string }[] = [
    { key: 'sources',       label: 'מקורות ליד' },
    { key: 'professions',   label: 'מקצועות' },
    { key: 'audience_types',label: 'סוגי קהל' },
    { key: 'programs',      label: 'תוכניות' },
  ];

  function addItem() {
    if (!newItem.trim()) return;
    const current = state.dropdownOptions[activeList];
    if (current.includes(newItem.trim())) return;
    onUpdate({ ...state, dropdownOptions: { ...state.dropdownOptions, [activeList]: [...current, newItem.trim()] } });
    setNewItem('');
  }

  function removeItem(item: string) {
    onUpdate({ ...state, dropdownOptions: { ...state.dropdownOptions, [activeList]: state.dropdownOptions[activeList].filter(x => x !== item) } });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {LISTS.map(l => (
          <button key={l.key} onClick={() => setActiveList(l.key)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${activeList === l.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {l.label}
          </button>
        ))}
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {state.dropdownOptions[activeList].map(item => (
          <div key={item} className="flex items-center gap-2 bg-white rounded-lg border p-2">
            <span className="flex-1 text-sm text-gray-700">{item}</span>
            <Btn size="xs" variant="danger" onClick={() => removeItem(item)}>✕</Btn>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={newItem} onChange={setNewItem} placeholder="ערך חדש..." onKeyDown={e => e.key === 'Enter' && addItem()} />
        <Btn size="sm" onClick={addItem} disabled={!newItem.trim()}>+ הוסף</Btn>
      </div>
    </div>
  );
}

// ─── Custom Fields Tab ────────────────────────────────────────────────────────

function FieldsTab({ state, onUpdate }: { state: AppState; onUpdate: (s: AppState) => void }) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CustomField['type']>('text');

  function addField() {
    if (!newName.trim()) return;
    const f: CustomField = { id: uid(), name: newName.trim(), type: newType, hidden: false, order: state.customFields.length };
    onUpdate({ ...state, customFields: [...state.customFields, f] });
    setNewName('');
  }

  function updateField(id: string, patch: Partial<CustomField>) {
    onUpdate({ ...state, customFields: state.customFields.map(f => f.id === id ? { ...f, ...patch } : f) });
  }

  function deleteField(id: string) {
    onUpdate({ ...state, customFields: state.customFields.filter(f => f.id !== id) });
  }

  const TYPE_OPTS: { value: CustomField['type']; label: string }[] = [
    { value: 'text',     label: 'טקסט'    },
    { value: 'number',   label: 'מספר'    },
    { value: 'date',     label: 'תאריך'   },
    { value: 'select',   label: 'בחירה'   },
    { value: 'checkbox', label: 'תיבת סימון' },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {state.customFields.length === 0 && <p className="text-sm text-gray-400 text-center py-4">אין שדות מותאמים עדיין</p>}
        {state.customFields.map(f => (
          <div key={f.id} className="flex items-center gap-2 bg-white rounded-xl border p-2.5">
            <span className="flex-1 text-sm font-medium text-gray-700">{f.name}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{TYPE_OPTS.find(t => t.value === f.type)?.label}</span>
            <Toggle checked={!f.hidden} onChange={v => updateField(f.id, { hidden: !v })} label="גלוי" />
            <Btn size="xs" variant="danger" onClick={() => deleteField(f.id)}>✕</Btn>
          </div>
        ))}
      </div>
      <div className="border border-dashed border-gray-300 rounded-xl p-3 flex gap-2">
        <Input value={newName} onChange={setNewName} placeholder="שם שדה *" />
        <SelectInput value={newType} onChange={v => setNewType(v as CustomField['type'])} options={TYPE_OPTS} className="w-28" />
        <Btn size="sm" onClick={addField} disabled={!newName.trim()}>+ הוסף</Btn>
      </div>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({
  state, onUpdate, onViewAs,
}: {
  state: AppState;
  onUpdate: (s: AppState) => void;
  onViewAs: (id: string) => void;
}) {
  const [newName,     setNewName]     = useState('');
  const [newEmail,    setNewEmail]    = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole,     setNewRole]     = useState<User['role']>('salesperson');
  const [newRate,     setNewRate]     = useState('10');
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [confirmDel,  setConfirmDel]  = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  async function addUser() {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) return;
    setCreating(true);
    setCreateError('');

    const newId = uid();
    const result = await apiCreateUser({
      email: newEmail.trim(),
      password: newPassword.trim(),
      crm_user_id: newId,
      role: newRole,
    });

    if ('error' in result) {
      setCreateError(result.error);
      setCreating(false);
      return;
    }

    const u: User = {
      id: newId,
      name: newName.trim(),
      role: newRole,
      commissionRate: Number(newRate) / 100,
      email: newEmail.trim(),
      password: newPassword.trim(),
    };
    onUpdate({ ...state, users: [...state.users, u] });
    setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('salesperson'); setNewRate('10');
    setCreating(false);
  }

  function updateUser(id: string, patch: Partial<User>) {
    onUpdate({ ...state, users: state.users.map(u => u.id === id ? { ...u, ...patch } : u) });
  }

  async function deleteUser(id: string) {
    if (id === state.currentUserId) return;
    setDeletingId(id);
    const result = await apiDeleteUser(id);
    if ('error' in result) {
      alert('שגיאה במחיקת המשתמש: ' + result.error);
    } else {
      onUpdate({ ...state, users: state.users.filter(u => u.id !== id) });
    }
    setDeletingId(null);
    setConfirmDel(null);
  }

  return (
    <div className="space-y-3">
      {/* Show/hide passwords toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">משתמשי המערכת</p>
        <button
          onClick={() => setShowPasswords(p => !p)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-2.5 py-1 transition-colors">
          {showPasswords ? '🙈 הסתר סיסמאות' : '👁️ הצג סיסמאות'}
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {state.users.map(u => (
          <div key={u.id} className="bg-white rounded-xl border p-3 space-y-2">
            {/* Row 1: avatar + name + role + commission */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {u.name.charAt(0)}
              </div>
              <Input value={u.name} onChange={v => updateUser(u.id, { name: v })} className="flex-1" />
              <SelectInput value={u.role} onChange={v => updateUser(u.id, { role: v as User['role'] })}
                options={[{ value: 'admin', label: 'מנהל' }, { value: 'salesperson', label: 'נציג' }]}
                className="w-24" />
              <div className="flex items-center gap-1 shrink-0">
                <input type="number" value={Math.round(u.commissionRate * 100)} min={0} max={100}
                  onChange={e => updateUser(u.id, { commissionRate: Number(e.target.value) / 100 })}
                  className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <span className="text-xs text-gray-500">%</span>
              </div>
            </div>

            {/* Row 2: email + password (if shown) */}
            <div className="flex items-center gap-2">
              <input
                type="email" value={u.email ?? ''} placeholder="מייל"
                onChange={e => updateUser(u.id, { email: e.target.value })}
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                dir="ltr" />
              {showPasswords && (
                <input
                  type="text" value={u.password ?? ''} placeholder="סיסמה"
                  onChange={e => updateUser(u.id, { password: e.target.value })}
                  className="w-36 border border-gray-300 rounded-lg px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                  dir="ltr" />
              )}
            </div>

            {/* Row 3: actions */}
            <div className="flex items-center gap-2 justify-end">
              {u.id === state.currentUserId ? (
                <span className="text-xs text-blue-500">אתה</span>
              ) : (
                <>
                  <Btn size="xs" variant="ghost" onClick={() => onViewAs(u.id)}>
                    👁️ צפה כ...
                  </Btn>
                  <Btn size="xs" variant="danger"
                    onClick={() => setConfirmDel(u.id)}
                    disabled={deletingId === u.id}>
                    {deletingId === u.id ? '...' : '✕ מחק'}
                  </Btn>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add new user */}
      <div className="border border-dashed border-gray-300 rounded-xl p-3 space-y-2">
        <p className="text-xs font-medium text-gray-600">+ משתמש חדש</p>
        <div className="flex gap-2">
          <Input value={newName} onChange={setNewName} placeholder="שם *" className="flex-1" />
          <SelectInput value={newRole} onChange={v => setNewRole(v as User['role'])}
            options={[{ value: 'admin', label: 'מנהל' }, { value: 'salesperson', label: 'נציג' }]}
            className="w-24" />
          <div className="flex items-center gap-1 shrink-0">
            <input type="number" value={newRate} min={0} max={100} onChange={e => setNewRate(e.target.value)}
              className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <span className="text-xs text-gray-500">%</span>
          </div>
        </div>
        <div className="flex gap-2">
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
            placeholder="מייל *"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            dir="ltr" />
          <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            placeholder="סיסמה *"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            dir="ltr" />
        </div>
        {createError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">⚠️ {createError}</p>
        )}
        <Btn size="sm" onClick={addUser}
          disabled={!newName.trim() || !newEmail.trim() || !newPassword.trim() || creating}>
          {creating ? '⏳ יוצר...' : '+ הוסף משתמש'}
        </Btn>
      </div>

      <ConfirmDialog
        open={!!confirmDel}
        message="למחוק משתמש זה לצמיתות? פעולה זו אינה ניתנת לביטול."
        onConfirm={() => confirmDel && deleteUser(confirmDel)}
        onCancel={() => setConfirmDel(null)} />
    </div>
  );
}

// ─── Automations Tab ──────────────────────────────────────────────────────────

function AutomationsTab({ state, onUpdate }: { state: AppState; onUpdate: (s: AppState) => void }) {
  const [newName, setNewName] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationRule['triggerType']>('status_change');
  const [fromStatus, setFromStatus] = useState('');
  const [toStatus, setToStatus] = useState('');
  const [daysIdle, setDaysIdle] = useState('3');
  const [actionType, setActionType] = useState<AutomationRule['actionType']>('create_task');
  const [taskNote, setTaskNote] = useState('');
  const [daysOffset, setDaysOffset] = useState('0');

  function addRule() {
    if (!newName.trim()) return;
    const rule: AutomationRule = {
      id: uid(), name: newName.trim(), active: true,
      triggerType,
      triggerFromStatus: triggerType === 'status_change' ? fromStatus : undefined,
      triggerToStatus: triggerType === 'status_change' ? toStatus : undefined,
      triggerDaysIdle: triggerType === 'no_activity' ? Number(daysIdle) : undefined,
      actionType,
      actionTaskNote: actionType === 'create_task' ? taskNote : undefined,
      actionTaskDaysOffset: actionType === 'create_task' ? Number(daysOffset) : undefined,
    };
    onUpdate({ ...state, automationRules: [...state.automationRules, rule] });
    setNewName(''); setTaskNote('');
  }

  function toggleRule(id: string) {
    onUpdate({ ...state, automationRules: state.automationRules.map(r => r.id === id ? { ...r, active: !r.active } : r) });
  }

  function deleteRule(id: string) {
    onUpdate({ ...state, automationRules: state.automationRules.filter(r => r.id !== id) });
  }

  const TRIGGER_LABELS: Record<string, string> = {
    status_change: 'שינוי סטטוס', new_lead: 'ליד חדש', no_activity: 'אין תנועה',
  };
  const ACTION_LABELS: Record<string, string> = {
    create_task: 'יצור משימה', move_to_client: 'העבר לקליטה', open_whatsapp: 'פתח וואצאפ',
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {state.automationRules.length === 0 && <p className="text-sm text-gray-400 text-center py-4">אין חוקי אוטומציה</p>}
        {state.automationRules.map(rule => (
          <div key={rule.id} className={`flex items-center gap-2 bg-white rounded-xl border p-2.5 ${!rule.active ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{rule.name}</p>
              <p className="text-xs text-gray-500">
                {TRIGGER_LABELS[rule.triggerType]} → {ACTION_LABELS[rule.actionType]}
              </p>
            </div>
            <Toggle checked={rule.active} onChange={() => toggleRule(rule.id)} />
            <Btn size="xs" variant="danger" onClick={() => deleteRule(rule.id)}>✕</Btn>
          </div>
        ))}
      </div>

      <div className="border border-dashed border-gray-300 rounded-xl p-3 space-y-2">
        <p className="text-xs font-medium text-gray-600">+ חוק אוטומציה חדש</p>
        <Input value={newName} onChange={setNewName} placeholder="שם החוק *" />
        <div className="grid grid-cols-2 gap-2">
          <SelectInput value={triggerType} onChange={v => setTriggerType(v as AutomationRule['triggerType'])}
            options={[
              { value: 'status_change', label: 'שינוי סטטוס' },
              { value: 'new_lead',      label: 'ליד חדש' },
              { value: 'no_activity',   label: 'אין תנועה' },
            ]} />
          <SelectInput value={actionType} onChange={v => setActionType(v as AutomationRule['actionType'])}
            options={[
              { value: 'create_task',    label: 'יצור משימה' },
              { value: 'move_to_client', label: 'העבר לקליטה' },
            ]} />
        </div>
        {triggerType === 'status_change' && (
          <div className="grid grid-cols-2 gap-2">
            <SelectInput value={fromStatus} onChange={setFromStatus} placeholder="מסטטוס (כל)" options={state.statuses.map(s => ({ value: s.id, label: s.label }))} />
            <SelectInput value={toStatus}   onChange={setToStatus}   placeholder="לסטטוס (כל)" options={state.statuses.map(s => ({ value: s.id, label: s.label }))} />
          </div>
        )}
        {triggerType === 'no_activity' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">אחרי</span>
            <input type="number" value={daysIdle} min={1} onChange={e => setDaysIdle(e.target.value)}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center" />
            <span className="text-xs text-gray-600">ימים ללא תנועה</span>
          </div>
        )}
        {actionType === 'create_task' && (
          <div className="grid grid-cols-2 gap-2">
            <Input value={taskNote} onChange={setTaskNote} placeholder="תיאור המשימה" />
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-600 shrink-0">עוד</span>
              <input type="number" value={daysOffset} min={0} onChange={e => setDaysOffset(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center" />
              <span className="text-xs text-gray-600 shrink-0">ימים</span>
            </div>
          </div>
        )}
        <Btn size="sm" onClick={addRule} disabled={!newName.trim()}>+ הוסף חוק</Btn>
      </div>
    </div>
  );
}

// ─── Interface Tab ─────────────────────────────────────────────────────────────

function InterfaceTab({ state, onUpdate }: { state: AppState; onUpdate: (s: AppState) => void }) {
  const NAV_NAMES: Record<string, string> = {
    home: '🏠 ראשי', leads: '👤 לידים', clients: '🎓 קליטה', products: '📦 מוצרים',
    tasks: '✅ משימות', data: '📊 נתונים', chat: '💬 צ\'אט', settings: '⚙️ הגדרות',
  };
  const sorted = [...state.navConfig].sort((a, b) => a.order - b.order);

  function moveTab(id: string, dir: 'up' | 'down') {
    const idx = sorted.findIndex(t => t.id === id);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === sorted.length - 1) return;
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    const updated = state.navConfig.map(t =>
      t.id === id ? { ...t, order: sorted[swap].order }
      : t.id === sorted[swap].id ? { ...t, order: sorted[idx].order }
      : t
    );
    onUpdate({ ...state, navConfig: updated });
  }

  function toggleTab(id: string) {
    onUpdate({ ...state, navConfig: state.navConfig.map(t => t.id === id ? { ...t, visible: !t.visible } : t) });
  }

  const importantLabels = [
    'app.title', 'tab.home', 'tab.leads', 'tab.clients', 'tab.products',
    'tab.tasks', 'tab.data', 'tab.chat', 'tab.settings',
    'kpi.active_leads', 'kpi.won_month', 'kpi.commission', 'kpi.today_tasks',
    'btn.add_lead', 'home.sub',
  ];

  function updateLabel(key: string, value: string) {
    onUpdate({ ...state, labels: { ...state.labels, [key]: value } });
  }

  function resetLabel(key: string) {
    const { [key]: _, ...rest } = state.labels;
    onUpdate({ ...state, labels: rest });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">סדר ונראות לשוניות ניווט</p>
        <div className="space-y-1.5">
          {sorted.map((tab, i) => (
            <div key={tab.id} className="flex items-center gap-2 bg-white rounded-xl border p-2.5">
              <Toggle checked={tab.visible} onChange={() => toggleTab(tab.id)} />
              <span className="flex-1 text-sm text-gray-700">{NAV_NAMES[tab.id] ?? tab.id}</span>
              <Btn size="xs" variant="ghost" onClick={() => moveTab(tab.id, 'up')} disabled={i === 0}>↑</Btn>
              <Btn size="xs" variant="ghost" onClick={() => moveTab(tab.id, 'down')} disabled={i === sorted.length - 1}>↓</Btn>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">עריכת כיתובים</p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {importantLabels.map(key => {
            const current = state.labels[key] ?? DEFAULT_LABELS[key] ?? key;
            const isCustom = !!state.labels[key];
            return (
              <div key={key} className="flex items-center gap-2 bg-white rounded-lg border p-2">
                <span className="text-xs text-gray-400 w-36 shrink-0 truncate">{key}</span>
                <input
                  value={current}
                  onChange={e => updateLabel(key, e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                {isCustom && (
                  <Btn size="xs" variant="ghost" onClick={() => resetLabel(key)} title="אפס לברירת מחדל">↺</Btn>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">מייל לסיכום יומי</p>
        <Input
          value={state.dailySummaryEmail}
          onChange={v => onUpdate({ ...state, dailySummaryEmail: v })}
          placeholder="your@email.com"
          type="email"
        />
      </div>
    </div>
  );
}

// ─── Settings Panel ────────────────────────────────────────────────────────────

export default function SettingsPanel({
  state, onUpdate, onViewAs,
}: {
  state: AppState;
  onUpdate: (s: AppState) => void;
  onViewAs: (id: string) => void;
}) {
  const [tab, setTab] = useState<'statuses' | 'dropdowns' | 'fields' | 'users' | 'automations' | 'interface' | 'design'>('statuses');

  const currentUser = state.users.find(u => u.id === state.currentUserId);
  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center py-20 text-center">
        <div>
          <span className="text-5xl">🔒</span>
          <p className="text-gray-700 font-semibold text-lg mt-3">גישה למנהלים בלבד</p>
          <p className="text-gray-400 text-sm mt-1">פנה למנהל המערכת לשינוי הגדרות</p>
        </div>
      </div>
    );
  }

  const TABS = [
    { id: 'statuses',    label: '🏷️ סטטוסים'   },
    { id: 'dropdowns',   label: '📋 רשימות'     },
    { id: 'fields',      label: '🔧 שדות'       },
    { id: 'users',       label: '👤 משתמשים'    },
    { id: 'automations', label: '🤖 אוטומציות'  },
    { id: 'interface',   label: '🖥️ ממשק'       },
    { id: 'design',      label: '🎨 עיצוב'      },
  ] as const;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">⚙️ הגדרות</h1>
        <span className="text-xs text-gray-400">מנהל: {currentUser.name}</span>
      </div>

      <div className="flex gap-1 mb-6 border-b pb-3 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border p-5 shadow-sm">
        {tab === 'statuses'    && <StatusesTab    state={state} onUpdate={onUpdate} />}
        {tab === 'dropdowns'   && <DropdownsTab   state={state} onUpdate={onUpdate} />}
        {tab === 'fields'      && <FieldsTab      state={state} onUpdate={onUpdate} />}
        {tab === 'users'       && <UsersTab       state={state} onUpdate={onUpdate} onViewAs={onViewAs} />}
        {tab === 'automations' && <AutomationsTab state={state} onUpdate={onUpdate} />}
        {tab === 'interface'   && <InterfaceTab   state={state} onUpdate={onUpdate} />}
        {tab === 'design'      && <DesignEditor />}
      </div>
    </div>
  );
}
