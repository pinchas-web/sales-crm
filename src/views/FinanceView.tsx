/**
 * מחלקת פיננסים — שלב ראשון: המבנה בלבד, בלי הזנת נתונים.
 * עמלות כבר עובדות (עברו מהדשבורד). הכנסות, הוצאות, תזרים ורווחיות ייבנו בהמשך.
 */
import { useState } from 'react';
import type { AppState } from '../types';
import { CommissionTab } from './DataView';

type Tab = 'income' | 'expenses' | 'cashflow' | 'profit' | 'commission';

const TABS: { id: Tab; label: string }[] = [
  { id: 'income',     label: '📥 הכנסות' },
  { id: 'expenses',   label: '📤 הוצאות' },
  { id: 'cashflow',   label: '🔁 תזרים' },
  { id: 'profit',     label: '📈 רווחיות לפי מוצר' },
  { id: 'commission', label: '💰 עמלות' },
];

const EMPTY = '—';

function ColumnsTable({ columns, rows, emptyText }: { columns: string[]; rows?: string[]; emptyText: string }) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            {columns.map(c => <th key={c} className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows?.length ? rows.map(name => (
            <tr key={name} className="border-b last:border-b-0">
              <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{name}</td>
              {columns.slice(1).map(c => <td key={c} className="px-4 py-3 text-gray-400">{EMPTY}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">{emptyText}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const EXPENSE_COLUMNS = ['שם', 'קטגוריה', 'ספק', 'צפוי', 'בפועל', 'הערה'];

function ExpensesTab({ products }: { products: string[] }) {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-bold text-gray-800">הוצאות קבועות</h2>
        <p className="text-sm text-gray-500">אותו סכום כל תקופה: למשל שכר משרד, תוכנות, רואה חשבון.</p>
        <ColumnsTable columns={EXPENSE_COLUMNS} emptyText="עוד אין הוצאות קבועות" />
      </section>
      <section className="space-y-2">
        <h2 className="font-bold text-gray-800">הוצאות משתנות</h2>
        <p className="text-sm text-gray-500">משתנות מחודש לחודש: למשל פרסום, עיצוב, נסיעות.</p>
        <ColumnsTable columns={EXPENSE_COLUMNS} emptyText="עוד אין הוצאות משתנות" />
      </section>
      <section className="space-y-2">
        <h2 className="font-bold text-gray-800">הוצאות לפי מוצר</h2>
        <p className="text-sm text-gray-500">שייכות למוצר אחד בלבד, ונספרות ברווחיות שלו.</p>
        <ColumnsTable columns={['מוצר', 'הוצאות החודש', 'הוצאות השנה']} rows={products} emptyText="עוד אין מוצרים פעילים" />
      </section>
    </div>
  );
}

export default function FinanceView({ state }: { state: AppState }) {
  const [tab, setTab] = useState<Tab>('expenses');
  const products = state.products.filter(p => p.active).map(p => p.name);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">💰 פיננסים</h1>
      </div>

      <div className="flex gap-1 mb-6 border-b pb-3 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'commission' && (
        <p className="mb-5 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          שלב ראשון: כאן המבנה של המחלקה. עוד אי אפשר להזין נתונים.
        </p>
      )}

      {tab === 'income' && (
        <ColumnsTable
          columns={['לקוח', 'מוצר', 'מחיר סופי', 'תשלום צפוי', 'תשלום בפועל', 'מצב']}
          emptyText="עוד אין הכנסות"
        />
      )}
      {tab === 'expenses' && <ExpensesTab products={products} />}
      {tab === 'cashflow' && (
        <ColumnsTable
          columns={['חודש', 'הכנסות צפויות', 'הכנסות בפועל', 'הוצאות צפויות', 'הוצאות בפועל', 'תזרים בפועל']}
          emptyText="התזרים יתמלא מההכנסות וההוצאות"
        />
      )}
      {tab === 'profit' && (
        <ColumnsTable
          columns={['מוצר', 'הכנסה בלי מע"מ', 'עלויות ישירות', 'רווח גולמי', 'חלק בהוצאות הכלליות', 'רווח תפעולי']}
          rows={products}
          emptyText="עוד אין מוצרים פעילים"
        />
      )}
      {tab === 'commission' && <CommissionTab state={state} />}
    </div>
  );
}
