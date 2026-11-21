-- Guest cleanup (GH-248). Run with `mise run db:test`.
-- Guests "age" by moving every timestamp that counts as use into the past.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

grant game_engine to current_user;
grant app_service to current_user;
grant usage on schema extensions to game_engine, app_service;

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;
grant execute on all functions in schema tests to public;

-- Guests already old enough in this database (none in CI), so counts below are exact.
select set_config('tests.before', (select count(*)::text from private.eligible_guests(now() - interval '90 days', 1000000)), true);

-- Old (91 days): plain, in a lobby, in a game in progress, played a finished game, a host.
-- Young (89 days). Recent: signed in long ago but refreshed a token yesterday.
-- Ann: an account last used 2 years ago. Alice: an admin account.
insert into auth.users (id, is_anonymous, created_at, last_sign_in_at) values
  ('10000000-0000-4000-8000-000000000001', true, now() - interval '91 days', now() - interval '91 days'),
  ('10000000-0000-4000-8000-000000000002', true, now() - interval '89 days', now() - interval '89 days'),
  ('10000000-0000-4000-8000-000000000003', true, now() - interval '91 days', now() - interval '91 days'),
  ('10000000-0000-4000-8000-000000000004', true, now() - interval '91 days', now() - interval '91 days'),
  ('10000000-0000-4000-8000-000000000005', true, now() - interval '91 days', now() - interval '91 days'),
  ('10000000-0000-4000-8000-000000000006', true, now() - interval '91 days', now() - interval '91 days'),
  ('10000000-0000-4000-8000-000000000007', true, now() - interval '200 days', now() - interval '200 days');
insert into auth.users (id, email, is_anonymous, created_at, last_sign_in_at) values
  ('20000000-0000-4000-8000-000000000001', 'ann@cleanup.test', false, now() - interval '2 years', now() - interval '2 years'),
  ('20000000-0000-4000-8000-000000000002', 'alice@cleanup.test', false, now(), now());
insert into private.admins (user_id) values ('20000000-0000-4000-8000-000000000002');
insert into public.profiles (user_id, display_name)
select id, 'Player' from auth.users where id::text like '10000000-%' or id::text like '20000000-%'
on conflict (user_id) do nothing;

-- Sessions: old ones for the old guests; the recent guest refreshed yesterday.
insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at) values
  (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', now() - interval '120 days', now() - interval '91 days',
   (now() - interval '91 days') at time zone 'UTC'),
  (gen_random_uuid(), '10000000-0000-4000-8000-000000000007', now() - interval '200 days', now() - interval '200 days',
   (now() - interval '1 day') at time zone 'UTC');

-- An open lobby (hosted by Ann) the lobby guest joined 91 days ago.
insert into public.rooms (id, code, host_id, status) values
  ('a0000000-0000-4000-8000-000000000001', 'CLNP1', '20000000-0000-4000-8000-000000000001', 'open');
insert into public.room_members (room_id, user_id, role, joined_at) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'contestant', now() - interval '91 days');

-- A game in progress and a finished one, both hosted by Ann.
insert into public.clues (id, season, air_date, round, category, value, clue_text, correct_response, source_key)
values ('c0000000-0000-4000-8000-000000000001', 78, date '2001-01-01', 'single', 'CLEANUP', 200, 'clue', 'response', 'cleanup-test-1');
insert into public.games (id, status, started_at, finished_at, host_user_id) values
  ('b0000000-0000-4000-8000-000000000001', 'in_progress', now() - interval '91 days', null, '20000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'finished', now() - interval '91 days', now() - interval '91 days',
   '20000000-0000-4000-8000-000000000001');
insert into public.game_players (id, game_id, user_id, role, display_name, joined_at) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000004', 'contestant', 'Ivy', now() - interval '91 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000005', 'contestant', 'Pat', now() - interval '91 days'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001', 'contestant', 'Ann', now() - interval '2 years');
insert into public.board_clues (id, game_id, round, column_index, row_index, category, value, clue_id, state) values
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'single', 0, 0, 'CLEANUP', 200,
   'c0000000-0000-4000-8000-000000000001', 'answered');
insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta) values
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000002', 'response', 'typed', 'correct', 200),
  ('f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000003', 'wrong', 'typed', 'incorrect', -200);
