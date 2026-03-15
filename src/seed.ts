/**
 * נתוני ברירת מחדל (seed) לאתחול המערכת בהפעלה ראשונה.
 * משמש גם כ-fallback כשאין state שמור ב-WordPress / localStorage.
 * ⚠️ צבעי סטטוסים הם hex (#rrggbb) — לא שמות Tailwind — כי הם נטענים לcolor picker.
 */
import type { AppState } from './types';

const TODAY    = new Date().toISOString().split('T')[0];
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];

export const SEED_STATE: AppState = {
  currentUserId: 'u1',
  tableColumnPrefs: {},
  salesTargets: { u2: 5, u3: 4 },
  labels: {},
  dailySummaryEmail: '',
  navConfig: [
    { id: 'home',     visible: true,  order: 0 },
    { id: 'leads',    visible: true,  order: 1 },
    { id: 'clients',  visible: true,  order: 2 },
    { id: 'products', visible: true,  order: 3 },
    { id: 'tasks',    visible: true,  order: 4 },
    { id: 'data',     visible: true,  order: 5 },
    { id: 'chat',     visible: true,  order: 6 },
    { id: 'settings', visible: true,  order: 7 },
  ],

  users: [
    { id: 'u1', name: 'פנחס',  role: 'admin',       commissionRate: 0 },
    { id: 'u2', name: 'שרה',   role: 'salesperson',  commissionRate: 0.10 },
    { id: 'u3', name: 'משה',   role: 'salesperson',  commissionRate: 0.10 },
  ],

  statuses: [
    { id: 'new',       label: 'לא נוצר קשר',             color: '#94a3b8', textColor: '#ffffff', isFinal: false, isWon: false, order: 0 },
    { id: 'no_answer', label: 'לא ענה',                   color: '#9ca3af', textColor: '#ffffff', isFinal: false, isWon: false, order: 1 },
    { id: 'in_proc',   label: 'בתהליך',                   color: '#3b82f6', textColor: '#ffffff', isFinal: false, isWon: false, order: 2 },
    { id: 'laser',     label: 'נקבעה פגישה עם פנחס',     color: '#6366f1', textColor: '#ffffff', isFinal: false, isWon: false, order: 3 },
    { id: 'followup',  label: 'פולואפ',                   color: '#f59e0b', textColor: '#ffffff', isFinal: false, isWon: false, order: 4 },
    { id: 'warmup',    label: 'משימות חימום',              color: '#fb923c', textColor: '#ffffff', isFinal: false, isWon: false, order: 5 },
    { id: 'won',       label: 'סגר!!!',                   color: '#22c55e', textColor: '#ffffff', isFinal: true,  isWon: true,  order: 6 },
    { id: 'lost',      label: 'נפל ❌',                   color: '#f87171', textColor: '#ffffff', isFinal: true,  isWon: false, order: 7 },
    { id: 'future',    label: 'עתיד 🕐',                  color: '#22d3ee', textColor: '#ffffff', isFinal: false, isWon: false, order: 8 },
  ],

  dropdownOptions: {
    sources:        ['facebook', 'whatsapp', 'organic', 'referral', 'other'],
    professions:    ['therapist', 'coach', 'psychologist', 'other'],
    audience_types: ['secular', 'religious', 'haredi'],
    programs:       ['biznes_therapy', 'premium_coaching', 'other'],
  },

  customFields: [],

  products: [
    {
      id: 'p1',
      name: "ביזנס תרפי",
      shortDescription: "פיתוח עסקי למטפלים ומאמנים",
      description: "תוכנית מקיפה לבניית עסק משגשג בתחום הטיפול והקואצ'ינג. 6 חודשים מלווים.",
      price: 9800,
      category: 'קואצ\'ינג',
      syllabusText: 'מפגש 1: זיהוי קהל היעד\nמפגש 2: בניית מותג אישי\nמפגש 3: שיווק ותוכן\nמפגש 4: מכירות\nמפגש 5: מערכות ואוטומציה\nמפגש 6: גדילה ומינוף',
      contractText: 'הסכם שירות — ביזנס תרפי\n\nהצדדים מסכימים לתנאי השירות...',
      testimonials: [
        { id: 'tm1', name: 'דינה לוי', phone: '052-1111111', note: 'שילשתי את ההכנסה תוך 4 חודשים!' },
        { id: 'tm2', name: 'אורי כהן', phone: '054-2222222', note: 'המנטורינג שינה את כיוון הקריירה שלי' },
      ],
      onboardingSteps: [
        { id: 'p1s1', title: 'שיחת פתיחה',          description: 'שיחת אוריינטציה עם המנחה',    order: 0 },
        { id: 'p1s2', title: 'הצטרפות לקבוצה',       description: 'הוספה לקבוצת הווצ\'אפ',       order: 1 },
        { id: 'p1s3', title: 'חתימת חוזה',           description: 'שליחה וחתימה על הסכם השירות', order: 2 },
        { id: 'p1s4', title: 'תשלום ראשון',          description: 'אישור קבלת תשלום',            order: 3 },
        { id: 'p1s5', title: 'גישה לחומרים',        description: 'שליחת לינק לפורטל',           order: 4 },
        { id: 'p1s6', title: 'תיאום מפגש פתיחה',    description: 'קביעת תאריך ושעה',             order: 5 },
      ],
      active: true,
      createdAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'p2',
      name: "פרימיום קואצ'ינג",
      shortDescription: "קואצ'ינג אישי מעמיק 1:1",
      description: "תהליך אישי ומעמיק 1:1 עם פנחס — 12 מפגשים לבניית חיי השפע שרצית תמיד.",
      price: 18000,
      category: 'קואצ\'ינג',
      syllabusText: '12 מפגשים אישיים\nכל מפגש 90 דקות\nשעה שבועית זמינות טלפונית\nקהילה בלעדית',
      contractText: 'הסכם שירות — פרימיום קואצ\'ינג\n\nתנאים ותאריכי תשלום...',
      testimonials: [
        { id: 'tm3', name: 'שרה מזרחי', phone: '058-3333333', note: 'הטוב ביותר שהשקעתי בעצמי' },
      ],
      onboardingSteps: [
        { id: 'p2s1', title: 'חתימת הסכם',           description: 'חוזה דיגיטלי',                order: 0 },
        { id: 'p2s2', title: 'תשלום מקדמה',          description: '50% עם תחילת התהליך',          order: 1 },
        { id: 'p2s3', title: 'שאלון אינטייק',         description: 'מילוי שאלון לפני המפגש הראשון', order: 2 },
        { id: 'p2s4', title: 'תיאום מפגש ראשון',      description: 'קביעת תאריך ופלטפורמה',        order: 3 },
        { id: 'p2s5', title: 'הוספה לפורטל',         description: 'גישה לחומרים ולקהילה',         order: 4 },
      ],
      active: true,
      createdAt: '2025-01-01T00:00:00Z',
    },
  ],

  leads: [
    {
      id: 'l1', name: 'ד"ר רחל כהן', phone: '050-1234567', email: 'rachel@example.com',
      source: 'facebook', profession: 'therapist', audience_type: 'secular',
      program: 'biznes_therapy', interestedIn: ['p1'], status: 'new',
      assigned_to: 'u2', created_at: TODAY + 'T09:00:00Z', updated_at: TODAY + 'T09:00:00Z',
      custom_fields: {}, score: 72, followUpAt: TODAY + 'T14:00:00Z',
      lastActivityAt: TODAY + 'T09:00:00Z', dealValue: 9800,
    },
    {
      id: 'l2', name: 'יוסי לוי', phone: '052-9876543',
      source: 'whatsapp', profession: 'coach', audience_type: 'religious',
      program: 'premium_coaching', interestedIn: ['p2'], status: 'in_proc',
      assigned_to: 'u2', created_at: '2025-01-12T10:00:00Z', updated_at: '2025-01-14T11:00:00Z',
      custom_fields: {}, score: 55, lastActivityAt: '2025-01-14T11:00:00Z', dealValue: 18000,
    },
    {
      id: 'l3', name: 'מיכל ברון', phone: '054-5556666', email: 'michal@example.com',
      source: 'referral', profession: 'psychologist', audience_type: 'secular',
      program: 'biznes_therapy', interestedIn: ['p1'], status: 'followup',
      assigned_to: 'u2', created_at: '2025-01-15T08:00:00Z', updated_at: '2025-01-20T14:00:00Z',
      custom_fields: {}, score: 80, followUpAt: TOMORROW + 'T10:00:00Z',
      lastActivityAt: '2025-01-20T14:00:00Z', dealValue: 9800,
    },
    {
      id: 'l4', name: 'אבי שמש', phone: '053-1112222',
      source: 'facebook', profession: 'coach', audience_type: 'haredi',
      program: 'premium_coaching', interestedIn: ['p2'], status: 'won',
      assigned_to: 'u3', created_at: '2025-01-05T07:00:00Z', updated_at: new Date().toISOString(),
      custom_fields: {}, score: 100, lastActivityAt: new Date().toISOString(), dealValue: 18000,
    },
    {
      id: 'l5', name: 'נועה גולן', phone: '058-3334444', email: 'noa@example.com',
      source: 'organic', profession: 'therapist', audience_type: 'secular',
      program: 'biznes_therapy', interestedIn: ['p1'], status: 'laser',
      assigned_to: 'u3', created_at: '2025-01-18T11:00:00Z', updated_at: '2025-01-25T09:00:00Z',
      custom_fields: {}, score: 85, followUpAt: TODAY + 'T11:00:00Z',
      lastActivityAt: '2025-01-25T09:00:00Z', dealValue: 9800,
    },
    {
      id: 'l6', name: 'חיים ורד', phone: '050-7778888',
      source: 'whatsapp', profession: 'coach', audience_type: 'religious',
      program: 'biznes_therapy', interestedIn: ['p1', 'p2'], status: 'warmup',
      assigned_to: 'u3', created_at: '2025-01-20T13:00:00Z', updated_at: '2025-01-28T10:00:00Z',
      custom_fields: {}, score: 40, lastActivityAt: '2025-01-28T10:00:00Z', dealValue: 9800,
    },
    {
      id: 'l7', name: 'תמר אביב', phone: '052-0001111', email: 'tamar@example.com',
      source: 'referral', profession: 'psychologist', audience_type: 'secular',
      program: 'premium_coaching', interestedIn: ['p2'], status: 'lost',
      assigned_to: 'u2', created_at: '2025-01-08T08:00:00Z', updated_at: '2025-01-30T15:00:00Z',
      custom_fields: {}, score: 10, lastActivityAt: '2025-01-30T15:00:00Z',
    },
    {
      id: 'l8', name: 'דני אשר', phone: '054-2223333',
      source: 'facebook', profession: 'therapist', audience_type: 'haredi',
      program: 'biznes_therapy', interestedIn: ['p1'], status: 'no_answer',
      assigned_to: 'u3', created_at: '2025-01-25T09:00:00Z', updated_at: '2025-01-25T09:00:00Z',
      custom_fields: {}, score: 30, dealValue: 9800,
    },
  ],

  activities: [
    { id: 'a1', lead_id: 'l2', date: '2025-01-14T11:00:00Z', note: 'שיחת טלפון ראשונה — מתעניין בתוכנית', created_by: 'u2', type: 'call' },
    { id: 'a2', lead_id: 'l3', date: '2025-01-20T14:00:00Z', note: 'שיחת גילוי התקיימה — מוכן להמשיך',   created_by: 'u2', type: 'meeting' },
    { id: 'a3', lead_id: 'l4', date: new Date().toISOString(), note: 'שילם ונרשם לתוכנית!',               created_by: 'u3', type: 'note' },
    { id: 'a4', lead_id: 'l5', date: '2025-01-25T09:00:00Z', note: 'נשלחה הצעת מחיר',                    created_by: 'u3', type: 'email' },
    { id: 'a5', lead_id: 'l1', date: TODAY + 'T09:00:00Z',   note: 'ליד חדש נכנס מפייסבוק',              created_by: 'u2', type: 'note' },
  ],

  tasks: [
    { id: 't1', lead_id: 'l1', due_date: TODAY,    time: '09:00', note: 'ליצור קשר ולתאם שיחת גילוי',   assigned_to: 'u2', done: false, type: 'call'    },
    { id: 't2', lead_id: 'l5', due_date: TODAY,    time: '11:00', note: 'לעקוב אחרי פגישת הלייזר',       assigned_to: 'u3', done: false, type: 'call'    },
    { id: 't3', lead_id: 'l3', due_date: TOMORROW,               note: 'לשלוח הצעת מחיר',               assigned_to: 'u2', done: false, type: 'email'   },
    { id: 't4', lead_id: 'l6', due_date: TODAY,    time: '14:00', note: 'לבדוק אם קיבל החלטה',           assigned_to: 'u3', done: false, type: 'call'    },
    { id: 't5',                due_date: TODAY,    time: '10:00', note: 'פגישת צוות שבועית',             assigned_to: 'u1', done: false, type: 'meeting' },
    { id: 't6', lead_id: 'l8', due_date: TOMORROW,               note: 'לנסות שוב — לא ענה',            assigned_to: 'u3', done: false, type: 'call'    },
  ],

  clients: [
    {
      id: 'c1', leadId: 'l4', productId: 'p2', dealValue: 18000,
      closedAt: new Date().toISOString(), assignedTo: 'u1',
      onboardingProgress: { p2s1: true, p2s2: true, p2s3: false, p2s4: false, p2s5: false },
      customSteps: [], notes: 'לקוח חדש — נרשם היום!',
    },
  ],

  chatMessages: [
    {
      id: 'cm1', fromUserId: 'u1', toUserId: null,
      content: 'שלום צוות! 👋 מתחילים שבוע חדש — יאללה מכירות!',
      timestamp: TODAY + 'T08:00:00Z', readBy: ['u1'],
    },
    {
      id: 'cm2', fromUserId: 'u2', toUserId: null,
      content: 'בוקר טוב! אני כבר בשדה 💪',
      timestamp: TODAY + 'T08:15:00Z', readBy: ['u1', 'u2'],
    },
  ],

  pinnedNotes: [
    {
      id: 'pn1', userId: 'u1',
      content: '⚡ יעד החודש: 9 סגירות\nשרה: 5 | משה: 4',
      createdAt: TODAY + 'T07:00:00Z', color: 'yellow',
    },
    {
      id: 'pn2', userId: 'u1',
      content: '📞 זכור: להתקשר לחיים ורד אחרי 14:00',
      createdAt: TODAY + 'T09:00:00Z', color: 'blue',
    },
  ],

  automationRules: [
    {
      id: 'ar1', name: 'מעבר אוטומטי לקליטת לקוח', active: true,
      triggerType: 'status_change', triggerToStatus: 'won',
      actionType: 'move_to_client',
    },
    {
      id: 'ar2', name: 'משימה לליד חדש', active: true,
      triggerType: 'new_lead',
      actionType: 'create_task',
      actionTaskNote: 'צור קשר עם הליד החדש תוך 24 שעות',
      actionTaskDaysOffset: 1,
    },
    {
      id: 'ar3', name: 'פולואפ לליד ישן', active: true,
      triggerType: 'no_activity', triggerDaysIdle: 3,
      actionType: 'create_task',
      actionTaskNote: 'פולואפ חם — לא הייתה תנועה 3 ימים',
      actionTaskDaysOffset: 0,
    },
  ],
};
