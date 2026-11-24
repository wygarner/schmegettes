-- Guest cleanup (GH-248): guests unused for 90 days are deleted daily by pg_cron, inside the
-- database, so no credential lives outside it. Deletion is the existing rule
-- (`delete from auth.users`, as private.delete_account does); the foreign keys do the rest.
-- See docs/system-docs/operations/data-retention.md.
-- Compatible with running code: new objects only.

create extension if not exists pg_cron with schema pg_catalog;

-- Last-used checks and the `set null` on delete both look games up by host.
create index if not exists games_host_user_idx on public.games (host_user_id);

-- One row per run: counts and durations only, never ids.
create table private.cleanup_runs (
  id bigint generated always as identity primary key,
  run_at timestamptz not null default now(),
  deleted integer not null default 0,
  duration_ms integer not null default 0,
  error text
);
create index cleanup_runs_run_at_idx on private.cleanup_runs (run_at desc);
alter table private.cleanup_runs enable row level security;
revoke all on private.cleanup_runs from public, anon, authenticated, app_service, game_engine;

-- The latest sign-in, token refresh, room join, game joined, or game hosted; the account's
-- creation is the floor. A visit refreshes the token, so each visit resets the clock.
create function private.guest_last_used(uid uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    u.created_at,
    u.last_sign_in_at,
    -- refreshed_at has no time zone; Supabase Auth writes UTC.
    (select max(greatest(s.refreshed_at at time zone 'UTC', s.updated_at)) from auth.sessions s where s.user_id = u.id),
    (select max(m.joined_at) from public.room_members m where m.user_id = u.id),
    (select max(gp.joined_at) from public.game_players gp where gp.user_id = u.id),
    (select max(g.started_at) from public.games g where g.host_user_id = u.id)
  )
  from auth.users u
  where u.id = uid;
$$;
revoke all on function private.guest_last_used(uuid) from public, anon, authenticated, app_service, game_engine;

-- Whether a user is in a room that isn't closed, or in a game in progress (as a player or
-- its host). Such a user is never deleted.
create function private.user_is_active(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.room_members m join public.rooms r on r.id = m.room_id
           where m.user_id = uid and r.status <> 'closed')
      or exists (select 1 from public.rooms r where r.host_id = uid and r.status <> 'closed')
      or exists (
           select 1 from public.game_players gp join public.games g on g.id = gp.game_id
           where gp.user_id = uid and g.status = 'in_progress')
      or exists (select 1 from public.games g where g.host_user_id = uid and g.status = 'in_progress');
$$;
revoke all on function private.user_is_active(uuid) from public, anon, authenticated, app_service, game_engine;

-- Guests last used before `cutoff` and not active, oldest first.
create function private.eligible_guests(cutoff timestamptz, max_rows integer)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.is_anonymous
    and private.guest_last_used(u.id) < cutoff
    and not private.user_is_active(u.id)
  order by u.created_at, u.id
  limit max_rows;
$$;
revoke all on function private.eligible_guests(timestamptz, integer)
  from public, anon, authenticated, app_service, game_engine;

-- Deletes up to 20 batches of 500 eligible guests, records the run, audits the count, and
-- returns it. Eligibility is checked again in the delete itself, so a guest who joins a room
-- between selection and delete is kept. A failure is recorded in cleanup_runs (and nothing is
-- deleted) instead of failing the cron job silently.
-- Requires private.audit (20261121143107_audit_and_staff_access.sql).
create function private.delete_unused_guests(cutoff timestamptz default now() - interval '90 days')
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  started timestamptz := clock_timestamp();
  total integer := 0;
  batch integer;
begin
  begin
    for i in 1..20 loop
      with gone as (
        delete from auth.users u
        where u.id in (select private.eligible_guests(delete_unused_guests.cutoff, 500))
          and u.is_anonymous
          and private.guest_last_used(u.id) < delete_unused_guests.cutoff
          and not private.user_is_active(u.id)
        returning 1
      )
      select count(*) into batch from gone;
      total := total + batch;
      exit when batch < 500;
    end loop;
  exception when others then
    -- The message names the failure, never a row (no DETAIL, which can carry key values).
    insert into private.cleanup_runs (deleted, duration_ms, error)
    values (0, (extract(epoch from clock_timestamp() - started) * 1000)::integer, sqlstate || ': ' || sqlerrm);
    raise warning 'guest cleanup failed: %', sqlstate;
    return 0;
  end;

  insert into private.cleanup_runs (deleted, duration_ms)
  values (total, (extract(epoch from clock_timestamp() - started) * 1000)::integer);
  perform private.audit('guests_deleted', 'system', null, jsonb_build_object('count', total));
  raise log 'guests deleted: %', total;
  return total;
end;
$$;
-- Only pg_cron (as the owner) and tests run it.
revoke all on function private.delete_unused_guests(timestamptz)
  from public, anon, authenticated, app_service, game_engine;

-- The last 30 runs, newest first (api GET /v1/admin/cleanup-runs).
create function private.admin_cleanup_runs()
returns setof private.cleanup_runs
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select * from private.cleanup_runs order by run_at desc, id desc limit 30;
end;
$$;
revoke all on function private.admin_cleanup_runs() from public;
grant execute on function private.admin_cleanup_runs() to authenticated;

-- Daily at 04:17 UTC, outside US game nights. Re-running the migration replaces the job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete-unused-guests') then
    perform cron.unschedule('delete-unused-guests');
  end if;
  perform cron.schedule('delete-unused-guests', '17 4 * * *', 'select private.delete_unused_guests()');
end;
$$;
