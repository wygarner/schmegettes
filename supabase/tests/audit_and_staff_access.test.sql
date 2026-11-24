-- Audit log and staff access (GH-245). Run with `mise run db:test`.
-- Users act as authenticated with request.jwt.claims. Every assertion about audit rows reads
-- the table as the owner.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

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
create function tests.as_owner() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;
-- Audit rows for one action and subject, read as the owner (tests run as the owner by default).
create function tests.audit_count(p_action text, p_subject uuid) returns bigint language sql
security definer as $$
  select count(*) from private.audit_log where action = p_action and subject_id is not distinct from p_subject;
$$;
grant execute on all functions in schema tests to public;

-- Alice: admin. Bob: player who redeems a code and changes his password. Carol: deletes her
-- account. Dave: a non-admin account. Erin: an account the admin deletes. Gus: a guest.
insert into auth.users (id, email, is_anonymous, encrypted_password) values
  ('11111111-1111-4111-8111-111111111111', 'alice@audit.test', false, 'x'),
  ('22222222-2222-4222-8222-222222222222', 'bob@audit.test', false, 'x'),
  ('33333333-3333-4333-8333-333333333333', 'carol@audit.test', false, 'x'),
  ('44444444-4444-4444-8444-444444444444', 'dave@audit.test', false, 'x'),
  ('55555555-5555-4555-8555-555555555555', 'erin@audit.test', false, 'x'),
  ('66666666-6666-4666-8666-666666666666', null, true, null);
insert into private.admins (user_id) values ('11111111-1111-4111-8111-111111111111');
insert into public.profiles (user_id, display_name) values ('22222222-2222-4222-8222-222222222222', 'Bob');

-- A room and a finished game with one answer, for the staff reads.
insert into public.clues (id, season, air_date, round, category, value, clue_text, correct_response, source_key)
values ('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', 77, date '2001-01-01', 'single', 'AUDIT', 200, 'clue', 'response', 'audit-test-1');
insert into public.rooms (id, code, host_id, status) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'AUDT1', '22222222-2222-4222-8222-222222222222', 'closed');
insert into public.games (id, room_id, status, finished_at, host_user_id) values
  ('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'finished', now(),
   '22222222-2222-4222-8222-222222222222');
insert into public.game_players (id, game_id, user_id, role, display_name) values
  ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
   '22222222-2222-4222-8222-222222222222', 'contestant', 'Bob');
insert into public.board_clues (id, game_id, round, column_index, row_index, category, value, clue_id, state) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', 'single', 0, 0, 'AUDIT', 200,
   'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', 'answered');
insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta) values
  ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1',
   'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'response', 'typed', 'correct', 200);

-- 1. The tables are append-only and closed to every app role
select has_table('private', 'audit_log', 'audit_log exists');
select has_table('private', 'staff_grants', 'staff_grants exists');
select ok((select relrowsecurity from pg_class where oid = 'private.audit_log'::regclass), 'audit_log has RLS');
select ok((select relrowsecurity from pg_class where oid = 'private.staff_grants'::regclass), 'staff_grants has RLS');
select is((select count(*) from pg_policies where schemaname = 'private' and tablename in ('audit_log', 'staff_grants')),
  0::bigint, 'neither table has a policy');

select tests.as_user('22222222-2222-4222-8222-222222222222');
select throws_ok($$ select * from private.audit_log $$, '42501', null, 'a player cannot read the audit log');
select throws_ok($$ update private.audit_log set action = 'staff_read' $$, '42501', null, 'a player cannot update the audit log');
select throws_ok($$ delete from private.audit_log $$, '42501', null, 'a player cannot delete from the audit log');
select throws_ok($$ insert into private.audit_log (action) values ('staff_read') $$, '42501', null,
  'a player cannot write the audit log directly');
select throws_ok($$ select private.audit('staff_read', 'user', null) $$, '42501', null,
  'a player cannot call private.audit');
select throws_ok($$ select * from private.staff_grants $$, '42501', null, 'a player cannot read staff grants');

reset role;
set local role app_service;
select throws_ok($$ select * from private.audit_log $$, '42501', null, 'app_service cannot read the audit log');
select throws_ok($$ update private.audit_log set action = 'staff_read' $$, '42501', null, 'app_service cannot update the audit log');
select throws_ok($$ delete from private.audit_log $$, '42501', null, 'app_service cannot delete from the audit log');

reset role;
set local role game_engine;
select throws_ok($$ select * from private.audit_log $$, '42501', null, 'game_engine cannot read the audit log');
select throws_ok($$ update private.audit_log set action = 'staff_read' $$, '42501', null, 'game_engine cannot update the audit log');
select throws_ok($$ delete from private.audit_log $$, '42501', null, 'game_engine cannot delete from the audit log');
select lives_ok($$ select private.audit('guests_deleted', 'system', null, '{"count": 0}') $$,
  'game_engine (a trusted caller) can write through private.audit');
