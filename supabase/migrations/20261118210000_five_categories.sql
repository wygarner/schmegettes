-- Five categories per round instead of six, so the board's columns are wider on the host's
-- iPhone (docs/product-docs/features/gameplay/feature-brief.md, "The board and control").
-- Same signature and grants; only boards built from now on change. Games already running
-- keep their six columns.

create or replace function public.build_board_round(target_game uuid, target_round public.round, contestants uuid[], seasons integer[])
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
  ranked as (
    select cat.category_key,
      row_number() over (order by coalesce(seen.seers, 0), seen.last_seen nulls first, random()) as pos
    from categories cat
    left join seen on seen.category_key = cat.category_key
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
