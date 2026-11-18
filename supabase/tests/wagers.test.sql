-- Wagers: secret wager storage, typed Final answers, and the in-game board_clues policy.
-- Run with `mise run db:test`. Rules: docs/product-docs/features/wagers/.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

grant game_engine to current_user;
grant usage on schema extensions to game_engine;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'host@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'alice@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test');

-- Hosting is invite-only; these fixture users can host. The gate itself is tested in
-- private_access.test.sql.
insert into public.host_codes (code) values ('TESTHSTS');
insert into public.hosts (user_id, code)
select id, 'TESTHSTS' from auth.users where email like '%@example.test';
insert into public.profiles (user_id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Wyatt'),
  ('22222222-2222-4222-8222-222222222222', 'Alice'),
  ('33333333-3333-4333-8333-333333333333', 'Olive');

insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 87, date '2001-01-01', r.round, 'WAGER ' || r.round::text || ' ' || c,
       case when r.round = 'final' then null else 200 * n end, 'clue', 'response',
       'wagers-test-' || r.round::text || '-' || c || '-' || n
from (values ('single'::public.round, 6, 5), ('double'::public.round, 6, 5), ('final'::public.round, 1, 1))
  as r (round, cats, per)
cross join lateral generate_series(1, r.cats) as c
cross join lateral generate_series(1, r.per) as n;

insert into public.rooms (id, code, host_id, seasons, host_plays) values
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'WAGR1', '11111111-1111-4111-8111-111111111111', '{87}', true);
insert into public.room_members (room_id, user_id, role) values
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', '22222222-2222-4222-8222-222222222222', 'contestant');

set local role game_engine;
select set_config('tests.g', public.start_game('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2')::text, true);
select set_config('tests.final', (select id::text from public.board_clues
  where game_id = current_setting('tests.g')::uuid and round = 'final'), true);
select set_config('tests.dd', (select id::text from public.board_clues
  where game_id = current_setting('tests.g')::uuid and round = 'single' and is_daily_double), true);
select set_config('tests.shown', (select id::text from public.board_clues
  where game_id = current_setting('tests.g')::uuid and round = 'single' and not is_daily_double limit 1), true);
select public.reveal_clue(current_setting('tests.shown')::uuid);

-- Wagers: the first one wins
select lives_ok($$ select public.record_wager(current_setting('tests.final')::uuid,
  '22222222-2222-4222-8222-222222222222', 600) $$, 'game_engine records a wager');
select public.record_wager(current_setting('tests.final')::uuid, '22222222-2222-4222-8222-222222222222', 900);
select is((select amount from public.wagers where board_clue_id = current_setting('tests.final')::uuid),
  600, 'a second wager leaves the first');
select lives_ok($$ select public.record_wager(current_setting('tests.final')::uuid,
  '11111111-1111-4111-8111-111111111111', 0) $$, 'a $0 wager is allowed, for a playing host too');
select throws_ok($$ select public.record_wager(current_setting('tests.final')::uuid,
  '33333333-3333-4333-8333-333333333333', 100) $$, 'P0002', null, 'someone outside the game cannot wager');
select throws_ok($$ insert into public.wagers (game_id, board_clue_id, game_player_id, amount)
  select current_setting('tests.g')::uuid, current_setting('tests.dd')::uuid, gp.id, -5
  from public.game_players gp where gp.game_id = current_setting('tests.g')::uuid limit 1 $$,
  '23514', null, 'a negative wager fails');

-- Typed Final answers: the first submission locks
select public.submit_final_answer(current_setting('tests.final')::uuid, '22222222-2222-4222-8222-222222222222', 'krakatoa');
select public.submit_final_answer(current_setting('tests.final')::uuid, '22222222-2222-4222-8222-222222222222', 'changed');
select is((select w.answer from public.wagers w join public.game_players gp on gp.id = w.game_player_id
  where w.board_clue_id = current_setting('tests.final')::uuid and gp.user_id = '22222222-2222-4222-8222-222222222222'),
  'krakatoa', 'a submitted answer is locked');
select isnt((select w.submitted_at from public.wagers w join public.game_players gp on gp.id = w.game_player_id
  where w.board_clue_id = current_setting('tests.final')::uuid and gp.user_id = '22222222-2222-4222-8222-222222222222'),
  null, 'submission time is stored');
select throws_ok($$ select public.submit_final_answer(current_setting('tests.final')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('x', 201)) $$, '23514', null, 'an answer over 200 characters fails');
select lives_ok($$ select public.record_answer('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', current_setting('tests.final')::uuid,
  '22222222-2222-4222-8222-222222222222', 'krakatoa', 'typed', 'correct', 600) $$, 'a typed answer can be recorded');

-- Players: no access to wagers at all
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok($$ select count(*) from public.wagers $$, '42501', null, 'a player cannot read wagers, even their own');
select throws_ok($$ insert into public.wagers (game_id, board_clue_id, game_player_id, amount)
  values (current_setting('tests.g')::uuid, current_setting('tests.final')::uuid, gen_random_uuid(), 1) $$,
  '42501', null, 'a player cannot insert a wager');
select throws_ok($$ update public.wagers set amount = 1 $$, '42501', null, 'a player cannot change a wager');
select throws_ok($$ select public.record_wager(current_setting('tests.final')::uuid,
  '22222222-2222-4222-8222-222222222222', 1) $$, '42501', null, 'a player cannot call record_wager');
select throws_ok($$ select public.submit_final_answer(current_setting('tests.final')::uuid,
  '22222222-2222-4222-8222-222222222222', 'x') $$, '42501', null, 'a player cannot call submit_final_answer');

-- board_clues during the game: only revealed rows
select is((select count(*)::integer from public.board_clues where game_id = current_setting('tests.g')::uuid
  and id = current_setting('tests.shown')::uuid), 1, 'a player sees a revealed clue');
select is((select count(*)::integer from public.board_clues where game_id = current_setting('tests.g')::uuid
  and id = current_setting('tests.dd')::uuid), 0, 'a player cannot see an unrevealed Daily Double');
select is((select count(*)::integer from public.board_clues where game_id = current_setting('tests.g')::uuid
  and is_daily_double and revealed_at is null), 0, 'no unrevealed Daily Double is visible');

reset role;
set local role anon;
select throws_ok($$ select count(*) from public.wagers $$, '42501', null, 'anon cannot read wagers');

-- After the game: everything, for history
reset role;
set local role game_engine;
select public.end_game(current_setting('tests.g')::uuid, 'finished');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::integer from public.board_clues where game_id = current_setting('tests.g')::uuid
  and id = current_setting('tests.final')::uuid), 1, 'after the game a player sees the Final clue');

select * from finish();
rollback;