reset role;

-- 2. Each action leaves exactly one row with the right actor and subject
select is((select count(*) from private.audit_log where action = 'account_created'
           and subject_id = '22222222-2222-4222-8222-222222222222' and actor = subject_id),
  1::bigint, 'a new account leaves one account_created row');
select is(tests.audit_count('account_created', '66666666-6666-4666-8666-666666666666'), 0::bigint,
  'a new guest leaves none');

-- Request id from golib/db is recorded.
select set_config('request.id', 'req-redeem', true);
select set_config('tests.code', (select current_code from private.host_code_rotation), true);
select tests.as_user('22222222-2222-4222-8222-222222222222');
select ok(private.redeem_host_code(current_setting('tests.code')), 'Bob redeems the current host code');
select ok(private.redeem_host_code(current_setting('tests.code')), 'redeeming again still succeeds');
select tests.as_owner();
select is((select count(*) from private.audit_log where action = 'host_access_granted'
           and subject_id = '22222222-2222-4222-8222-222222222222'
           and actor = '22222222-2222-4222-8222-222222222222' and request_id = 'req-redeem'),
  1::bigint, 'redeeming leaves one row with actor, subject and request id; a repeat adds none');
select set_config('request.id', '', true);

-- The player's own change: their claims are set; Supabase Auth's role does the update.
select tests.as_owner();
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
update auth.users set encrypted_password = 'changed-by-bob' where id = '22222222-2222-4222-8222-222222222222';
select tests.as_owner();
select is((select count(*) from private.audit_log where action = 'password_changed'
           and subject_id = '22222222-2222-4222-8222-222222222222'
           and actor = '22222222-2222-4222-8222-222222222222' and details = '{}'),
  1::bigint, 'a player changing their password leaves one row with them as the actor');

-- The admin's reset from the SQL editor: no JWT, run as postgres.
update auth.users set encrypted_password = 'reset-by-admin' where id = '44444444-4444-4444-8444-444444444444';
select is((select count(*) from private.audit_log where action = 'password_changed'
           and subject_id = '44444444-4444-4444-8444-444444444444' and actor is null
           and details ->> 'via' = session_user),
  1::bigint, 'an admin reset in SQL leaves one row with no actor and via = the SQL role');

update auth.users set email = 'other@audit.test' where id = '44444444-4444-4444-8444-444444444444';
select is(tests.audit_count('password_changed', '44444444-4444-4444-8444-444444444444'), 1::bigint,
  'other changes to auth.users add no row');

update auth.users set is_anonymous = false where id = '66666666-6666-4666-8666-666666666666';
select is(tests.audit_count('account_created', '66666666-6666-4666-8666-666666666666'), 1::bigint,
  'a guest becoming an account leaves one account_created row');

select tests.as_user('33333333-3333-4333-8333-333333333333');
select lives_ok($$ select private.delete_account() $$, 'Carol deletes her account');
select tests.as_owner();
select is((select count(*) from private.audit_log where action = 'account_deleted'
           and subject_id = '33333333-3333-4333-8333-333333333333'
           and actor = '33333333-3333-4333-8333-333333333333' and details ->> 'by' = 'self'),
  1::bigint, 'deleting an account leaves one row, by self');

select tests.as_user('44444444-4444-4444-8444-444444444444');
select throws_ok($$ select private.admin_delete_account('55555555-5555-4555-8555-555555555555') $$, '42501', null,
  'a non-admin cannot delete another account');
select tests.as_user('11111111-1111-4111-8111-111111111111');
select lives_ok($$ select private.admin_delete_account('55555555-5555-4555-8555-555555555555') $$,
  'the admin deletes an account');
select throws_ok($$ select private.admin_delete_account('55555555-5555-4555-8555-555555555555') $$, '22023', null,
  'deleting it again is refused');
select tests.as_owner();
select ok(not exists (select 1 from auth.users where id = '55555555-5555-4555-8555-555555555555'), 'Erin is gone');
select is((select count(*) from private.audit_log where action = 'account_deleted'
           and subject_id = '55555555-5555-4555-8555-555555555555'
           and actor = '11111111-1111-4111-8111-111111111111' and details ->> 'by' = 'admin'),
  1::bigint, 'the admin deletion leaves one row, by admin');

select tests.as_user('11111111-1111-4111-8111-111111111111');
select lives_ok($$ select private.admin_remove_host('22222222-2222-4222-8222-222222222222') $$, 'the admin removes Bob');
select lives_ok(format('select * from private.admin_rotate_host_code(%L)', current_setting('tests.code')),
  'the admin rotates the code');
select tests.as_owner();
select is(tests.audit_count('host_access_removed', '22222222-2222-4222-8222-222222222222'), 1::bigint,
  'removing a host leaves one row');