insert into public.seen_clues (user_id, clue_id, seen_at, game_id) values
  ('10000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', now() - interval '91 days',
   'b0000000-0000-4000-8000-000000000002');

-- The host guest.
insert into public.host_codes (code) values ('CXEANUPS');
insert into public.hosts (user_id, code, created_at) values
  ('10000000-0000-4000-8000-000000000006', 'CXEANUPS', now() - interval '91 days');

-- Results before the run, to compare.
create temporary table before_results as
  select game_player_id, score, placement from public.game_results where game_id = 'b0000000-0000-4000-8000-000000000002';

-- 1. Locked down
select has_table('private', 'cleanup_runs', 'cleanup_runs exists');
select ok((select relrowsecurity from pg_class where oid = 'private.cleanup_runs'::regclass), 'cleanup_runs has RLS');
select ok(exists (select 1 from cron.job where jobname = 'delete-unused-guests' and schedule = '17 4 * * *'
                  and command = 'select private.delete_unused_guests()'), 'the daily job is scheduled at 04:17 UTC');

select tests.as_user('20000000-0000-4000-8000-000000000001');
select throws_ok($$ select private.delete_unused_guests() $$, '42501', null, 'authenticated cannot run the cleanup');
select throws_ok($$ select * from private.cleanup_runs $$, '42501', null, 'authenticated cannot read cleanup runs');
select throws_ok($$ select * from private.admin_cleanup_runs() $$, '42501', null, 'a non-admin cannot list runs');
reset role;
set local role app_service;
select throws_ok($$ select private.delete_unused_guests() $$, '42501', null, 'app_service cannot run the cleanup');
reset role;
set local role game_engine;
select throws_ok($$ select private.delete_unused_guests() $$, '42501', null, 'game_engine cannot run the cleanup');
reset role;

-- 2. Last use
select ok(private.guest_last_used('10000000-0000-4000-8000-000000000007') > now() - interval '2 days',
  'a token refresh counts as use');
select ok(private.guest_last_used('10000000-0000-4000-8000-000000000001') < now() - interval '90 days',
  'an untouched guest was last used 91 days ago');

-- 3. The run (as the owner, as pg_cron runs it)
select is(private.delete_unused_guests(), current_setting('tests.before')::integer + 3,
  'the run deletes the three eligible guests');

select ok(not exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000001'),
  'a guest unused for 91 days is deleted');
select ok(exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000002'),
  'a guest unused for 89 days is kept');
select ok(exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000003'),
  'a 91-day guest in an open room is kept');
select ok(exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000004'),
  'a 91-day guest in a game in progress is kept');
select ok(exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000007'),
  'a guest who refreshed yesterday is kept');
select ok(exists (select 1 from auth.users where id = '20000000-0000-4000-8000-000000000001'),
  'an account unused for 2 years is kept');

select ok(not exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000005'),
  'the guest who played a finished game is deleted');
select results_eq(
  $$ select game_player_id, score, placement from public.game_results
     where game_id = 'b0000000-0000-4000-8000-000000000002' order by game_player_id $$,
  $$ select game_player_id, score, placement from before_results order by game_player_id $$,
  'every score and placement on that scoreboard is unchanged');
select is((select display_name from public.game_results where game_player_id = 'd0000000-0000-4000-8000-000000000002'),
  'Former player', 'their seat shows Former player');
select is((select display_name from public.game_results where game_player_id = 'd0000000-0000-4000-8000-000000000003'),
  'Ann', 'the other player''s row is unchanged');
select ok(not exists (select 1 from public.seen_clues where user_id = '10000000-0000-4000-8000-000000000005'),
  'their seen clues are gone');
select ok(not exists (select 1 from public.hosts where user_id = '10000000-0000-4000-8000-000000000006'),
  'a deleted host guest loses host access');

-- 4. Recorded and audited, counts only
select tests.as_user('20000000-0000-4000-8000-000000000002');
select is((select deleted from private.admin_cleanup_runs() limit 1), current_setting('tests.before')::integer + 3,
  'the run is recorded with its count; the admin can list it');
reset role;
select is((select (details ->> 'count')::integer from private.audit_log where action = 'guests_deleted'
           order by id desc limit 1),
  current_setting('tests.before')::integer + 3, 'the run is audited with its count');

select * from finish();
rollback;
