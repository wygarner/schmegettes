-- Dedicated QA identities, leaderboard exclusion, and all-QA cleanup (GH-254).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid, p_anonymous boolean default false) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', p_anonymous)::text, true);
  set local role authenticated;
end;
$$;
create function tests.as_owner() returns void language plpgsql as $$ begin reset role; end; $$;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email, is_anonymous) values
  ('25400000-0000-4000-8000-000000000001', 'admin@qa.test', false),
  ('25400000-0000-4000-8000-000000000002', 'host@qa.test', false),
  ('25400000-0000-4000-8000-000000000003', 'one@qa.test', false),
  ('25400000-0000-4000-8000-000000000004', 'two@qa.test', false),
  ('25400000-0000-4000-8000-000000000005', 'real@qa.test', false),
  ('25400000-0000-4000-8000-000000000006', 'opponent@qa.test', false);
insert into public.profiles (user_id, display_name, account_name) values
  ('25400000-0000-4000-8000-000000000001', 'Admin', 'Admin'),
  ('25400000-0000-4000-8000-000000000002', 'Host', 'Host'),
  ('25400000-0000-4000-8000-000000000003', 'One', 'One'),
  ('25400000-0000-4000-8000-000000000004', 'Two', 'Two'),
  ('25400000-0000-4000-8000-000000000005', 'Real', 'Real'),
  ('25400000-0000-4000-8000-000000000006', 'Opponent', 'Opponent');
insert into private.admins (user_id) values ('25400000-0000-4000-8000-000000000001');
insert into public.clues (id, season, round, category, value, clue_text, correct_response, source_key)
values ('25410000-0000-4000-8000-000000000001', 254, 'single', 'QA', 100, 'clue', 'response', 'qa-test');

select has_table('private', 'qa_accounts', 'qa_accounts exists');
select ok((select relrowsecurity from pg_class where oid = 'private.qa_accounts'::regclass), 'qa_accounts has RLS');

select tests.as_user('25400000-0000-4000-8000-000000000005');
select throws_ok($$ select * from private.qa_accounts $$, '42501', null, 'players cannot read QA markers');
select throws_ok(
  $$ select private.admin_mark_qa('25400000-0000-4000-8000-000000000005', 'contestant', 'No') $$,
  '42501', 'not found', 'a non-admin cannot mark QA accounts');
select throws_ok(
  $$ select * from private.admin_qa_cleanup(interval '0', true) $$,
  '42501', 'not found', 'a non-admin cannot clean QA data');

select tests.as_user('25400000-0000-4000-8000-000000000001');
select private.admin_mark_qa('25400000-0000-4000-8000-000000000002', 'host', 'QA Host');
select private.admin_mark_qa('25400000-0000-4000-8000-000000000003', 'contestant', 'QA 1');
select private.admin_mark_qa('25400000-0000-4000-8000-000000000004', 'contestant', 'QA 2');

select tests.as_owner();
select results_eq(
  $$ select account_name from public.profiles where user_id in
       ('25400000-0000-4000-8000-000000000002', '25400000-0000-4000-8000-000000000003') order by user_id $$,
  $$ values ('QA Host'::text), ('QA 1'::text) $$,
  'marking sets the account labels');
select is((select note from public.hosts where user_id = '25400000-0000-4000-8000-000000000002'),
  'QA host (permanent)', 'the QA host has permanent host access');
select ok(not has_function_privilege('authenticated', 'private.is_qa(uuid)', 'execute'), 'is_qa is internal');

-- Ten finished wins for one QA account and one real account. QA must be removed before rank().
create function tests.add_rank_game(target uuid) returns uuid language plpgsql as $$
declare g uuid := gen_random_uuid(); t uuid := gen_random_uuid(); o uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into public.games (id, status, finished_at) values (g, 'finished', now());
  insert into public.game_players (id, game_id, user_id, role, display_name) values
    (t, g, target, 'contestant', 'Target'),
    (o, g, '25400000-0000-4000-8000-000000000006', 'contestant', 'Opponent');
  insert into public.board_clues (id, game_id, round, column_index, row_index, category, value, clue_id)
  values (b, g, 'single', 0, 0, 'QA', 100, '25410000-0000-4000-8000-000000000001');
  insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta) values
    (gen_random_uuid(), g, b, t, 'response', 'voice', 'correct', 100),
    (gen_random_uuid(), g, b, o, 'wrong', 'voice', 'incorrect', 0);
  return g;
end;
$$;
select tests.add_rank_game('25400000-0000-4000-8000-000000000003') from generate_series(1, 10);
select tests.add_rank_game('25400000-0000-4000-8000-000000000005') from generate_series(1, 10);

select ok(not exists (select 1 from private.ranked_players() where user_id = '25400000-0000-4000-8000-000000000003'),
  'a QA account with ten wins is not ranked');
select is((select rank from private.ranked_players() where user_id = '25400000-0000-4000-8000-000000000005'),
  1::bigint, 'a QA account does not shift a real player rank');
select tests.as_user('25400000-0000-4000-8000-000000000003');
select is(private.leaderboard()->>'myState', 'hidden', 'a QA viewer is hidden from the board');
select ok(not (private.leaderboard()->'rows' @> '[{"name":"QA 1"}]'::jsonb),
  'a QA viewer gets the normal board without an own row');

-- Old all-QA room/game, an old mixed room/game, and a new all-QA game.
select tests.as_owner();
insert into public.rooms (id, code, host_id, status, created_at) values
  ('25420000-0000-4000-8000-000000000001', 'QA001', '25400000-0000-4000-8000-000000000002', 'in_game', now() - interval '2 days'),
  ('25420000-0000-4000-8000-000000000002', 'QA002', '25400000-0000-4000-8000-000000000002', 'in_game', now() - interval '2 days');
