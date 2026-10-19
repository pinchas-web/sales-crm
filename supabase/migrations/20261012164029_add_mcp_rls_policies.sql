-- Allow authenticated CRM users to access the small set of tables exposed by
-- the ChatGPT MCP server. The existing Vercel API uses the service-role key and
-- therefore continues to bypass these policies.

grant usage on schema public to authenticated;
grant select on table public.crm_users, public.crm_config to authenticated;
grant select, update on table public.leads, public.clients to authenticated;
grant select, insert on table public.activities, public.tasks to authenticated;

alter table public.crm_users enable row level security;
alter table public.crm_config enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.clients enable row level security;

create policy "crm_users_read_self"
on public.crm_users for select to authenticated
using (auth_user_id = (select auth.uid()));

create policy "crm_config_read_approved"
on public.crm_config for select to authenticated
using (
  exists (
    select 1 from public.crm_users
    where auth_user_id = (select auth.uid())
  )
);

create policy "leads_read_owned_or_admin"
on public.leads for select to authenticated
using (
  exists (
    select 1 from public.crm_users u
    where u.auth_user_id = (select auth.uid())
      and (u.role = 'admin' or u.crm_user_id = leads.assigned_to)
  )
);

create policy "leads_update_owned_or_admin"
on public.leads for update to authenticated
using (
  exists (
    select 1 from public.crm_users u
    where u.auth_user_id = (select auth.uid())
      and (u.role = 'admin' or u.crm_user_id = leads.assigned_to)
  )
)
with check (
  exists (
    select 1 from public.crm_users u
    where u.auth_user_id = (select auth.uid())
      and (u.role = 'admin' or u.crm_user_id = leads.assigned_to)
  )
);

create policy "activities_read_for_visible_lead"
on public.activities for select to authenticated
using (
  exists (
    select 1 from public.leads l
    where l.id = activities.lead_id
  )
);

create policy "activities_insert_for_visible_lead"
on public.activities for insert to authenticated
with check (
  exists (
    select 1 from public.leads l
    where l.id = activities.lead_id
  )
  and exists (
    select 1 from public.crm_users u
    where u.auth_user_id = (select auth.uid())
      and (u.role = 'admin' or u.crm_user_id = activities.created_by)
  )
);

create policy "tasks_read_owned_or_admin"
on public.tasks for select to authenticated
using (
  exists (
    select 1 from public.crm_users u
    where u.auth_user_id = (select auth.uid())
      and (u.role = 'admin' or u.crm_user_id = tasks.assigned_to)
  )
);

create policy "tasks_insert_owned_or_admin"
on public.tasks for insert to authenticated
with check (
  exists (
    select 1 from public.crm_users u
    where u.auth_user_id = (select auth.uid())
      and (u.role = 'admin' or u.crm_user_id = tasks.assigned_to)
  )
);

create policy "clients_read_owned_or_admin"
on public.clients for select to authenticated
using (
  exists (
    select 1 from public.crm_users u
    where u.auth_user_id = (select auth.uid())
      and (u.role = 'admin' or u.crm_user_id = clients.assigned_to)
  )
);

create policy "clients_update_owned_or_admin"
on public.clients for update to authenticated
using (
  exists (
    select 1 from public.crm_users u
    where u.auth_user_id = (select auth.uid())
      and (u.role = 'admin' or u.crm_user_id = clients.assigned_to)
  )
)
with check (
  exists (
    select 1 from public.crm_users u
    where u.auth_user_id = (select auth.uid())
      and (u.role = 'admin' or u.crm_user_id = clients.assigned_to)
  )
);
