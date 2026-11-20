-- Quick picks (docs/product-docs/features/lobby/feature-brief.md, "Game options"): with it on, a
-- spoken pick of just a category picks the lowest clue left in it. Like the other options it
-- lives on the room (kept for a rematch) and is copied onto the game at Start (kept for a
-- resume). The rule itself is applied where spoken picks are matched (web); the server only
-- carries the flag to the game's players on room_snapshot.

alter table public.rooms add column quick_picks boolean not null default false;
-- Games before this had no Quick picks, which is what the default says.
alter table public.games add column quick_picks boolean not null default false;

-- set_room_options gains new_quick. Postgres can't add a parameter in place, so the old one is
-- dropped and recreated; the new one's default lets the 6-argument call the running api makes
-- keep working until the api that sends quickPicks is deployed (migrations run first). The body
-- is 20261119232726_lobby_fixed_timers.sql's (timers always Standard) plus quick_picks.
drop function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer);
create function public.set_room_options(
  target_room uuid,
  set_seasons boolean,
  new_seasons integer[],
  new_timers public.timer_pace,
  new_double boolean,
  new_max integer,
  new_quick boolean default null
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
    timers = 'standard',
    double_round = coalesce(new_double, double_round),
    max_players = coalesce(new_max, max_players),
    quick_picks = coalesce(new_quick, quick_picks)
  where id = target_room;
end;
$$;
revoke all on function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer, boolean) from public, anon;
grant execute on function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer, boolean) to authenticated;

-- start_game: as in 20261118220000_game_options.sql, plus quick_picks copied onto the game.
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
  insert into public.games (room_id, host_user_id, timers, double_round, quick_picks)
  values (target_room, room.host_id, room.timers, room.double_round, room.quick_picks)
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
