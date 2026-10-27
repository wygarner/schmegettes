-- Lobby: hosting a room, display names, and a host who plays on the host device.
-- Product rules: docs/product-docs/features/lobby/. Users change rooms only through the
-- functions below; game/ calls the lobby ones as game_engine.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
-- The host joined the game as a contestant on the host device.
alter table public.rooms add column host_plays boolean not null default false;

-- Codes are unique only among rooms that aren't closed, so a closed room's code can come back.
alter table public.rooms drop constraint rooms_code_key;
create unique index rooms_live_code_idx on public.rooms (code) where status <> 'closed';

-- Name in this room: suffixed ("Alice 2") when taken, editable until Start. Null on rows from
-- before this migration; readers fall back to profiles.display_name.
alter table public.room_members
  add column display_name text check (char_length(display_name) between 1 and 20);

-- ---------------------------------------------------------------------------
-- Helpers (not granted to anyone; called by the functions below)
-- ---------------------------------------------------------------------------
create function public.clean_display_name(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := btrim(coalesce(raw, ''));
begin
  if char_length(cleaned) not between 1 and 20 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  return cleaned;
end;
$$;
revoke all on function public.clean_display_name(text) from public;

-- The first of "Name", "Name 2", "Name 3"… not used (case-insensitively) by anyone listed in the
-- room other than skip_user. The host is listed only while they play.
create function public.free_member_name(target_room uuid, wanted text, skip_user uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  candidate text := wanted;
  n integer := 1;
begin
  loop
    if not exists (
      select 1
      from public.room_members m
      join public.rooms r on r.id = m.room_id
      where m.room_id = target_room
        and m.user_id <> skip_user
        and (m.role <> 'host' or r.host_plays)
        and lower(m.display_name) = lower(candidate)
    ) then
      return candidate;
    end if;
    n := n + 1;
    candidate := left(wanted, 20 - char_length(' ' || n)) || ' ' || n;
  end loop;
end;
$$;
revoke all on function public.free_member_name(uuid, text, uuid) from public;

-- Remember the caller's latest name for the next prefill.
create function public.remember_display_name(target_user uuid, member_name text)
returns void
language sql
set search_path = ''
as $$
  insert into public.profiles (user_id, display_name) values (target_user, member_name)
  on conflict (user_id) do update set display_name = excluded.display_name;
$$;
revoke all on function public.remember_display_name(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Creating and joining (callers: authenticated, through api/)
-- ---------------------------------------------------------------------------
create function public.create_room(host_name text)
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

-- Replaces join_room(text, player_role): joining now carries a name.
drop function public.join_room(text, public.player_role);

create function public.join_room(
  room_code text,
  member_name text,
  join_role public.player_role default 'contestant'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cleaned text;
  target public.rooms;
  contestants integer;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if join_role = 'host' then
    raise exception 'cannot join as host' using errcode = '22023';
  end if;
  cleaned := public.clean_display_name(member_name);

  -- Locks the room, so a join and start_game() never interleave.
  select * into target from public.rooms
  where code = upper(room_code) and status <> 'closed'
  for update;
  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  -- Already a member (a reload): keep their name and role.
  if exists (select 1 from public.room_members where room_id = target.id and user_id = caller) then
    return target.id;
  end if;

  if join_role = 'contestant' then
    if target.status <> 'open' then
      raise exception 'game started' using errcode = '55000';
    end if;
    select count(*) + (case when target.host_plays then 1 else 0 end) into contestants
    from public.room_members
    where room_id = target.id and role = 'contestant';
    if contestants >= target.max_players then
      raise exception 'room full' using errcode = '23P01';
    end if;
  end if;

  -- Memberships reference the profile, so a first-time player gets one first.
  perform public.remember_display_name(caller, cleaned);
  insert into public.room_members (room_id, user_id, role, display_name)
  values (target.id, caller, join_role, public.free_member_name(target.id, cleaned, caller));

  return target.id;
end;
$$;
revoke all on function public.join_room(text, text, public.player_role) from public;
grant execute on function public.join_room(text, text, public.player_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Lobby changes (caller: game_engine, on behalf of a connected member)
-- ---------------------------------------------------------------------------
create function public.set_member_name(target_room uuid, target_user uuid, member_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text := public.clean_display_name(member_name);
  stored text;
begin
  perform 1 from public.rooms where id = target_room and status = 'open' for update;
  if not found then
    raise exception 'room not open' using errcode = '55000';
  end if;

  stored := public.free_member_name(target_room, cleaned, target_user);
  update public.room_members set display_name = stored
  where room_id = target_room and user_id = target_user;
  if not found then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  perform public.remember_display_name(target_user, cleaned);
  return stored;
end;
$$;
revoke all on function public.set_member_name(uuid, uuid, text) from public;
grant execute on function public.set_member_name(uuid, uuid, text) to game_engine;

create function public.set_host_plays(target_room uuid, plays boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.rooms;
  contestants integer;
  host_name text;
begin
  select * into target from public.rooms where id = target_room and status = 'open' for update;
  if not found then
    raise exception 'room not open' using errcode = '55000';
  end if;
  if target.host_plays = plays then
    return;
  end if;

  if plays then
    select count(*) into contestants from public.room_members
    where room_id = target_room and role = 'contestant';
    if contestants >= target.max_players then
      raise exception 'room full' using errcode = '23P01';
    end if;
  end if;

  update public.rooms set host_plays = plays where id = target_room;

  -- Joining makes the host the later of two same-named players, so they get the suffix.
  -- Leaving gives back the name they chose.
  select p.display_name into host_name from public.profiles p where p.user_id = target.host_id;
  update public.room_members
  set display_name = case
    when plays then public.free_member_name(target_room, left(host_name, 20), target.host_id)
    else left(host_name, 20)
  end
  where room_id = target_room and user_id = target.host_id;
end;
$$;
revoke all on function public.set_host_plays(uuid, boolean) from public;
grant execute on function public.set_host_plays(uuid, boolean) to game_engine;

create function public.leave_room(target_room uuid, target_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.room_members
  where room_id = target_room and user_id = target_user and role <> 'host';
$$;
revoke all on function public.leave_room(uuid, uuid) from public;
grant execute on function public.leave_room(uuid, uuid) to game_engine;

-- ---------------------------------------------------------------------------
-- start_game: a playing host is a contestant; names come from the room.
-- ---------------------------------------------------------------------------
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

  insert into public.games (room_id) values (target_room) returning id into new_game;

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

-- ---------------------------------------------------------------------------
-- Rooms change only through the functions above. Direct writes would let a host skip the
-- lobby rules: reopen a game in progress so contestants join mid-game, pick a look-alike
-- code, or set host_plays past the player limit.
-- ---------------------------------------------------------------------------
revoke insert on public.rooms from authenticated;
revoke update (status, max_players, seasons) on public.rooms from authenticated;
drop policy rooms_insert on public.rooms;
drop policy rooms_update on public.rooms;
