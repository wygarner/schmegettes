-- Answer judging: the rule, transcripts and judge's verdict recorded with each answer, and
-- when the host overrode it. Run with `mise run db:test`.
-- Rules: docs/product-docs/features/gameplay/ ("How an answer is matched"). Engine calls run as game_engine.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

grant game_engine to current_user;
grant usage on schema extensions to game_engine;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'host@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'alice@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test');

insert into public.host_codes (code) values ('TESTJDGE');
insert into public.hosts (user_id, code) values ('11111111-1111-4111-8111-111111111111', 'TESTJDGE');
insert into public.profiles (user_id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Wyatt'),
  ('22222222-2222-4222-8222-222222222222', 'Alice'),
  ('33333333-3333-4333-8333-333333333333', 'Olive');

insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 87, date '2001-01-01', r.round, 'JUDGE ' || r.round::text || ' ' || c,
       case when r.round = 'final' then null else 200 * n end, 'clue', 'Mauna Loa',
       'judging-test-' || r.round::text || '-' || c || '-' || n
from (values ('single'::public.round, 6, 5), ('double'::public.round, 6, 5), ('final'::public.round, 1, 1))
  as r (round, cats, per)
cross join lateral generate_series(1, r.cats) as c
cross join lateral generate_series(1, r.per) as n;

insert into public.rooms (id, code, host_id, seasons) values
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'JDGE2', '11111111-1111-4111-8111-111111111111', '{87}');
insert into public.room_members (room_id, user_id, role) values
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', '22222222-2222-4222-8222-222222222222', 'contestant');

set local role game_engine;
select set_config('tests.g', public.start_game('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2')::text, true);
select set_config('tests.c1', (select id::text from public.board_clues
  where game_id = current_setting('tests.g')::uuid and round = 'single' and column_index = 0 and row_index = 0), true);
select public.reveal_clue(current_setting('tests.c1')::uuid);

-- Recording the rule and transcripts
select lives_ok($$ select public.record_answer('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', current_setting('tests.c1')::uuid,
  '22222222-2222-4222-8222-222222222222', 'mona lowa', 'voice', 'correct', 200, 'sounds_alike',
  array['mona lowa', 'mono lower']) $$, 'record_answer takes the rule and transcripts');
select is((select match_rule from public.answers where id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  'sounds_alike'::public.match_rule, 'the rule is stored');
select is((select heard from public.answers where id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  array['mona lowa', 'mono lower'], 'every transcript is stored, in order');
select is((select judge_verdict from public.answers where id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  'correct'::public.verdict, 'the judge''s verdict is stored');

-- The running game server's 7-argument call still works
select lives_ok($$ select public.record_answer('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', current_setting('tests.c1')::uuid,
  '22222222-2222-4222-8222-222222222222', 'kilauea', 'voice', 'incorrect', -200) $$, 'the 7-argument call still works');
select ok((select match_rule is null and heard is null and judge_verdict = 'incorrect'
  from public.answers where id = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2'),
  'without them, the rule and transcripts are null and the judge''s verdict is kept');

-- Overrides
select ok((select overridden_at is null from public.answers where id = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2'),
  'a new answer has not been overridden');
select public.update_verdict('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'overridden_correct', 200);
select ok((select overridden_at is not null and judge_verdict = 'incorrect' and verdict = 'overridden_correct'
  from public.answers where id = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2'),
  'an override stamps overridden_at and keeps the judge''s verdict');
select public.update_verdict('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'overridden_incorrect', -200);
select public.update_verdict('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'overridden_correct', 200);
select ok((select judge_verdict = 'correct' and match_rule = 'sounds_alike' and heard = array['mona lowa', 'mono lower']
  and overridden_at is not null from public.answers where id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  'a flip and a flip back keep the judge''s verdict, rule and transcripts');

-- Limits
select throws_ok($$ select public.record_answer('c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', current_setting('tests.c1')::uuid,
  '22222222-2222-4222-8222-222222222222', 'a', 'voice', 'incorrect', -200, 'no_match',
  array['a', 'b', 'c', 'd', 'e', 'f']) $$, '23514', null, 'at most 5 transcripts');
select throws_ok($$ select public.record_answer('c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4', current_setting('tests.c1')::uuid,
  '22222222-2222-4222-8222-222222222222', 'a', 'voice', 'incorrect', -200, 'no_match', array[]::text[]) $$,
  '23514', null, 'an empty transcript list is rejected (use null)');

-- Who can read it
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select match_rule from public.answers where id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  'sounds_alike'::public.match_rule, 'a player in the game can read the new fields');
select throws_ok($$ select public.record_answer('c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5', current_setting('tests.c1')::uuid,
  '22222222-2222-4222-8222-222222222222', 'x', 'voice', 'correct', 200, 'exact', array['x']) $$,
  '42501', null, 'users cannot call record_answer');
select throws_ok($$ select public.update_verdict('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'overridden_incorrect', -200) $$,
  '42501', null, 'users cannot call update_verdict');

reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.answers where game_id = current_setting('tests.g')::uuid), 0,
  'someone outside the game reads none of its answers');

reset role;
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'record_answer'), 1, 'only one record_answer exists');

select * from finish();
rollback;
