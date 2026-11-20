-- Clue difficulty (docs/product-docs/features/clue-catalog/feature-brief.md, "Difficulty"; lobby
-- feature brief, "Game options"; game-history feature brief, "Building a fresh board").
--
-- Every category that can reach a board gets a score (1-100) from Claude, written by the worker's
-- `rate-clues` run on the owner connection. The first complete run fixes the cut points that split
-- the scores into thirds (difficulty_scale); labels follow from them and never change. A host can
-- keep a game to one label; null (Any) builds boards exactly as before.

create type public.difficulty as enum ('easy', 'medium', 'hard');

-- One row per rated category. score is null while its request is pending (batch_id set) or after
-- a failure; difficulty is null until a scale exists for its kind.
create table public.category_difficulty (
  category_key text primary key,
  kind text not null check (kind in ('board', 'final')),
  score smallint check (score between 1 and 100),
  difficulty public.difficulty,
  model text,
  rated_at timestamptz,
  batch_id text,
  failures smallint not null default 0
);
create index category_difficulty_pending_idx on public.category_difficulty (batch_id) where batch_id is not null;

-- The cut points, one row per kind, written once by the first complete rating run.
-- score <= easy_max is easy, <= medium_max is medium, above is hard.
create table public.difficulty_scale (
  kind text primary key check (kind in ('board', 'final')),
  easy_max smallint not null check (easy_max between 1 and 100),
  medium_max smallint not null check (medium_max between easy_max and 100),
  categories integer not null check (categories > 0),
  set_at timestamptz not null default now()
);

-- Only the game engine reads labels (to build boards); only the owner (worker) writes them or
-- reads the scale. Players never see a category's label.
alter table public.category_difficulty enable row level security;
alter table public.difficulty_scale enable row level security;
revoke all on public.category_difficulty, public.difficulty_scale from public, anon, authenticated, app_service, game_engine;
grant select on public.category_difficulty to game_engine;
create policy engine_read on public.category_difficulty for select to game_engine using (true);

-- The host's choice lives on the room (kept for a rematch) and is copied onto the game at Start
-- (kept for a resume). null is Any, which is what every room and game so far was.
alter table public.rooms add column difficulty public.difficulty;
alter table public.games add column difficulty public.difficulty;

-- set_room_options gains set_difficulty and new_difficulty. As with seasons, set_difficulty tells
-- "leave it" from "set it to Any (null)". Both default, so the 7-argument call the running api
-- makes keeps working until the api that sends difficulty is deployed (migrations run first).
-- The body is 20261119234826_quick_picks.sql's plus difficulty.
drop function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer, boolean);
create function public.set_room_options(
  target_room uuid,
  set_seasons boolean,
  new_seasons integer[],
  new_timers public.timer_pace,
  new_double boolean,
  new_max integer,
  new_quick boolean default null,
  set_difficulty boolean default false,
  new_difficulty public.difficulty default null
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
    quick_picks = coalesce(new_quick, quick_picks),
    difficulty = case when set_difficulty then new_difficulty else difficulty end
  where id = target_room;
end;
$$;
revoke all on function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer, boolean, boolean, public.difficulty) from public, anon;
grant execute on function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer, boolean, boolean, public.difficulty) to authenticated;

-- build_board_round gains target_difficulty. The body is 20261118210000_five_categories.sql's;
-- only the ranking changes. Unseen categories come first as before, ordered by tier: the chosen
-- level, then the next level over (Easy and Hard take Medium; Medium takes Easy and Hard at
-- random), then the rest. Seen categories follow as before, at any level. A category not yet
-- rated counts as Medium. With Any (null) every tier is 0, so the order is exactly today's.
drop function public.build_board_round(uuid, public.round, uuid[], integer[]);
create function public.build_board_round(
  target_game uuid,
  target_round public.round,
  contestants uuid[],
  seasons integer[],
  target_difficulty public.difficulty default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  wanted integer := case when target_round = 'final' then 1 else 5 end;
  clues_per integer := case when target_round = 'final' then 1 else 5 end;
  rows_per integer := case when target_round = 'final' then 1 else 4 end;
  step integer := case target_round when 'single' then 200 when 'double' then 400 else 0 end;
  daily_doubles integer := case target_round when 'single' then 1 when 'double' then 2 else 0 end;
  picked integer;
begin
  with seen as (
    select c.category_key, count(distinct s.user_id) as seers, max(s.seen_at) as last_seen
    from public.seen_clues s
    join public.clues c on c.id = s.clue_id
    where s.user_id = any (contestants) and c.round = target_round
    group by c.category_key
  ),
  categories as (
    select c.category_key
    from public.clues c
    where c.round = target_round and (seasons is null or c.season = any (seasons))
    group by c.category_key
    having count(*) = clues_per
  ),
  tiered as (
    select cat.category_key,
      case
        when target_difficulty is null then 0
        when coalesce(d.difficulty, 'medium') = target_difficulty then 0
        when target_difficulty = 'medium' or coalesce(d.difficulty, 'medium') = 'medium' then 1
        else 2
      end as tier
    from categories cat
    left join public.category_difficulty d on d.category_key = cat.category_key
  ),
  ranked as (
    select t.category_key,
      row_number() over (
        order by case when coalesce(seen.seers, 0) = 0 then t.tier else 3 end,
          coalesce(seen.seers, 0), seen.last_seen nulls first, random()
      ) as pos
    from tiered t
    left join seen on seen.category_key = t.category_key
  ),
  chosen as (
    select r.category_key, (r.pos - 1)::smallint as column_index
    from ranked r
    where r.pos <= wanted
  ),
  numbered as (
    select ch.column_index, c.category, c.id,
      row_number() over (partition by ch.category_key order by c.value nulls last, c.id) as rn
    from chosen ch
    join public.clues c on c.category_key = ch.category_key and c.round = target_round
  )
  insert into public.board_clues (game_id, round, column_index, row_index, category, value, clue_id)
  select target_game, target_round, n.column_index, (n.rn - 1)::smallint, n.category, step * n.rn, n.id
  from numbered n
  where n.rn <= rows_per;

  get diagnostics picked = row_count;
  if picked < wanted * rows_per then
    raise exception 'catalog too small' using errcode = 'P0001';
  end if;

  -- Daily Doubles: in different columns, never in the top row (rows 1-3 of 0-3).
  update public.board_clues b
  set is_daily_double = true
  from (
    select col, 1 + floor(random() * 3)::integer as row_pick
    from generate_series(0, wanted - 1) as col
    order by random()
    limit daily_doubles
  ) dd
  where b.game_id = target_game and b.round = target_round
    and b.column_index = dd.col and b.row_index = dd.row_pick;
end;
$$;
revoke all on function public.build_board_round(uuid, public.round, uuid[], integer[], public.difficulty) from public, anon, authenticated;
grant execute on function public.build_board_round(uuid, public.round, uuid[], integer[], public.difficulty) to game_engine;

-- start_game: as in 20261119234826_quick_picks.sql, plus difficulty copied onto the game and
-- passed to every round's board.
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
  insert into public.games (room_id, host_user_id, timers, double_round, quick_picks, difficulty)
  values (target_room, room.host_id, room.timers, room.double_round, room.quick_picks, room.difficulty)
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

  perform public.build_board_round(new_game, 'single', contestants, room.seasons, room.difficulty);
  if room.double_round then
    perform public.build_board_round(new_game, 'double', contestants, room.seasons, room.difficulty);
  end if;
  perform public.build_board_round(new_game, 'final', contestants, room.seasons, room.difficulty);

  update public.rooms set status = 'in_game' where id = target_room;
  return new_game;
end;
$$;
