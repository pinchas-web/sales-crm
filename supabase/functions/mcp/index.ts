/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase Edge middleware injects a runtime client without exported generics. */

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0'
import { pipeline } from 'npm:@supabase/middleware@1'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1'
import { z } from 'npm:zod@^4.3.6'

type SupabaseClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: Error | null }> }
  from: (table: string) => any
}

type CrmUser = {
  auth_user_id: string
  crm_user_id: string
  email: string
  role: 'admin' | 'salesperson'
}

const textResult = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value as Record<string, unknown>,
})

const errorResult = (message: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: message }],
})

async function currentCrmUser(supabase: SupabaseClient): Promise<CrmUser> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) throw new Error('לא נמצא משתמש מחובר')

  const { data, error } = await supabase
    .from('crm_users')
    .select('auth_user_id, crm_user_id, email, role')
    .eq('auth_user_id', authData.user.id)
    .single()

  if (error || !data) throw new Error('המשתמש המחובר אינו מאושר ב-CRM')
  return data as CrmUser
}

async function crmConfig(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('crm_config')
    .select('users, statuses, products')
    .limit(1)
    .single()
  if (error) throw error
  return data as {
    users: Array<{ id: string; name: string }>
    statuses: Array<{ id: string; label: string; isFinal: boolean; isWon?: boolean }>
    products: Array<{
      id: string
      name: string
      active: boolean
      onboardingSteps?: Array<{ id: string; title: string; description?: string; order: number }>
    }>
  }
}

