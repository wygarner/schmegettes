-- Audit log, time-limited staff access, and admin account deletion (GH-245).
-- Compatible with the code already running: new tables and functions, replaced functions keep
-- their signatures and grants, and the triggers on auth.users only add audit rows.

-- Append-only. Nobody but the owner can read, update, or delete it; rows are written only
-- by private.audit (security definer).
create table private.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null check (action in (
    'host_access_granted', 'host_access_removed', 'host_code_rotated',
    'account_created', 'guest_merged', 'password_changed', 'account_deleted', 'guests_deleted',
    'staff_access_granted', 'staff_access_revoked', 'staff_read'
  )),
  subject_type text check (subject_type in ('user', 'room', 'game', 'system')),
  subject_id uuid,
  request_id text,
  details jsonb not null default '{}'
);
create index audit_log_at_idx on private.audit_log (at desc);
create index audit_log_subject_idx on private.audit_log (subject_id, at desc);
alter table private.audit_log enable row level security;
revoke all on private.audit_log from public, anon, authenticated, app_service, game_engine;

-- One admin's read access to one subject, until expires_at or revoked_at.
create table private.staff_grants (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users (id) on delete cascade,
  subject_type text not null check (subject_type in ('user', 'room', 'game')),
  subject_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '8 hours')
);
create index staff_grants_admin_idx on private.staff_grants (admin_id, created_at desc);
alter table private.staff_grants enable row level security;
revoke all on private.staff_grants from public, anon, authenticated, app_service, game_engine;

-- Writes one audit row. The actor is the caller (auth.uid()), or `actor` from a trusted caller
-- (triggers, game_engine) when there is no JWT. The request id is what golib/db sets per
-- transaction. A failed write never fails the action: it raises a WARNING that golib/db logs
-- as ERROR "audit write failed", which observability alerts on.
create function private.audit(
  action text,
  subject_type text,
  subject_id uuid,
  details jsonb default '{}',
  actor uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  begin
    insert into private.audit_log (actor, action, subject_type, subject_id, request_id, details)
    values (
      coalesce((select auth.uid()), audit.actor),
      audit.action,
      audit.subject_type,
      audit.subject_id,
      nullif(current_setting('request.id', true), ''),
      coalesce(audit.details, '{}')
    );
  exception when others then
    -- golib/db parses this line; keep the format.
    raise warning 'audit write failed: action=% sqlstate=% request_id=%',
      audit.action, sqlstate, coalesce(nullif(current_setting('request.id', true), ''), '-');
  end;
end;
$$;
revoke all on function private.audit(text, text, uuid, jsonb, uuid)
  from public, anon, authenticated, app_service, game_engine;
grant execute on function private.audit(text, text, uuid, jsonb, uuid) to game_engine;

-- Account created (new sign-up, or a guest becoming an account) and password changed.
-- Never lets sign-in, sign-up, or a password change fail.
create function private.audit_trigger_auth_users()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- The role that made the change: supabase_auth_admin for Supabase Auth, postgres for the
  -- SQL editor (the admin's password reset). current_user is the definer here.
  via text := case when current_setting('role') <> 'none' then current_setting('role') else session_user end;
begin
  begin
    if tg_op = 'INSERT' then
      if not coalesce(new.is_anonymous, false) then
        perform private.audit('account_created', 'user', new.id, '{}', new.id);
      end if;
    else
      if coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false) then
        perform private.audit('account_created', 'user', new.id, '{}', new.id);
      end if;
      if new.encrypted_password is distinct from old.encrypted_password then
        perform private.audit('password_changed', 'user', new.id,
          case when (select auth.uid()) is null then jsonb_build_object('via', via) else '{}' end);
      end if;
    end if;
  exception when others then
    raise warning 'audit write failed: action=% sqlstate=% request_id=%', 'auth_users_trigger', sqlstate, '-';
  end;
  return null;
end;
$$;
revoke all on function private.audit_trigger_auth_users()
  from public, anon, authenticated, app_service, game_engine;

create trigger audit_account_created
  after insert on auth.users
  for each row when (not coalesce(new.is_anonymous, false))
  execute function private.audit_trigger_auth_users();
create trigger audit_account_updated
  after update of is_anonymous, encrypted_password on auth.users
  for each row when (
    (coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false))
    or new.encrypted_password is distinct from old.encrypted_password
  )
  execute function private.audit_trigger_auth_users();

