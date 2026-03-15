/**
 * פונקציות עזר משותפות לכל האפליקציה.
 * חישובים (score, עמלה), פורמטים (תאריך, זמן יחסי), קישורים חיצוניים (וואצאפ, גוגל).
 * כל פונקציה עצמאית — אין side effects, אין state.
 */
import type { Lead, Activity, Task, AppState } from './types';

export const TODAY = new Date().toISOString().split('T')[0];

export const SOURCE_LABELS: Record<string, string> = {
  facebook: 'פייסבוק', whatsapp: 'וואצאפ', organic: 'אורגני',
  referral: 'המלצה', other: 'אחר',
};
export const PROFESSION_LABELS: Record<string, string> = {
  therapist: 'מטפל/ת', coach: 'מאמן/ת', psychologist: 'פסיכולוג/ית', other: 'אחר',
};
export const AUDIENCE_LABELS: Record<string, string> = {
  secular: 'חילוני', religious: 'דתי', haredi: 'חרדי',
};

export const ACTIVITY_ICONS: Record<string, string> = {
  note:     '📝',
  call:     '☎️',
  email:    '📧',
  whatsapp: '💬',
  meeting:  '📅',
};
export const ACTIVITY_LABELS: Record<string, string> = {
  note:     'הערה',
  call:     'שיחה',
  email:    'מייל',
  whatsapp: 'וואצאפ',
  meeting:  'פגישה',
};

export const CHART_COLORS = [
  '#6366f1','#3b82f6','#10b981','#f59e0b',
  '#ef4444','#8b5cf6','#ec4899','#14b8a6',
  '#f97316','#84cc16','#06b6d4','#a855f7',
];

export const NOTE_COLORS: Record<string, string> = {
  yellow: 'bg-yellow-100 border-yellow-300',
  blue:   'bg-blue-100   border-blue-300',
  pink:   'bg-pink-100   border-pink-300',
  green:  'bg-green-100  border-green-300',
  purple: 'bg-purple-100 border-purple-300',
};

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('he-IL'); } catch { return iso; }
}

export function formatDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `לפני ${mins} דקות`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  const days = Math.floor(hrs / 24);
  return `לפני ${days} ימים`;
}

export function getL(key: string, labels: Record<string, string>): string {
  return labels[key] ?? DEFAULT_LABELS[key] ?? key;
}

export const DEFAULT_LABELS: Record<string, string> = {
  'app.title':           'CRM',
  'tab.home':            'ראשי',
  'tab.leads':           'לידים',
  'tab.clients':         'קליטת לקוח',
  'tab.products':        'מוצרים',
  'tab.tasks':           'משימות',
  'tab.data':            'נתונים',
  'tab.chat':            'צ\'אט',
  'tab.settings':        'הגדרות',
  'kpi.active_leads':    'לידים פעילים',
  'kpi.won_month':       'סגירות החודש',
  'kpi.commission':      'עמלה צבורה',
  'kpi.today_tasks':     'משימות להיום',
  'sidebar.title':       'משימות היום',
  'btn.add_lead':        '+ ליד חדש',
  'btn.daily_summary':   '📧 סיכום יומי',
  'home.greeting_am':    'בוקר טוב',
  'home.greeting_pm':    'צהריים טובים',
  'home.greeting_eve':   'ערב טוב',
  'home.greeting_night': 'לילה טוב',
  'home.sub':            'כל הנתונים להצלחה שלך נמצאים ממש כאן!',
};

export function greeting(name: string, labels: Record<string, string>): string {
  const h = new Date().getHours();
  const base = h < 12
    ? getL('home.greeting_am', labels)
    : h < 17 ? getL('home.greeting_pm', labels)
    : h < 21 ? getL('home.greeting_eve', labels)
    : getL('home.greeting_night', labels);
  return `${base} ${name}`;
}

