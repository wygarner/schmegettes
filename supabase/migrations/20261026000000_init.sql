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
  source_key text not null unique -- stable id from the dataset, so imports are idempotent
);
create index clues_season_round_idx on public.clues (season, round);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{5}$'),
  host_id uuid not null references public.profiles (user_id) on delete cascade,
  status public.room_status not null default 'open',
  max_players integer not null default 6 check (max_players between 2 and 8),
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

-- One board per room per round. Carries no clue text or response: those stay in clues.
create table public.board_clues (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round public.round not null,
  column_index smallint not null check (column_index between 0 and 5),
  row_index smallint not null check (row_index between 0 and 4),
  category text not null,
  value integer not null,
  is_daily_double boolean not null default false,
  state public.clue_state not null default 'unplayed',
  clue_id uuid not null references public.clues (id),
  unique (room_id, round, column_index, row_index)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index games_room_idx on public.games (room_id);

create table public.game_players (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  final_score integer,
  placement smallint,
  primary key (game_id, user_id)
);
create index game_players_user_idx on public.game_players (user_id);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  board_clue_id uuid not null references public.board_clues (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  answer text not null check (char_length(answer) <= 200),
  source public.answer_source not null,
  verdict public.verdict not null,
  score_delta integer not null,
  created_at timestamptz not null default now()
);
create index answers_game_idx on public.answers (game_id);

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
grant select, insert, update (status, max_players) on public.rooms to authenticated;
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

-- Game data: read-only for members. Only game_engine writes it.
grant select on public.board_clues, public.games, public.game_players, public.answers to authenticated;
create policy board_clues_select on public.board_clues for select to authenticated
  using (public.is_room_member(room_id));
create policy games_select on public.games for select to authenticated
  using (public.is_room_member(room_id));
create policy game_players_select on public.game_players for select to authenticated
  using (
    exists (select 1 from public.games g where g.id = game_id and public.is_room_member(g.room_id))
  );
create policy answers_select on public.answers for select to authenticated
  using (
    exists (select 1 from public.games g where g.id = game_id and public.is_room_member(g.room_id))
  );

-- game_engine: the trusted game server. Full read; writes only game state.
grant select on all tables in schema public to game_engine;
grant update (status) on public.rooms to game_engine;
grant insert, update on public.board_clues, public.games, public.game_players, public.answers to game_engine;
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
