-- Shared rotating host codes and the local devtools admin surface.
-- Existing host rows and the legacy host_codes columns stay intact for rolling-deploy
-- compatibility. All access still goes through security-definer functions called as a user.

alter table public.hosts add column note text;
alter table public.hosts add constraint hosts_note_length check (char_length(note) <= 200);

create table private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table private.host_code_rotation (
  singleton boolean primary key default true check (singleton),
  current_code text not null references public.host_codes (code),
  current_started_at timestamptz not null,
  rotates_at timestamptz not null,
  previous_code text references public.host_codes (code),
  previous_valid_until timestamptz,
  check (rotates_at > current_started_at),
  check ((previous_code is null) = (previous_valid_until is null))
);

alter table private.admins enable row level security;
alter table private.host_code_rotation enable row level security;
revoke all on private.admins, private.host_code_rotation
  from public, anon, authenticated, app_service, game_engine;

-- The singleton is initialized on the fixed UTC 45-minute grid. A manual rotation resets
-- the grid from that moment until the next manual rotation.
do $$
declare
  t timestamptz := clock_timestamp();
  epoch constant timestamptz := timestamptz '2000-01-01 00:00:00+00';
  started timestamptz;
  code text;
begin
  started := epoch + floor(extract(epoch from (t - epoch)) / 2700) * interval '45 minutes';
  code := private.new_host_code('rotating code');
  insert into private.host_code_rotation
    (current_code, current_started_at, rotates_at)
  values (code, started, started + interval '45 minutes');
end;
$$;

-- Advance the singleton to the window containing at_time. The advisory lock also serializes
-- redemption and manual rotation across api instances.
create function private.advance_host_code(at_time timestamptz default clock_timestamp())
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  state private.host_code_rotation;
  started timestamptz;
  code text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('private.host_code_rotation', 0));
  select * into strict state from private.host_code_rotation where singleton for update;
  if at_time < state.rotates_at then
    return;
  end if;

  started := state.rotates_at
    + floor(extract(epoch from (at_time - state.rotates_at)) / 2700) * interval '45 minutes';
  code := private.new_host_code('rotating code');
  update private.host_code_rotation
  set current_code = code,
      current_started_at = started,
      rotates_at = started + interval '45 minutes',
      previous_code = case when started = state.rotates_at then state.current_code end,
      previous_valid_until = case when started = state.rotates_at then state.rotates_at + interval '5 minutes' end
  where singleton;
end;
$$;
revoke all on function private.advance_host_code(timestamptz)
  from public, anon, authenticated, app_service, game_engine;

-- The same current code may be redeemed by any number of users. An existing host is left
-- untouched, including their original grant time and code.
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
  return true;
end;
$$;
revoke all on function private.redeem_host_code(text) from public;
grant execute on function private.redeem_host_code(text) to authenticated;

create function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null
     or not exists (
       select 1 from auth.users u
       join private.admins a on a.user_id = u.id
       where u.id = caller and not coalesce(u.is_anonymous, false)
     ) then
    raise exception 'not found' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_admin()
  from public, anon, authenticated, app_service, game_engine;

create function private.admin_current_host_code()
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
begin
  perform private.require_admin();
  perform private.advance_host_code(t);
  return query
    select r.current_code, r.current_started_at, r.rotates_at,
           -- A grace period that has ended is reported as none.
           case when r.previous_valid_until > t then r.previous_valid_until end, t
    from private.host_code_rotation r where r.singleton;
end;
$$;
revoke all on function private.admin_current_host_code() from public;
grant execute on function private.admin_current_host_code() to authenticated;

create function private.admin_rotate_host_code(expected_code text)
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
  end if;
  return query
    select r.current_code, r.current_started_at, r.rotates_at,
           r.previous_valid_until, t
    from private.host_code_rotation r where r.singleton;
end;
$$;
revoke all on function private.admin_rotate_host_code(text) from public;
grant execute on function private.admin_rotate_host_code(text) to authenticated;

create function private.admin_hosts()
returns table (
  user_id uuid,
  kind text,
  email text,
  last_played_as text,
  host_since timestamptz,
  note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select h.user_id,
           case when coalesce(u.is_anonymous, false) then 'guest' else 'account' end,
           case when coalesce(u.is_anonymous, false) then null else u.email::text end,
           p.display_name,
           h.created_at,
           h.note
    from public.hosts h
    join auth.users u on u.id = h.user_id
    left join public.profiles p on p.user_id = h.user_id
    order by h.created_at desc, h.user_id;
end;
$$;
revoke all on function private.admin_hosts() from public;
grant execute on function private.admin_hosts() to authenticated;

create function private.admin_set_host_note(target_user uuid, new_note text)
returns table (
  user_id uuid,
  kind text,
  email text,
  last_played_as text,
  host_since timestamptz,
  note text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cleaned text := nullif(btrim(coalesce(new_note, '')), '');
begin
  perform private.require_admin();
  if char_length(cleaned) > 200 then
    raise exception 'note too long' using errcode = '22023';
  end if;
  return query
    with changed as (
      update public.hosts h set note = cleaned where h.user_id = target_user
      returning h.user_id, h.created_at, h.note
    )
    select c.user_id,
           case when coalesce(u.is_anonymous, false) then 'guest' else 'account' end,
           case when coalesce(u.is_anonymous, false) then null else u.email::text end,
           p.display_name,
           c.created_at,
           c.note
    from changed c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.user_id = c.user_id;
end;
$$;
revoke all on function private.admin_set_host_note(uuid, text) from public;
grant execute on function private.admin_set_host_note(uuid, text) to authenticated;

create function private.admin_remove_host(target_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.hosts where user_id = target_user;
end;
$$;
revoke all on function private.admin_remove_host(uuid) from public;
grant execute on function private.admin_remove_host(uuid) to authenticated;