function registerCrmTools(server: McpServer, supabase: SupabaseClient) {
  server.registerTool(
    'get_profile',
    {
      title: 'פרטי המשתמש המחובר',
      description: 'מחזיר את זהות משתמש ה-CRM המחובר ואת תפקידו.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { 'openai/profile': true },
    },
    async () => {
      try {
        const user = await currentCrmUser(supabase)
        const config = await crmConfig(supabase)
        return textResult({
          crmUserId: user.crm_user_id,
          email: user.email,
          role: user.role,
          name: config.users.find((item) => item.id === user.crm_user_id)?.name ?? user.email,
        })
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : 'שגיאה בקריאת המשתמש')
      }
    },
  )

  server.registerTool(
    'list_active_leads',
    {
      title: 'רשימת לידים פעילים',
      description: 'מחזיר לידים שאינם בסטטוס סופי. אפשר לסנן לפי חיפוש חופשי או להגביל כמות.',
      inputSchema: {
        search: z.string().trim().min(1).optional().describe('שם, טלפון או אימייל לחיפוש'),
        limit: z.number().int().min(1).max(100).default(50),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ search, limit }) => {
      try {
        const config = await crmConfig(supabase)
        const finalStatuses = config.statuses.filter((status) => status.isFinal).map((status) => status.id)
        let query = supabase
          .from('leads')
          .select('id, name, phone, email, status, assigned_to, interested_in, follow_up_at, score, last_activity_at, deal_value, updated_at')
          .order('updated_at', { ascending: false })
          .limit(limit)
        if (finalStatuses.length) query = query.not('status', 'in', `(${finalStatuses.join(',')})`)
        if (search) {
          const safe = search.replace(/[,%()]/g, '')
          query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
        }
        const { data, error } = await query
        if (error) throw error

        const statusNames = Object.fromEntries(config.statuses.map((status) => [status.id, status.label]))
        const userNames = Object.fromEntries(config.users.map((user) => [user.id, user.name]))
        const productNames = Object.fromEntries(config.products.map((product) => [product.id, product.name]))
        const leads = (data ?? []).map((lead: any) => ({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          status: lead.status,
          statusLabel: statusNames[lead.status] ?? lead.status,
          assignedTo: lead.assigned_to,
          assignedToName: userNames[lead.assigned_to] ?? lead.assigned_to,
          interestedIn: (lead.interested_in ?? []).map((id: string) => productNames[id] ?? id),
          followUpAt: lead.follow_up_at,
          score: lead.score,
          lastActivityAt: lead.last_activity_at,
          dealValue: lead.deal_value,
          updatedAt: lead.updated_at,
        }))
        return textResult({ count: leads.length, leads })
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : 'שגיאה בקריאת הלידים')
      }
    },
  )

  server.registerTool(
    'get_lead',
    {
      title: 'פרטי ליד',
      description: 'מחזיר ליד לפי מזהה או שם, כולל הפעילויות והמשימות האחרונות שלו.',
      inputSchema: {
        leadId: z.string().trim().min(1).optional(),
        name: z.string().trim().min(1).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ leadId, name }) => {
      try {
        if (!leadId && !name) return errorResult('יש לספק leadId או name')
        let query = supabase.from('leads').select('*').limit(5)
        query = leadId ? query.eq('id', leadId) : query.ilike('name', `%${name}%`)
        const { data: leads, error } = await query
        if (error) throw error
        if (!leads?.length) return textResult({ found: false })
        if (leads.length > 1) {
          return textResult({ found: true, ambiguous: true, matches: leads.map((lead: any) => ({ id: lead.id, name: lead.name, phone: lead.phone })) })
        }
        const lead = leads[0]
        const [{ data: activities, error: activitiesError }, { data: tasks, error: tasksError }] = await Promise.all([
          supabase.from('activities').select('*').eq('lead_id', lead.id).order('date', { ascending: false }).limit(20),
          supabase.from('tasks').select('*').eq('lead_id', lead.id).order('due_date', { ascending: true }).limit(20),
        ])
        if (activitiesError) throw activitiesError
        if (tasksError) throw tasksError
        return textResult({ found: true, lead, recentActivities: activities ?? [], tasks: tasks ?? [] })
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : 'שגיאה בקריאת הליד')
      }
    },
  )

  server.registerTool(
    'list_followups',
    {
      title: 'פולואפים ומשימות',
      description: 'מחזיר משימות פתוחות ופולואפים של לידים עד תאריך נתון.',
      inputSchema: {
        throughDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('תאריך אחרון בפורמט YYYY-MM-DD'),
        limit: z.number().int().min(1).max(100).default(50),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ throughDate, limit }) => {
      try {
        const [{ data: tasks, error: tasksError }, { data: leads, error: leadsError }] = await Promise.all([
          supabase.from('tasks').select('*').eq('done', false).lte('due_date', throughDate).order('due_date').limit(limit),
          supabase.from('leads').select('id, name, phone, status, follow_up_at').not('follow_up_at', 'is', null).lte('follow_up_at', `${throughDate}T23:59:59.999Z`).order('follow_up_at').limit(limit),
        ])
        if (tasksError) throw tasksError
        if (leadsError) throw leadsError
        return textResult({ throughDate, openTasks: tasks ?? [], leadFollowUps: leads ?? [] })
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : 'שגיאה בקריאת הפולואפים')
      }
    },
  )

  server.registerTool(
    'list_active_clients',
    {
      title: 'לקוחות פעילים וקליטה',
      description: 'מחזיר לקוחות ותמונת מצב של התקדמות הקליטה שלהם.',
      inputSchema: { limit: z.number().int().min(1).max(100).default(50) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit }) => {
      try {
        const config = await crmConfig(supabase)
        const { data: clients, error } = await supabase.from('clients').select('*').order('closed_at', { ascending: false }).limit(limit)
        if (error) throw error
        const leadIds = (clients ?? []).map((client: any) => client.lead_id).filter(Boolean)
        const { data: leads, error: leadsError } = leadIds.length
          ? await supabase.from('leads').select('id, name, phone, email').in('id', leadIds)
          : { data: [], error: null }
        if (leadsError) throw leadsError
        const leadMap = Object.fromEntries((leads ?? []).map((lead: any) => [lead.id, lead]))
        const productMap = Object.fromEntries(config.products.map((product) => [product.id, product]))
        const result = (clients ?? []).map((client: any) => {
          const product = productMap[client.product_id]
          const steps = product?.onboardingSteps ?? []
          const completed = steps.filter((step) => client.onboarding_progress?.[step.id]).length
          return {
            ...client,
            lead: leadMap[client.lead_id] ?? null,
            productName: product?.name ?? client.product_id,
            onboarding: { completed, total: steps.length, progress: client.onboarding_progress },
          }
        })
        return textResult({ count: result.length, clients: result })
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : 'שגיאה בקריאת הלקוחות')
      }
    },
  )

  server.registerTool(
    'get_onboarding_process',
    {
      title: 'שלבי קליטת לקוח',
      description: 'מחזיר את שלבי הקליטה המוגדרים למוצר או לתוכנית לפי שם.',
      inputSchema: { product: z.string().trim().min(1).describe('שם מלא או חלקי של המוצר') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ product }) => {
      try {
        const config = await crmConfig(supabase)
        const normalized = product.toLocaleLowerCase('he-IL')
        const matches = config.products.filter((item) => item.name.toLocaleLowerCase('he-IL').includes(normalized))
        if (!matches.length) return textResult({ found: false, availableProducts: config.products.map((item) => item.name) })
        return textResult({
          found: true,
          products: matches.map((item) => ({
            id: item.id,
            name: item.name,
            active: item.active,
            steps: [...(item.onboardingSteps ?? [])].sort((a, b) => a.order - b.order),
          })),
        })
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : 'שגיאה בקריאת תהליך הקליטה')
      }
    },
  )

  server.registerTool(
    'add_activity',
    {
      title: 'הוספת פעילות לליד',
      description: 'כותב ב-CRM שיחה, פגישה, אימייל, ווטסאפ או הערה לליד. הפעל רק אחרי בקשה מפורשת ואישור המשתמש.',
      inputSchema: {
        leadId: z.string().trim().min(1),
        note: z.string().trim().min(1).max(4000),
        type: z.enum(['note', 'call', 'email', 'whatsapp', 'meeting']).default('note'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ leadId, note, type }) => {
      try {
        const user = await currentCrmUser(supabase)
        const activity = { id: crypto.randomUUID(), lead_id: leadId, date: new Date().toISOString(), note, type, created_by: user.crm_user_id }
        const { data, error } = await supabase.from('activities').insert(activity).select().single()
        if (error) throw error
        await supabase.from('leads').update({ last_activity_at: activity.date, updated_at: activity.date }).eq('id', leadId)
        return textResult({ created: true, activity: data })
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : 'שגיאה בהוספת הפעילות')
      }
    },
  )

  server.registerTool(
    'create_task',
    {
      title: 'יצירת משימת המשך',
      description: 'יוצר משימה ב-CRM. הפעל רק אחרי בקשה מפורשת ואישור המשתמש.',
      inputSchema: {
        note: z.string().trim().min(1).max(1000),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        leadId: z.string().trim().min(1).optional(),
        assignedTo: z.string().trim().min(1).optional().describe('מזהה משתמש CRM; ברירת המחדל היא המשתמש המחובר'),
        type: z.enum(['note', 'call', 'email', 'whatsapp', 'meeting']).default('note'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ note, dueDate, time, leadId, assignedTo, type }) => {
      try {
        const user = await currentCrmUser(supabase)
        const task = { id: crypto.randomUUID(), lead_id: leadId ?? null, due_date: dueDate, time: time ?? null, note, assigned_to: assignedTo ?? user.crm_user_id, done: false, type }
        const { data, error } = await supabase.from('tasks').insert(task).select().single()
        if (error) throw error
        return textResult({ created: true, task: data })
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : 'שגיאה ביצירת המשימה')
      }
    },
  )

  server.registerTool(
    'update_lead',
    {
      title: 'עדכון ליד',
      description: 'מעדכן סטטוס, פולואפ, ציון או ערך עסקה של ליד. הפעל רק אחרי בקשה מפורשת ואישור המשתמש.',
      inputSchema: {
        leadId: z.string().trim().min(1),
        status: z.string().trim().min(1).optional(),
        followUpAt: z.string().datetime({ offset: true }).nullable().optional(),
        score: z.number().int().min(0).max(100).optional(),
        dealValue: z.number().min(0).nullable().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ leadId, status, followUpAt, score, dealValue }) => {
      try {
        const changes: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (status !== undefined) changes.status = status
        if (followUpAt !== undefined) changes.follow_up_at = followUpAt
        if (score !== undefined) changes.score = score
        if (dealValue !== undefined) changes.deal_value = dealValue
        if (Object.keys(changes).length === 1) return errorResult('לא סופק שדה לעדכון')
        const { data, error } = await supabase.from('leads').update(changes).eq('id', leadId).select().single()
        if (error) throw error
        return textResult({ updated: true, lead: data })
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : 'שגיאה בעדכון הליד')
      }
    },
  )

  server.registerTool(
    'set_onboarding_step',
    {
      title: 'עדכון שלב קליטת לקוח',
      description: 'מסמן שלב קליטה כבוצע או כלא בוצע. הפעל רק אחרי בקשה מפורשת ואישור המשתמש.',
      inputSchema: {
        clientId: z.string().trim().min(1),
        stepId: z.string().trim().min(1),
        done: z.boolean(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ clientId, stepId, done }) => {
      try {
        const { data: current, error: readError } = await supabase.from('clients').select('onboarding_progress').eq('id', clientId).single()
        if (readError) throw readError
        const onboardingProgress = { ...(current.onboarding_progress ?? {}), [stepId]: done }
        const { data, error } = await supabase.from('clients').update({ onboarding_progress: onboardingProgress }).eq('id', clientId).select().single()
        if (error) throw error
        return textResult({ updated: true, client: data })
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : 'שגיאה בעדכון שלב הקליטה')
      }
    },
  )
}

Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase({ auth: 'user' })],
    async (request, context) => {
      const supabase = context.supabase as SupabaseClient
      const handler = createMcpHandler(
        () => {
          const server = new McpServer(
            { name: 'הבית למטפלים ומאמנים CRM', version: '1.0.0' },
            {
              instructions:
                'כלי CRM פרטיים. מותר לקרוא מידע לפי בקשת המשתמש. לפני כלי כתיבה יש לתאר במדויק את השינוי ולקבל אישור מפורש של המשתמש; אין לבצע כתיבה יזומה.',
            },
          )
          registerCrmTools(server, supabase)
          return server
        },
      )
      return handler.fetch(request)
    },
  ),
)
