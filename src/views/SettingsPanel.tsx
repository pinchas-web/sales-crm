/**
 * לוח הגדרות — מנהל בלבד.
 * 7 לשוניות: סטטוסים, רשימות בחירה, שדות מותאמים,
 * משתמשים, אוטומציות, ממשק, עיצוב.
 */
import { useState } from 'react';
import type { AppState, Status, User, AutomationRule, CustomField } from '../types';
import { uid, DEFAULT_LABELS } from '../utils';
import { Btn, Input, SelectInput, ConfirmDialog, Toggle } from '../ui';
import { apiCreateUser, apiDeleteUser, apiChangeUserPassword, apiUpdateUser } from '../api';
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

const ALL_TABS_PERMS = [
  { id: 'home',     icon: '🏠', label: 'ראשי'   },
  { id: 'leads',    icon: '👤', label: 'לידים'  },
  { id: 'clients',  icon: '🎓', label: 'קליטה'  },
  { id: 'products', icon: '📦', label: 'מוצרים' },
  { id: 'tasks',    icon: '✅', label: 'משימות' },
  { id: 'data',     icon: '📊', label: 'נתונים' },
  { id: 'chat',     icon: '💬', label: "צ'אט"   },
  { id: 'courses',  icon: '📚', label: 'קורסים' },
];
const DEFAULT_TABS = ALL_TABS_PERMS.map(t => t.id);

// ── UserCard — כרטיס משתמש בודד (תצוגה + עריכה) ────────────────────────────

function UserCard({
  u, isMe,
  onSave, onViewAs, onDelete, onChangePassword, onChangePerms,
}: {
  u: User;
  isMe: boolean;
  onSave:           (id: string, patch: Partial<User>) => void;
  onViewAs:         (id: string) => void;
  onDelete:         (id: string) => void;
  onChangePassword: (u: User) => void;
  onChangePerms:    (u: User) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(u.name);
  const [phone,   setPhone]   = useState(u.phone ?? '');
  const [email,   setEmail]   = useState(u.email ?? '');
  const [role,    setRole]    = useState(u.role);
  const [rate,    setRate]    = useState(String(Math.round(u.commissionRate * 100)));

  // sync אם ה-props השתנו מבחוץ
  const syncEdit = () => {
    setName(u.name); setPhone(u.phone ?? ''); setEmail(u.email ?? '');
    setRole(u.role); setRate(String(Math.round(u.commissionRate * 100)));
    setEditing(true);
  };

  function save() {
    onSave(u.id, {
      name:           name.trim() || u.name,
      phone:          phone.trim() || undefined,
      email:          email.trim() || u.email,
      role,
      commissionRate: Number(rate) / 100,
    });
    setEditing(false);
  }

  function cancel() {
    setName(u.name); setPhone(u.phone ?? ''); setEmail(u.email ?? '');
    setRole(u.role); setRate(String(Math.round(u.commissionRate * 100)));
    setEditing(false);
  }

  const roleColor = u.role === 'admin'
    ? 'bg-purple-100 text-purple-700'
    : 'bg-blue-100 text-blue-700';

  const inputCls = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* ─── Header: אווטר + שם + תפקיד ─── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600
                        text-white font-bold text-sm flex items-center justify-center shrink-0 select-none">
          {u.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-gray-900 truncate leading-tight">{u.name}</p>
          <p className="text-xs text-gray-500 truncate leading-tight">{u.email}</p>
        </div>
        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full shrink-0 ${roleColor}`}>
          {u.role === 'admin' ? 'מנהל' : 'נציג'}
        </span>
        {isMe && <span className="text-xs text-emerald-600 font-semibold shrink-0">● אתה</span>}
      </div>

      {/* ─── פרטים (view mode) ─── */}
      {!editing && (
        <div className="px-4 py-2.5 flex items-center gap-5 text-xs text-gray-500 border-b border-gray-100">
          {u.phone ? <span>📞 {u.phone}</span> : <span className="text-gray-300">אין טלפון</span>}
          <span>{Math.round(u.commissionRate * 100)}% עמלה</span>
        </div>
      )}

      {/* ─── עריכה (edit mode) ─── */}
      {editing && (
        <div className="px-4 pt-3 pb-3 space-y-2.5 border-b border-gray-100 bg-blue-50/40">
          <div>
            <label className="block text-xs text-gray-500 mb-1">שם מלא</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">טלפון</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">מייל</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">תפקיד</label>
              <select value={role} onChange={e => setRole(e.target.value as User['role'])} className={inputCls}>
                <option value="salesperson">נציג</option>
                <option value="admin">מנהל</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">% עמלה</label>
              <input type="number" value={rate} min={0} max={100}
                onChange={e => setRate(e.target.value)} className={inputCls + ' text-center'} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save}
              className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-xs font-semibold hover:bg-blue-700 transition-colors">
              ✓ שמור שינויים
            </button>
            <button onClick={cancel}
              className="px-4 text-xs border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors text-gray-600">
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* ─── פעולות ─── */}
      {!isMe && !editing && (
        <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap">
          <ActionBtn onClick={syncEdit} label="✏️ ערוך" />
          <ActionBtn onClick={() => onChangePassword(u)} label="🔑 שנה סיסמא" />
          {u.role !== 'admin' && <ActionBtn onClick={() => onChangePerms(u)} label="📋 הרשאות" />}
          <ActionBtn onClick={() => onViewAs(u.id)} label="👁️ צפה כ..." />
          <ActionBtn onClick={() => onDelete(u.id)} label="🗑️ מחק" danger />
        </div>
      )}
    </div>
  );
}

function ActionBtn({ onClick, label, danger }: { onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors
        ${danger
          ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
          : 'border-gray-200 text-gray-600 hover:bg-gray-100'}`}
    >
      {label}
    </button>
  );
}