select is((select count(*) from private.audit_log where action = 'host_code_rotated' and details = '{}'
           and actor = '11111111-1111-4111-8111-111111111111'),
  1::bigint, 'rotating leaves one row with no code in it');

-- 3. A failed audit write never blocks the action. NOT VALID applies the check to new rows only.
alter table private.audit_log add constraint tests_force_failure check (action <> 'host_access_granted') not valid;
select set_config('tests.code', (select current_code from private.host_code_rotation), true);
select tests.as_user('22222222-2222-4222-8222-222222222222');
select ok(private.redeem_host_code(current_setting('tests.code')), 'redeeming succeeds while audit writes fail');
select tests.as_owner();
select ok(exists (select 1 from public.hosts where user_id = '22222222-2222-4222-8222-222222222222'),
  'the action took effect');
select is(tests.audit_count('host_access_granted', '22222222-2222-4222-8222-222222222222'), 1::bigint,
  'and no new audit row was written (only the earlier one)');
alter table private.audit_log drop constraint tests_force_failure;

-- 4. Staff access
select tests.as_user('44444444-4444-4444-8444-444444444444');
select throws_ok($$ select * from private.staff_grant('user', '22222222-2222-4222-8222-222222222222', 'look', 60) $$,
  '42501', null, 'a non-admin cannot create a grant');

select tests.as_user('11111111-1111-4111-8111-111111111111');
select throws_ok($$ select * from private.staff_grant('user', '22222222-2222-4222-8222-222222222222', 'look', 481) $$,
  '22023', null, 'more than 8 hours is refused');
select throws_ok($$ select * from private.staff_grant('user', '22222222-2222-4222-8222-222222222222', '  ', 60) $$,
  '22023', null, 'a reason is required');
select throws_ok($$ select * from private.staff_grant('user', '99999999-9999-4999-8999-999999999999', 'look', 60) $$,
  '22023', null, 'a subject that does not exist is refused');

select set_config('tests.grant', (select grant_id::text from
  private.staff_grant('user', '22222222-2222-4222-8222-222222222222', 'Bob reported a missing game', null)), true);
select set_config('tests.room_grant', (select grant_id::text from
  private.staff_grant('room', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'room check', 5)), true);
select set_config('tests.game_grant', (select grant_id::text from
  private.staff_grant('game', 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', 'game check', 5)), true);

select is(private.staff_read(current_setting('tests.grant')::uuid) ->> 'userId',
  '22222222-2222-4222-8222-222222222222', 'an active grant reads its subject');
select ok(not (private.staff_read(current_setting('tests.grant')::uuid)::text ilike '%@audit.test%'),
  'the read never contains an email');
select is(jsonb_array_length(private.staff_read(current_setting('tests.game_grant')::uuid) -> 'answers'), 1,
  'a game read has its answers');
select is(private.staff_read(current_setting('tests.room_grant')::uuid) ->> 'code', 'AUDT1', 'a room read has its room');

-- Another admin's grant is refused: Dave becomes an admin for this check.
select tests.as_owner();
insert into private.admins (user_id) values ('44444444-4444-4444-8444-444444444444');
select tests.as_user('44444444-4444-4444-8444-444444444444');
select throws_ok(format('select private.staff_read(%L)', current_setting('tests.grant')), '28000', null,
  'another admin cannot use the grant');

select tests.as_user('11111111-1111-4111-8111-111111111111');
select lives_ok(format('select * from private.staff_revoke(%L)', current_setting('tests.room_grant')), 'a grant is revoked early');
select throws_ok(format('select private.staff_read(%L)', current_setting('tests.room_grant')), '28000', null,
  'a revoked grant is refused');

select tests.as_owner();
update private.staff_grants set created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'
where id = current_setting('tests.grant')::uuid;
select tests.as_user('11111111-1111-4111-8111-111111111111');
select throws_ok(format('select private.staff_read(%L)', current_setting('tests.grant')), '28000', null,
  'an expired grant is refused');

select tests.as_owner();
select is((select count(*) from private.audit_log where action = 'staff_access_granted'
           and actor = '11111111-1111-4111-8111-111111111111' and not details ? 'reason'), 3::bigint,
  'each grant is audited, without the reason');
select is((select count(*) from private.audit_log where action = 'staff_read'
           and details ->> 'grant_id' = current_setting('tests.grant')), 2::bigint,
  'each successful read is audited with its grant');
select is(tests.audit_count('staff_access_revoked', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'), 1::bigint,
  'the revocation is audited');

select tests.as_user('11111111-1111-4111-8111-111111111111');
select is((select count(*) from private.admin_audit(null, 'staff_read', null)), 4::bigint,
  'the admin reads the audit log, filtered by action');

select * from finish();
rollback;
