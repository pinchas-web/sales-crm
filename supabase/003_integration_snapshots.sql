begin;
create table if not exists public.integration_snapshots (
  provider text primary key,
  payload jsonb not null default '{}',
  record_count integer not null default 0,
  synced_at timestamptz not null default now()
);
alter table public.integration_snapshots enable row level security;
revoke all on public.integration_snapshots from anon,authenticated;
grant all on public.integration_snapshots to service_role;
commit;
