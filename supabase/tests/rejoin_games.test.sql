-- Rejoin and resume games. Run with `mise run db:test`.
-- Rules: docs/product-docs/features/rejoin-games/. Users act as authenticated with
-- request.jwt.claims; game/ calls run as game_engine.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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
create function tests.v(p_name text) returns uuid language sql stable as $$
  select current_setting('tests.' || p_name)::uuid;
$$;
grant execute on all functions in schema tests to public;

-- Alice hosts; Bob and Carol play; Dave never did.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'carol@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'dave@example.test');
insert into public.host_codes (code) values ('TESTHSTS');
insert into public.hosts (user_id, code)
select id, 'TESTHSTS' from auth.users where email like '%@example.test';

insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 39, date '2023-01-01', r.round, 'RESUME ' || r.round::text || ' ' || c,
       case when r.round = 'final' then null else 200 * n end, 'clue', 'response',
       'resume-test-' || r.round::text || '-' || c || '-' || n
from (values ('single'::public.round, 6, 5), ('double'::public.round, 6, 5), ('final'::public.round, 1, 1))
  as r (round, cats, per)
cross join lateral generate_series(1, r.cats) as c
cross join lateral generate_series(1, r.per) as n;

select tests.as_user('11111111-1111-4111-8111-111111111111');
select set_config('tests.room', public.create_room('Alice')::text, true);
select set_config('tests.code', (select code from public.rooms where id = tests.v('room')), true);
select tests.as_user('22222222-2222-4222-8222-222222222222');
select public.join_room(current_setting('tests.code'), 'Bob');
select tests.as_user('33333333-3333-4333-8333-333333333333');
select public.join_room(current_setting('tests.code'), 'Carol');

-- ---------------------------------------------------------------------------
-- Rejoin: Home finds the game in progress
-- ---------------------------------------------------------------------------
select tests.as_engine();
select set_config('tests.game', public.start_game(tests.v('room'))::text, true);
-- A clue is in play when the game stops.
select set_config('tests.clue', (select id::text from public.board_clues
  where game_id = tests.v('game') and round = 'single' order by column_index, row_index limit 1), true);
select public.reveal_clue(tests.v('clue'));
update public.board_clues set state = 'active' where id = tests.v('clue');

select tests.as_user('22222222-2222-4222-8222-222222222222');
select is(
  (select array[kind, code, role] from public.my_current_room()),
  array['game', current_setting('tests.code'), 'contestant'], 'Bob is offered his game in progress'
);
select is(
  (select player_names from public.my_current_room()), array['Bob', 'Carol'], 'with who is playing'
);
select tests.as_user('44444444-4444-4444-8444-444444444444');
select is((select count(*)::integer from public.my_current_room()), 0, 'Dave is in no room');

-- The host device is gone 30 minutes: abandoned, room closed.
select tests.as_engine();
select public.end_game(tests.v('game'), 'abandoned');
update public.rooms set status = 'closed' where id = tests.v('room');
select tests.as_user('22222222-2222-4222-8222-222222222222');
select is((select count(*)::integer from public.my_current_room()), 0, 'nothing to rejoin once it ended');

-- ---------------------------------------------------------------------------
-- Resume: only the host, only abandoned, only within 30 days
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.resume_game(tests.v('game')) $$, '42501', 'not the host', 'a contestant can''t resume'
);
select tests.as_user('11111111-1111-4111-8111-111111111111');
select set_config('tests.resume', public.resume_game(tests.v('game'))::text, true);
select is(public.resume_game(tests.v('game')), tests.v('resume'), 'pressing again reuses the open resume lobby');
select is(
  (select array[status::text, host_plays::text] from public.rooms where id = tests.v('resume')),
  array['open', 'false'], 'a new open room; the host who only hosted still only hosts'
);
select set_config('tests.rcode', (select code from public.rooms where id = tests.v('resume')), true);

select tests.as_user('22222222-2222-4222-8222-222222222222');
select is(
  (select array[kind, code] from public.my_current_room()),
  array['resume_invite', current_setting('tests.rcode')], 'Bob is invited back'
);
select lives_ok($$ select public.join_room(current_setting('tests.rcode'), 'Robert') $$, 'Bob joins the resume lobby');
select is(
  (select display_name from public.room_members where room_id = tests.v('resume') and user_id = '22222222-2222-4222-8222-222222222222'),
  'Bob', 'with the name he played under, not a new one'
);
select tests.as_user('44444444-4444-4444-8444-444444444444');
select throws_ok(
  $$ select public.join_room(current_setting('tests.rcode'), 'Dave') $$,
  'SCH01', 'not in this game', 'someone who didn''t play can''t join'
);

-- ---------------------------------------------------------------------------
-- Start: the same game, back in progress, where it stopped
-- ---------------------------------------------------------------------------
select tests.as_engine();
select is(public.start_resumed_game(tests.v('resume')), tests.v('game'), 'Start resumes the same game');
reset role;
select is(
  (select array[status::text, room_id::text, coalesce(finished_at::text, 'null')] from public.games where id = tests.v('game')),
  array['in_progress', tests.v('resume')::text, 'null'], 'in progress again, in the new room'
);
select is(
  (select state::text from public.board_clues where id = tests.v('clue')), 'unanswered',
  'the clue in play when it stopped is done, with no score change'
);
select is(
  (select array[status::text, coalesce(resume_game_id::text, 'null')] from public.rooms where id = tests.v('resume')),
  array['in_game', 'null'], 'the room is an ordinary room with a game in progress now'
);

-- Carol comes back mid-game; Dave still can't.
select tests.as_user('33333333-3333-4333-8333-333333333333');
select lives_ok($$ select public.join_room(current_setting('tests.rcode'), 'Carol') $$, 'Carol takes her seat mid-game');
select tests.as_user('44444444-4444-4444-8444-444444444444');
select throws_ok(
  $$ select public.join_room(current_setting('tests.rcode'), 'Dave') $$, '55000', 'game started', 'Dave still can''t'
);
reset role;

select function_privs_are('public', 'start_resumed_game', array['uuid'], 'authenticated', array[]::text[],
  'players can''t start a resume themselves');
select function_privs_are('public', 'start_resumed_game', array['uuid'], 'game_engine', array['EXECUTE'],
  'game/ starts it');

select * from finish();
rollback;
