-- Service notices and their admin-only history (GH-252).

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('incident', 'maintenance', 'whats_new')),
  title text not null check (char_length(btrim(title)) between 1 and 60),
  body text not null default '' check (char_length(body) <= 280),
  link text check (link ~ '^https://'),
  starts_at timestamptz,
  ends_at timestamptz,
  resolved_at timestamptz,
  resolution text check (char_length(resolution) between 1 and 280),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_page_ref text,
  status_page_sync text not null default 'ok' check (status_page_sync in ('ok', 'failed')),
  status_page_error text,
  check (
    (kind = 'maintenance' and starts_at is not null and ends_at is not null and ends_at > starts_at)
    or (kind <> 'maintenance')
  ),
  check ((resolved_at is null and resolution is null) or
    (kind = 'incident' and resolved_at is not null and resolution is not null))
);
create index notices_created_at_idx on public.notices (created_at desc);
create index notices_active_idx on public.notices (kind, resolved_at, ends_at, created_at desc);
alter table public.notices enable row level security;
revoke all on public.notices from public, anon, authenticated, app_service, game_engine;

create table private.notice_history (
  id bigint generated always as identity primary key,
  notice_id uuid not null references public.notices (id) on delete cascade,
  at timestamptz not null default now(),
  actor uuid not null,
  action text not null check (action in ('post', 'edit', 'resolve', 'sync')),
  revision integer not null check (revision > 0)
);
create index notice_history_notice_idx on private.notice_history (notice_id, at desc);
alter table private.notice_history enable row level security;
revoke all on private.notice_history from public, anon, authenticated, app_service, game_engine;

-- Extend the existing security audit allowlist for notice administration. The audit helper
-- catches its own errors, so a future deployment without the audit table can still use the
-- notice-specific history below.
alter table private.audit_log drop constraint audit_log_action_check;
alter table private.audit_log add constraint audit_log_action_check check (action in (
  'host_access_granted', 'host_access_removed', 'host_code_rotated',
  'account_created', 'guest_merged', 'password_changed', 'account_deleted', 'guests_deleted',
  'staff_access_granted', 'staff_access_revoked', 'staff_read',
  'qa_account_marked', 'qa_cleanup',
  'notice_posted', 'notice_edited', 'notice_resolved', 'notice_synced'
));

