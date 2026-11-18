-- Game options in the lobby (docs/product-docs/features/lobby/feature-brief.md, "Game options"):
-- seasons (rooms.seasons, already there), the timer pace, and whether to play Double
-- Schmegettes. They live on the room (kept for a rematch) and are copied onto the game at
-- Start, so a game's rules never change under it and a resumed game keeps them.

create type public.timer_pace as enum ('relaxed', 'standard', 'fast');

alter table public.rooms
  add column timers public.timer_pace not null default 'standard',
  add column double_round boolean not null default true;

-- Games played before this were Standard with Double, which is what the defaults say.
alter table public.games
  add column timers public.timer_pace not null default 'standard',
  add column double_round boolean not null default true;

-- Rooms change only through functions (20261027174627_lobby.sql revoked direct writes), so
-- options do too. Security definer, because authenticated can't update rooms; the checks
-- below are the only gate. A null argument leaves that option as it is; set_seasons says
-- whether new_seasons applies (null seasons means every season).
create function public.set_room_options(
  target_room uuid,
  set_seasons boolean,
  new_seasons integer[],
  new_timers public.timer_pace,
  new_double boolean,
  new_max integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  room public.rooms;
begin
  select * into room from public.rooms where id = target_room for update;
  if not found or room.status = 'closed' then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if caller is null or room.host_id <> caller then
    raise exception 'not the host' using errcode = '42501';
  end if;
  if room.status <> 'open' then
    raise exception 'game started' using errcode = '55000';
  end if;
  if set_seasons and new_seasons is not null and (
    cardinality(new_seasons) = 0
    or exists (select 1 from unnest(new_seasons) s where s < 1 or s > 40)
  ) then
    raise exception 'seasons must be 1 to 40' using errcode = '22023';
  end if;
  if new_max is not null and (new_max < 2 or new_max > 6) then
    raise exception 'max players must be 2 to 6' using errcode = '22023';
  end if;

  update public.rooms set
    seasons = case when set_seasons then new_seasons else seasons end,
    timers = coalesce(new_timers, timers),
    double_round = coalesce(new_double, double_round),
    max_players = coalesce(new_max, max_players)
  where id = target_room;
end;
$$;
revoke all on function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer) from public, anon;
grant execute on function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer) to authenticated;

-- start_game: as in 20261110033412_private_access.sql, plus the options: copied onto the
-- game, and no Double board when Double Schmegettes is off.
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
  -- The room's game options are copied onto the game, so its rules never change under it.
  insert into public.games (room_id, host_user_id, timers, double_round)
  values (target_room, room.host_id, room.timers, room.double_round)
  returning id into new_game;

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
  if room.double_round then
    perform public.build_board_round(new_game, 'double', contestants, room.seasons);
  end if;
  perform public.build_board_round(new_game, 'final', contestants, room.seasons);

  update public.rooms set status = 'in_game' where id = target_room;
  return new_game;
end;
$$;
