-- The same_words match rule (GH-339) is recorded like any other. Run with `mise run db:test`.
-- Rules: docs/product-docs/features/gameplay/ ("How an answer is matched"). Engine calls run as game_engine.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

grant game_engine to current_user;
grant usage on schema extensions to game_engine;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'host@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'alice@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test');

insert into public.host_codes (code) values ('TESTSAME');
insert into public.hosts (user_id, code) values ('11111111-1111-4111-8111-111111111111', 'TESTSAME');
insert into public.profiles (user_id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Wyatt'),
  ('22222222-2222-4222-8222-222222222222', 'Alice'),
  ('33333333-3333-4333-8333-333333333333', 'Olive');

insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 89, date '2001-01-01', r.round, 'SAME ' || r.round::text || ' ' || c,
       case when r.round = 'final' then null else 200 * n end, 'clue', 'Mauna Loa',
       'same-words-test-' || r.round::text || '-' || c || '-' || n
from (values ('single'::public.round, 6, 5), ('double'::public.round, 6, 5), ('final'::public.round, 1, 1))
  as r (round, cats, per)
cross join lateral generate_series(1, r.cats) as c
cross join lateral generate_series(1, r.per) as n;

insert into public.rooms (id, code, host_id, seasons) values
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'SAME2', '11111111-1111-4111-8111-111111111111', '{89}');
insert into public.room_members (room_id, user_id, role) values
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', '22222222-2222-4222-8222-222222222222', 'contestant');

set local role game_engine;
select set_config('tests.g', public.start_game('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2')::text, true);
select set_config('tests.c1', (select id::text from public.board_clues
  where game_id = current_setting('tests.g')::uuid and round = 'single' and column_index = 0 and row_index = 0), true);
select public.reveal_clue(current_setting('tests.c1')::uuid);

select ok('same_words' = any(enum_range(null::public.match_rule)::text[]), 'same_words is a match rule');
select lives_ok($$ select public.record_answer('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', current_setting('tests.c1')::uuid,
  '22222222-2222-4222-8222-222222222222', 'loa mauna', 'voice', 'correct', 200, 'same_words', array['loa mauna']) $$,
  'record_answer takes same_words');
select is((select match_rule from public.answers where id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'),
  'same_words'::public.match_rule, 'the rule is stored');

select * from finish();
rollback;