create function private.active_notices(at_time timestamptz default now())
returns table (
  id uuid, revision integer, kind text, phase text, title text, body text, link text,
  starts_at timestamptz, ends_at timestamptz, resolved_at timestamptz, resolution text
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.revision, n.kind,
    case
      when n.kind = 'incident' and n.resolved_at is not null then 'resolved'
      when n.kind = 'maintenance' and n.starts_at <= at_time then 'now'
      when n.kind = 'maintenance' then 'upcoming'
      else 'active'
    end,
    n.title, n.body, n.link, n.starts_at, n.ends_at, n.resolved_at, n.resolution
  from public.notices n
  where
    (n.kind = 'incident' and (n.resolved_at is null or n.resolved_at > at_time - interval '24 hours'))
    or (n.kind = 'maintenance' and n.created_at <= at_time and n.ends_at > at_time)
    or (n.kind = 'whats_new'
      and n.created_at > at_time - interval '14 days'
      and not exists (
        select 1 from public.notices newer
        where newer.kind = 'whats_new' and newer.created_at > n.created_at and newer.created_at <= at_time
      ))
  order by case n.kind when 'incident' then 1 when 'maintenance' then 2 else 3 end,
    n.created_at desc;
$$;
revoke all on function private.active_notices(timestamptz) from public, anon, app_service, game_engine;
grant execute on function private.active_notices(timestamptz) to authenticated;

create type private.admin_notice_row as (
  id uuid, revision integer, kind text, phase text, title text, body text, link text,
  starts_at timestamptz, ends_at timestamptz, resolved_at timestamptz, resolution text,
  status_page_ref text, status_page_sync text, status_page_error text, created_by uuid,
  history integer, created_at timestamptz, updated_at timestamptz
);

create function private.notice_admin_row(target uuid, at_time timestamptz default now())
returns setof private.admin_notice_row
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.revision, n.kind,
    case
      when n.kind = 'incident' and n.resolved_at is not null then 'resolved'
      when n.kind = 'maintenance' and n.starts_at <= at_time then 'now'
      when n.kind = 'maintenance' then 'upcoming'
      else 'active'
    end,
    n.title, n.body, n.link, n.starts_at, n.ends_at, n.resolved_at, n.resolution,
    n.status_page_ref, n.status_page_sync, n.status_page_error, n.created_by,
    (select count(*)::integer from private.notice_history h where h.notice_id = n.id),
    n.created_at, n.updated_at
  from public.notices n where n.id = target;
$$;
revoke all on function private.notice_admin_row(uuid, timestamptz)
  from public, anon, authenticated, app_service, game_engine;

create function private.admin_post_notice(
  notice_kind text, notice_title text, notice_body text, notice_link text default null,
  notice_starts_at timestamptz default null, notice_ends_at timestamptz default null
)
returns setof private.admin_notice_row
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  notice_id uuid;
begin
  perform private.require_admin();
  insert into public.notices (kind, title, body, link, starts_at, ends_at, created_by)
  values (notice_kind, btrim(notice_title), coalesce(notice_body, ''), notice_link,
    notice_starts_at, notice_ends_at, caller)
  returning id into notice_id;
  insert into private.notice_history (notice_id, actor, action, revision)
  values (notice_id, caller, 'post', 1);
  perform private.audit('notice_posted', 'system', notice_id,
    jsonb_build_object('kind', notice_kind, 'revision', 1));
  return query select * from private.notice_admin_row(notice_id);
end;
$$;
revoke all on function private.admin_post_notice(text, text, text, text, timestamptz, timestamptz) from public;
grant execute on function private.admin_post_notice(text, text, text, text, timestamptz, timestamptz) to authenticated;

create function private.admin_edit_notice(notice_id uuid, patch jsonb)
returns setof private.admin_notice_row
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  next_revision integer;
begin
  perform private.require_admin();
  if patch is null or patch = '{}'::jsonb or patch - array['title','body','link','startsAt','endsAt'] <> '{}'::jsonb then
    raise exception 'invalid notice edit' using errcode = '22023';
  end if;
  update public.notices n set
    title = case when patch ? 'title' then btrim(patch->>'title') else n.title end,
    body = case when patch ? 'body' then coalesce(patch->>'body', '') else n.body end,
    link = case when patch ? 'link' then nullif(patch->>'link', '') else n.link end,
    starts_at = case when patch ? 'startsAt' then (patch->>'startsAt')::timestamptz else n.starts_at end,
    ends_at = case when patch ? 'endsAt' then (patch->>'endsAt')::timestamptz else n.ends_at end,
    revision = n.revision + 1,
    updated_at = now()
  where n.id = notice_id
  returning revision into next_revision;
  if not found then
    raise no_data_found;
  end if;
  insert into private.notice_history (notice_id, actor, action, revision)
  values (notice_id, caller, 'edit', next_revision);
  perform private.audit('notice_edited', 'system', notice_id,
    jsonb_build_object('revision', next_revision));
  return query select * from private.notice_admin_row(notice_id);
end;
$$;
revoke all on function private.admin_edit_notice(uuid, jsonb) from public;
grant execute on function private.admin_edit_notice(uuid, jsonb) to authenticated;

create function private.admin_resolve_notice(notice_id uuid, closing_line text)
returns setof private.admin_notice_row
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  next_revision integer;
  notice_kind text;
begin
  perform private.require_admin();
  select n.kind into notice_kind from public.notices n where n.id = notice_id for update;
  if not found then raise no_data_found; end if;
  if notice_kind <> 'incident' then
    raise exception 'not an incident' using errcode = 'SCH03';
  end if;
  if char_length(btrim(coalesce(closing_line, ''))) not between 1 and 280 then
    raise exception 'invalid resolution' using errcode = '22023';
  end if;
  update public.notices n set resolved_at = now(), resolution = btrim(closing_line),
    revision = n.revision + 1, updated_at = now()
  where n.id = notice_id returning revision into next_revision;
  insert into private.notice_history (notice_id, actor, action, revision)
  values (notice_id, caller, 'resolve', next_revision);
  perform private.audit('notice_resolved', 'system', notice_id,
    jsonb_build_object('revision', next_revision));
  return query select * from private.notice_admin_row(notice_id);
end;
$$;
revoke all on function private.admin_resolve_notice(uuid, text) from public;
grant execute on function private.admin_resolve_notice(uuid, text) to authenticated;

create function private.admin_set_notice_sync(
  notice_id uuid, provider_ref text, sync_status text, sync_error text
)
returns setof private.admin_notice_row
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  current_revision integer;
begin
  perform private.require_admin();
  if sync_status not in ('ok', 'failed') then
    raise exception 'invalid sync status' using errcode = '22023';
  end if;
  update public.notices n set
    status_page_ref = coalesce(nullif(provider_ref, ''), n.status_page_ref),
    status_page_sync = sync_status,
    status_page_error = case when sync_status = 'failed' then sync_error else null end,
    updated_at = now()
  where n.id = notice_id returning revision into current_revision;
  if not found then raise no_data_found; end if;
  insert into private.notice_history (notice_id, actor, action, revision)
  values (notice_id, caller, 'sync', current_revision);
  perform private.audit('notice_synced', 'system', notice_id,
    jsonb_build_object('revision', current_revision, 'status', sync_status));
  return query select * from private.notice_admin_row(notice_id);
end;
$$;
revoke all on function private.admin_set_notice_sync(uuid, text, text, text) from public;
grant execute on function private.admin_set_notice_sync(uuid, text, text, text) to authenticated;

create function private.admin_notices(p_days integer default 30)
returns setof private.admin_notice_row
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'invalid days' using errcode = '22023';
  end if;
  return query
    select row.* from public.notices n
    cross join lateral private.notice_admin_row(n.id) row
    where n.created_at >= now() - make_interval(days => p_days)
    order by n.created_at desc;
end;
$$;
revoke all on function private.admin_notices(integer) from public;
grant execute on function private.admin_notices(integer) to authenticated;
