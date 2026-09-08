begin;
create table if not exists public.google_connections (
  owner text primary key references public.crm_users(crm_user_id) on delete cascade,
  token text not null,
  calendar_id text,
  updated_at timestamptz not null default now()
);
create table if not exists public.google_oauth_states (
  id text primary key,
  owner text not null references public.crm_users(crm_user_id) on delete cascade,
  verifier text not null,
  expires_at timestamptz not null
);
alter table public.google_connections enable row level security;
alter table public.google_oauth_states enable row level security;
revoke all on public.google_connections, public.google_oauth_states from anon,authenticated;
grant all on public.google_connections, public.google_oauth_states to service_role;
commit;
