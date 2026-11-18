-- Gameplay recording: finishing clues and scores from answers. Run with `mise run db:test`.
-- Rules: docs/product-docs/features/gameplay/. Engine calls run as game_engine.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

grant game_engine to current_user;
grant usage on schema extensions to game_engine;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'host@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'alice@example.test');

-- Hosting is invite-only; these fixture users can host. The gate itself is tested in
-- private_access.test.sql.
insert into public.host_codes (code) values ('TESTHSTS');
insert into public.hosts (user_id, code)
select id, 'TESTHSTS' from auth.users where email like '%@example.test';
insert into public.profiles (user_id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Wyatt'),
  ('22222222-2222-4222-8222-222222222222', 'Alice');

-- A small catalog in its own season so start_game can build a board.
insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 88, date '2001-01-01', r.round, 'PLAY ' || r.round::text || ' ' || c,
       case when r.round = 'final' then null else 200 * n end, 'clue', 'response',
       'gameplay-test-' || r.round::text || '-' || c || '-' || n
from (values ('single'::public.round, 6, 5), ('double'::public.round, 6, 5), ('final'::public.round, 1, 1))
  as r (round, cats, per)
cross join lateral generate_series(1, r.cats) as c
cross join lateral generate_series(1, r.per) as n;

-- The host plays on the host device; Alice plays on her phone.
insert into public.rooms (id, code, host_id, seasons, host_plays) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'PLAY2', '11111111-1111-4111-8111-111111111111', '{88}', true);
insert into public.room_members (room_id, user_id, role) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', '22222222-2222-4222-8222-222222222222', 'contestant');

set local role game_engine;
select set_config('tests.g', public.start_game('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')::text, true);
select set_config('tests.c1', (select id::text from public.board_clues
  where game_id = current_setting('tests.g')::uuid and round = 'single' and column_index = 0 and row_index = 0), true);
select set_config('tests.c2', (select id::text from public.board_clues
  where game_id = current_setting('tests.g')::uuid and round = 'single' and column_index = 0 and row_index = 1), true);

-- Finishing a clue
select public.reveal_clue(current_setting('tests.c1')::uuid);
select lives_ok($$ select public.finish_clue(current_setting('tests.c1')::uuid, 'answered') $$, 'finish_clue marks a clue answered');
select is((select state from public.board_clues where id = current_setting('tests.c1')::uuid), 'answered'::public.clue_state, 'the state is stored');
select public.finish_clue(current_setting('tests.c1')::uuid, 'unanswered');
select is((select state from public.board_clues where id = current_setting('tests.c1')::uuid), 'answered'::public.clue_state, 'finishing again keeps the first state');
select throws_ok($$ select public.finish_clue(current_setting('tests.c2')::uuid, 'active') $$, '22023', null, 'active is not a final state');
select throws_ok($$ select public.finish_clue(current_setting('tests.c2')::uuid, 'unplayed') $$, '22023', null, 'unplayed is not a final state');

-- Scores are the sum of answers, for a playing host too
select lives_ok($$ select public.record_answer('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', current_setting('tests.c1')::uuid,
  '11111111-1111-4111-8111-111111111111', 'what is response', 'voice', 'correct', 200) $$, 'a playing host can record an answer');
select public.record_answer('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', current_setting('tests.c1')::uuid,
  '22222222-2222-4222-8222-222222222222', 'nope', 'voice', 'incorrect', -200);
select public.record_answer('b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3', current_setting('tests.c2')::uuid,
  '22222222-2222-4222-8222-222222222222', 'response', 'voice', 'correct', 400);
select is((select score from public.game_results where game_id = current_setting('tests.g')::uuid
  and user_id = '22222222-2222-4222-8222-222222222222'), 200, 'a score is the sum of correct and incorrect answers');
select is((select score from public.game_results where game_id = current_setting('tests.g')::uuid
  and user_id = '11111111-1111-4111-8111-111111111111'), 200, 'the playing host scores');

-- Users can't finish clues
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.finish_clue(current_setting('tests.c2')::uuid, 'answered') $$, '42501', null, 'users cannot call finish_clue');

select * from finish();
rollback;