function UsersTab({
  state, onUpdate, onViewAs,
}: {
  state: AppState;
  onUpdate: (s: AppState) => void;
  onViewAs: (id: string) => void;
}) {
  // ── טופס הוספת משתמש ──
  const [newName,     setNewName]     = useState('');
  const [newPhone,    setNewPhone]    = useState('');
  const [newEmail,    setNewEmail]    = useState('');
  const [newRole,     setNewRole]     = useState<User['role']>('salesperson');
  const [newRate,     setNewRate]     = useState('10');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState('');

  // ── מודל שינוי סיסמא ──
  const [passTarget,  setPassTarget]  = useState<User | null>(null);
  const [newPass,     setNewPass]     = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [passError,   setPassError]   = useState('');
  const [passSaving,  setPassSaving]  = useState(false);
  const [passDone,    setPassDone]    = useState(false);

  // ── מודל הרשאות ──
  const [permTarget,   setPermTarget]   = useState<User | null>(null);
  const [selectedTabs, setSelectedTabs] = useState<string[]>(DEFAULT_TABS);

  // ── מחיקה ──
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function updateUser(id: string, patch: Partial<User>) {
    onUpdate({ ...state, users: state.users.map(u => u.id === id ? { ...u, ...patch } : u) });
    if (patch.email || patch.role) {
      const result = await apiUpdateUser({
        crm_user_id: id,
        email: patch.email,
        role: patch.role,
      });
      if ('error' in result) {
        alert('שגיאה בעדכון הרשאות המשתמש: ' + result.error);
      }
    }
  }

  async function addUser() {
    const trimName  = newName.trim();
    const trimEmail = newEmail.trim();
    if (!trimName || !trimEmail) { setCreateError('שם ומייל הם שדות חובה.'); return; }
    if (newPassword.length < 6)  { setCreateError('הסיסמא חייבת להכיל לפחות 6 תווים.'); return; }

    setCreating(true); setCreateError('');

    const newId = uid();
    const result = await apiCreateUser({ email: trimEmail, crm_user_id: newId, role: newRole, password: newPassword });

    if ('error' in result) {
      // תרגם שגיאות נפוצות מ-Supabase לעברית
      const msg = result.error.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('crm user already exists')) {
        setCreateError('מייל זה כבר רשום במערכת. השתמש במייל אחר.');
      } else {
        setCreateError(result.error);
      }
      setCreating(false);
      return;
    }

    const u: User = {
      id: newId, name: trimName, role: newRole,
      commissionRate: Number(newRate) / 100,
      email: trimEmail, phone: newPhone.trim() || undefined,
    };
    onUpdate({ ...state, users: [...state.users, u] });
    setNewName(''); setNewPhone(''); setNewEmail('');
    setNewRole('salesperson'); setNewRate('10'); setNewPassword('');
    setCreating(false);

    // פתח הרשאות אוטומטית לנציגים
    if (newRole !== 'admin') {
      setSelectedTabs(DEFAULT_TABS);
      setPermTarget(u);
    }
  }

  async function doChangePassword() {
    if (!passTarget || newPass.length < 6) return;
    setPassSaving(true); setPassError('');
    const result = await apiChangeUserPassword(passTarget.id, newPass);
    setPassSaving(false);
    if ('error' in result) { setPassError(result.error); return; }
    setPassDone(true);
    setTimeout(() => { setPassTarget(null); setNewPass(''); setPassDone(false); }, 1500);
  }

  function openChangePerms(u: User) {
    setSelectedTabs(u.allowedTabs ?? DEFAULT_TABS);
    setPermTarget(u);
  }

  function savePerms() {
    if (!permTarget) return;
    onUpdate({ ...state, users: state.users.map(u => u.id === permTarget.id ? { ...u, allowedTabs: selectedTabs } : u) });
    setPermTarget(null);
  }

  async function deleteUser(id: string) {
    if (id === state.currentUserId) return;
    setDeletingId(id);
    const result = await apiDeleteUser(id);
    if ('error' in result) {
      alert('שגיאה: ' + result.error);
    } else {
      onUpdate({ ...state, users: state.users.filter(u => u.id !== id) });
    }
    setDeletingId(null); setConfirmDel(null);
  }

  const fieldCls = 'w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors bg-white';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── רשימת משתמשים ── */}
      <p className="text-sm font-semibold text-gray-700">משתמשי המערכת ({state.users.length})</p>

      <div className="space-y-3 max-h-[32rem] overflow-y-auto">
        {state.users.map(u => (
          <UserCard
            key={u.id}
            u={u}
            isMe={u.id === state.currentUserId}
            onSave={updateUser}
            onViewAs={onViewAs}
            onDelete={id => { if (deletingId) return; setConfirmDel(id); }}
            onChangePassword={u => { setPassTarget(u); setNewPass(''); setPassError(''); setPassDone(false); }}
            onChangePerms={openChangePerms}
          />
        ))}
      </div>

      {/* ── הוספת משתמש חדש ── */}
      <details className="border border-dashed border-gray-300 rounded-2xl overflow-hidden">
        <summary className="px-4 py-3 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 select-none list-none flex items-center gap-2">
          <span>+</span> הוסף משתמש חדש
        </summary>
        <div className="px-4 pb-4 pt-3 space-y-3 border-t border-gray-100">

          {/* שם */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">שם מלא *</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="ישראל ישראלי" className={fieldCls} />
          </div>

          {/* טלפון + תפקיד */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">טלפון</label>
              <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                placeholder="050-0000000" className={fieldCls} dir="ltr" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">תפקיד</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value as User['role'])} className={fieldCls}>
                <option value="salesperson">נציג מכירות</option>
                <option value="admin">מנהל מערכת</option>
              </select>
            </div>
          </div>

          {/* מייל */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">מייל (שם משתמש) *</label>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
              placeholder="user@email.com" className={fieldCls} dir="ltr" />
          </div>

          {/* עמלה + סיסמא */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">% עמלה</label>
              <input type="number" value={newRate} min={0} max={100}
                onChange={e => setNewRate(e.target.value)} className={fieldCls + ' text-center'} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                סיסמא ראשונית *
                {newPassword.length > 0 && newPassword.length < 6 && (
                  <span className="text-red-500 mr-1">(לפחות 6 תווים)</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="לפחות 6 תווים"
                  className={fieldCls + ' pl-10 ' + (newPassword.length > 0 && newPassword.length < 6 ? 'border-red-400 ring-red-400' : '')}
                  dir="ltr" />
                <button type="button" onClick={() => setShowNewPass(p => !p)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-base leading-none">
                  {showNewPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          </div>

          {createError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700 flex items-center gap-2">
              <span>⚠️</span><span>{createError}</span>
            </div>
          )}

          <button onClick={addUser}
            disabled={!newName.trim() || !newEmail.trim() || newPassword.length < 6 || creating}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold
                       hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {creating
              ? <span className="flex items-center justify-center gap-2"><span className="animate-spin">⏳</span> יוצר משתמש...</span>
              : '+ הוסף משתמש'}
          </button>
        </div>
      </details>

      {/* ── מודל שינוי סיסמא ── */}
      {passTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800">🔑 שינוי סיסמא</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                עבור: <span className="font-semibold text-gray-800">{passTarget.name}</span>
              </p>
            </div>
            {passDone ? (
              <div className="text-center py-4 space-y-2">
                <div className="text-4xl">✅</div>
                <p className="text-green-700 font-semibold">הסיסמא שונתה בהצלחה!</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">סיסמא חדשה *</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={newPass} onChange={e => setNewPass(e.target.value)}
                      placeholder="לפחות 6 תווים" autoFocus
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pl-12"
                      dir="ltr"
                      onKeyDown={e => e.key === 'Enter' && doChangePassword()} />
                    <button type="button" onClick={() => setShowPass(p => !p)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                {passError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
                    ⚠️ {passError}
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={doChangePassword}
                    disabled={newPass.length < 6 || passSaving}
                    className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold
                               hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {passSaving ? '⏳ שומר...' : 'שמור סיסמא'}
                  </button>
                  <button onClick={() => setPassTarget(null)}
                    className="px-5 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors">
                    ביטול
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── מודל הרשאות ── */}
      {permTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800">📋 הרשאות גישה</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                בחר מה יהיה זמין ל-<span className="font-semibold text-gray-800">{permTarget.name}</span>
              </p>
            </div>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {ALL_TABS_PERMS.map(tab => (
                <label key={tab.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                  <input type="checkbox"
                    checked={selectedTabs.includes(tab.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedTabs(t => [...t, tab.id]);
                      else setSelectedTabs(t => t.filter(x => x !== tab.id));
                    }}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-gray-700">{tab.icon} {tab.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={savePerms}
                className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors">
                שמור הרשאות
              </button>
              <button onClick={() => setPermTarget(null)}
                className="px-5 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors">
                דלג
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        message={`למחוק את ${state.users.find(u => u.id === confirmDel)?.name ?? 'המשתמש'} לצמיתות? פעולה זו אינה ניתנת לביטול.`}
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
    tasks: '✅ משימות', data: '📊 נתונים', chat: '💬 צ\'אט', courses: '📚 קורסים',
    marketing: '📣 שיווק', settings: '⚙️ הגדרות',
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
  // TEMP BYPASS — להחזיר את הבדיקה אחרי שהמנהל יתקן את התפקיד שלו
  // if (currentUser?.role !== 'admin') {
  //   return (
  //     <div className="flex items-center justify-center py-20 text-center">
  //       <div>
  //         <span className="text-5xl">🔒</span>
  //         <p className="text-gray-700 font-semibold text-lg mt-3">גישה למנהלים בלבד</p>
  //         <p className="text-gray-400 text-sm mt-1">פנה למנהל המערכת לשינוי הגדרות</p>
  //       </div>
  //     </div>
  //   );
  // }

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
        <span className="text-xs text-gray-400">{currentUser?.name ?? ''}</span>
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
