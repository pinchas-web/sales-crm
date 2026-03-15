/**
 * מעקב קליטת לקוחות — לאחר סגירת עסקה.
 * טבלת התקדמות עם שלבי קליטה לפי המוצר שנרכש.
 * לחיצה על שורה → כרטיס לקוח מלא עם 3 לשוניות: התקדמות, פרטים, הערות.
 */
import { useState } from 'react';
import type { AppState, Client, Lead, Product, OnboardingStep } from '../types';
import { uid, formatDate } from '../utils';
import { Btn, Input, Modal, Textarea } from '../ui';

// ─── Client Detail Modal ───────────────────────────────────────────────────────

function ClientDetailModal({ client, lead, product, state, onClose, onSave }: {
  client: Client; lead: Lead; product: Product | undefined;
  state: AppState; onClose: () => void;
  onSave: (c: Client) => void;
}) {
  const [form, setForm] = useState<Client>(client);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [tab, setTab] = useState<'progress' | 'info' | 'notes'>('progress');

  // Merge product steps + custom steps, sorted by order
  const productSteps: OnboardingStep[] = product
    ? [...product.onboardingSteps].sort((a, b) => a.order - b.order)
    : [];
  const allSteps: (OnboardingStep & { isCustom?: boolean })[] = [
    ...productSteps.map(s => ({ ...s })),
    ...form.customSteps.map(s => ({ ...s, isCustom: true })),
  ];
  const doneCount = allSteps.filter(s => form.onboardingProgress[s.id]).length;
  const totalCount = allSteps.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  function toggleStep(stepId: string) {
    setForm(f => ({
      ...f,
      onboardingProgress: {
        ...f.onboardingProgress,
        [stepId]: !f.onboardingProgress[stepId],
      },
    }));
  }

  function addCustomStep() {
    if (!newStepTitle.trim()) return;
    const step: OnboardingStep = {
      id: uid(),
      title: newStepTitle.trim(),
      order: form.customSteps.length + productSteps.length,
    };
    setForm(f => ({ ...f, customSteps: [...f.customSteps, step] }));
    setNewStepTitle('');
  }

  function removeCustomStep(stepId: string) {
    setForm(f => ({
      ...f,
      customSteps: f.customSteps.filter(s => s.id !== stepId),
      onboardingProgress: Object.fromEntries(
        Object.entries(f.onboardingProgress).filter(([k]) => k !== stepId)
      ),
    }));
  }

  const assignee = state.users.find(u => u.id === form.assignedTo);
  const TABS = [
    { id: 'progress', label: 'שלבי קליטה' },
    { id: 'info',     label: 'פרטים'      },
    { id: 'notes',    label: 'הערות'      },
  ] as const;

  return (
    <Modal open onClose={onClose} title={`קליטת לקוח — ${lead.name}`} wide>
      {/* Tab bar */}
      <div className="flex gap-1 mb-5 border-b pb-3">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Progress header */}
      <div className="mb-4 p-3 bg-gray-50 rounded-xl border flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">התקדמות כללית</span>
            <span className={`text-sm font-bold ${pct === 100 ? 'text-green-600' : 'text-blue-600'}`}>{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">{doneCount} / {totalCount} שלבים הושלמו</p>
        </div>
        {pct === 100 && (
          <span className="text-3xl">🎉</span>
        )}
      </div>

      {/* ── Progress Tab ── */}
      {tab === 'progress' && (
        <div className="space-y-2">
          {allSteps.length === 0 && (
            <p className="text-center text-gray-400 py-8">אין שלבי קליטה מוגדרים עדיין</p>
          )}
          {productSteps.length > 0 && (
            <p className="text-xs font-medium text-gray-500 mb-2">שלבי המוצר — {product?.name}</p>
          )}
          {productSteps.map((step, i) => {
            const done = !!form.onboardingProgress[step.id];
            return (
              <div key={step.id}
                onClick={() => toggleStep(step.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${done ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {done ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${done ? 'text-green-700 line-through' : 'text-gray-800'}`}>{step.title}</p>
                  {step.description && <p className="text-xs text-gray-500">{step.description}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {done ? 'הושלם ✓' : 'ממתין'}
                </span>
              </div>
            );
          })}

          {form.customSteps.length > 0 && (
            <p className="text-xs font-medium text-gray-500 mb-2 mt-4">שלבים מותאמים</p>
          )}
          {form.customSteps.map((step, i) => {
            const done = !!form.onboardingProgress[step.id];
            return (
              <div key={step.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${done ? 'bg-green-50 border-green-300' : 'bg-blue-50 border-blue-200'}`}>
                <div
                  onClick={() => toggleStep(step.id)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold cursor-pointer transition-colors ${done ? 'bg-green-500 text-white' : 'bg-blue-400 text-white'}`}>
                  {done ? '✓' : productSteps.length + i + 1}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleStep(step.id)}>
                  <p className={`text-sm font-medium ${done ? 'text-green-700 line-through' : 'text-blue-800'}`}>{step.title}</p>
                </div>
                <Btn size="xs" variant="ghost" onClick={() => removeCustomStep(step.id)}>✕</Btn>
              </div>
            );
          })}

          {/* Add custom step */}
          <div className="border border-dashed border-gray-300 rounded-xl p-3 mt-3 flex gap-2">
            <Input
              value={newStepTitle}
              onChange={setNewStepTitle}
              placeholder="הוסף שלב מותאם..."
              onKeyDown={e => e.key === 'Enter' && addCustomStep()}
            />
            <Btn size="sm" onClick={addCustomStep} disabled={!newStepTitle.trim()}>+ הוסף</Btn>
          </div>
        </div>
      )}

      {/* ── Info Tab ── */}
      {tab === 'info' && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 border">
              <p className="text-xs text-gray-500 mb-0.5">שם לקוח</p>
              <p className="font-semibold text-gray-800">{lead.name}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border">
              <p className="text-xs text-gray-500 mb-0.5">טלפון</p>
              <p className="font-semibold text-gray-800">{lead.phone}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border">
              <p className="text-xs text-gray-500 mb-0.5">מוצר</p>
              <p className="font-semibold text-gray-800">{product?.name ?? '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border">
              <p className="text-xs text-gray-500 mb-0.5">ערך עסקה</p>
              <p className="font-semibold text-blue-700">₪{form.dealValue.toLocaleString('he-IL')}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border">
              <p className="text-xs text-gray-500 mb-0.5">תאריך סגירה</p>
              <p className="font-semibold text-gray-800">{formatDate(form.closedAt)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border">
              <p className="text-xs text-gray-500 mb-0.5">אחראי קליטה</p>
              <p className="font-semibold text-gray-800">{assignee?.name ?? '—'}</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">שנה אחראי קליטה</label>
            <select
              value={form.assignedTo}
              onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
              {state.users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          {lead.email && (
            <div className="bg-gray-50 rounded-xl p-3 border">
              <p className="text-xs text-gray-500 mb-0.5">מייל</p>
              <p className="font-semibold text-gray-800">{lead.email}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Notes Tab ── */}
      {tab === 'notes' && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-2">הערות קליטה</label>
          <Textarea
            value={form.notes ?? ''}
            onChange={v => setForm(f => ({ ...f, notes: v }))}
            placeholder="הוסף הערות לגבי קליטת הלקוח..."
            rows={8}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
        <Btn variant="secondary" onClick={onClose}>ביטול</Btn>
        <Btn onClick={() => { onSave(form); onClose(); }}>שמור</Btn>
      </div>
    </Modal>
  );
}

// ─── Clients View ──────────────────────────────────────────────────────────────

export default function ClientsView({
  state, onSaveClient,
}: {
  state: AppState;
  onSaveClient: (c: Client) => void;
}) {
  const [selected, setSelected] = useState<Client | null>(null);

  function getProduct(productId: string): Product | undefined {
    return state.products.find(p => p.id === productId);
  }
  function getLead(leadId: string): Lead | undefined {
    return state.leads.find(l => l.id === leadId);
  }

  // Build combined steps list for display
  function getAllSteps(client: Client): OnboardingStep[] {
    const product = getProduct(client.productId);
    return [
      ...(product?.onboardingSteps ?? []).sort((a, b) => a.order - b.order),
      ...client.customSteps,
    ];
  }

  function getProgress(client: Client): { done: number; total: number; pct: number } {
    const steps = getAllSteps(client);
    const done = steps.filter(s => client.onboardingProgress[s.id]).length;
    return { done, total: steps.length, pct: steps.length > 0 ? Math.round((done / steps.length) * 100) : 0 };
  }

  const selectedLead = selected ? getLead(selected.leadId) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">🎓 קליטת לקוח</h1>
        <span className="text-sm text-gray-500">{state.clients.length} לקוחות פעילים</span>
      </div>

      {state.clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-6xl mb-4">🎓</span>
          <p className="text-gray-700 font-semibold text-lg">אין לקוחות בקליטה עדיין</p>
          <p className="text-gray-400 text-sm mt-1">לקוחות יופיעו כאן לאחר סגירת עסקה</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-right">
                <th className="px-4 py-3 font-semibold text-gray-600">לקוח</th>
                <th className="px-4 py-3 font-semibold text-gray-600">טלפון</th>
                <th className="px-4 py-3 font-semibold text-gray-600">מוצר</th>
                <th className="px-4 py-3 font-semibold text-gray-600">ערך עסקה</th>
                <th className="px-4 py-3 font-semibold text-gray-600">אחראי קליטה</th>
                <th className="px-4 py-3 font-semibold text-gray-600">תאריך סגירה</th>
                {/* Dynamic step columns */}
                {state.clients.length > 0 && (() => {
                  const firstClient = state.clients[0];
                  const steps = getAllSteps(firstClient);
                  return steps.slice(0, 6).map((step, i) => (
                    <th key={step.id} className="px-3 py-3 font-semibold text-gray-600 text-center whitespace-nowrap max-w-[80px]">
                      <span className="truncate block text-xs">{i + 1}. {step.title.length > 10 ? step.title.slice(0, 10) + '…' : step.title}</span>
                    </th>
                  ));
                })()}
                <th className="px-4 py-3 font-semibold text-gray-600 text-center">התקדמות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {state.clients.map(client => {
                const lead    = getLead(client.leadId);
                const product = getProduct(client.productId);
                const steps   = getAllSteps(client);
                const prog    = getProgress(client);
                const assignee = state.users.find(u => u.id === client.assignedTo);

                return (
                  <tr key={client.id}
                    onClick={() => setSelected(client)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{lead?.name ?? '—'}</p>
                      {lead?.email && <p className="text-xs text-gray-400">{lead.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{lead?.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        {product?.name ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      ₪{client.dealValue.toLocaleString('he-IL')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{assignee?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(client.closedAt)}</td>
                    {/* Step checkboxes */}
                    {steps.slice(0, 6).map(step => {
                      const done = !!client.onboardingProgress[step.id];
                      return (
                        <td key={step.id} className="px-3 py-3 text-center">
                          <div className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center text-xs font-bold transition-colors ${done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                            {done ? '✓' : '○'}
                          </div>
                        </td>
                      );
                    })}
                    {/* Progress */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${prog.pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${prog.pct}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${prog.pct === 100 ? 'text-green-600' : 'text-gray-600'}`}>
                          {prog.pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && selectedLead && (
        <ClientDetailModal
          client={selected}
          lead={selectedLead}
          product={getProduct(selected.productId)}
          state={state}
          onClose={() => setSelected(null)}
          onSave={c => { onSaveClient(c); setSelected(c); }}
        />
      )}
    </div>
  );
}
