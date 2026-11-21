-- All-time stats and leaderboard. Results are computed on read so verdict overrides,
-- renames, visibility changes, and account deletion are reflected immediately.

alter table public.profiles
  add column show_on_leaderboard boolean not null default true;

grant update (show_on_leaderboard) on public.profiles to authenticated;

-- The existing profiles_update policy is not column-bound and still restricts updates to
-- auth.uid(). Restate it here so this migration owns the new column's access boundary.
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A target's finished games as a contestant. left_at is intentionally ignored.
create function private.counted_games(target uuid)
returns table (game_id uuid, score integer, placement integer, finished_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, r.score, r.placement, g.finished_at
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  join public.game_results r on r.game_player_id = gp.id
  where gp.user_id = target
    and gp.role = 'contestant'
    and g.status = 'finished';
$$;
revoke all on function private.counted_games(uuid) from public, anon, authenticated, app_service, game_engine;

-- The eligible population and its exact-ratio rank. Kept internal so both public functions
-- use exactly the same qualification and tie-break rules.
create function private.ranked_players()
returns table (user_id uuid, rank bigint, name text, win_rate integer, wins integer, games integer)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select p.user_id, p.account_name as name,
      count(c.game_id)::integer as games,
      count(c.game_id) filter (where c.placement = 1)::integer as wins
    from public.profiles p
    join auth.users u on u.id = p.user_id and not u.is_anonymous
    join private.counted_games(p.user_id) c on true
    where p.account_name is not null and p.show_on_leaderboard
    group by p.user_id, p.account_name
    having count(c.game_id) >= 10
  )
  select user_id,
    rank() over (order by wins::numeric / games desc, wins desc, games desc),
    name, floor(100 * wins::numeric / games)::integer, wins, games
  from totals;
$$;
revoke all on function private.ranked_players() from public, anon, authenticated, app_service, game_engine;

create function private.my_stats()
returns table (
  games integer,
  wins integer,
  win_rate integer,
  average_score integer,
  best_score integer,
  best_game_id uuid,
  career_total bigint,
  correct jsonb,
  daily_doubles jsonb,
  final jsonb,
  leaderboard jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  visible boolean;
  counted integer;
  caller_rank integer;
begin
  if caller is null or private.caller_is_guest() then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select coalesce(p.show_on_leaderboard, true) into visible
  from public.profiles p where p.user_id = caller;
  visible := coalesce(visible, true);

  select count(*)::integer into counted from private.counted_games(caller);
  select r.rank::integer into caller_rank from private.ranked_players() r where r.user_id = caller;

  return query
  with cg as materialized (select * from private.counted_games(caller)),
  best as (
    select c.score, c.game_id from cg c order by c.score desc, c.finished_at desc, c.game_id limit 1
  ),
  judged as (
    select bc.round, bc.is_daily_double, a.verdict,
      a.verdict in ('correct', 'overridden_correct') as is_right,
      a.verdict in ('incorrect', 'overridden_incorrect') as is_wrong
    from cg c
    join public.game_players gp on gp.game_id = c.game_id and gp.user_id = caller and gp.role = 'contestant'
    join public.answers a on a.game_player_id = gp.id
    join public.board_clues bc on bc.id = a.board_clue_id
    where a.verdict in ('correct', 'overridden_correct', 'incorrect', 'overridden_incorrect')
  ),
  answer_totals as (
    select
      count(*) filter (where round in ('single', 'double') and is_right)::integer as correct_right,
      count(*) filter (where round in ('single', 'double') and (is_right or is_wrong))::integer as correct_judged,
      count(*) filter (where is_daily_double and is_right)::integer as dd_right,
      count(*) filter (where is_daily_double and is_wrong)::integer as dd_wrong,
      count(*) filter (where round = 'final' and is_right)::integer as final_right,
      count(*) filter (where round = 'final' and is_wrong)::integer as final_wrong
    from judged
  )
  select counted,
    case when counted = 0 then null else count(*) filter (where c.placement = 1)::integer end,
    case when counted = 0 then null else floor(100 * count(*) filter (where c.placement = 1)::numeric / counted)::integer end,
    case when counted = 0 then null else round(avg(c.score))::integer end,
    case when counted = 0 then null else (select b.score from best b) end,
    case when counted = 0 then null else (select b.game_id from best b) end,
    case when counted = 0 then null else sum(c.score)::bigint end,
    jsonb_build_object(
      'right', case when counted = 0 then null else a.correct_right end,
      'judged', case when counted = 0 then null else a.correct_judged end
    ),
    jsonb_build_object(
      'right', case when counted = 0 then null else a.dd_right end,
      'wrong', case when counted = 0 then null else a.dd_wrong end
    ),
    jsonb_build_object(
      'right', case when counted = 0 then null else a.final_right end,
      'wrong', case when counted = 0 then null else a.final_wrong end
    ),
    case
      when not visible then jsonb_build_object('state', 'hidden')
      when caller_rank is not null then jsonb_build_object('state', 'ranked', 'rank', caller_rank)
      else jsonb_build_object('state', 'needs-games', 'gamesToGo', greatest(10 - counted, 1))
    end
  from cg c cross join answer_totals a
  group by a.correct_right, a.correct_judged, a.dd_right, a.dd_wrong, a.final_right, a.final_wrong;

  -- An aggregate over an empty cg still returns one row, but keep the invariant explicit.
  if not found then
    return query select 0, null::integer, null::integer, null::integer, null::integer, null::uuid,
      null::bigint,
      jsonb_build_object('right', null, 'judged', null),
      jsonb_build_object('right', null, 'wrong', null),
      jsonb_build_object('right', null, 'wrong', null),
      case when not visible then jsonb_build_object('state', 'hidden')
           else jsonb_build_object('state', 'needs-games', 'gamesToGo', 10) end;
  end if;
end;
$$;
revoke all on function private.my_stats() from public, anon;
grant execute on function private.my_stats() to authenticated;

create function private.leaderboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  counted integer;
  visible boolean;
  caller_rank integer;
  result jsonb;
begin
  if caller is null or private.caller_is_guest() then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select count(*)::integer into counted from private.counted_games(caller);
  if counted = 0 then
    raise exception 'no counted games' using errcode = 'P0001';
  end if;

  select coalesce(p.show_on_leaderboard, true) into visible
  from public.profiles p where p.user_id = caller;
  visible := coalesce(visible, true);
  select r.rank::integer into caller_rank from private.ranked_players() r where r.user_id = caller;

  with ranked as materialized (
    select * from private.ranked_players()
  ),
  top_rows as (
    select * from ranked order by rank, wins desc, games desc, name, user_id limit 50
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', t.rank, 'name', t.name, 'winRate', t.win_rate,
        'wins', t.wins, 'games', t.games, 'isMe', t.user_id = caller
      ) order by t.rank, t.wins desc, t.games desc, t.name)
      from top_rows t
    ), '[]'::jsonb),
    'me', case when caller_rank is not null and not exists (select 1 from top_rows t where t.user_id = caller)
      then (select jsonb_build_object(
        'rank', r.rank, 'name', r.name, 'winRate', r.win_rate,
        'wins', r.wins, 'games', r.games, 'isMe', true
      ) from ranked r where r.user_id = caller)
      else null end,
    'myState', case when not visible then 'hidden' when caller_rank is not null then 'ranked' else 'needs-games' end
  ) || case when visible and caller_rank is null
       then jsonb_build_object('gamesToGo', 10 - counted)
       else '{}'::jsonb end
  into result;
  return result;
end;
$$;
revoke all on function private.leaderboard() from public, anon;
grant execute on function private.leaderboard() to authenticated;
