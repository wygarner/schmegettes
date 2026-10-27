-- Initial schema with row-level security.
-- Design: docs/system-docs/architecture/data-and-isolation.md
--
-- Roles
--   authenticated  Supabase's role for a signed-in user. Services `set local role authenticated`
--                  and set request.jwt.claims per transaction, so auth.uid() is the caller.
--   game_engine    Used only by game/ for board loading and recording results. Can read the
--                  clue catalog (including correct responses), which no user role can.
--   app_service    The LOGIN role services connect as. Holds no table rights of its own; it can
--                  only switch to authenticated or game_engine. LOGIN and a password are set per
--                  environment, never in a migration (see docs/system-docs/operations/deployment.md).
-- The owner role (postgres) is used only by migrations and the worker's catalog imports.

create extension if not exists pgmq;

-- ---------------------------------------------------------------------------
-- Domain enums. Values must match shared/schemas/domain.schema.json.
-- ---------------------------------------------------------------------------
create type public.round as enum ('single', 'double', 'final');
create type public.player_role as enum ('host', 'contestant', 'spectator');
create type public.room_status as enum ('open', 'in_game', 'closed');
create type public.clue_state as enum ('unplayed', 'active', 'answered', 'unanswered');
create type public.verdict as enum ('correct', 'incorrect', 'overridden_correct', 'overridden_incorrect', 'appeal_pending');
create type public.answer_source as enum ('typed', 'voice');
create type public.game_status as enum ('in_progress', 'finished', 'abandoned');

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'game_engine') then
    create role game_engine nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_service') then
    create role app_service nologin noinherit;
  end if;
end
$$;

grant authenticated to app_service;
grant game_engine to app_service;
grant usage on schema public to game_engine;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

-- Clue catalog, imported by the worker from the jeopardy_clue_dataset TSVs.
create table public.clues (
  id uuid primary key default gen_random_uuid(),
  season integer not null check (season > 0),
  air_date date,
  round public.round not null,
  category text not null,
  value integer check (value >= 0),
  clue_text text not null,
  correct_response text not null,
  source_key text not null unique, -- stable id from the dataset, so imports are idempotent
  -- One category from one aired game. Boards are built from whole categories.
  -- Built only from immutable expressions (no date or enum casts to text), as generated
  -- columns require.
  category_key text not null generated always as (
    md5(
      season::text || '|'
      || coalesce((air_date - date '1970-01-01')::text, '') || '|'
      || case round when 'single' then '1' when 'double' then '2' else '3' end || '|'
      || category
    )
  ) stored
);
create index clues_season_round_idx on public.clues (season, round);
create index clues_round_category_idx on public.clues (round, category_key);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{5}$'),
  host_id uuid not null references public.profiles (user_id) on delete cascade,
  status public.room_status not null default 'open',
  max_players integer not null default 6 check (max_players between 2 and 8),
  seasons integer[], -- host's season choice for boards; null means every season
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role public.player_role not null,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members (user_id);

-- Game history outlives rooms and accounts (docs/product-docs/features/game-history/).
-- Deleting a room keeps its games; deleting an account keeps its results as "Former player".
create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms (id) on delete set null,
  status public.game_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  finished_at timestamptz -- when the game ended, finished or abandoned
);
create index games_room_idx on public.games (room_id);

-- Everyone in a game, spectators included. display_name is a snapshot from the start of the
-- game, so renames don't rewrite old scoreboards. Scores live in the game_results view.
create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid references public.profiles (user_id) on delete set null,
  role public.player_role not null,
  display_name text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (game_id, user_id)
);
create index game_players_user_idx on public.game_players (user_id);

-- One board per game. Carries no clue text or response: those stay in clues.
-- value is the standard value for the row, not the catalog's era-specific value.
create table public.board_clues (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  round public.round not null,
  column_index smallint not null check (column_index between 0 and 5),
  row_index smallint not null check (row_index between 0 and 4),
  category text not null,
  value integer not null,
  is_daily_double boolean not null default false,
  state public.clue_state not null default 'unplayed',
  revealed_at timestamptz,
  clue_id uuid not null references public.clues (id),
  unique (game_id, round, column_index, row_index)
);

create table public.answers (
  id uuid primary key, -- supplied by the game server, so a retried write is a no-op
  game_id uuid not null references public.games (id) on delete cascade,
  board_clue_id uuid not null references public.board_clues (id) on delete cascade,
  game_player_id uuid not null references public.game_players (id) on delete cascade,
  answer text not null check (char_length(answer) <= 200),
  source public.answer_source not null,
  verdict public.verdict not null,
  score_delta integer not null,
  created_at timestamptz not null default now()
);
create index answers_game_idx on public.answers (game_id);
create index answers_game_player_idx on public.answers (game_player_id);

