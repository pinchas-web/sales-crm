/**
 * לוח נתונים ואנליטיקה — 4 לשוניות: ביצועים, עמלות, pipeline, השוואת צוות.
 * משתמש ב-Recharts לגרפים: AreaChart, BarChart, PieChart.
 */
import { useState } from 'react';
import type { AppState } from '../types';
import { TODAY, CHART_COLORS, calcCommission } from '../utils';
import { Btn } from '../ui';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, CartesianGrid,
} from 'recharts';

// ─── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color = 'blue' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color] ?? colors.blue}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

// ─── Performance Tab ──────────────────────────────────────────────────────────

function PerformanceTab({ state }: { state: AppState }) {
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'year'>('month');

  function getRangeStart(): Date {
    const d = new Date();
    if (range === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (range === 'week')  { d.setDate(d.getDate() - 7); return d; }
    if (range === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
    d.setMonth(0); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  }
  const start = getRangeStart();

  const wonLeads = state.leads.filter(l => {
    const s = state.statuses.find(st => st.id === l.status);
    return s?.isWon && new Date(l.updated_at) >= start;
  });
  const newLeads = state.leads.filter(l => new Date(l.created_at) >= start);
  const allActive = state.leads.filter(l => !state.statuses.find(s => s.id === l.status)?.isFinal);
  const convRate = newLeads.length > 0 ? Math.round((wonLeads.length / newLeads.length) * 100) : 0;
  const totalRevenue = wonLeads.reduce((sum, l) => sum + (l.dealValue ?? 0), 0);
  const pipelineValue = allActive.reduce((sum, l) => sum + (l.dealValue ?? 0), 0);

  // Build leads-per-day for last 30 days
  const days30: { date: string; לידים: number; סגירות: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    days30.push({
      date: `${d.getDate()}/${d.getMonth() + 1}`,
      לידים: state.leads.filter(l => l.created_at.startsWith(ds)).length,
      סגירות: state.leads.filter(l => l.updated_at.startsWith(ds) && state.statuses.find(s => s.id === l.status)?.isWon).length,
    });
  }

  // Status distribution
  const statusDist = state.statuses.map(s => ({
    name: s.label,
    value: state.leads.filter(l => l.status === s.id).length,
  })).filter(x => x.value > 0);

  const RANGES = ['today', 'week', 'month', 'year'] as const;
  const RANGE_LABELS: Record<string, string> = { today: 'היום', week: 'שבוע', month: 'חודש', year: 'שנה' };

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {RANGES.map(r => (
          <button key={r} onClick={() => setRange(r)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${range === r ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="לידים חדשים" value={newLeads.length} color="blue" />
        <SummaryCard label="סגירות" value={wonLeads.length} color="green" />
        <SummaryCard label="שיעור המרה" value={`${convRate}%`} color="yellow" />
        <SummaryCard label="הכנסות" value={`₪${totalRevenue.toLocaleString('he-IL')}`} color="purple" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard label="Pipeline Value" value={`₪${pipelineValue.toLocaleString('he-IL')}`} sub="סך ערך לידים פעילים" color="blue" />
        <SummaryCard label="לידים פעילים" value={allActive.length} sub="לא נסגרו" color="blue" />
        <SummaryCard label={'לידים סה"כ'} value={state.leads.length} color="blue" />
      </div>

      {/* Area chart — 30 days */}
      <div className="bg-white rounded-2xl border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">לידים וסגירות — 30 ימים אחרונים</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={days30}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="לידים" stroke="#6366f1" fill="#e0e7ff" />
            <Area type="monotone" dataKey="סגירות" stroke="#10b981" fill="#d1fae5" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Status distribution pie */}
      <div className="bg-white rounded-2xl border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">התפלגות לפי סטטוס</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
              {statusDist.map((_, idx) => (
                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Commission Tab ────────────────────────────────────────────────────────────

function CommissionTab({ state }: { state: AppState }) {
  const [year, setYear] = useState(new Date().getFullYear());

  function getYearData(userId: string) {
    const months: { month: string; deals: number; revenue: number; commission: number }[] = [];
    const user = state.users.find(u => u.id === userId);
    if (!user) return months;
    for (let m = 0; m < 12; m++) {
      const start = new Date(year, m, 1);
      const end   = new Date(year, m + 1, 0, 23, 59, 59);
      const wonLeads = state.leads.filter(l =>
        l.assigned_to === userId &&
        state.statuses.find(s => s.id === l.status)?.isWon &&
        new Date(l.updated_at) >= start &&
        new Date(l.updated_at) <= end
      );
      const revenue = wonLeads.reduce((sum, l) => sum + (l.dealValue ?? 0), 0);
      months.push({
        month: new Intl.DateTimeFormat('he-IL', { month: 'short' }).format(start),
        deals: wonLeads.length,
        revenue,
        commission: Math.round(revenue * user.commissionRate),
      });
    }
    return months;
  }

  const salesUsers = state.users.filter(u => u.role === 'salesperson' || true);
  const currentMonthData = salesUsers.map(u => {
    const d = calcCommission(state, u.id);
    return { user: u, ...d };
  });

  return (
    <div className="space-y-6">
      {/* Current month summary */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">סיכום חודש נוכחי</h3>
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-right font-semibold text-gray-600">נציג</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">אחוז עמלה</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">עסקאות</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">הכנסות</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">עמלה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {currentMonthData.map(({ user, deals, revenue, commission }) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">
                        {user.name.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-800">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{Math.round(user.commissionRate * 100)}%</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-800">{deals}</td>
                  <td className="px-4 py-3 text-center text-blue-700 font-semibold">₪{revenue.toLocaleString('he-IL')}</td>
                  <td className="px-4 py-3 text-center text-green-700 font-bold">₪{commission.toLocaleString('he-IL')}</td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="bg-gray-50 font-bold border-t">
                <td className="px-4 py-3 text-gray-700">סה"כ</td>
                <td></td>
                <td className="px-4 py-3 text-center">{currentMonthData.reduce((s, x) => s + x.deals, 0)}</td>
                <td className="px-4 py-3 text-center text-blue-700">₪{currentMonthData.reduce((s, x) => s + x.revenue, 0).toLocaleString('he-IL')}</td>
                <td className="px-4 py-3 text-center text-green-700">₪{currentMonthData.reduce((s, x) => s + x.commission, 0).toLocaleString('he-IL')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Annual commission chart per user */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">עמלות לפי חודש — {year}</h3>
          <div className="flex gap-1">
            <Btn size="xs" variant="ghost" onClick={() => setYear(y => y - 1)}>◀</Btn>
            <span className="text-sm font-medium px-2">{year}</span>
            <Btn size="xs" variant="ghost" onClick={() => setYear(y => y + 1)}>▶</Btn>
          </div>
        </div>
        {state.users.filter(u => u.role === 'salesperson' || state.users.length <= 2).map(user => {
          const monthData = getYearData(user.id);
          const totalYear = monthData.reduce((s, m) => s + m.commission, 0);
          return (
            <div key={user.id} className="bg-white rounded-2xl border p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">{user.name}</p>
                <span className="text-sm font-bold text-green-700">₪{totalYear.toLocaleString('he-IL')} עמלה שנתית</span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={monthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number | undefined) => v != null ? `₪${v.toLocaleString('he-IL')}` : ''} />
                  <Bar dataKey="commission" fill="#10b981" name="עמלה" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pipeline Tab ─────────────────────────────────────────────────────────────

function PipelineTab({ state }: { state: AppState }) {
  // Funnel by status
  const funnelData = state.statuses
    .filter(s => !s.isFinal)
    .sort((a, b) => a.order - b.order)
    .map(s => ({
      name: s.label,
      count: state.leads.filter(l => l.status === s.id).length,
      value: state.leads.filter(l => l.status === s.id).reduce((sum, l) => sum + (l.dealValue ?? 0), 0),
    }));

  // Source breakdown
  const sourceDist = (() => {
    const map = new Map<string, number>();
    state.leads.forEach(l => map.set(l.source, (map.get(l.source) ?? 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  })();

  // Product interest breakdown
  const productDist = state.products.map(p => ({
    name: p.name,
    value: state.leads.filter(l => l.interestedIn.includes(p.id)).length,
  })).filter(x => x.value > 0);

  return (
    <div className="space-y-6">
      {/* Funnel */}
      <div className="bg-white rounded-2xl border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">פאנל מכירות</h3>
        <div className="space-y-2">
          {funnelData.map((row, i) => {
            const maxCount = Math.max(...funnelData.map(r => r.count), 1);
            const pct = Math.round((row.count / maxCount) * 100);
            return (
              <div key={row.name} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-32 shrink-0 text-left truncate">{row.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center px-2 transition-all"
                    style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  >
                    <span className="text-white text-xs font-bold">{row.count}</span>
                  </div>
                </div>
                <span className="text-xs text-gray-500 w-24 text-left shrink-0">₪{row.value.toLocaleString('he-IL')}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Source & Product charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">מקורות לידים</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={sourceDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                {sourceDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">עניין במוצרים</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={productDist} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
              <Tooltip />
              <Bar dataKey="value" fill="#6366f1" name="לידים" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab({ state }: { state: AppState }) {
  const teamData = state.users.map(user => {
    const myLeads   = state.leads.filter(l => l.assigned_to === user.id);
    const active    = myLeads.filter(l => !state.statuses.find(s => s.id === l.status)?.isFinal);
    const won       = myLeads.filter(l => state.statuses.find(s => s.id === l.status)?.isWon);
    const revenue   = won.reduce((sum, l) => sum + (l.dealValue ?? 0), 0);
    const rate      = myLeads.length > 0 ? Math.round((won.length / myLeads.length) * 100) : 0;
    const tasks     = state.tasks.filter(t => t.assigned_to === user.id && !t.done).length;
    const overdue   = state.tasks.filter(t => t.assigned_to === user.id && !t.done && t.due_date < TODAY).length;
    return { user, myLeads: myLeads.length, active: active.length, won: won.length, revenue, rate, tasks, overdue };
  });

  const barData = teamData.map(d => ({
    name: d.user.name,
    'לידים פעילים': d.active,
    'סגירות': d.won,
  }));

  return (
    <div className="space-y-6">
      {/* Team table */}
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-right">
              <th className="px-4 py-3 font-semibold text-gray-600">נציג</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">לידים פעילים</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">סגירות</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">שיעור המרה</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">הכנסות</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">משימות פתוחות</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">משימות באיחור</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {teamData.map(d => (
              <tr key={d.user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">
                      {d.user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{d.user.name}</p>
                      <p className="text-xs text-gray-400">{d.user.role === 'admin' ? 'מנהל' : 'נציג'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center font-semibold text-gray-800">{d.active}</td>
                <td className="px-4 py-3 text-center font-semibold text-green-700">{d.won}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${d.rate >= 30 ? 'bg-green-100 text-green-700' : d.rate >= 15 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                    {d.rate}%
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-blue-700 font-semibold">₪{d.revenue.toLocaleString('he-IL')}</td>
                <td className="px-4 py-3 text-center text-gray-600">{d.tasks}</td>
                <td className="px-4 py-3 text-center">
                  {d.overdue > 0
                    ? <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{d.overdue}</span>
                    : <span className="text-xs text-green-600">✓</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comparison bar chart */}
      <div className="bg-white rounded-2xl border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">השוואת ביצועי צוות</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="לידים פעילים" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="סגירות" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Data View ────────────────────────────────────────────────────────────────

export default function DataView({ state }: { state: AppState }) {
  const [tab, setTab] = useState<'performance' | 'commission' | 'pipeline' | 'team'>('performance');

  const TABS = [
    { id: 'performance', label: '📈 ביצועים' },
    { id: 'commission',  label: '💰 עמלות'  },
    { id: 'pipeline',    label: '🔄 Pipeline' },
    { id: 'team',        label: '👥 צוות'    },
  ] as const;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">📊 נתונים</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b pb-3">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'performance' && <PerformanceTab state={state} />}
      {tab === 'commission'  && <CommissionTab  state={state} />}
      {tab === 'pipeline'    && <PipelineTab    state={state} />}
      {tab === 'team'        && <TeamTab        state={state} />}
    </div>
  );
}
