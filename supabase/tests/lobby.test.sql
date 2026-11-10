-- Lobby: creating rooms, joining with names, a host who plays. Run with `mise run db:test`.
-- Rules: docs/product-docs/features/lobby/. Users act as authenticated with request.jwt.claims;
-- lobby changes run as game_engine, as game/ calls them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

grant game_engine to current_user;
grant usage on schema extensions to game_engine;

create schema tests;
grant usage on schema tests to public;

-- Act as a user (by first letter of the fixture id), or as game_engine.
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
create function tests.room(p_name text) returns uuid language sql stable as $$
  select current_setting('tests.' || p_name)::uuid;
$$;
create function tests.name_of(p_room uuid, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select display_name from public.room_members where room_id = p_room and user_id = p_user;
$$;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'carol@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'dave@example.test'),
  ('55555555-5555-4555-8555-555555555555', 'eve@example.test');

-- Hosting is invite-only; these fixture users can host. The gate itself is tested in
-- private_access.test.sql.
insert into public.host_codes (code) values ('TESTHSTS');
insert into public.hosts (user_id, code)
select id, 'TESTHSTS' from auth.users where email like '%@example.test';

-- A small catalog in its own season, so start_game can build a board.
insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 77, date '2001-01-01', r.round, 'LOBBY ' || r.round::text || ' ' || c,
       case when r.round = 'final' then null else 200 * n end, 'clue', 'response',
       'lobby-test-' || r.round::text || '-' || c || '-' || n
from (values ('single'::public.round, 6, 5), ('double'::public.round, 6, 5), ('final'::public.round, 1, 1))
  as r (round, cats, per)
cross join lateral generate_series(1, r.cats) as c
cross join lateral generate_series(1, r.per) as n;

-- ---------------------------------------------------------------------------
-- Creating a room
-- ---------------------------------------------------------------------------
select tests.as_user('11111111-1111-4111-8111-111111111111');

select throws_ok($$ select public.create_room('   ') $$, '22023', null, 'a blank host name is refused');
select throws_ok($$ select public.create_room(repeat('x', 21)) $$, '22023', null, 'a 21-character name is refused');

select set_config('tests.old', public.create_room('Wyatt')::text, true);
select set_config('tests.r', public.create_room('  Wyatt ')::text, true);

select matches(
  (select code from public.rooms where id = tests.room('r')),
  '^[2-9A-HJKMNP-Z]{5}$',
  'codes use no look-alike characters'
);
select is(tests.name_of(tests.room('r'), '11111111-1111-4111-8111-111111111111'), 'Wyatt', 'the host is a member under the trimmed name');
select is(
  (select display_name from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'),
  'Wyatt', 'the name is remembered on the profile'
);
select is((select status from public.rooms where id = tests.room('old')), 'closed'::public.room_status, 'a new room closes the host''s previous lobby');
select is((select host_plays from public.rooms where id = tests.room('r')), false, 'the host does not play by default');

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------
select set_config('tests.code', (select code from public.rooms where id = tests.room('r')), true);
select set_config('tests.oldcode', (select code from public.rooms where id = tests.room('old')), true);

select tests.as_user('22222222-2222-4222-8222-222222222222');
select is(public.join_room(lower(current_setting('tests.code')), 'Wyatt'), tests.room('r'), 'a contestant joins by code, any case');
select is(tests.name_of(tests.room('r'), '22222222-2222-4222-8222-222222222222'), 'Wyatt', 'a contestant may share the name of a host who isn''t playing');
select is(public.join_room(current_setting('tests.code'), 'Zed'), tests.room('r'), 'joining again returns the same room');
select is(tests.name_of(tests.room('r'), '22222222-2222-4222-8222-222222222222'), 'Wyatt', 'joining again keeps the name');
select throws_ok($$ select public.join_room('ZZZZZ', 'Bob') $$, 'P0002', null, 'an unknown code is not found');
select throws_ok($$ select public.join_room(current_setting('tests.oldcode'), 'Bob') $$, 'P0002', null, 'a closed room is not found');
select throws_ok($$ select public.join_room(current_setting('tests.code'), '') $$, '22023', null, 'joining needs a name');

select tests.as_user('33333333-3333-4333-8333-333333333333');
select lives_ok($$ select public.join_room(current_setting('tests.code'), 'wyatt') $$, 'a second contestant joins');
select is(tests.name_of(tests.room('r'), '33333333-3333-4333-8333-333333333333'), 'wyatt 2', 'a taken name gets a suffix, case-insensitively');

-- What users can't do directly.
select throws_ok(
  $$ update public.room_members set display_name = 'Hacked' where user_id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', null, 'a user cannot rename members directly'
);
select throws_ok($$ select public.set_member_name(tests.room('r'), '33333333-3333-4333-8333-333333333333', 'X') $$, '42501', null, 'users cannot call set_member_name');
select throws_ok($$ select public.set_host_plays(tests.room('r'), true) $$, '42501', null, 'users cannot call set_host_plays');
select throws_ok($$ select public.leave_room(tests.room('r'), '33333333-3333-4333-8333-333333333333') $$, '42501', null, 'users cannot call leave_room');

select tests.as_user('11111111-1111-4111-8111-111111111111');
select throws_ok(
  $$ update public.rooms set host_plays = true where id = tests.room('r') $$,
  '42501', null, 'the host cannot set host_plays directly'
);

-- ---------------------------------------------------------------------------
-- Capacity and the playing host
-- ---------------------------------------------------------------------------
reset role;
select throws_ok(
  $$ update public.rooms set max_players = 7 where id = tests.room('r') $$,
  '23514', null, 'a room holds at most 6 contestants'
);
select lives_ok($$ update public.rooms set max_players = 6 where id = tests.room('r') $$, '6 contestants is allowed');
select throws_ok(
  $$ update public.rooms set max_players = 1 where id = tests.room('r') $$,
  '23514', null, 'a room needs room for at least 2 contestants'
);
update public.rooms set max_players = 2, seasons = '{77}' where id = tests.room('r');

select tests.as_user('44444444-4444-4444-8444-444444444444');
select throws_ok($$ select public.join_room(current_setting('tests.code'), 'Dave') $$, '23P01', null, 'a full room refuses contestants');

select tests.as_engine();
select throws_ok($$ select public.set_host_plays(tests.room('r'), true) $$, '23P01', null, 'the host cannot join a full room');

reset role;
update public.rooms set max_players = 3 where id = tests.room('r');

select tests.as_engine();
select lives_ok($$ select public.set_host_plays(tests.room('r'), true) $$, 'the host joins the game');
select is(tests.name_of(tests.room('r'), '11111111-1111-4111-8111-111111111111'), 'Wyatt 3', 'a joining host is the later name and gets the suffix');

select tests.as_user('44444444-4444-4444-8444-444444444444');
select throws_ok($$ select public.join_room(current_setting('tests.code'), 'Dave') $$, '23P01', null, 'a playing host counts toward the limit');

select tests.as_engine();
select lives_ok($$ select public.set_host_plays(tests.room('r'), false) $$, 'the host leaves the game');
select is(tests.name_of(tests.room('r'), '11111111-1111-4111-8111-111111111111'), 'Wyatt', 'leaving the game gives back the chosen name');

-- ---------------------------------------------------------------------------
-- Renaming and leaving
-- ---------------------------------------------------------------------------
select is(public.set_member_name(tests.room('r'), '33333333-3333-4333-8333-333333333333', 'Carol'), 'Carol', 'a member renames');
select is(public.set_member_name(tests.room('r'), '33333333-3333-4333-8333-333333333333', 'Carol'), 'Carol', 'renaming to your own name keeps it');
select lives_ok($$ select public.leave_room(tests.room('r'), '11111111-1111-4111-8111-111111111111') $$, 'leave_room ignores the host');
select ok(tests.name_of(tests.room('r'), '11111111-1111-4111-8111-111111111111') is not null, 'the host stays in the room');

-- ---------------------------------------------------------------------------
-- Start with a playing host
-- ---------------------------------------------------------------------------
select public.set_host_plays(tests.room('r'), true);
select set_config('tests.g', public.start_game(tests.room('r'))::text, true);
select is(
  (select role from public.game_players where game_id = tests.room('g') and user_id = '11111111-1111-4111-8111-111111111111'),
  'contestant'::public.player_role, 'a playing host is a contestant in the game'
);
select ok(
  (select placement from public.game_results where game_id = tests.room('g') and user_id = '11111111-1111-4111-8111-111111111111') is not null,
  'a playing host gets a placement'
);
select is(
  (select array_agg(display_name order by display_name) from public.game_players where game_id = tests.room('g')),
  array['Carol', 'Wyatt', 'Wyatt 2'], 'game players keep their room names'
);

select throws_ok($$ select public.set_member_name(tests.room('r'), '33333333-3333-4333-8333-333333333333', 'Late') $$, '55000', null, 'names are fixed once the game starts');

select tests.as_user('44444444-4444-4444-8444-444444444444');
select throws_ok($$ select public.join_room(current_setting('tests.code'), 'Dave') $$, '55000', null, 'contestants cannot join after Start');
select tests.as_user('55555555-5555-4555-8555-555555555555');
select lives_ok($$ select public.join_room(current_setting('tests.code'), 'Eve', 'spectator') $$, 'spectators can still join');

-- A closed room's code can be used again.
reset role;
select lives_ok(
  format($$ insert into public.rooms (code, host_id) values (%L, '22222222-2222-4222-8222-222222222222') $$, current_setting('tests.oldcode')),
  'a closed room''s code can be reused'
);

select * from finish();
rollback;
