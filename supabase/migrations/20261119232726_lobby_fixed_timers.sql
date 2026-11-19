-- No timer option any more (docs/product-docs/features/lobby/feature-brief.md, "Game options"):
-- every new game gives 9 s to buzz in and 9 s to answer, which is the Standard pace. The
-- timer_pace enum, rooms.timers and games.timers stay, so the contract doesn't change and a
-- game started before this (or resumed later) keeps the pace it started with.

-- Rooms that saved Relaxed or Fast (an open lobby, or a finished room waiting for a rematch)
-- play Standard from now on.
update public.rooms set timers = 'standard' where timers <> 'standard';

-- set_room_options: as in 20261118220000_game_options.sql, except that timers is always
-- Standard. new_timers is still accepted, so a browser tab from before this change that
-- sends 'fast' gets no error, and it has no effect.
create or replace function public.set_room_options(
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
    timers = 'standard',
    double_round = coalesce(new_double, double_round),
    max_players = coalesce(new_max, max_players)
  where id = target_room;
end;
$$;
revoke all on function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer) from public, anon;
grant execute on function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer) to authenticated;
