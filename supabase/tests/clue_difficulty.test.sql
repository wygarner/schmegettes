-- Clue difficulty: who can read labels, the room option, and how boards keep to a level. Run with
-- `mise run db:test`. Rules: docs/product-docs/features/clue-catalog/feature-brief.md ("Difficulty")
-- and game-history/feature-brief.md ("Building a fresh board").
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

grant game_engine to current_user;
grant usage on schema extensions to game_engine;

create schema tests;
grant usage on schema tests to public;

create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;
create function tests.as_engine() returns void language plpgsql as $$
begin
  reset role;
  set local role game_engine;
end;
$$;
create function tests.room() returns uuid language sql stable as $$
  select current_setting('tests.room')::uuid;
$$;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'x@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'y@example.test'),
  ('55555555-5555-4555-8555-555555555555', 'z@example.test');
insert into public.profiles (user_id, display_name)
select id, split_part(email, '@', 1) from auth.users where email like '%@example.test'
on conflict do nothing;
insert into public.host_codes (code) values ('TESTDFFS');
insert into public.hosts (user_id, code)
select id, 'TESTDFFS' from auth.users where email like '%@example.test';

-- A catalog in its own season. Single: 6 Easy (E), 3 Medium (M), 2 Hard (H), 2 not yet rated (U,
-- which plays as Medium). Double and Final: 5 Hard each, so a Hard game can start.
insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 37, date '2021-01-01', 'single', 'DIFF ' || cat, 200 * n, 'clue', 'response', 'diff-test-single-' || cat || '-' || n
from unnest(array['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'M1', 'M2', 'M3', 'H1', 'H2', 'U1', 'U2']) as cat
cross join generate_series(1, 5) as n;
insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 37, date '2021-01-01', 'double', 'DIFF DH' || cat, 400 * n, 'clue', 'response', 'diff-test-double-' || cat || '-' || n
from generate_series(1, 5) as cat cross join generate_series(1, 5) as n;
insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 37, date '2021-01-01', 'final', 'DIFF FH' || cat, null, 'clue', 'response', 'diff-test-final-' || cat
from generate_series(1, 5) as cat;

insert into public.category_difficulty (category_key, kind, score, difficulty)
select distinct category_key,
  case when round = 'final' then 'final' else 'board' end,
  50,
  case substr(category, 6, 1) when 'E' then 'easy' when 'M' then 'medium' else 'hard' end::public.difficulty
from public.clues
where season = 37 and substr(category, 6, 1) <> 'U';

-- One Single board for these players at this difficulty, as the sorted letters of its categories
-- ("EEMMU"). Built on the owner connection; Start (below) checks it as the game engine.
create function tests.board(diff public.difficulty, players uuid[]) returns text language plpgsql as $$
declare
  g uuid;
begin
  insert into public.games default values returning id into g;
  perform public.build_board_round(g, 'single', players, '{37}', diff);
  return (
    select string_agg(l, '' order by l)
    from (select distinct category, substr(category, 6, 1) as l from public.board_clues where game_id = g) b
  );
end;
$$;

-- Mark a player as having seen every clue of these Single categories.
create function tests.saw(p_user uuid, cats text[]) returns void language sql as $$
  insert into public.seen_clues (user_id, clue_id, seen_at)
  select p_user, c.id, now() - interval '1 day'
  from public.clues c
  where c.season = 37 and c.round = 'single' and c.category = any (select 'DIFF ' || x from unnest(cats) x);
$$;

-- ---------------------------------------------------------------------------
-- Labels are for the game engine only
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.category_difficulty'::regclass), 'category_difficulty has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.difficulty_scale'::regclass), 'difficulty_scale has RLS');
select ok(not has_table_privilege('anon', 'public.category_difficulty', 'select'), 'anon can''t read labels');
select ok(not has_table_privilege('authenticated', 'public.category_difficulty', 'select'), 'players can''t read labels');
select ok(not has_table_privilege('authenticated', 'public.difficulty_scale', 'select'), 'players can''t read the scale');
select ok(not has_table_privilege('game_engine', 'public.category_difficulty', 'insert'), 'the engine can''t write labels');
select ok(not has_table_privilege('game_engine', 'public.difficulty_scale', 'select'), 'the engine doesn''t read the scale');
select tests.as_engine();
select ok((select count(*) > 0 from public.category_difficulty), 'the engine reads labels');
reset role;

-- ---------------------------------------------------------------------------
-- The room option
-- ---------------------------------------------------------------------------
select tests.as_user('11111111-1111-4111-8111-111111111111');
select set_config('tests.room', public.create_room('Alice')::text, true);
select set_config('tests.code', (select code from public.rooms where id = tests.room()), true);
select is((select difficulty from public.rooms where id = tests.room()), null, 'a new room: Any');
select lives_ok(
  $$ select public.set_room_options(tests.room(), true, '{37}', null, null, null, null, true, 'hard') $$,
  'the host picks Hard'
);
select is((select difficulty::text from public.rooms where id = tests.room()), 'hard', 'Hard saved');
select lives_ok(
  $$ select public.set_room_options(tests.room(), false, null, null, null, null, true) $$,
  'the 7-argument call (the api before difficulty) still works'
);
select is((select difficulty::text from public.rooms where id = tests.room()), 'hard', 'and leaves the difficulty as it was');
select public.set_room_options(tests.room(), false, null, null, null, null, null, true, null);
select is((select difficulty from public.rooms where id = tests.room()), null, 'set_difficulty with null: back to Any');
select public.set_room_options(tests.room(), false, null, null, null, null, null, true, 'hard');
select tests.as_user('22222222-2222-4222-8222-222222222222');
select public.join_room(current_setting('tests.code'), 'Bob');
select throws_ok(
  $$ select public.set_room_options(tests.room(), false, null, null, null, null, null, true, 'easy') $$,
  '42501', 'not the host', 'a contestant can''t change the difficulty'
);

-- Start runs as the game engine, as game/ calls it: the game keeps Hard, and its boards keep to it.
select tests.as_engine();
select set_config('tests.game', public.start_game(tests.room())::text, true);
reset role;
select is((select difficulty::text from public.games where id = current_setting('tests.game')::uuid), 'hard',
  'the game keeps the difficulty it started with');
select is(
  (select count(distinct b.category)::integer from public.board_clues b
   where b.game_id = current_setting('tests.game')::uuid and b.round = 'single' and b.category in ('DIFF H1', 'DIFF H2')),
  2, 'Start, as the engine: both fresh Hard categories reach the Single board'
);
select is(
  (select count(distinct b.category)::integer from public.board_clues b
   where b.game_id = current_setting('tests.game')::uuid and b.round = 'single' and b.category like 'DIFF E%'),
  0, 'and no Easy one (two levels off) while fresh Medium ones remain'
);

-- ---------------------------------------------------------------------------
-- Building boards at a level (owner connection; the engine path is covered above)
-- ---------------------------------------------------------------------------
select is(tests.board('easy', '{}'), 'EEEEE', 'Easy: five Easy categories while fresh ones remain');
select is(tests.board('medium', '{}'), 'MMMUU', 'Medium: Medium and not-yet-rated categories (rated Medium) only');
select matches(tests.board('hard', '{}'), '^HH[MU]{3}$', 'Hard: both Hard, then fresh Medium ones (the next level over)');

-- Y has seen four Easy categories: two fresh Easy, then fresh Medium, never Hard.
select tests.saw('44444444-4444-4444-8444-444444444444', array['E1', 'E2', 'E3', 'E4']);
select matches(
  tests.board('easy', array['44444444-4444-4444-8444-444444444444']::uuid[]), '^EE[MU]{3}$',
  'Easy runs short: fresh Easy, then fresh Medium'
);
select matches(
  tests.board('medium', array['44444444-4444-4444-8444-444444444444']::uuid[]), '^[MU]{5}$',
  'Medium with enough fresh Medium never takes Easy or Hard'
);

-- X has seen every Hard, Medium and unrated category: fresh Easy beats any repeat.
select tests.saw('33333333-3333-4333-8333-333333333333', array['M1', 'M2', 'M3', 'H1', 'H2', 'U1', 'U2']);
select is(
  tests.board('hard', array['33333333-3333-4333-8333-333333333333']::uuid[]), 'EEEEE',
  'Hard with nothing fresh nearby: fresh categories at any level before a repeat'
);

-- Z has seen all but five categories, one of each kind: Any takes exactly those, as before.
select tests.saw('55555555-5555-4555-8555-555555555555', array['E2', 'E3', 'E4', 'E5', 'E6', 'M2', 'M3', 'H2']);
select is(
  tests.board(null, array['55555555-5555-4555-8555-555555555555']::uuid[]), 'EHMUU',
  'Any: fresh categories at every level, labels ignored'
);

-- Privileges on the new signatures
select function_privs_are(
  'public', 'build_board_round', array['uuid', 'round', 'uuid[]', 'integer[]', 'difficulty'],
  'authenticated', array[]::text[], 'players can''t build boards'
);
select function_privs_are(
  'public', 'set_room_options',
  array['uuid', 'boolean', 'integer[]', 'timer_pace', 'boolean', 'integer', 'boolean', 'boolean', 'difficulty'],
  'anon', array[]::text[], 'anon can''t set options'
);

select * from finish();
rollback;