insert into public.room_members (room_id, user_id, role) values
  ('25420000-0000-4000-8000-000000000001', '25400000-0000-4000-8000-000000000003', 'contestant'),
  ('25420000-0000-4000-8000-000000000002', '25400000-0000-4000-8000-000000000005', 'contestant');
insert into public.games (id, room_id, status, started_at, finished_at, host_user_id) values
  ('25430000-0000-4000-8000-000000000001', '25420000-0000-4000-8000-000000000001', 'finished', now() - interval '2 days', now() - interval '2 days', '25400000-0000-4000-8000-000000000002'),
  ('25430000-0000-4000-8000-000000000002', '25420000-0000-4000-8000-000000000002', 'finished', now() - interval '2 days', now() - interval '2 days', '25400000-0000-4000-8000-000000000002'),
  ('25430000-0000-4000-8000-000000000003', null, 'finished', now(), now(), '25400000-0000-4000-8000-000000000002');
insert into public.game_players (id, game_id, user_id, role, display_name) values
  ('25440000-0000-4000-8000-000000000001', '25430000-0000-4000-8000-000000000001', '25400000-0000-4000-8000-000000000003', 'contestant', 'QA 1'),
  ('25440000-0000-4000-8000-000000000002', '25430000-0000-4000-8000-000000000001', '25400000-0000-4000-8000-000000000004', 'contestant', 'QA 2'),
  ('25440000-0000-4000-8000-000000000003', '25430000-0000-4000-8000-000000000002', '25400000-0000-4000-8000-000000000003', 'contestant', 'QA 1'),
  ('25440000-0000-4000-8000-000000000004', '25430000-0000-4000-8000-000000000002', '25400000-0000-4000-8000-000000000005', 'contestant', 'Real'),
  ('25440000-0000-4000-8000-000000000005', '25430000-0000-4000-8000-000000000003', '25400000-0000-4000-8000-000000000003', 'contestant', 'QA 1');
insert into public.board_clues (id, game_id, round, column_index, row_index, category, value, clue_id) values
  ('25450000-0000-4000-8000-000000000001', '25430000-0000-4000-8000-000000000001', 'single', 0, 0, 'QA', 100, '25410000-0000-4000-8000-000000000001');
insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta) values
  ('25460000-0000-4000-8000-000000000001', '25430000-0000-4000-8000-000000000001', '25450000-0000-4000-8000-000000000001', '25440000-0000-4000-8000-000000000001', 'response', 'voice', 'correct', 100);
insert into public.seen_clues (user_id, clue_id, seen_at, game_id) values
  ('25400000-0000-4000-8000-000000000003', '25410000-0000-4000-8000-000000000001', now() - interval '2 days', '25430000-0000-4000-8000-000000000001');

select tests.as_user('25400000-0000-4000-8000-000000000001');
select ok(exists (select 1 from private.admin_qa_cleanup(interval '1 day', true)
                 where kind = 'game' and id = '25430000-0000-4000-8000-000000000001'),
  'dry run reports an old all-QA game');
select ok(exists (select 1 from private.admin_qa_cleanup(interval '1 day', true)
                 where kind = 'room' and id = '25420000-0000-4000-8000-000000000001'),
  'dry run reports an old all-QA room');
select tests.as_owner();
select ok(exists (select 1 from public.games where id = '25430000-0000-4000-8000-000000000001'),
  'dry run deletes nothing');
select tests.as_user('25400000-0000-4000-8000-000000000001');
select ok(not exists (select 1 from private.admin_qa_cleanup(interval '1 day', true)
                     where id = '25430000-0000-4000-8000-000000000003'),
  'cleanup keeps everything newer than older_than');
do $$ begin perform 1 from private.admin_qa_cleanup(interval '1 day', false); end $$;

select tests.as_owner();
select ok(not exists (select 1 from public.games where id = '25430000-0000-4000-8000-000000000001'),
  'cleanup deletes an all-QA game');
select ok(not exists (select 1 from public.answers where id = '25460000-0000-4000-8000-000000000001'),
  'game answers cascade away');
select ok(not exists (select 1 from public.seen_clues where user_id = '25400000-0000-4000-8000-000000000003'
                     and clue_id = '25410000-0000-4000-8000-000000000001'),
  'QA seen clues for the game are removed');
select ok(not exists (select 1 from public.rooms where id = '25420000-0000-4000-8000-000000000001'),
  'cleanup closes and deletes an all-QA room');
select ok(exists (select 1 from public.games where id = '25430000-0000-4000-8000-000000000002'),
  'cleanup refuses a game with a non-QA player');
select ok(exists (select 1 from public.rooms where id = '25420000-0000-4000-8000-000000000002' and status = 'in_game'),
  'cleanup does not touch a room with a non-QA member');
select ok(exists (select 1 from public.games where id = '25430000-0000-4000-8000-000000000003'),
  'a new all-QA game is kept');
select is((select count(*) from private.qa_accounts), 3::bigint, 'QA accounts survive cleanup');
select ok((select count(*) from private.audit_log where action = 'qa_account_marked') = 3,
  'marking QA accounts is audited');
select ok(exists (select 1 from private.audit_log where action = 'qa_cleanup'
                 and details ? 'games' and details ? 'rooms' and details ? 'dry_run'),
  'cleanup is audited with counts and the dry-run flag');

select * from finish();
rollback;
