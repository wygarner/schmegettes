-- Private access: hosting is invite-only (docs/product-docs/features/private-access/).
-- A device gets host access by spending a one-use host code; a new code is created at once.
-- Codes and hosts are owner-only. The helpers live in schema `private`, which the Data API
-- doesn't expose, so redeeming a code goes through the api and its rate limit.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, game_engine;

-- The room-code alphabet: no look-alikes (0 O 1 I L).
create table public.host_codes (
  code text primary key check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
  note text, -- admin: who it's for
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

create table public.hosts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null references public.host_codes (code),
  created_at timestamptz not null default now()
);

alter table public.host_codes enable row level security;
alter table public.hosts enable row level security;
revoke all on public.host_codes, public.hosts from public, anon, authenticated, app_service, game_engine;
-- No policies: only the owner (admin, SQL editor) reads or writes these.

-- A new unused code. The admin calls it to invite several people at once:
--   select private.new_host_code('for Sam');
create function private.new_host_code(note text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  candidate text;
  byte integer;
  bytes bytea;
begin
  for attempt in 1..10 loop
    candidate := '';
    while char_length(candidate) < 8 loop
      bytes := extensions.gen_random_bytes(16);
      for i in 0..15 loop
        byte := get_byte(bytes, i);
        -- 248 = 31 * 8: dropping higher bytes keeps every character equally likely.
        if byte < 248 and char_length(candidate) < 8 then
          candidate := candidate || substr(alphabet, 1 + byte % 31, 1);
        end if;
      end loop;
    end loop;
    begin
      insert into public.host_codes (code, note) values (candidate, new_host_code.note);
      return candidate;
    exception when unique_violation then
      null; -- vanishingly rare; try another
    end;
  end loop;
  raise exception 'could not create a unique host code';
end;
$$;
revoke all on function private.new_host_code(text) from public, anon, authenticated, app_service, game_engine;

create function private.user_is_host(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hosts where user_id = target_user);
$$;
revoke all on function private.user_is_host(uuid) from public;
grant execute on function private.user_is_host(uuid) to game_engine;

create function private.caller_is_host()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_is_host((select auth.uid()));
$$;
revoke all on function private.caller_is_host() from public;
grant execute on function private.caller_is_host() to authenticated;

-- Spends a code for the caller. True when the caller can host afterwards. A caller who can
-- already host keeps the code unspent. Two callers racing for one code: the row update lets
-- exactly one of them through.
create function private.redeem_host_code(candidate text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cleaned text := upper(regexp_replace(coalesce(candidate, ''), '[\s-]', '', 'g'));
  spent text;
begin
  if caller is null then
    return false;
  end if;
  if private.user_is_host(caller) then
    return true;
  end if;

  update public.host_codes
  set used_at = now(), used_by = caller
  where code = cleaned and used_at is null
  returning code into spent;
  if spent is null then
    return false;
  end if;

  insert into public.hosts (user_id, code) values (caller, spent);
  perform private.new_host_code();
  return true;
end;
$$;
revoke all on function private.redeem_host_code(text) from public;
grant execute on function private.redeem_host_code(text) to authenticated;

-- create_room: as in 20261027174627_lobby.sql, plus the host-access check.
create or replace function public.create_room(host_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cleaned text := public.clean_display_name(host_name);
  -- No look-alikes: 0 O 1 I L.
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  new_code text;
  new_room uuid;
  attempt integer := 0;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not private.user_is_host(caller) then
    raise exception 'not a host' using errcode = '42501';
  end if;

  perform public.remember_display_name(caller, cleaned);

  -- One open lobby per host: a new room replaces the old one. game/ notices and tells its phones.
  update public.rooms set status = 'closed' where host_id = caller and status = 'open';

  loop
    attempt := attempt + 1;
    select string_agg(substr(alphabet, 1 + floor(random() * char_length(alphabet))::integer, 1), '')
      into new_code
      from generate_series(1, 5);
    begin
      insert into public.rooms (code, host_id) values (new_code, caller) returning id into new_room;
      exit;
    exception when unique_violation then
      if attempt >= 10 then
        raise;
      end if;
    end;
  end loop;

  -- The rooms_add_host trigger added the host's membership.
  update public.room_members set display_name = cleaned where room_id = new_room and user_id = caller;
  return new_room;
end;
$$;
revoke all on function public.create_room(text) from public;
grant execute on function public.create_room(text) to authenticated;

-- start_game: as in 20261109210750_games_host.sql, plus the host-access check (Start and the
-- Start after a Rematch). Checked before anything is written.
create or replace function public.start_game(target_room uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  room public.rooms;
  new_game uuid;
  contestants uuid[];
begin
  select * into room from public.rooms where id = target_room for update;
  if not found or room.status <> 'open' then
    raise exception 'room not open' using errcode = '55000';
  end if;
  if not private.user_is_host(room.host_id) then
    raise exception 'not a host' using errcode = '42501';
  end if;

  -- The host is recorded on the game, so "Hosted by" survives the room (My games).
  insert into public.games (room_id, host_user_id) values (target_room, room.host_id) returning id into new_game;

  -- A host who joined the game plays from the host device, so they are a contestant here.
  insert into public.game_players (game_id, user_id, role, display_name)
  select new_game, m.user_id,
         case when m.role = 'host' and room.host_plays then 'contestant'::public.player_role else m.role end,
         coalesce(m.display_name, p.display_name)
  from public.room_members m
  join public.profiles p on p.user_id = m.user_id
  where m.room_id = target_room;

  select coalesce(array_agg(gp.user_id), '{}') into contestants
  from public.game_players gp
  where gp.game_id = new_game and gp.role = 'contestant';

  perform public.build_board_round(new_game, 'single', contestants, room.seasons);
  perform public.build_board_round(new_game, 'double', contestants, room.seasons);
  perform public.build_board_round(new_game, 'final', contestants, room.seasons);

  update public.rooms set status = 'in_game' where id = target_room;
  return new_game;
end;
$$;
revoke all on function public.start_game(uuid) from public, anon, authenticated;
grant execute on function public.start_game(uuid) to game_engine;

-- The first code. After the release, the admin reads it with:
--   select code from public.host_codes where used_at is null;
select private.new_host_code('first code');
