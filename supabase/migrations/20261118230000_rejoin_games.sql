-- Rejoin and resume games (docs/product-docs/features/rejoin-games/feature-brief.md).
--
-- Rejoin: my_current_room() tells Home which room the caller is in.
-- Resume: the host of an abandoned game (within 30 days) opens a resume lobby
-- (resume_game); only that game's contestants can join it (join_room); Start
-- (start_resumed_game) moves the game to the new room, puts it back in progress, and
-- normalizes where it stopped, so game/ recovers it as after a restart.

alter table public.rooms
  add column resume_game_id uuid references public.games (id) on delete set null;
-- One resume lobby per game.
create unique index rooms_one_resume_lobby on public.rooms (resume_game_id)
  where status = 'open' and resume_game_id is not null;

-- ---------------------------------------------------------------------------
-- my_current_room: the room Home offers to rejoin. Only ever the caller's own rows.
-- ---------------------------------------------------------------------------
create function public.my_current_room()
returns table (kind text, room_id uuid, code text, role text, host_display_name text, player_names text[])
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    -- Rooms the caller is in: a game first, then a lobby.
    select case r.status when 'in_game' then 'game' else 'lobby' end as kind,
           r.id, r.code, m.role::text as role, r.host_id, r.host_plays,
           case r.status when 'in_game' then 0 else 2 end as rank, m.joined_at as at
    from public.room_members m
    join public.rooms r on r.id = m.room_id
    where m.user_id = (select auth.uid()) and r.status in ('open', 'in_game')
      and m.role in ('host', 'contestant')
    union all
    -- A resume lobby for a game the caller played, not joined yet.
    select 'resume_invite', r.id, r.code, 'contestant', r.host_id, r.host_plays, 1, r.created_at
    from public.rooms r
    join public.game_players gp on gp.game_id = r.resume_game_id
    where r.status = 'open' and gp.user_id = (select auth.uid()) and gp.role = 'contestant'
      and not exists (select 1 from public.room_members m where m.room_id = r.id and m.user_id = (select auth.uid()))
  ),
  pick as (select * from mine order by rank, at desc limit 1)
  select p.kind, p.id, p.code, p.role,
         (select coalesce(m.display_name, pr.display_name)
          from public.room_members m join public.profiles pr on pr.user_id = m.user_id
          where m.room_id = p.id and m.user_id = p.host_id),
         coalesce((
           select array_agg(m.display_name order by m.joined_at)
           from public.room_members m
           where m.room_id = p.id and (m.role = 'contestant' or (m.role = 'host' and p.host_plays))
         ), '{}')
  from pick p;
$$;
revoke all on function public.my_current_room() from public, anon;
grant execute on function public.my_current_room() to authenticated;

