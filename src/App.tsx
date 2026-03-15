/**
 * נקודת השליטה המרכזית של האפליקציה.
 * מנהל state גלובלי, כל ה-handlers, מנוע האוטומציות, והניווט.
 * Auth: Supabase → JWT → /api/state (Vercel Serverless Functions)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, apiLoadState, apiSaveState } from './api';
import type { AppState, Lead, Activity, Task, Product, Client, ChatMessage, PinnedNote, CustomField } from './types';
import { SEED_STATE } from './seed';
import { uid, TODAY, getL, calcScore } from './utils';

import LoginScreen   from './views/LoginScreen';
import HomePage      from './views/HomePage';
import LeadsView     from './views/LeadsView';
import ClientsView   from './views/ClientsView';
import ProductsView  from './views/ProductsView';
import TasksView     from './views/TasksView';
import DataView      from './views/DataView';
import ChatView      from './views/ChatView';
import SettingsPanel from './views/SettingsPanel';
import DesignEditor  from './views/DesignEditor';

// ─── State merge ──────────────────────────────────────────────────────────────

// מיזוג state שנטען מה-server עם ה-seed הקיים
function mergeState(parsed: Partial<AppState>): AppState {
  return {
    ...SEED_STATE,
    ...parsed,
    navConfig: SEED_STATE.navConfig.map(tab => {
      const saved = (parsed.navConfig ?? []).find((t: { id: string }) => t.id === tab.id);
      return saved ?? tab;
    }),
    labels: { ...(parsed.labels ?? {}) },
  };
}

// ─── Client Onboarding Pop-up ─────────────────────────────────────────────────

function ClientOnboardingPopup({ lead, state, onConfirm, onCancel }: {
  lead: Lead;
  state: AppState;
  onConfirm: (productId: string, dealValue: number, assignedTo: string) => void;
  onCancel: () => void;
}) {
  const activeProducts = state.products.filter(p => p.active);
  const [productId, setProductId]   = useState(lead.interestedIn[0] ?? activeProducts[0]?.id ?? '');
  const [dealValue, setDealValue]   = useState(String(lead.dealValue ?? state.products.find(p => p.id === (lead.interestedIn[0] ?? activeProducts[0]?.id))?.price ?? 0));
  const [assignedTo, setAssignedTo] = useState(lead.assigned_to);

  const selectedProduct = state.products.find(p => p.id === productId);

  function handleProductChange(pid: string) {
    setProductId(pid);
    const p = state.products.find(pr => pr.id === pid);
    if (p) setDealValue(String(p.price));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎉</span>
            <div>
              <h2 className="text-lg font-bold text-gray-800">סגירה! — {lead.name}</h2>
              <p className="text-sm text-gray-500">בחר מוצר ופרטי עסקה לקליטת הלקוח</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">מוצר שנרכש *</label>
            {activeProducts.length === 0 ? (
              <p className="text-sm text-red-500">אין מוצרים פעילים — הוסף מוצר בהגדרות</p>
            ) : (
              <select value={productId} onChange={e => handleProductChange(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                {activeProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — ₪{p.price.toLocaleString('he-IL')}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ערך עסקה (₪)</label>
            <input type="number" value={dealValue} onChange={e => setDealValue(e.target.value)} min={0}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">אחראי קליטה</label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
              {state.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {selectedProduct && selectedProduct.onboardingSteps.length > 0 && (
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-xs font-medium text-blue-700 mb-2">{selectedProduct.onboardingSteps.length} שלבי קליטה יפתחו אוטומטית:</p>
              {[...selectedProduct.onboardingSteps].sort((a, b) => a.order - b.order).slice(0, 4).map(s => (
                <p key={s.id} className="text-xs text-blue-600">• {s.title}</p>
              ))}
              {selectedProduct.onboardingSteps.length > 4 && (
                <p className="text-xs text-blue-400">ועוד {selectedProduct.onboardingSteps.length - 4}...</p>
              )}
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            ביטול
          </button>
          <button onClick={() => onConfirm(productId, Number(dealValue) || 0, assignedTo)}
            disabled={!productId || activeProducts.length === 0}
            className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
            🎓 קלוט לקוח
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User Badge (מחליף את UserSwitcher — ללא אפשרות החלפת משתמש) ─────────────

function UserBadge({ state }: { state: AppState }) {
  const current = state.users.find(u => u.id === state.currentUserId);

  async function handleLogout() {
    await supabase.auth.signOut();
    // onAuthStateChange ב-App() מגיב אוטומטית ומציג את LoginScreen
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-white">
        <div className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center text-sm font-bold">
          {current?.name.charAt(0)}
        </div>
        <div className="hidden sm:block text-right">
          <p className="text-xs font-medium leading-none">{current?.name}</p>
          <p className="text-[10px] opacity-60 leading-none mt-0.5">
            {current?.role === 'admin' ? 'מנהל' : 'נציג'}
          </p>
        </div>
      </div>
      <button
        onClick={handleLogout}
        title="יציאה מהמערכת"
        className="text-white/70 hover:text-white text-xs px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
      >
        יציאה
      </button>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Auth state ────────────────────────────────────────────────────────────
  const [session, setSession]   = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // בדיקת session קיים בטעינה
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    // האזנה לשינויים — login / logout / token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── CRM state ─────────────────────────────────────────────────────────────
  const [state, setState]                     = useState<AppState>(SEED_STATE);
  const [activeTab, setActiveTab]             = useState('home');
  const [pendingOnboarding, setPendingOnboarding] = useState<Lead | null>(null);
  const [loading, setLoading]                 = useState(true);

  // טעינה ראשונית מ-API (רק כשיש session)
  const didLoad = useRef(false);
  useEffect(() => {
    if (!session || didLoad.current) return;
    didLoad.current = true;
    apiLoadState()
      .then(data => {
        if (data) setState(mergeState(data as Partial<AppState>));
      })
      .catch(err => console.error('CRM: failed to load state', err))
      .finally(() => setLoading(false));
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // איפוס כשמשתמש מתנתק
  useEffect(() => {
    if (!session) {
      setState(SEED_STATE);
      setLoading(true);
      didLoad.current = false;
    }
  }, [session]);

  // שמירה אוטומטית בכל שינוי state
  useEffect(() => {
    if (loading || !session) return;
    apiSaveState(state).catch(err => console.error('CRM: failed to save state', err));
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run no_activity automations on mount
  useEffect(() => {
    if (loading) return;
    const now = Date.now();
    const newTasks: Task[] = [];
    state.leads.forEach(lead => {
      if (!lead.lastActivityAt) return;
      const daysIdle = (now - new Date(lead.lastActivityAt).getTime()) / 86400000;
      state.automationRules
        .filter(r => r.active && r.triggerType === 'no_activity' && r.actionType === 'create_task')
        .forEach(r => {
          if (daysIdle < (r.triggerDaysIdle ?? 3)) return;
          const alreadyExists = state.tasks.some(t =>
            t.lead_id === lead.id && t.note === (r.actionTaskNote ?? '') && t.due_date === TODAY
          );
          if (!alreadyExists) {
            newTasks.push({
              id: uid(), lead_id: lead.id, due_date: TODAY,
              note: r.actionTaskNote ?? `פולואפ — ${lead.name}`,
              assigned_to: lead.assigned_to, done: false, type: 'call',
            });
          }
        });
    });
    if (newTasks.length > 0) setState(s => ({ ...s, tasks: [...s.tasks, ...newTasks] }));
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Automation runner
  function runAutomations(
    trigger:
      | { type: 'status_change'; fromStatus: string; toStatus: string; lead: Lead }
      | { type: 'new_lead'; lead: Lead },
    currentState: AppState
  ): Task[] {
    const newTasks: Task[] = [];
    currentState.automationRules.filter(r => r.active).forEach(r => {
      let match = false;
      if (r.triggerType === 'status_change' && trigger.type === 'status_change') {
        match = (!r.triggerFromStatus || r.triggerFromStatus === trigger.fromStatus)
             && (!r.triggerToStatus   || r.triggerToStatus   === trigger.toStatus);
      }
      if (r.triggerType === 'new_lead' && trigger.type === 'new_lead') match = true;
      if (!match || r.actionType !== 'create_task') return;
      const dueDate = new Date(Date.now() + (r.actionTaskDaysOffset ?? 0) * 86400000).toISOString().split('T')[0];
      newTasks.push({
        id: uid(), lead_id: trigger.lead.id, due_date: dueDate,
        note: r.actionTaskNote ?? `פעולה אוטומטית — ${trigger.lead.name}`,
        assigned_to: trigger.lead.assigned_to, done: false, type: 'call',
      });
    });
    return newTasks;
  }

  // ── Lead handlers ──────────────────────────────────────────────────────────

  const handleAddLead = useCallback((lead: Lead) => {
    setState(s => {
      const newTasks = runAutomations({ type: 'new_lead', lead }, s);
      return { ...s, leads: [...s.leads, lead], tasks: [...s.tasks, ...newTasks] };
    });
  }, []);

  const handleBulkUpdateLeads = useCallback((ids: string[], updates: Partial<Lead>) => {
    setState(s => {
      let newTasks: Task[] = [];
      const updatedLeads = s.leads.map(l => {
        if (!ids.includes(l.id)) return l;
        const updated: Lead = {
          ...l, ...updates,
          score: calcScore({ ...l, ...updates }, s.activities, s.tasks),
          updated_at: new Date().toISOString(),
        };
        if (updates.status && updates.status !== l.status) {
          newTasks = [...newTasks, ...runAutomations({ type: 'status_change', fromStatus: l.status, toStatus: updates.status, lead: updated }, s)];
        }
        return updated;
      });
      return { ...s, leads: updatedLeads, tasks: [...s.tasks, ...newTasks] };
    });
  }, []);

  const handleBulkAddLeads = useCallback((leads: Lead[], newCustomFields: CustomField[] = []) => {
    setState(s => {
      let newTasks: Task[] = [];
      leads.forEach(lead => {
        newTasks = [...newTasks, ...runAutomations({ type: 'new_lead', lead }, s)];
      });
      const mergedCFs = [
        ...s.customFields,
        ...newCustomFields.filter(ncf => !s.customFields.some(cf => cf.name === ncf.name)),
      ];
      return { ...s, leads: [...s.leads, ...leads], tasks: [...s.tasks, ...newTasks], customFields: mergedCFs };
    });
  }, []);

  const handleBulkDeleteLeads = useCallback((ids: string[]) => {
    setState(s => ({
      ...s,
      leads:      s.leads.filter(l => !ids.includes(l.id)),
      activities: s.activities.filter(a => !ids.includes(a.lead_id)),
      tasks:      s.tasks.filter(t => !t.lead_id || !ids.includes(t.lead_id)),
    }));
  }, []);

  const handleUpdateLead = useCallback((id: string, updates: Partial<Lead>) => {
    setState(s => {
      const existing = s.leads.find(l => l.id === id);
      if (!existing) return s;
      const updated: Lead = {
        ...existing, ...updates,
        score: calcScore({ ...existing, ...updates }, s.activities, s.tasks),
        updated_at: new Date().toISOString(),
      };
      let newTasks: Task[] = [];
      if (updates.status && updates.status !== existing.status) {
        newTasks = runAutomations({ type: 'status_change', fromStatus: existing.status, toStatus: updates.status, lead: updated }, s);
        const wonStatus = s.statuses.find(st => st.id === updates.status);
        if (wonStatus?.isWon) {
          setTimeout(() => setPendingOnboarding(updated), 50);
        }
      }
      return { ...s, leads: s.leads.map(l => l.id === id ? updated : l), tasks: [...s.tasks, ...newTasks] };
    });
  }, []);

  const handleDeleteLead = useCallback((id: string) => {
    setState(s => ({
      ...s,
      leads: s.leads.filter(l => l.id !== id),
      activities: s.activities.filter(a => a.lead_id !== id),
      tasks: s.tasks.filter(t => t.lead_id !== id),
    }));
  }, []);

  // ── Activity handlers ──────────────────────────────────────────────────────

  const handleAddActivity = useCallback((activity: Activity) => {
    setState(s => ({
      ...s,
      activities: [...s.activities, activity],
      leads: s.leads.map(l =>
        l.id === activity.lead_id
          ? { ...l, lastActivityAt: activity.date, updated_at: new Date().toISOString() }
          : l
      ),
    }));
  }, []);

  const handleDeleteActivity = useCallback((id: string) => {
    setState(s => ({ ...s, activities: s.activities.filter(a => a.id !== id) }));
  }, []);

  // ── Task handlers ──────────────────────────────────────────────────────────

  const handleAddTask    = useCallback((task: Task) => setState(s => ({ ...s, tasks: [...s.tasks, task] })), []);
  const handleUpdateTask = useCallback((id: string, updates: Partial<Task>) =>
    setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, ...updates } : t) })), []);
  const handleDeleteTask = useCallback((id: string) =>
    setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) })), []);

  // ── Product handlers ───────────────────────────────────────────────────────

  const handleSaveProduct  = useCallback((product: Product) =>
    setState(s => ({
      ...s,
      products: s.products.some(p => p.id === product.id)
        ? s.products.map(p => p.id === product.id ? product : p)
        : [...s.products, product],
    })), []);
  const handleDeleteProduct = useCallback((id: string) =>
    setState(s => ({ ...s, products: s.products.filter(p => p.id !== id) })), []);

  // ── Client handlers ────────────────────────────────────────────────────────

  const handleSaveClient = useCallback((client: Client) =>
    setState(s => ({
      ...s,
      clients: s.clients.some(c => c.id === client.id)
        ? s.clients.map(c => c.id === client.id ? client : c)
        : [...s.clients, client],
    })), []);

  const handleConfirmOnboarding = useCallback((productId: string, dealValue: number, assignedTo: string) => {
    if (!pendingOnboarding) return;
    const lead = pendingOnboarding;
    const newClient: Client = {
      id: uid(), leadId: lead.id, productId, dealValue,
      closedAt: new Date().toISOString(), assignedTo,
      onboardingProgress: {}, customSteps: [],
    };
    setState(s => ({
      ...s,
      clients: [...s.clients, newClient],
      leads: s.leads.map(l => l.id === lead.id ? { ...l, dealValue } : l),
    }));
    setPendingOnboarding(null);
    setActiveTab('clients');
  }, [pendingOnboarding]);

  // ── Pinned notes handlers ──────────────────────────────────────────────────

  const handleAddNote    = useCallback((note: PinnedNote) => setState(s => ({ ...s, pinnedNotes: [...s.pinnedNotes, note] })), []);
  const handleDeleteNote = useCallback((id: string) => setState(s => ({ ...s, pinnedNotes: s.pinnedNotes.filter(n => n.id !== id) })), []);
  const handleUpdateNote = useCallback((id: string, updates: Partial<PinnedNote>) =>
    setState(s => ({ ...s, pinnedNotes: s.pinnedNotes.map(n => n.id === id ? { ...n, ...updates } : n) })), []);

  // ── Chat handlers ──────────────────────────────────────────────────────────

  const handleSendMessage = useCallback((msg: ChatMessage) => setState(s => ({ ...s, chatMessages: [...s.chatMessages, msg] })), []);
  const handleMarkRead    = useCallback((msgId: string, userId: string) =>
    setState(s => ({
      ...s,
      chatMessages: s.chatMessages.map(m =>
        m.id === msgId && !m.readBy.includes(userId) ? { ...m, readBy: [...m.readBy, userId] } : m
      ),
    })), []);

  // ── Full state update for settings ────────────────────────────────────────

  const handleUpdateState = useCallback((newState: AppState) => setState(newState), []);

  // ── Nav config ────────────────────────────────────────────────────────────

  const getLabel = (key: string) => getL(key, state.labels);

  const NAV_TABS = [
    { id: 'home',     icon: '🏠', defaultLabel: 'ראשי'    },
    { id: 'leads',    icon: '👤', defaultLabel: 'לידים'   },
    { id: 'clients',  icon: '🎓', defaultLabel: 'קליטה'   },
    { id: 'products', icon: '📦', defaultLabel: 'מוצרים'  },
    { id: 'tasks',    icon: '✅', defaultLabel: 'משימות'  },
    { id: 'data',     icon: '📊', defaultLabel: 'נתונים'  },
    { id: 'chat',     icon: '💬', defaultLabel: "צ'אט"    },
    { id: 'settings', icon: '⚙️', defaultLabel: 'הגדרות'  },
  ];

  const visibleTabs = [...state.navConfig]
    .filter(t => t.visible)
    .sort((a, b) => a.order - b.order)
    .map(t => NAV_TABS.find(n => n.id === t.id))
    .filter((t): t is typeof NAV_TABS[0] => !!t);

  const unreadChat = state.chatMessages.filter(m =>
    m.fromUserId !== state.currentUserId && !m.readBy.includes(state.currentUserId)
  ).length;

  const overdueTasks = state.tasks.filter(t =>
    !t.done && t.due_date < TODAY && t.assigned_to === state.currentUserId
  ).length;

  // ── Render ────────────────────────────────────────────────────────────────

  // בדיקת auth ראשונית
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-700 to-indigo-700 flex items-center justify-center" dir="rtl">
        <div className="text-center text-white">
          <div className="text-5xl mb-4 animate-bounce">⚡</div>
          <p className="text-xl font-bold mb-1">מערכת CRM</p>
          <p className="text-sm opacity-70">מאמת...</p>
        </div>
      </div>
    );
  }

  // אין session — מציג מסך כניסה
  if (!session) {
    return <LoginScreen />;
  }

  // טעינת נתונים ראשונית
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-700 to-indigo-700 flex items-center justify-center" dir="rtl">
        <div className="text-center text-white">
          <div className="text-5xl mb-4 animate-bounce">⚡</div>
          <p className="text-xl font-bold mb-1">מערכת CRM</p>
          <p className="text-sm opacity-70">טוען נתונים...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-right" dir="rtl">
      {/* Header */}
      <header className="bg-gradient-to-l from-blue-700 to-indigo-700 text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-screen-2xl mx-auto px-4 py-2.5 flex items-center gap-2">
          <h1 className="text-base font-bold tracking-wide ml-2 shrink-0">
            {getLabel('app.title')}
          </h1>
          <nav className="flex-1 flex items-center gap-0.5 overflow-x-auto">
            {visibleTabs.map(tab => {
              const isActive = activeTab === tab.id;
              const label = getLabel(`tab.${tab.id}`) || tab.defaultLabel;
              const badge =
                tab.id === 'chat'  ? unreadChat   :
                tab.id === 'tasks' ? overdueTasks : 0;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
                  <span>{tab.icon}</span>
                  <span className="hidden lg:inline">{label}</span>
                  {badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          {/* UserBadge במקום UserSwitcher — ללא אפשרות החלפת משתמש */}
          <UserBadge state={state} />
        </div>
      </header>

      {/* Main */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        {activeTab === 'home' && (
          <HomePage
            state={state}
            onNavigate={setActiveTab}
            onUpdateTask={handleUpdateTask}
            onAddTask={handleAddTask}
            onAddNote={handleAddNote}
            onDeleteNote={handleDeleteNote}
            onUpdateNote={handleUpdateNote}
          />
        )}
        {activeTab === 'leads' && (
          <LeadsView
            state={state}
            onAddLead={handleAddLead}
            onBulkAddLeads={handleBulkAddLeads}
            onBulkUpdateLeads={handleBulkUpdateLeads}
            onBulkDeleteLeads={handleBulkDeleteLeads}
            onUpdateLead={handleUpdateLead}
            onDeleteLead={handleDeleteLead}
            onAddActivity={handleAddActivity}
            onDeleteActivity={handleDeleteActivity}
            onAddTask={handleAddTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
          />
        )}
        {activeTab === 'clients' && (
          <ClientsView state={state} onSaveClient={handleSaveClient} />
        )}
        {activeTab === 'products' && (
          <ProductsView state={state} onSaveProduct={handleSaveProduct} onDeleteProduct={handleDeleteProduct} />
        )}
        {activeTab === 'tasks' && (
          <TasksView
            state={state}
            onAddTask={handleAddTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
          />
        )}
        {activeTab === 'data'     && <DataView      state={state} />}
        {activeTab === 'chat'     && <ChatView      state={state} onSendMessage={handleSendMessage} onMarkRead={handleMarkRead} />}
        {activeTab === 'settings' && <SettingsPanel state={state} onUpdate={handleUpdateState} />}
      </main>

      {/* Client onboarding popup */}
      {pendingOnboarding && (
        <ClientOnboardingPopup
          lead={pendingOnboarding}
          state={state}
          onConfirm={handleConfirmOnboarding}
          onCancel={() => setPendingOnboarding(null)}
        />
      )}

      {/* Visual design editor — floating 🎨 button, bottom-left */}
      <DesignEditor />
    </div>
  );
}