export function openGoogleCalendar(task: Task, lead?: Lead) {
  const title   = [task.note, lead ? `- ${lead.name}` : ''].filter(Boolean).join(' ');
  const details = lead ? `שם: ${lead.name}\nטלפון: ${lead.phone}` : '';
  const d       = task.due_date.replace(/-/g, '');
  const next    = new Date(task.due_date);
  next.setDate(next.getDate() + 1);
  const nd  = next.toISOString().split('T')[0].replace(/-/g, '');
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('dates', `${d}/${nd}`);
  url.searchParams.set('details', details);
  window.open(url.toString(), '_blank');
}

export function openWhatsApp(phone: string, message?: string) {
  const cleaned = phone.replace(/\D/g, '');
  const intl    = cleaned.startsWith('0') ? '972' + cleaned.slice(1) : cleaned;
  const url     = `https://wa.me/${intl}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
  window.open(url, '_blank');
}

/** Calculate auto-score 0–100 for a lead */
export function calcScore(lead: Lead, activities: Activity[], tasks: Task[]): number {
  let score = 50;
  const daysSinceCreate = (Date.now() - new Date(lead.created_at).getTime()) / 86400000;
  const lastAct = lead.lastActivityAt ? (Date.now() - new Date(lead.lastActivityAt).getTime()) / 86400000 : 99;
  const actCount = activities.filter(a => a.lead_id === lead.id).length;
  const taskCount = tasks.filter(t => t.lead_id === lead.id && !t.done).length;
  if (daysSinceCreate <= 1)  score += 20;
  else if (daysSinceCreate <= 3) score += 10;
  else if (daysSinceCreate > 14) score -= 20;
  if (lastAct <= 1)  score += 10;
  else if (lastAct > 7) score -= 15;
  score += Math.min(actCount * 5, 20);
  if (taskCount > 0) score += 5;
  if (lead.dealValue && lead.dealValue > 10000) score += 5;
  return Math.max(0, Math.min(100, score));
}

/** Hot leads for home page — new today, follow-up today, or active without future followup */
export function getHotLeads(state: AppState): Lead[] {
  const today = TODAY;
  return state.leads.filter(l => {
    const st = state.statuses.find(s => s.id === l.status);
    if (st?.isFinal) return false; // exclude closed/lost
    const isNew       = l.created_at.startsWith(today);
    const hasFollowUp = l.followUpAt?.startsWith(today);
    const lastAct     = l.lastActivityAt;
    const isStale     = !lastAct || (Date.now() - new Date(lastAct).getTime()) > 3 * 86400000;
    if (isStale && !isNew && !hasFollowUp) return false; // stale without action
    const hasFutureFollowUp = l.followUpAt && l.followUpAt > today + 'T23:59:59Z' && !hasFollowUp;
    if (hasFutureFollowUp) return false;
    return true;
  }).sort((a, b) => b.score - a.score).slice(0, 15);
}

/** Check for duplicate leads by phone / email / name */
export function findDuplicates(leads: Lead[], name: string, phone: string, email?: string): Lead[] {
  const n = name.trim().toLowerCase();
  const p = phone.replace(/\D/g, '');
  const e = email?.trim().toLowerCase();
  return leads.filter(l => {
    if (p && l.phone.replace(/\D/g, '') === p) return true;
    if (e && l.email?.toLowerCase() === e) return true;
    if (n && l.name.trim().toLowerCase() === n) return true;
    return false;
  });
}

/** Compute month-to-date commission for a user */
export function calcCommission(state: AppState, userId: string): { deals: number; revenue: number; commission: number } {
  const user = state.users.find(u => u.id === userId);
  if (!user) return { deals: 0, revenue: 0, commission: 0 };
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const wonLeads = state.leads.filter(l =>
    l.assigned_to === userId &&
    state.statuses.find(s => s.id === l.status)?.isWon &&
    new Date(l.updated_at) >= monthStart
  );
  const revenue   = wonLeads.reduce((sum, l) => sum + (l.dealValue ?? 0), 0);
  const commission = revenue * user.commissionRate;
  return { deals: wonLeads.length, revenue, commission };
}