-- Bodies below are copied from 20261117225224_host_code_rotation.sql and
-- 20261110180920_accounts.sql with audit calls added. Signatures and grants are unchanged.

create or replace function private.redeem_host_code(candidate text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cleaned text := upper(regexp_replace(coalesce(candidate, ''), '[\s-]', '', 'g'));
  state private.host_code_rotation;
  t timestamptz := clock_timestamp();
  accepted text;
begin
  if caller is null then
    return false;
  end if;
  perform private.advance_host_code(t);
  select * into strict state from private.host_code_rotation where singleton;
  if cleaned = state.current_code and t < state.rotates_at then
    accepted := state.current_code;
  elsif cleaned = state.previous_code and t < state.previous_valid_until then
    accepted := state.previous_code;
  else
    return false;
  end if;

  insert into public.hosts (user_id, code) values (caller, accepted)
  on conflict (user_id) do nothing;
  -- An existing host gained nothing, so nothing is recorded.
  if found then
    perform private.audit('host_access_granted', 'user', caller);
  end if;
  return true;
end;
$$;

create or replace function private.admin_rotate_host_code(expected_code text)
returns table (
  code text,
  current_started_at timestamptz,
  rotates_at timestamptz,
  previous_valid_until timestamptz,
  server_time timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t timestamptz := clock_timestamp();
  cleaned text := upper(regexp_replace(coalesce(expected_code, ''), '[\s-]', '', 'g'));
  state private.host_code_rotation;
  new_code text;
begin
  perform private.require_admin();
  perform private.advance_host_code(t);
  select * into strict state from private.host_code_rotation where singleton for update;
  if cleaned = state.current_code then
    new_code := private.new_host_code('manual rotation');
    update private.host_code_rotation
    set current_code = new_code,
        current_started_at = t,
        rotates_at = t + interval '45 minutes',
        previous_code = null,
        previous_valid_until = null
    where singleton;
    -- No code values in the audit row.
    perform private.audit('host_code_rotated', 'system', null);
  end if;
  return query
    select r.current_code, r.current_started_at, r.rotates_at,
           r.previous_valid_until, t
    from private.host_code_rotation r where r.singleton;
end;
$$;

create or replace function private.admin_remove_host(target_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.hosts where user_id = target_user;
  if found then
    perform private.audit('host_access_removed', 'user', target_user);
  end if;
end;
$$;

create or replace function private.merge_guest(ticket text)
returns table (games_added integer, host_access_added boolean, account_was_new boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  guest uuid;
  was_new boolean;
  was_host boolean;
  added integer := 0;
begin
  if caller is null or private.caller_is_guest() then
    raise exception 'only a signed-in player can take in a guest' using errcode = '42501';
  end if;

  delete from private.merge_tickets t
  where t.token_hash = sha256(convert_to(coalesce(merge_guest.ticket, ''), 'UTF8'))
    and t.expires_at > now()
  returning t.guest_id into guest;
  if guest is null or guest = caller
     or not exists (select 1 from auth.users u where u.id = guest and u.is_anonymous) then
    raise exception 'invalid merge ticket' using errcode = '22023';
  end if;
  if private.user_in_game(guest) then
    raise exception 'the guest is in a game in progress' using errcode = '55006';
  end if;

  select coalesce((select p.account_name is null from public.profiles p where p.user_id = caller), true)
    into was_new;
  was_host := private.user_is_host(caller);

  -- Rows below point at the caller's profile, so it must exist.
  insert into public.profiles (user_id, display_name)
  select caller, p.display_name from public.profiles p where p.user_id = guest
  on conflict (user_id) do nothing;

  -- Games: move the guest's rows unless the caller was in that game too.
  with moved as (
    update public.game_players gp set user_id = caller
    where gp.user_id = guest
      and not exists (select 1 from public.game_players a where a.game_id = gp.game_id and a.user_id = caller)
    returning gp.game_id
  )
  select count(*) into added
  from moved join public.games g on g.id = moved.game_id
  where g.status in ('finished', 'abandoned');
  -- Same game, both identities: the guest's row becomes "Former player".
  update public.game_players set user_id = null, display_name = null where user_id = guest;

  update public.games set host_user_id = caller where host_user_id = guest;

  -- Seen clues: keep the later time, so a fresh board still avoids what was seen recently.
  insert into public.seen_clues (user_id, clue_id, seen_at, game_id)
  select caller, s.clue_id, s.seen_at, s.game_id from public.seen_clues s where s.user_id = guest
  on conflict (user_id, clue_id) do update set seen_at = greatest(public.seen_clues.seen_at, excluded.seen_at);

  -- Host access: either one's is enough.
  insert into public.hosts (user_id, code, created_at)
  select caller, h.code, h.created_at from public.hosts h where h.user_id = guest
  on conflict (user_id) do nothing;
  update public.host_codes set used_by = caller where used_by = guest;

  -- The rest (profile, memberships, lobbies the guest hosted, tickets) goes with the guest.
  delete from auth.users where id = guest;

  perform private.audit('guest_merged', 'user', caller, jsonb_build_object('games_added', added));

  return query select added, (not was_host and private.user_is_host(caller)), was_new;
end;
$$;

create or replace function private.delete_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or private.caller_is_guest() then
    raise exception 'only a signed-in player can delete an account' using errcode = '42501';
  end if;
  if private.user_in_game(caller) then
    raise exception 'the caller is in a game in progress' using errcode = '55006';
  end if;
  delete from auth.users where id = caller;
  perform private.audit('account_deleted', 'user', caller, '{"by": "self"}');
end;
$$;

-- The admin deletes an account on request (operator-scripts.md), run as the admin from SQL with
-- their claims set, or through any future admin route. Same deletion as delete_account.
--   22023  no such user
--   55006  the user is in a game in progress
create function private.admin_delete_account(target uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (select 1 from auth.users where id = target) then
    raise exception 'no such user' using errcode = '22023';
  end if;
  if private.user_in_game(target) then
    raise exception 'the user is in a game in progress' using errcode = '55006';
  end if;
  delete from auth.users where id = target;
  perform private.audit('account_deleted', 'user', target, '{"by": "admin"}');
end;
$$;
revoke all on function private.admin_delete_account(uuid) from public;
grant execute on function private.admin_delete_account(uuid) to authenticated;

-- Timestamps in staff reads: RFC 3339 in UTC, like the rest of the api.
create function private.utc_text(t timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;
revoke all on function private.utc_text(timestamptz) from public, anon, authenticated, app_service, game_engine;

-- Errors from the staff functions:
--   42501  the caller isn't an admin (the api answers not-found)
--   22023  bad subject type, reason, or duration; or the subject doesn't exist (invalid-grant)
--   28000  the grant is unknown, someone else's, expired, or revoked (grant-inactive)
create function private.staff_grant(subject_type text, subject_id uuid, reason text, minutes integer default 60)
returns table (grant_id uuid, grant_subject_type text, grant_subject_id uuid, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cleaned text := btrim(coalesce(staff_grant.reason, ''));
  duration integer := coalesce(staff_grant.minutes, 60);
  g private.staff_grants;
  subject_exists boolean;
begin
  perform private.require_admin();
  if staff_grant.subject_type is null or staff_grant.subject_type not in ('user', 'room', 'game')
     or staff_grant.subject_id is null
     or char_length(cleaned) not between 1 and 200
     or duration not between 1 and 480 then
    raise exception 'invalid grant' using errcode = '22023';
  end if;
  subject_exists := case staff_grant.subject_type
    when 'user' then exists (select 1 from auth.users u where u.id = staff_grant.subject_id)
    when 'room' then exists (select 1 from public.rooms r where r.id = staff_grant.subject_id)
    else exists (select 1 from public.games ga where ga.id = staff_grant.subject_id)
  end;
  if not subject_exists then
    raise exception 'no such subject' using errcode = '22023';
  end if;

  insert into private.staff_grants (admin_id, subject_type, subject_id, reason, expires_at)
  values (caller, staff_grant.subject_type, staff_grant.subject_id, cleaned, now() + make_interval(mins => duration))
  returning * into g;
  -- The reason stays in staff_grants; the audit row carries only ids and the duration.
  perform private.audit('staff_access_granted', g.subject_type, g.subject_id,
    jsonb_build_object('grant_id', g.id, 'minutes', duration));
  return query select g.id, g.subject_type, g.subject_id, g.expires_at;
end;
$$;
revoke all on function private.staff_grant(text, uuid, text, integer) from public;
grant execute on function private.staff_grant(text, uuid, text, integer) to authenticated;

-- Revokes the caller's grant early and returns its subject. Already expired or revoked is
-- not an error.
create function private.staff_revoke(grant_id uuid)
returns table (subject_type text, subject_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  g private.staff_grants;
begin
  perform private.require_admin();
  select * into g from private.staff_grants s where s.id = staff_revoke.grant_id and s.admin_id = caller
  for update;
  if g.id is null then
    raise exception 'grant inactive' using errcode = '28000';
  end if;
  if g.revoked_at is null and g.expires_at > now() then
    update private.staff_grants set revoked_at = now() where id = g.id;
    perform private.audit('staff_access_revoked', g.subject_type, g.subject_id,
      jsonb_build_object('grant_id', g.id));
  end if;
  return query select g.subject_type, g.subject_id;
end;
$$;
revoke all on function private.staff_revoke(uuid) from public;
grant execute on function private.staff_revoke(uuid) to authenticated;

-- The grant's subject, while the grant is the caller's, unexpired, and unrevoked. Each read is
-- audited. A fixed shape (StaffSubject in shared/openapi.yaml): never emails, password
-- hashes, or tokens.
create function private.staff_read(grant_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  g private.staff_grants;
  result jsonb;
begin
  perform private.require_admin();
  select * into g from private.staff_grants s
  where s.id = staff_read.grant_id and s.admin_id = caller
    and s.revoked_at is null and s.expires_at > now();
  if g.id is null then
    raise exception 'grant inactive' using errcode = '28000';
  end if;

  if g.subject_type = 'user' then
    select jsonb_build_object(
      'kind', 'user',
      'userId', u.id,
      'isAnonymous', coalesce(u.is_anonymous, false),
      'isAdmin', exists (select 1 from private.admins a where a.user_id = u.id),
      'createdAt', private.utc_text(u.created_at),
      'profile', (
        select jsonb_build_object('displayName', p.display_name, 'accountName', p.account_name,
          'showOnLeaderboard', p.show_on_leaderboard, 'createdAt', private.utc_text(p.created_at))
        from public.profiles p where p.user_id = u.id),
      'host', (
        select jsonb_build_object('since', private.utc_text(h.created_at), 'note', h.note)
        from public.hosts h where h.user_id = u.id),
      'rooms', coalesce((
        select jsonb_agg(jsonb_build_object('roomId', r.id, 'code', r.code, 'status', r.status,
          'role', m.role, 'joinedAt', private.utc_text(m.joined_at)) order by m.joined_at desc)
        from public.room_members m join public.rooms r on r.id = m.room_id
        where m.user_id = u.id), '[]'),
      'games', coalesce((
        select jsonb_agg(jsonb_build_object('gameId', ga.id, 'status', ga.status,
          'startedAt', private.utc_text(ga.started_at), 'finishedAt', private.utc_text(ga.finished_at),
          'role', gp.role, 'score', coalesce(res.score, 0), 'placement', res.placement)
          order by ga.started_at desc)
        from public.game_players gp
        join public.games ga on ga.id = gp.game_id
        left join public.game_results res on res.game_player_id = gp.id
        where gp.user_id = u.id), '[]'),
      'seenClueCount', (select count(*) from public.seen_clues s where s.user_id = u.id)
    ) into result
    from auth.users u where u.id = g.subject_id;
  elsif g.subject_type = 'room' then
    select jsonb_build_object(
      'kind', 'room',
      'roomId', r.id,
      'code', r.code,
      'hostId', r.host_id,
      'status', r.status,
      'createdAt', private.utc_text(r.created_at),
      'resumeGameId', r.resume_game_id,
      'options', jsonb_build_object('maxPlayers', r.max_players, 'seasons', r.seasons,
        'hostPlays', r.host_plays, 'timers', r.timers, 'doubleRound', r.double_round,
        'quickPicks', r.quick_picks, 'difficulty', r.difficulty),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('userId', m.user_id, 'role', m.role,
          'displayName', m.display_name, 'joinedAt', private.utc_text(m.joined_at)) order by m.joined_at)
        from public.room_members m where m.room_id = r.id), '[]')
    ) into result
    from public.rooms r where r.id = g.subject_id;
  else
    select jsonb_build_object(
      'kind', 'game',
      'gameId', ga.id,
      'roomId', ga.room_id,
      'status', ga.status,
      'startedAt', private.utc_text(ga.started_at),
      'finishedAt', private.utc_text(ga.finished_at),
      'hostUserId', ga.host_user_id,
      'players', coalesce((
        select jsonb_agg(jsonb_build_object('gamePlayerId', gp.id, 'userId', gp.user_id, 'role', gp.role,
          'displayName', gp.display_name, 'joinedAt', private.utc_text(gp.joined_at),
          'leftAt', private.utc_text(gp.left_at), 'score', coalesce(res.score, 0)) order by gp.joined_at)
        from public.game_players gp
        left join public.game_results res on res.game_player_id = gp.id
        where gp.game_id = ga.id), '[]'),
      'board', coalesce((
        select jsonb_agg(jsonb_build_object('boardClueId', b.id, 'round', b.round,
          'columnIndex', b.column_index, 'rowIndex', b.row_index, 'category', b.category,
          'value', b.value, 'isDailyDouble', b.is_daily_double, 'state', b.state)
          order by b.round, b.column_index, b.row_index)
        from public.board_clues b where b.game_id = ga.id), '[]'),
      'answers', coalesce((
        select jsonb_agg(jsonb_build_object('answerId', a.id, 'boardClueId', a.board_clue_id,
          'gamePlayerId', a.game_player_id, 'answer', a.answer, 'verdict', a.verdict,
          'scoreDelta', a.score_delta, 'createdAt', private.utc_text(a.created_at)) order by a.created_at)
        from public.answers a where a.game_id = ga.id), '[]')
    ) into result
    from public.games ga where ga.id = g.subject_id;
  end if;

  -- The subject was deleted after the grant: nothing to read.
  if result is null then
    raise exception 'grant inactive' using errcode = '28000';
  end if;
  perform private.audit('staff_read', g.subject_type, g.subject_id, jsonb_build_object('grant_id', g.id));
  return result;
end;
$$;
revoke all on function private.staff_read(uuid) from public;
grant execute on function private.staff_read(uuid) to authenticated;

-- Audit entries newest first, at most 500. Every filter is optional.
create function private.admin_audit(since timestamptz default null, action text default null, subject uuid default null)
returns setof private.audit_log
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select l.* from private.audit_log l
    where (admin_audit.since is null or l.at >= admin_audit.since)
      and (admin_audit.action is null or l.action = admin_audit.action)
      and (admin_audit.subject is null or l.subject_id = admin_audit.subject)
    order by l.id desc
    limit 500;
end;
$$;
revoke all on function private.admin_audit(timestamptz, text, uuid) from public;
grant execute on function private.admin_audit(timestamptz, text, uuid) to authenticated;