-- Which clues each person has seen, so new boards avoid them. Never shown to users.
create table public.seen_clues (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  clue_id uuid not null references public.clues (id) on delete cascade,
  seen_at timestamptz not null,
  game_id uuid references public.games (id) on delete set null,
  primary key (user_id, clue_id)
);

-- One row per person in a game. score is the sum of their answers, so it can't drift.
-- Tied scores share a placement; spectators have none.
create view public.game_results with (security_invoker = true) as
select
  gp.game_id,
  gp.id as game_player_id,
  gp.user_id,
  gp.role,
  case when gp.user_id is null then 'Former player' else coalesce(gp.display_name, 'Former player') end
    as display_name,
  coalesce(s.score, 0)::integer as score,
  case when gp.role <> 'spectator' then
    (rank() over (
      partition by gp.game_id, gp.role = 'spectator'
      order by coalesce(s.score, 0) desc
    ))::integer
  end as placement
from public.game_players gp
left join (
  select a.game_player_id, sum(a.score_delta) as score
  from public.answers a
  group by a.game_player_id
) s on s.game_player_id = gp.id;

-- ---------------------------------------------------------------------------
-- Membership helper. SECURITY DEFINER so policies on room_members can call it
-- without recursing into their own RLS.
-- ---------------------------------------------------------------------------
create function public.is_room_member(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = target_room and m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

-- Joining by code: the caller is not a member yet, so cannot see the room through RLS.
create function public.join_room(room_code text, join_role public.player_role default 'contestant')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.rooms;
  members integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if join_role = 'host' then
    raise exception 'cannot join as host' using errcode = '22023';
  end if;

  select * into target from public.rooms where code = upper(room_code) for update;
  if not found or target.status = 'closed' then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  select count(*) into members from public.room_members
  where room_id = target.id and role in ('host', 'contestant');
  if join_role = 'contestant' and members >= target.max_players then
    raise exception 'room full' using errcode = '23P01';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (target.id, (select auth.uid()), join_role)
  on conflict (room_id, user_id) do nothing;

  return target.id;
end;
$$;
revoke all on function public.join_room(text, public.player_role) from public;
grant execute on function public.join_room(text, public.player_role) to authenticated;

-- The host is a member of their own room from the moment it exists.
create function public.add_host_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.room_members (room_id, user_id, role) values (new.id, new.host_id, 'host');
  return new;
end;
$$;
create trigger rooms_add_host after insert on public.rooms
for each row execute function public.add_host_membership();

-- Game membership: everyone who played or watched a game can read it, permanently, whether or
-- not they are still in the room. SECURITY DEFINER so game_players' own policy can call it.
create function public.is_game_member(target_game uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = target_game and gp.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_game_member(uuid) from public, anon;
grant execute on function public.is_game_member(uuid) to authenticated;

-- A deleted account becomes "Former player": scrub the name snapshots before the foreign key
-- nulls user_id. SECURITY DEFINER because the deleting role (e.g. Supabase Auth) has no
-- rights on game_players.
create function public.scrub_game_player_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.game_players set display_name = null where user_id = old.user_id;
  return old;
end;
$$;
revoke all on function public.scrub_game_player_names() from public, anon, authenticated;
create trigger profiles_scrub_game_player_names before delete on public.profiles
for each row execute function public.scrub_game_player_names();

-- ---------------------------------------------------------------------------
-- Game engine functions. Called by game/ as game_engine (SECURITY INVOKER: they run with
-- game_engine's own rights). Each is one transaction and safe to call again after a retry.
-- See docs/system-docs/architecture/realtime-game-server.md, "Recording".
-- ---------------------------------------------------------------------------

-- Fill one round of a game's board with whole categories nobody playing has seen. When too
-- few are fresh, take the ones seen by the fewest contestants, longest ago. Called only by
-- start_game().
create function public.build_board_round(target_game uuid, target_round public.round, contestants uuid[], seasons integer[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  wanted integer := case when target_round = 'final' then 1 else 6 end;
  clues_per integer := case when target_round = 'final' then 1 else 5 end;
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
  )
  insert into public.board_clues (game_id, round, column_index, row_index, category, value, clue_id)
  select
    target_game,
    target_round,
    ch.column_index,
    (row_number() over (partition by ch.category_key order by c.value nulls last, c.id) - 1)::smallint,
    c.category,
    step * row_number() over (partition by ch.category_key order by c.value nulls last, c.id),
    c.id
  from chosen ch
  join public.clues c on c.category_key = ch.category_key and c.round = target_round;

  get diagnostics picked = row_count;
  if picked < wanted * clues_per then
    raise exception 'catalog too small' using errcode = 'P0001';
  end if;

  -- Daily Doubles: in different columns, never in the top row.
  update public.board_clues b
  set is_daily_double = true
  from (
    select col, 1 + floor(random() * 4)::integer as row_pick
    from generate_series(0, 5) as col
    order by random()
    limit daily_doubles
  ) dd
  where b.game_id = target_game and b.round = target_round
    and b.column_index = dd.col and b.row_index = dd.row_pick;
end;
$$;

-- Host pressed Start: record the game and its players, then build a fresh board for exactly
-- those players. All or nothing: if the board can't be built, nothing is kept.
create function public.start_game(target_room uuid)
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

  insert into public.game_players (game_id, user_id, role, display_name)
  select new_game, m.user_id, m.role, p.display_name
  from public.room_members m
  join public.profiles p on p.user_id = m.user_id
  where m.room_id = target_room;

  -- The host counts as a contestant: there is no host-only option yet.
  select coalesce(array_agg(gp.user_id), '{}') into contestants
  from public.game_players gp
  where gp.game_id = new_game and gp.role in ('host', 'contestant');

  perform public.build_board_round(new_game, 'single', contestants, room.seasons);
  perform public.build_board_round(new_game, 'double', contestants, room.seasons);
  perform public.build_board_round(new_game, 'final', contestants, room.seasons);

  update public.rooms set status = 'in_game' where id = target_room;
  return new_game;
end;
$$;

-- A spectator joined after Start. Their seen clues are recorded from now on, and they can
-- read the game afterwards. They don't affect this game's board.
create function public.add_spectator(target_game uuid, target_user uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.game_players (game_id, user_id, role, display_name)
  select target_game, p.user_id, 'spectator', p.display_name
  from public.profiles p
  where p.user_id = target_user
  on conflict (game_id, user_id) do nothing;
end;
$$;

-- A clue's text was shown to the room: everyone in the game has now seen it.
create function public.reveal_clue(target_board_clue uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  clue public.board_clues;
begin
  select * into clue from public.board_clues where id = target_board_clue for update;
  if not found then
    raise exception 'board clue not found' using errcode = 'P0002';
  end if;
  if clue.revealed_at is not null then
    return;
  end if;

  update public.board_clues set revealed_at = now(), state = 'active' where id = target_board_clue;

  insert into public.seen_clues (user_id, clue_id, seen_at, game_id)
  select gp.user_id, clue.clue_id, now(), clue.game_id
  from public.game_players gp
  where gp.game_id = clue.game_id and gp.user_id is not null and gp.left_at is null
  on conflict (user_id, clue_id) do update
    set seen_at = greatest(public.seen_clues.seen_at, excluded.seen_at),
        game_id = case when excluded.seen_at > public.seen_clues.seen_at
                       then excluded.game_id else public.seen_clues.game_id end;
end;
$$;

create function public.record_answer(
  answer_id uuid,
  target_board_clue uuid,
  target_user uuid,
  answer_text text,
  answer_source public.answer_source,
  answer_verdict public.verdict,
  answer_score_delta integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.answers where id = answer_id) then
    return;
  end if;

  insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta)
  select answer_id, b.game_id, b.id, gp.id, answer_text, answer_source, answer_verdict, answer_score_delta
  from public.board_clues b
  join public.game_players gp on gp.game_id = b.game_id and gp.user_id = target_user
  where b.id = target_board_clue
  on conflict (id) do nothing;

  if not found then
    raise exception 'player not in game' using errcode = 'P0002';
  end if;
end;
$$;

-- Host override or appeal result.
create function public.update_verdict(answer_id uuid, answer_verdict public.verdict, answer_score_delta integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.answers set verdict = answer_verdict, score_delta = answer_score_delta
  where id = answer_id;
  if not found then
    raise exception 'answer not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Clues revealed after this don't count as seen for them. Their score so far stays.
create function public.player_left(target_game uuid, target_user uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.game_players set left_at = now()
  where game_id = target_game and user_id = target_user and left_at is null;
$$;

-- Ends an in-progress game as finished or abandoned and reopens the room for a rematch.
-- Calling it on an ended game does nothing.
create function public.end_game(target_game uuid, final_status public.game_status)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ended_room uuid;
begin
  if final_status not in ('finished', 'abandoned') then
    raise exception 'a game ends as finished or abandoned' using errcode = '22023';
  end if;

  update public.games set status = final_status, finished_at = now()
  where id = target_game and status = 'in_progress'
  returning room_id into ended_room;

  if found and ended_room is not null then
    update public.rooms set status = 'open' where id = ended_room and status = 'in_game';
  end if;
end;
$$;

revoke all on function public.build_board_round(uuid, public.round, uuid[], integer[]) from public, anon, authenticated;
revoke all on function public.start_game(uuid) from public, anon, authenticated;
revoke all on function public.add_spectator(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reveal_clue(uuid) from public, anon, authenticated;
revoke all on function public.record_answer(uuid, uuid, uuid, text, public.answer_source, public.verdict, integer) from public, anon, authenticated;
revoke all on function public.update_verdict(uuid, public.verdict, integer) from public, anon, authenticated;
revoke all on function public.player_left(uuid, uuid) from public, anon, authenticated;
revoke all on function public.end_game(uuid, public.game_status) from public, anon, authenticated;
grant execute on function public.build_board_round(uuid, public.round, uuid[], integer[]) to game_engine;
grant execute on function public.start_game(uuid) to game_engine;
grant execute on function public.add_spectator(uuid, uuid) to game_engine;
grant execute on function public.reveal_clue(uuid) to game_engine;
grant execute on function public.record_answer(uuid, uuid, uuid, text, public.answer_source, public.verdict, integer) to game_engine;
grant execute on function public.update_verdict(uuid, public.verdict, integer) to game_engine;
grant execute on function public.player_left(uuid, uuid) to game_engine;
grant execute on function public.end_game(uuid, public.game_status) to game_engine;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.clues enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.board_clues enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.answers enable row level security;
alter table public.seen_clues enable row level security;

-- Supabase grants table rights to anon/authenticated by default. Start from nothing, and
-- make future tables start from nothing too: each migration grants exactly what it needs.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- profiles: your own, plus anyone you share a room with (to show names).
grant select, insert, update (display_name) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.room_members theirs
      where theirs.user_id = profiles.user_id and public.is_room_member(theirs.room_id)
    )
  );
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- clues: no user access at all. Correct responses must never reach a client.

-- rooms: members see it; anyone creates one as host; the host updates it.
-- host_id is checked as well as membership because INSERT ... RETURNING is checked against
-- this policy before the trigger below adds the host's membership row.
grant select, insert, update (status, max_players, seasons) on public.rooms to authenticated;
create policy rooms_select on public.rooms for select to authenticated
  using (host_id = (select auth.uid()) or public.is_room_member(id));
create policy rooms_insert on public.rooms for insert to authenticated
  with check (host_id = (select auth.uid()));
create policy rooms_update on public.rooms for update to authenticated
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));

-- room_members: visible to fellow members; joining goes through join_room(); you may leave.
grant select, delete on public.room_members to authenticated;
create policy room_members_select on public.room_members for select to authenticated
  using (public.is_room_member(room_id));
create policy room_members_leave on public.room_members for delete to authenticated
  using (user_id = (select auth.uid()) and role <> 'host');

-- Game data: read-only for everyone who played or watched the game, even after they leave the
-- room or it is deleted. Only game_engine writes it.
grant select on public.board_clues, public.games, public.game_players, public.answers, public.game_results
  to authenticated;
create policy board_clues_select on public.board_clues for select to authenticated
  using (public.is_game_member(game_id));
create policy games_select on public.games for select to authenticated
  using (public.is_game_member(id));
create policy game_players_select on public.game_players for select to authenticated
  using (public.is_game_member(game_id));
create policy answers_select on public.answers for select to authenticated
  using (public.is_game_member(game_id));

-- seen_clues: no user access at all. Only used to build boards.

-- game_engine: the trusted game server. Full read; writes only game state. No deletes.
grant select on all tables in schema public to game_engine;
grant update (status) on public.rooms to game_engine;
grant insert, update on public.board_clues, public.games, public.game_players, public.answers, public.seen_clues
  to game_engine;
create policy engine_seen_clues on public.seen_clues for all to game_engine using (true) with check (true);
create policy engine_all on public.clues for select to game_engine using (true);
create policy engine_rooms_select on public.rooms for select to game_engine using (true);
create policy engine_rooms_update on public.rooms for update to game_engine using (true) with check (true);
create policy engine_members on public.room_members for select to game_engine using (true);
create policy engine_profiles on public.profiles for select to game_engine using (true);
create policy engine_board_clues on public.board_clues for all to game_engine using (true) with check (true);
create policy engine_games on public.games for all to game_engine using (true) with check (true);
create policy engine_game_players on public.game_players for all to game_engine using (true) with check (true);
create policy engine_answers on public.answers for all to game_engine using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Job queues (Supabase Queues / pgmq). Envelope: shared/schemas/jobs/job.schema.json
-- ---------------------------------------------------------------------------
select pgmq.create('jobs');
