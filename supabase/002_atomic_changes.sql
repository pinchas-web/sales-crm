-- Apply after a verified backup. No existing business rows are changed.
begin;
alter table public.leads add column if not exists archived boolean not null default false;
alter table public.courses add column if not exists archived boolean not null default false;
alter table public.lessons add column if not exists archived boolean not null default false;

-- Business data is accessed exclusively through authenticated server routes.
do $$ declare t text; begin
  foreach t in array array['crm_users','crm_config','leads','activities','tasks','clients',
    'chat_messages','pinned_notes','courses','lessons','content_items','marketing_knowledge','marketing_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

create or replace function public.crm_apply_changes(actor text, changes jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  change jsonb; old_row jsonb; new_row jsonb; current_row jsonb;
  typed_old jsonb; typed_new jsonb; projected jsonb;
  t text; row_id text; column_names text; assignments text;
  admin_user boolean; candidate jsonb; allowed boolean;
begin
  select role = 'admin' into admin_user from public.crm_users where crm_user_id = actor;
  if admin_user is null then raise exception 'Not approved' using errcode = '42501'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 5000 then
    raise exception 'Invalid changes' using errcode = '22023';
  end if;
  -- Serialize application writes. Every row comparison and write is one transaction.
  perform pg_advisory_xact_lock(781204103);
  for change in select value from jsonb_array_elements(changes) loop
    t := change->>'table';
    if t is null or t <> all(array['crm_config','leads','activities','tasks','clients',
      'chat_messages','pinned_notes','courses','lessons','content_items','marketing_knowledge','marketing_messages']) then
      raise exception 'Invalid table' using errcode = '22023';
    end if;
    old_row := nullif(change->'before', 'null'::jsonb);
    new_row := nullif(change->'after', 'null'::jsonb);
    row_id := coalesce(new_row->>'id', old_row->>'id');
    if row_id is null or (old_row is not null and new_row is not null and old_row->>'id' <> new_row->>'id') then
      raise exception 'Invalid row ID' using errcode = '22023';
    end if;
    execute format('select to_jsonb(r) from public.%I r where id::text = $1 for update', t)
      into current_row using row_id;

    -- Convert timestamps/numbers with the actual PostgreSQL row type before comparing.
    if old_row is not null then
      execute format('select to_jsonb(jsonb_populate_record(null::public.%I, $1))', t) into typed_old using old_row;
      select jsonb_object_agg(key, typed_old->key) into projected from jsonb_object_keys(old_row) key;
      if current_row is null or not current_row @> projected then
        raise exception 'Record changed; reload before saving' using errcode = '40001';
      end if;
    elsif current_row is not null then
      raise exception 'Record already exists' using errcode = '40001';
    end if;

    -- Check persisted ownership AND requested ownership. A supplied owner cannot steal a row.
    if not admin_user then
      for candidate in select value from jsonb_array_elements(jsonb_build_array(current_row, new_row)) where value <> 'null'::jsonb loop
        allowed := false;
        if t in ('leads','tasks') then allowed := candidate->>'assigned_to' = actor;
        elsif t = 'pinned_notes' then allowed := candidate->>'user_id' = actor;
        elsif t in ('activities','clients') then
          select exists(select 1 from public.leads where id = candidate->>'lead_id' and assigned_to = actor) into allowed;
        elsif t = 'chat_messages' then
          allowed := candidate->>'from_user_id' = actor;
        end if;
        if not coalesce(allowed,false) then raise exception 'Forbidden' using errcode = '42501'; end if;
      end loop;
    end if;
    if new_row is null then
      -- Preserve dependent records, including children added concurrently by an integration.
      if t in ('leads','courses','lessons') then
        execute format('update public.%I set archived = true where id::text = $1', t) using row_id;
      else
        execute format('delete from public.%I where id::text = $1', t) using row_id;
      end if;
    else
      execute format('select to_jsonb(jsonb_populate_record(null::public.%I, $1))', t) into typed_new using new_row;
      if exists(select 1 from jsonb_object_keys(new_row) k where not typed_new ? k) then
        raise exception 'Unknown field' using errcode = '22023';
      end if;
      select string_agg(format('%I',key), ', '), string_agg(format('%I = incoming.%I',key,key), ', ')
        into column_names, assignments from jsonb_object_keys(new_row) key;
      if current_row is null then
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', t,column_names,column_names,t) using new_row;
      else
        execute format('update public.%I target set %s from jsonb_populate_record(null::public.%I, $1) incoming where target.id::text = $2', t,assignments,t) using new_row,row_id;
      end if;
    end if;
  end loop;
  return jsonb_build_object('saved',true);
end $$;
revoke all on function public.crm_apply_changes(text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_apply_changes(text,jsonb) to service_role;
commit;
