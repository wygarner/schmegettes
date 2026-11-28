-- Voided answers (GH-338): an answer after an earlier one on the clue was overridden to correct
-- scores 0 and is recorded as voided. Run with `mise run db:test`.
-- Rules: docs/product-docs/features/scoreboard-and-overrides/ (Host overrides). Engine calls run as game_engine.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

grant game_engine to current_user;
grant usage on schema extensions to game_engine;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'host@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'alice@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test');

insert into public.host_codes (code) values ('TESTVXDE');
insert into public.hosts (user_id, code) values ('11111111-1111-4111-8111-111111111111', 'TESTVXDE');
insert into public.profiles (user_id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Wyatt'),
  ('22222222-2222-4222-8222-222222222222', 'Alice'),
  ('33333333-3333-4333-8333-333333333333', 'Olive');

insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 88, date '2001-01-01', r.round, 'VOID ' || r.round::text || ' ' || c,
       case when r.round = 'final' then null else 200 * n end, 'clue', 'Mauna Loa',
       'voided-test-' || r.round::text || '-' || c || '-' || n
from (values ('single'::public.round, 6, 5), ('double'::public.round, 6, 5), ('final'::public.round, 1, 1))
  as r (round, cats, per)
cross join lateral generate_series(1, r.cats) as c
cross join lateral generate_series(1, r.per) as n;

insert into public.rooms (id, code, host_id, seasons) values
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'VOID2', '11111111-1111-4111-8111-111111111111', '{88}');
insert into public.room_members (room_id, user_id, role) values
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', '22222222-2222-4222-8222-222222222222', 'contestant');

set local role game_engine;
select set_config('tests.g', public.start_game('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2')::text, true);
select set_config('tests.c1', (select id::text from public.board_clues
  where game_id = current_setting('tests.g')::uuid and round = 'single' and column_index = 0 and row_index = 0), true);
select public.reveal_clue(current_setting('tests.c1')::uuid);

select ok('voided' = any(enum_range(null::public.verdict)::text[]), 'voided is a verdict');

select public.record_answer('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', current_setting('tests.c1')::uuid,
  '22222222-2222-4222-8222-222222222222', 'mauna loa', 'voice', 'correct', 200, 'exact', array['mauna loa']);
select lives_ok($$ select public.update_verdict('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'voided', 0) $$,
  'update_verdict takes voided');
select ok((select verdict = 'voided' and score_delta = 0 and judge_verdict = 'correct' and overridden_at is not null
  from public.answers where id = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1'),
  'a voided answer scores 0 and keeps the judge''s verdict');
select lives_ok($$ select public.update_verdict('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'correct', 200) $$,
  'a voided answer can be restored');
select ok((select verdict = 'correct' and score_delta = 200 from public.answers
  where id = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1'), 'restored as it was judged');

select * from finish();
rollback;
