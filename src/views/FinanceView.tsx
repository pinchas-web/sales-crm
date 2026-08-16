/**
 * דשבורד פיננסי ביתי — ניהול הכנסות והוצאות.
 * פוקוס על חיכוך אפסי: ייבוא CSV מהבנק, עסקאות קבועות אוטומטיות, הוספה מהירה.
 */
import { useState, useMemo, useRef, useCallback } from 'react';
import type { AppState, FinanceTx, FinanceCategory, FinanceRecurring, FinanceTxType } from '../types';
import { uid } from '../utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  state: AppState;
  onAddTxs:          (txs: FinanceTx[]) => void;
  onUpdateTx:        (id: string, updates: Partial<FinanceTx>) => void;
  onDeleteTx:        (id: string) => void;
  onUpdateCategory:  (id: string, updates: Partial<FinanceCategory>) => void;
  onSaveRecurring:   (r: FinanceRecurring) => void;
  onDeleteRecurring: (id: string) => void;
  onApplyRecurring:  (month: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split('T')[0]; }
function monthKey(d: Date) { return d.toISOString().slice(0, 7); } // YYYY-MM
function fmtAmount(n: number) { return n.toLocaleString('he-IL'); }
function fmtDate(s: string) {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return `${HE_MONTHS[+m - 1]} ${y}`;
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

interface ParsedRow { date: string; description: string; amount: number; type: FinanceTxType }

function parseIsraeliCsv(raw: string): ParsedRow[] {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];

  let startIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const l = lines[i].toLowerCase();
    if (l.includes('תאריך') || l.includes('date') || l.includes('ת.ערך')) { startIdx = i + 1; break; }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
    if (cols.length < 2) continue;

    let date = '';
    let debit = 0, credit = 0;
    let desc = '';

    for (let j = 0; j < cols.length; j++) {
      const c = cols[j];
      if (!date) {
        const dmatch = c.match(/^(\d{1,2})[\/\-.]( \d{1,2})[\/\-.]( \d{2,4})$/);
        if (dmatch) {
          const [, d, m, y] = dmatch;
          const yr = y.length === 2 ? `20${y}` : y;
          date = `${yr}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
          continue;
        }
        const ymatch = c.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ymatch) { date = c; continue; }
      }

      const num = parseFloat(c.replace(/[,\s₪]/g, ''));
      if (!isNaN(num) && num !== 0) {
        if (num < 0 && debit === 0) debit = Math.abs(num);
        else if (num > 0 && j < cols.length - 1) {
          if (debit === 0) debit = num;
          else if (credit === 0) credit = num;
        }
      } else if (!num && c && !/^0$/.test(c)) {
        if (!desc || c.length > desc.length) desc = c;
      }
    }

    if (!date || (!debit && !credit)) continue;
    if (!desc) desc = `עסקה ${i}`;

    if (debit > 0)  rows.push({ date, description: desc, amount: debit,  type: 'expense' });
    if (credit > 0) rows.push({ date, description: desc, amount: credit, type: 'income'  });
  }

  return rows;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  fc_food:      ['רמי לוי','שופרסל','מגה','ויקטורי','מסעדה','פיצה','שניצל','סושי','אוכל','קפה'],
  fc_car:       ['פז','סונול','גדות','דלק','אגד','רכבת','מטרו','גט','ביטוח רכב','רב-קו'],
  fc_health:    ['סופרפארם','super-pharm','בית מרקחת','קופת חולים','מאוחדת','מכבי','לאומית','כללית','שיניים'],
  fc_utilities: ['חשמל','מים','גז','חברת חשמל','עיריית'],
  fc_comm:      ['HOT','yes','בזק','גולן טלקום','partner','cellcom','pelephone'],
  fc_insurance: ['מגדל','הפניקס','מנורה','כלל ביטוח','הראל','הסנה'],
  fc_entertain: ['yes planet','סינמה','קולנוע','ספורט','gym','אמזון','netflix','spotify','apple'],
  fc_kids:      ['גן ילדים','בית ספר','פעוטון','מעון'],
  fc_edu:       ['אוניברסיטה','מכללה','קורס','השתלמות'],
  fc_housing:   ['שכירות','משכנתא','ועד בית','ארנונה'],
  fc_saving:    ['קופת גמל','קרן השתלמות','פנסיה','מיטב','אנליסט'],
  fc_clothing:  ['זארה','h&m','FOX','MANGO','ביגוד'],
};

function autoCategory(desc: string, type: FinanceTxType, categories: FinanceCategory[]): string {
  if (type === 'income') {
    const d = desc.toLowerCase();
    if (d.includes('משכורת') || d.includes('שכר') || d.includes('salary')) return 'fc_salary';
    if (d.includes('שכירות') || d.includes('דמי שכירות')) return 'fc_rental';
    return 'fc_freelance';
  }
  const lower = desc.toLowerCase();
  for (const [catId, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw.toLowerCase()))) return catId;
  }
  return categories.find(c => c.type === 'expense')?.id ?? 'fc_other_ex';
}

// ─── Quick Add Modal ──────────────────────────────────────────────────────────

function QuickAddModal({ categories, onAdd, onClose, defaultType }: {
  categories: FinanceCategory[];
  onAdd: (tx: FinanceTx) => void;
  onClose: () => void;
  defaultType?: FinanceTxType;
}) {
  const [type, setType]     = useState<FinanceTxType>(defaultType ?? 'expense');
  const [amount, setAmount] = useState('');
  const [catId, setCatId]   = useState('');
  const [note, setNote]     = useState('');
  const [date, setDate]     = useState(todayStr());

  const cats = categories.filter(c => c.type === type || c.type === 'both');

  function submit() {
    const n = parseFloat(amount);
    if (!n || n <= 0 || !catId) return;
    onAdd({
      id: uid(), date, amount: n, type, categoryId: catId,
      note: note || undefined, source: 'manual',
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex rounded-t-3xl sm:rounded-t-2xl overflow-hidden">
          <button onClick={() => setType('expense')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${type === 'expense' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
            הוצאה
          </button>
          <button onClick={() => setType('income')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${type === 'income' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
            הכנסה
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">סכום (₪)</label>
            <input
              autoFocus
              type="number" min="0" step="any"
              value={amount} onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="0"
              className="w-full text-3xl font-bold text-center border-b-2 border-gray-300 focus:border-blue-500 outline-none pb-1 bg-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">קטגוריה</label>
            <div className="grid grid-cols-3 gap-2">
              {cats.map(c => (
                <button key={c.id} onClick={() => setCatId(c.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl text-xs transition-all border-2 ${catId === c.id ? 'border-blue-500 bg-blue-50' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}>
                  <span className="text-2xl">{c.icon}</span>
                  <span className="leading-tight text-center">{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">תאריך</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">הערה (אופציונלי)</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)}
                placeholder="..."
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          <button onClick={submit} disabled={!amount || !catId}
            className="w-full py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition-colors">
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

function CsvImportModal({ categories, onImport, onClose }: {
  categories: FinanceCategory[];
  onImport: (txs: FinanceTx[]) => void;
  onClose: () => void;
}) {
  const [raw, setRaw]         = useState('');
  const [rows, setRows]       = useState<(ParsedRow & { catId: string; include: boolean })[]>([]);
  const [parsed, setParsed]   = useState(false);
  const fileRef               = useRef<HTMLInputElement>(null);

  function parse() {
    const result = parseIsraeliCsv(raw);
    setRows(result.map(r => ({
      ...r,
      catId: autoCategory(r.description, r.type, categories),
      include: true,
    })));
    setParsed(true);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => { setRaw((e.target?.result as string) ?? ''); };
    reader.readAsText(file, 'windows-1255');
  }

  function doImport() {
    const txs: FinanceTx[] = rows.filter(r => r.include).map(r => ({
      id: uid(), date: r.date, amount: r.amount, type: r.type,
      categoryId: r.catId, note: r.description, source: 'csv' as const,
    }));
    onImport(txs);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">ייבוא CSV מהבנק</h2>
            <p className="text-xs text-gray-500 mt-0.5">הורד קובץ CSV/Excel מהבנק → גרור לכאן</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {!parsed ? (
          <div className="p-6 space-y-4 overflow-y-auto">
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-blue-300 rounded-2xl p-8 text-center cursor-pointer hover:bg-blue-50 transition-colors">
              <div className="text-4xl mb-2">📂</div>
              <p className="font-medium text-gray-700">גרור קובץ CSV / לחץ לבחירה</p>
              <p className="text-xs text-gray-400 mt-1">תומך בפורמט של רוב הבנקים הישראליים</p>
              <input ref={fileRef} type="file" accept=".csv,.txt,.xls,.xlsx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative text-center"><span className="bg-white px-2 text-xs text-gray-400">או הדבק טקסט ישירות</span></div>
            </div>

            <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={8}
              placeholder={'תאריך,תיאור,חובה,זכות,יתרה\n15/01/2026,רמי לוי,350,,\n14/01/2026,משכורת,,15000,'}
              className="w-full border border-gray-300 rounded-xl p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />

            <details className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
              <summary className="cursor-pointer font-medium text-gray-600">איך להוריד מהבנק שלי?</summary>
              <div className="mt-2 space-y-1">
                <p>🏦 <b>הפועלים:</b> BankApp → פעולות → הורדת עסקאות → CSV</p>
                <p>🏦 <b>לאומי:</b> ניהול חשבון → תנועות בחשבון → ייצוא → Excel/CSV</p>
                <p>🏦 <b>דיסקונט:</b> חשבונות ופיקדונות → תנועות → ייצוא לאקסל</p>
                <p>🏦 <b>מזרחי:</b> חשבון → תנועות → ייצוא → CSV</p>
                <p>💳 <b>ויזה כאל:</b> אזור אישי → עסקאות → ייצוא לאקסל</p>
              </div>
            </details>

            <button onClick={parse} disabled={!raw.trim()}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-40 transition-colors">
              נתח קובץ
            </button>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 bg-blue-50 border-b text-sm text-blue-800">
              נמצאו <b>{rows.filter(r => r.include).length}</b> עסקאות — בדוק וסמן מה לייבא
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm" dir="rtl">
                <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 border-b">
                  <tr>
                    <th className="px-3 py-2 text-right w-8">✓</th>
                    <th className="px-3 py-2 text-right">תאריך</th>
                    <th className="px-3 py-2 text-right">תיאור</th>
                    <th className="px-3 py-2 text-right">סכום</th>
                    <th className="px-3 py-2 text-right">קטגוריה</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-b transition-colors ${r.include ? 'bg-white' : 'bg-gray-50 opacity-50'}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={r.include}
                          onChange={e => setRows(prev => prev.map((rr, ii) => ii === i ? { ...rr, include: e.target.checked } : rr))} />
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{r.description}</td>
                      <td className={`px-3 py-2 font-medium ${r.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                        {r.type === 'income' ? '+' : '-'}₪{fmtAmount(r.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <select value={r.catId}
                          onChange={e => setRows(prev => prev.map((rr, ii) => ii === i ? { ...rr, catId: e.target.value } : rr))}
                          className="border border-gray-200 rounded-lg px-1 py-0.5 text-xs bg-white">
                          {categories.filter(c => c.type === r.type || c.type === 'both').map(c => (
                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t flex gap-3 justify-between">
              <button onClick={() => setParsed(false)} className="text-sm text-gray-500 hover:text-gray-700">חזרה</button>
              <div className="flex gap-2">
                <button onClick={() => setRows(r => r.map(x => ({ ...x, include: true })))} className="text-xs text-blue-600 hover:underline">סמן הכל</button>
                <button onClick={doImport} disabled={!rows.some(r => r.include)}
                  className="px-5 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-40 transition-colors">
                  ייבא {rows.filter(r => r.include).length} עסקאות
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Recurring Manager ────────────────────────────────────────────────────────

function RecurringManager({ categories, recurring, onSave, onDelete, onClose }: {
  categories: FinanceCategory[];
  recurring: FinanceRecurring[];
  onSave: (r: FinanceRecurring) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Partial<FinanceRecurring> | null>(null);

  function saveEditing() {
    if (!editing) return;
    const { name, amount, type, categoryId, dayOfMonth } = editing;
    if (!name || !amount || !type || !categoryId || !dayOfMonth) return;
    onSave({
      id: editing.id ?? uid(),
      name, amount, type, categoryId, dayOfMonth,
      active: editing.active ?? true,
      note: editing.note,
    });
    setEditing(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">עסקאות קבועות</h2>
            <p className="text-xs text-gray-500">שכר, שכירות, מינויים — נוצרות אוטומטית כל חודש</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {recurring.map(r => {
            const cat = categories.find(c => c.id === r.categoryId);
            return (
              <div key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border ${r.active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                <span className="text-2xl">{cat?.icon ?? '💳'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-800 truncate">{r.name}</p>
                  <p className="text-xs text-gray-400">יום {r.dayOfMonth} בחודש · {cat?.name}</p>
                </div>
                <span className={`font-bold text-sm ${r.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                  {r.type === 'income' ? '+' : '-'}₪{fmtAmount(r.amount)}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(r)} className="p-1 text-gray-400 hover:text-blue-500 transition-colors">✏️</button>
                  <button onClick={() => onDelete(r.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">🗑️</button>
                </div>
              </div>
            );
          })}

          {recurring.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-6">אין עסקאות קבועות עדיין.<br/>הוסף כאן את המשכורת, שכר דירה, מינויים...</p>
          )}
        </div>

        {editing !== null && (
          <div className="border-t p-4 space-y-3 bg-blue-50">
            <p className="text-sm font-bold text-blue-800">{editing.id ? 'עריכה' : 'עסקה קבועה חדשה'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500">שם</label>
                <input type="text" value={editing.name ?? ''} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))}
                  placeholder="משכורת / שכירות / ..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mt-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500">סוג</label>
                <select value={editing.type ?? 'expense'} onChange={e => setEditing(x => ({ ...x, type: e.target.value as FinanceTxType }))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="expense">הוצאה</option>
                  <option value="income">הכנסה</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">סכום (₪)</label>
                <input type="number" min="0" value={editing.amount ?? ''} onChange={e => setEditing(x => ({ ...x, amount: +e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mt-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500">קטגוריה</label>
                <select value={editing.categoryId ?? ''} onChange={e => setEditing(x => ({ ...x, categoryId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">בחר...</option>
                  {categories.filter(c => c.type === (editing.type ?? 'expense') || c.type === 'both').map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">יום בחודש</label>
                <input type="number" min="1" max="28" value={editing.dayOfMonth ?? 1} onChange={e => setEditing(x => ({ ...x, dayOfMonth: +e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mt-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="text-sm text-gray-500 px-3 py-1.5 hover:text-gray-700">ביטול</button>
              <button onClick={saveEditing}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">שמור</button>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t flex justify-between items-center">
          <button onClick={() => setEditing({})}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium">+ הוסף עסקה קבועה</button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 transition-colors">סגור</button>
        </div>
      </div>
    </div>
  );
}

// ─── Budget Edit Modal ────────────────────────────────────────────────────────

function BudgetModal({ categories, onUpdate, onClose }: {
  categories: FinanceCategory[];
  onUpdate: (id: string, updates: Partial<FinanceCategory>) => void;
  onClose: () => void;
}) {
  const expCats = categories.filter(c => c.type === 'expense');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">תקציב חודשי</h2>
            <p className="text-xs text-gray-500">קבע תקציב לכל קטגוריית הוצאה</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {expCats.map(c => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="text-xl">{c.icon}</span>
              <span className="flex-1 text-sm text-gray-700">{c.name}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">₪</span>
                <input type="number" min="0" defaultValue={c.budget ?? 0}
                  onBlur={e => onUpdate(c.id, { budget: +e.target.value })}
                  className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t">
          <button onClick={onClose} className="w-full py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">שמור</button>
        </div>
      </div>
    </div>
  );
}

// ─── SVG Donut Chart ─────────────────────────────────────────────────────────

function DonutChart({ slices }: { slices: { value: number; color: string; label: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <div className="w-40 h-40 flex items-center justify-center text-gray-300">אין נתונים</div>;

  const R = 54, cx = 64, cy = 64, stroke = 22;
  const circumference = 2 * Math.PI * R;
  let cumOffset = 0;

  const arcs = slices.map(s => {
    const pct = s.value / total;
    const dash = pct * circumference;
    const gap  = circumference - dash;
    const off  = -cumOffset * circumference;
    cumOffset += pct;
    return { ...s, dash, gap, offset: off };
  });

  return (
    <svg viewBox="0 0 128 128" className="w-40 h-40">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      {arcs.map((a, i) => (
        <circle key={i} cx={cx} cy={cy} r={R} fill="none"
          stroke={a.color} strokeWidth={stroke}
          strokeDasharray={`${a.dash} ${a.gap}`}
          strokeDashoffset={a.offset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
        />
      ))}
    </svg>
  );
}

// ─── Main FinanceView ─────────────────────────────────────────────────────────

export default function FinanceView({
  state, onAddTxs, onDeleteTx, onUpdateCategory, onSaveRecurring, onDeleteRecurring, onApplyRecurring,
}: Props) {
  const { financeCategories: cats, financeTxs: allTxs, financeRecurring: recurring } = state;

  const [currentMonth, setCurrentMonth] = useState(() => monthKey(new Date()));
  const prevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setCurrentMonth(monthKey(d));
  };
  const nextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setCurrentMonth(monthKey(d));
  };

  const [showQuickAdd, setShowQuickAdd]     = useState(false);
  const [quickAddType, setQuickAddType]     = useState<FinanceTxType>('expense');
  const [showCsvImport, setShowCsvImport]   = useState(false);
  const [showRecurring, setShowRecurring]   = useState(false);
  const [showBudget, setShowBudget]         = useState(false);
  const [filterCat, setFilterCat]           = useState<string>('');
  const [filterType, setFilterType]         = useState<FinanceTxType | ''>('');
  const [deletingId, setDeletingId]         = useState<string | null>(null);

  const monthTxs = useMemo(() =>
    allTxs.filter(t => t.date.startsWith(currentMonth))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [allTxs, currentMonth]);

  const totalIncome  = useMemo(() => monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [monthTxs]);
  const totalExpense = useMemo(() => monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [monthTxs]);
  const balance      = totalIncome - totalExpense;
  const savingPct    = totalIncome > 0 ? Math.max(0, Math.round(balance / totalIncome * 100)) : 0;

  const catTotals = useMemo(() => {
    const m: Record<string, number> = {};
    monthTxs.forEach(t => { m[t.categoryId] = (m[t.categoryId] ?? 0) + t.amount; });
    return m;
  }, [monthTxs]);

  const donutSlices = useMemo(() => {
    return cats.filter(c => c.type === 'expense' && catTotals[c.id] > 0).map(c => ({
      value: catTotals[c.id],
      color: c.color,
      label: c.name,
    }));
  }, [cats, catTotals]);

  const filteredTxs = useMemo(() =>
    monthTxs.filter(t =>
      (!filterCat  || t.categoryId === filterCat) &&
      (!filterType || t.type === filterType)
    ), [monthTxs, filterCat, filterType]);

  const recurringAlreadyApplied = state.financeLastRecurringMonth === currentMonth;

  const handleApplyRecurring = useCallback(() => {
    onApplyRecurring(currentMonth);
  }, [onApplyRecurring, currentMonth]);

  const addTx = useCallback((tx: FinanceTx) => onAddTxs([tx]), [onAddTxs]);

  return (
    <div className="space-y-5" dir="rtl">

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-200 transition-colors text-gray-500">◄</button>
          <h2 className="text-lg font-bold text-gray-800 min-w-[130px] text-center">{monthLabel(currentMonth)}</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-200 transition-colors text-gray-500">►</button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setQuickAddType('expense'); setShowQuickAdd(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors shadow-sm">
            <span>−</span> הוצאה
          </button>
          <button onClick={() => { setQuickAddType('income'); setShowQuickAdd(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition-colors shadow-sm">
            <span>+</span> הכנסה
          </button>
          <button onClick={() => setShowCsvImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
            ↑ ייבוא CSV
          </button>
          <button onClick={() => setShowRecurring(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
            🔄 קבועות
          </button>
          <button onClick={() => setShowBudget(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
            🎯 תקציב
          </button>
        </div>
      </div>

      {recurring.filter(r => r.active).length > 0 && !recurringAlreadyApplied && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🔄</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">יש {recurring.filter(r => r.active).length} עסקאות קבועות שלא הוחלו עדיין על {monthLabel(currentMonth)}</p>
            <p className="text-xs text-amber-600">לחץ לייצר אותן אוטומטית</p>
          </div>
          <button onClick={handleApplyRecurring}
            className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors whitespace-nowrap">
            החל עסקאות
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="הכנסות" amount={totalIncome} color="green" icon="📈" />
        <SummaryCard label="הוצאות" amount={totalExpense} color="red"   icon="📉" />
        <SummaryCard label={balance >= 0 ? 'עודף' : 'גירעון'} amount={Math.abs(balance)} color={balance >= 0 ? 'blue' : 'orange'} icon={balance >= 0 ? '✅' : '⚠️'} />
        <div className="bg-white rounded-2xl shadow-sm p-4 text-right">
          <div className="text-xs text-gray-400 mb-1">אחוז חיסכון</div>
          <div className={`text-2xl font-bold ${savingPct >= 20 ? 'text-green-600' : savingPct >= 10 ? 'text-amber-500' : 'text-red-500'}`}>
            {savingPct}%
          </div>
          <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${savingPct >= 20 ? 'bg-green-400' : savingPct >= 10 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${Math.min(savingPct, 100)}%` }} />
          </div>
          <div className="text-[10px] text-gray-400 mt-1">{savingPct >= 20 ? 'מצוין!' : savingPct >= 10 ? 'סביר' : 'שפר חיסכון'}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-5">

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">הוצאות לפי קטגוריה</h3>
            <div className="flex items-center">
              <DonutChart slices={donutSlices} />
            </div>
          </div>

          <div className="space-y-3">
            {cats.filter(c => c.type === 'expense').map(c => {
              const spent  = catTotals[c.id] ?? 0;
              const budget = c.budget ?? 0;
              const pct    = budget > 0 ? Math.min(Math.round(spent / budget * 100), 100) : 0;
              const over   = budget > 0 && spent > budget;
              if (spent === 0 && budget === 0) return null;
              return (
                <div key={c.id} className="group">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{c.icon}</span>
                    <span className="flex-1 text-sm text-gray-700">{c.name}</span>
                    <button onClick={() => { setFilterCat(c.id); setFilterType('expense'); }}
                      className="text-xs text-gray-400 group-hover:text-blue-500 transition-colors">
                      ₪{fmtAmount(spent)}{budget > 0 ? ` / ${fmtAmount(budget)}` : ''}
                    </button>
                  </div>
                  {budget > 0 && (
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-green-400'}`}
                        style={{ width: `${pct}%`, backgroundColor: over ? undefined : c.color + 'cc' }} />
                    </div>
                  )}
                </div>
              );
            })}
            {donutSlices.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">אין הוצאות החודש עדיין.</p>
            )}
          </div>

          {totalIncome > 0 && (
            <div className="mt-5 pt-4 border-t">
              <h4 className="font-semibold text-gray-700 text-sm mb-3">הכנסות</h4>
              <div className="space-y-2">
                {cats.filter(c => c.type === 'income' && catTotals[c.id]).map(c => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span>{c.icon}</span>
                    <span className="flex-1 text-sm text-gray-600">{c.name}</span>
                    <span className="text-sm font-medium text-green-600">+₪{fmtAmount(catTotals[c.id])}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm flex flex-col min-h-[400px]">
          <div className="flex gap-2 p-4 border-b flex-wrap">
            <h3 className="font-bold text-gray-800 ml-1">עסקאות</h3>
            <select value={filterType} onChange={e => setFilterType(e.target.value as FinanceTxType | '')}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none">
              <option value="">הכל</option>
              <option value="income">הכנסות</option>
              <option value="expense">הוצאות</option>
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none">
              <option value="">כל הקטגוריות</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            {(filterCat || filterType) && (
              <button onClick={() => { setFilterCat(''); setFilterType(''); }}
                className="text-xs text-gray-400 hover:text-gray-600">✕ נקה</button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {filteredTxs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-gray-400">
                <div className="text-4xl mb-3">💸</div>
                <p className="text-sm">אין עסקאות {filterCat || filterType ? 'עם הסינון הנבחר' : 'החודש'}</p>
                <button onClick={() => setShowQuickAdd(true)}
                  className="mt-3 text-sm text-blue-500 hover:text-blue-700 font-medium">הוסף עסקה ראשונה</button>
              </div>
            ) : (
              filteredTxs.map(tx => {
                const cat = cats.find(c => c.id === tx.categoryId);
                return (
                  <div key={tx.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group ${deletingId === tx.id ? 'bg-red-50' : ''}`}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ backgroundColor: (cat?.color ?? '#94a3b8') + '20' }}>
                      {cat?.icon ?? '💳'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{tx.note || cat?.name || 'עסקה'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-400">{fmtDate(tx.date)}</p>
                        {cat && <span className="text-xs text-gray-400">· {cat.name}</span>}
                        {tx.source === 'csv' && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded">CSV</span>}
                        {tx.source === 'recurring' && <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 rounded">קבועה</span>}
                      </div>
                    </div>
                    <span className={`font-bold text-sm ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                      {tx.type === 'income' ? '+' : '−'}₪{fmtAmount(tx.amount)}
                    </span>
                    <button
                      onClick={() => {
                        if (deletingId === tx.id) { onDeleteTx(tx.id); setDeletingId(null); }
                        else setDeletingId(tx.id);
                        setTimeout(() => setDeletingId(null), 3000);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-xs px-1">
                      {deletingId === tx.id ? '✓ בטוח?' : '✕'}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {filteredTxs.length > 0 && (
            <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500 flex justify-between">
              <span>{filteredTxs.length} עסקאות</span>
              <span>
                סה"כ: <span className={`font-bold ${filteredTxs.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  ₪{fmtAmount(Math.abs(filteredTxs.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0)))}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {showQuickAdd && (
        <QuickAddModal categories={cats} defaultType={quickAddType}
          onAdd={tx => { addTx(tx); setShowQuickAdd(false); }}
          onClose={() => setShowQuickAdd(false)} />
      )}
      {showCsvImport && (
        <CsvImportModal categories={cats}
          onImport={txs => onAddTxs(txs)}
          onClose={() => setShowCsvImport(false)} />
      )}
      {showRecurring && (
        <RecurringManager categories={cats} recurring={recurring}
          onSave={onSaveRecurring} onDelete={onDeleteRecurring}
          onClose={() => setShowRecurring(false)} />
      )}
      {showBudget && (
        <BudgetModal categories={cats} onUpdate={onUpdateCategory}
          onClose={() => setShowBudget(false)} />
      )}
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, amount, color, icon }: { label: string; amount: number; color: string; icon: string }) {
  const colorMap: Record<string, string> = {
    green:  'text-green-600 bg-green-50',
    red:    'text-red-500   bg-red-50',
    blue:   'text-blue-600  bg-blue-50',
    orange: 'text-orange-500 bg-orange-50',
  };
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 text-right">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <span className={`text-sm px-2 py-0.5 rounded-lg ${colorMap[color]}`}>{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${colorMap[color].split(' ')[0]}`}>
        ₪{amount === 0 ? '0' : amount.toLocaleString('he-IL')}
      </div>
    </div>
  );
}