-- ---------------------------------------------------------------------------
-- resume_game: the host opens a resume lobby for an abandoned game.
-- ---------------------------------------------------------------------------
create function public.resume_game(target_game uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  g public.games;
  existing uuid;
  host_name text;
  host_played boolean;
  -- No look-alikes: 0 O 1 I L (as create_room).
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  new_code text;
  new_room uuid;
  attempt integer := 0;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into g from public.games where id = target_game for update;
  if not found or g.host_user_id is distinct from caller then
    raise exception 'not the host' using errcode = '42501';
  end if;
  if not private.user_is_host(caller) then
    raise exception 'not a host' using errcode = 'SCH02';
  end if;
  if g.status <> 'abandoned' or g.finished_at < now() - interval '30 days' then
    raise exception 'not resumable' using errcode = '55000';
  end if;

  select id into existing from public.rooms where resume_game_id = target_game and status = 'open';
  if found then
    return existing;
  end if;

  -- One open lobby per host, as when hosting a new game.
  update public.rooms set status = 'closed' where host_id = caller and status = 'open';

  select gp.display_name, gp.role = 'contestant' into host_name, host_played
  from public.game_players gp where gp.game_id = target_game and gp.user_id = caller limit 1;

  loop
    attempt := attempt + 1;
    select string_agg(substr(alphabet, 1 + floor(random() * char_length(alphabet))::integer, 1), '')
      into new_code
      from generate_series(1, 5);
    begin
      insert into public.rooms (code, host_id, resume_game_id, host_plays)
      values (new_code, caller, target_game, coalesce(host_played, false))
      returning id into new_room;
      exit;
    exception when unique_violation then
      if attempt >= 10 then
        raise;
      end if;
    end;
  end loop;

  -- The rooms_add_host trigger added the host's membership; the host keeps the game's name.
  if host_name is not null then
    update public.room_members set display_name = host_name where room_id = new_room and user_id = caller;
  end if;
  return new_room;
end;
$$;
revoke all on function public.resume_game(uuid) from public, anon;
grant execute on function public.resume_game(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- join_room: as in 20261027174627_lobby.sql, plus resume lobbies and a resumed game's
-- players coming back mid-game.
-- ---------------------------------------------------------------------------
create or replace function public.join_room(
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
  seat_game uuid;
  seat_name text;
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

  -- A resume lobby, or a game in progress (a resumed game whose players come back later):
  -- only that game's contestants, matched by account, take back their seat and their name.
  select coalesce(target.resume_game_id,
                  (select g.id from public.games g where g.room_id = target.id and g.status = 'in_progress'
                   order by g.started_at desc limit 1))
    into seat_game;
  if target.resume_game_id is not null
     or (join_role = 'contestant' and target.status = 'in_game' and seat_game is not null) then
    select gp.display_name into seat_name
    from public.game_players gp
    where gp.game_id = seat_game and gp.user_id = caller and gp.role = 'contestant'
    limit 1;
    if not found then
      if target.resume_game_id is not null then
        raise exception 'not in this game' using errcode = 'SCH01';
      end if;
      raise exception 'game started' using errcode = '55000';
    end if;
    insert into public.room_members (room_id, user_id, role, display_name)
    values (target.id, caller, 'contestant', seat_name);
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

-- ---------------------------------------------------------------------------
-- start_resumed_game: Start in a resume lobby (game/, as game_engine).
-- ---------------------------------------------------------------------------
create function public.start_resumed_game(target_room uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.rooms;
  g public.games;
begin
  select * into room from public.rooms where id = target_room for update;
  if not found or room.status <> 'open' or room.resume_game_id is null then
    raise exception 'room not open' using errcode = '55000';
  end if;
  if not private.user_is_host(room.host_id) then
    raise exception 'not a host' using errcode = '42501';
  end if;
  select * into g from public.games where id = room.resume_game_id for update;
  if g.status <> 'abandoned' then
    raise exception 'not resumable' using errcode = '55000';
  end if;

  update public.games set room_id = target_room, status = 'in_progress', finished_at = null where id = g.id;

  -- A clue in play when the game stopped is done, with no score change: its text was seen.
  update public.board_clues set state = 'unanswered'
  where game_id = g.id and state = 'active' and round <> 'final';

  -- Final not yet being revealed: start it again from the category (wagers and answers
  -- entered again). Being revealed: keep everything, the reveal starts over.
  if not exists (
    select 1 from public.answers a join public.board_clues b on b.id = a.board_clue_id
    where b.game_id = g.id and b.round = 'final'
  ) then
    delete from public.wagers w using public.board_clues b
    where w.board_clue_id = b.id and b.game_id = g.id and b.round = 'final';
    update public.board_clues set state = 'unplayed' where game_id = g.id and round = 'final' and state = 'active';
  end if;

  -- From here the room is an ordinary room with a game in progress; join_room lets the
  -- game's players who aren't back yet in.
  update public.rooms set status = 'in_game', resume_game_id = null where id = target_room;
  return g.id;
end;
$$;
revoke all on function public.start_resumed_game(uuid) from public, anon, authenticated;
grant execute on function public.start_resumed_game(uuid) to game_engine;
