-- Who hosted each game, for "Hosted by" in My games (docs/product-docs/features/game-history/).
-- A playing host is recorded in game_players as a contestant, so once a room is deleted the
-- host can't be told apart without this. Nullable: deleting the host's account nulls it.

alter table public.games
  add column host_user_id uuid references public.profiles (user_id) on delete set null;

-- Games from before this migration: the room still knows its host, when it still exists.
update public.games g
set host_user_id = r.host_id
from public.rooms r
where g.room_id = r.id and g.host_user_id is null;

-- start_game: as in 20261027174627_lobby.sql, plus the host on the new game.
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
