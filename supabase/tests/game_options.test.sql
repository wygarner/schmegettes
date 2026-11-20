-- Game options in the lobby: seasons, Double Schmegettes, Quick picks (timers are always Standard). Run with `mise run db:test`.
-- Rules: docs/product-docs/features/lobby/feature-brief.md, "Game options". Users act as
-- authenticated with request.jwt.claims; Start runs as game_engine, as game/ calls it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test');
insert into public.host_codes (code) values ('TESTHSTS');
insert into public.hosts (user_id, code)
select id, 'TESTHSTS' from auth.users where email like '%@example.test';

-- A small catalog in its own season, so start_game can build a board.
insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 38, date '2022-01-01', r.round, 'OPTS ' || r.round::text || ' ' || c,
       case when r.round = 'final' then null else 200 * n end, 'clue', 'response',
       'opts-test-' || r.round::text || '-' || c || '-' || n
from (values ('single'::public.round, 6, 5), ('double'::public.round, 6, 5), ('final'::public.round, 1, 1))
  as r (round, cats, per)
cross join lateral generate_series(1, r.cats) as c
cross join lateral generate_series(1, r.per) as n;

-- Alice hosts; Bob joins.
select tests.as_user('11111111-1111-4111-8111-111111111111');
select set_config('tests.room', public.create_room('Alice')::text, true);
select set_config('tests.code', (select code from public.rooms where id = tests.room()), true);
select tests.as_user('22222222-2222-4222-8222-222222222222');
select public.join_room(current_setting('tests.code'), 'Bob');

-- ---------------------------------------------------------------------------
-- Defaults, and setting them
-- ---------------------------------------------------------------------------
select tests.as_user('11111111-1111-4111-8111-111111111111');
select is(
  (select array[timers::text, double_round::text, coalesce(seasons::text, 'all')] from public.rooms where id = tests.room()),
  array['standard', 'true', 'all'], 'a new room: Standard timers, Double on, every season'
);
select lives_ok(
  $$ select public.set_room_options(tests.room(), true, '{38}', 'fast', false, null) $$,
  'the host sets the options'
);
select is(
  (select array[timers::text, double_round::text, seasons::text, max_players::text] from public.rooms where id = tests.room()),
  array['standard', 'false', '{38}', '6'], 'options saved; a timer pace is ignored (always Standard); max players untouched'
);
select lives_ok(
  $$ select public.set_room_options(tests.room(), false, null, null, null, null) $$,
  'nulls leave everything as it is'
);
select is(
  (select quick_picks from public.rooms where id = tests.room()), false, 'Quick picks is off by default'
);
select lives_ok(
  $$ select public.set_room_options(tests.room(), false, null, null, null, null, true) $$,
  'the host turns Quick picks on'
);
select is(
  (select quick_picks from public.rooms where id = tests.room()), true, 'Quick picks saved'
);
select lives_ok(
  $$ select public.set_room_options(tests.room(), false, null, null, true, null) $$,
  'the 6-argument call (the api before quickPicks) still works'
);
select ok(
  (select quick_picks and double_round from public.rooms where id = tests.room()),
  'and leaves Quick picks as it was'
);
select public.set_room_options(tests.room(), false, null, null, false, null);
select is(
  (select seasons from public.rooms where id = tests.room()), '{38}'::integer[], 'seasons kept when not set'
);

-- ---------------------------------------------------------------------------
-- Who and when
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.set_room_options(tests.room(), true, '{}', null, null, null) $$,
  '22023', 'seasons must be 1 to 40', 'no seasons at all is refused'
);
select throws_ok(
  $$ select public.set_room_options(tests.room(), true, '{0,41}', null, null, null) $$,
  '22023', 'seasons must be 1 to 40', 'seasons out of range are refused'
);
select tests.as_user('22222222-2222-4222-8222-222222222222');
select throws_ok(
  $$ select public.set_room_options(tests.room(), false, null, 'relaxed', null, null) $$,
  '42501', 'not the host', 'a contestant can''t change the options'
);
select throws_ok(
  $$ update public.rooms set timers = 'relaxed' where id = tests.room() $$,
  '42501', null, 'nor write the room directly'
);
select throws_ok(
  $$ select public.set_room_options(tests.room(), false, null, null, null, null, false) $$,
  '42501', 'not the host', 'a contestant can''t turn Quick picks off'
);

-- ---------------------------------------------------------------------------
-- Start copies them onto the game; Double off builds no Double board
-- ---------------------------------------------------------------------------
select tests.as_engine();
select set_config('tests.game', public.start_game(tests.room())::text, true);
reset role;
select is(
  (select array[timers::text, double_round::text, quick_picks::text] from public.games where id = current_setting('tests.game')::uuid),
  array['standard', 'false', 'true'], 'the game keeps the options it started with, Quick picks included'
);
select is(
  (select count(*)::integer from public.board_clues where game_id = current_setting('tests.game')::uuid and round = 'double'),
  0, 'Double Schmegettes off: no Double board'
);
select ok(
  (select count(*) > 0 from public.board_clues where game_id = current_setting('tests.game')::uuid and round = 'single'),
  'the Single board as usual'
);
select is(
  (select count(*)::integer from public.board_clues b join public.clues c on c.id = b.clue_id
   where b.game_id = current_setting('tests.game')::uuid and c.season <> 38),
  0, 'every clue from the chosen seasons'
);

select tests.as_user('11111111-1111-4111-8111-111111111111');
select throws_ok(
  $$ select public.set_room_options(tests.room(), false, null, 'relaxed', null, null) $$,
  '55000', 'game started', 'options lock at Start'
);
reset role;

select function_privs_are(
  'public', 'set_room_options', array['uuid', 'boolean', 'integer[]', 'timer_pace', 'boolean', 'integer', 'boolean'],
  'anon', array[]::text[], 'anon can''t set options'
);
select function_privs_are(
  'public', 'set_room_options', array['uuid', 'boolean', 'integer[]', 'timer_pace', 'boolean', 'integer', 'boolean'],
  'authenticated', array['EXECUTE'], 'signed-in users can call it (the host check is inside)'
);

select * from finish();
rollback;
