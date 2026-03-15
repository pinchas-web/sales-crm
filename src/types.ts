/**
 * הגדרות הטיפוסים המרכזיות של המערכת.
 * כל ישות (ליד, משתמש, משימה, מוצר, לקוח, הודעה...) מוגדרת כאן.
 * שינוי כאן משפיע על כל האפליקציה — כולל PHP ב-WordPress.
 */

// ─── Core Entities ────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'salesperson';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  commissionRate: number;        // 0.10 = 10%
  email?: string;                // מייל לזיהוי מול Supabase Auth
}

export interface Status {
  id: string;
  label: string;
  color: string;
  textColor: string;
  isFinal: boolean;
  isWon?: boolean;
  order: number;
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

export interface CustomField {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: string[];
  hidden: boolean;
  order: number;
}

export interface DropdownOptions {
  sources: string[];
  professions: string[];
  audience_types: string[];
  programs: string[];
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: string;
  sourceCampaign?: string;
  profession: string;
  audience_type: string;
  program: string;               // kept for compat
  interestedIn: string[];        // product IDs
  status: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
  custom_fields: Record<string, string | number | boolean>;
  followUpAt?: string;           // ISO datetime — next follow-up
  score: number;                 // 0-100 auto-calculated
  lastActivityAt?: string;       // ISO datetime of last activity/note
  dealValue?: number;            // ₪ expected deal value
}

export interface Activity {
  id: string;
  lead_id: string;
  date: string;
  note: string;
  created_by: string;
  type: 'note' | 'call' | 'email' | 'whatsapp' | 'meeting';
}

export interface Task {
  id: string;
  lead_id?: string;
  due_date: string;
  time?: string;                 // HH:MM
  note: string;
  assigned_to: string;
  done: boolean;
  type?: 'note' | 'call' | 'email' | 'whatsapp' | 'meeting';
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface ProductTestimonial {
  id: string;
  name: string;
  phone: string;
  note?: string;
}

export interface OnboardingStep {
  id: string;
  title: string;
  description?: string;
  order: number;
  defaultAssigneeRole?: UserRole;
}

export interface Product {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  price: number;
  category: string;
  imageDataUrl?: string;         // base64 stored in localStorage
  syllabusText?: string;
  contractText?: string;
  testimonials: ProductTestimonial[];
  onboardingSteps: OnboardingStep[];
  active: boolean;
  createdAt: string;
}

// ─── Clients (post-sale) ──────────────────────────────────────────────────────

export interface Client {
  id: string;
  leadId: string;
  productId: string;
  dealValue: number;
  closedAt: string;
  assignedTo: string;            // who manages onboarding
  onboardingProgress: Record<string, boolean>; // stepId → done
  customSteps: OnboardingStep[]; // manually added steps
  notes?: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  fromUserId: string;
  toUserId: string | null;       // null = broadcast to all
  content: string;
  timestamp: string;
  readBy: string[];              // userIds who read it
}

// ─── Pinned Notes ─────────────────────────────────────────────────────────────

export type NoteColor = 'yellow' | 'blue' | 'pink' | 'green' | 'purple';

export interface PinnedNote {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  color: NoteColor;
}

// ─── Automations ──────────────────────────────────────────────────────────────

export type AutomationTriggerType = 'status_change' | 'new_lead' | 'no_activity';

export interface AutomationRule {
  id: string;
  name: string;
  active: boolean;
  triggerType: AutomationTriggerType;
  triggerFromStatus?: string;
  triggerToStatus?: string;
  triggerDaysIdle?: number;
  actionType: 'create_task' | 'move_to_client' | 'open_whatsapp';
  actionTaskNote?: string;
  actionTaskDaysOffset?: number;
  actionWhatsappMessage?: string;
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

export interface NavTabConfig {
  id: string;
  visible: boolean;
  order: number;
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface AppState {
  // entities
  users: User[];
  statuses: Status[];
  leads: Lead[];
  activities: Activity[];
  tasks: Task[];
  products: Product[];
  clients: Client[];
  chatMessages: ChatMessage[];
  pinnedNotes: PinnedNote[];
  automationRules: AutomationRule[];
  // config
  dropdownOptions: DropdownOptions;
  customFields: CustomField[];
  currentUserId: string;
  tableColumnPrefs: Record<string, boolean>;
  salesTargets: Record<string, number>;
  labels: Record<string, string>;
  navConfig: NavTabConfig[];
  dailySummaryEmail: string;
}
