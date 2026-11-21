-- Private access: one rotating host code, the hosting gate, and the admin functions.
-- Run with `mise run db:test`. Rules: docs/product-docs/features/private-access/.
-- Users act as authenticated with request.jwt.claims; Start runs as game_engine, as game/ calls it.
-- The functions read the real clock, so tests move the rotation row's boundaries relative to now().
begin;
create extension if not exists pgtap with schema extensions;
select plan(82);

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
create function tests.as_owner() returns void language plpgsql as $$
begin
  reset role;
end;
$$;
-- The current code, read as the owner.
create function tests.current_code() returns text language sql as $$
  select current_code from private.host_code_rotation where singleton;
$$;
-- Put the rotation in a known state, as the owner: `code` current since `started`, rotating at `rotates`.
create function tests.set_rotation(p_code text, started timestamptz, rotates timestamptz) returns void language plpgsql as $$
begin
  reset role;
  insert into public.host_codes (code) values (p_code) on conflict do nothing;
  update private.host_code_rotation
  set current_code = p_code, current_started_at = started, rotates_at = rotates,
      previous_code = null, previous_valid_until = null
  where singleton;
end;
$$;
grant execute on all functions in schema tests to public;

-- Alice: admin account. Bob, Carol: players who become hosts. Dave: signed-in non-admin.
-- Gus: a guest (anonymous). Ann: an anonymous user wrongly put on the admin list.
-- Olive: a host from before this release.
insert into auth.users (id, email, is_anonymous) values
  ('11111111-1111-4111-8111-111111111111', 'alice@access.test', false),
  ('22222222-2222-4222-8222-222222222222', 'bob@access.test', false),
  ('33333333-3333-4333-8333-333333333333', 'carol@access.test', false),
  ('44444444-4444-4444-8444-444444444444', 'dave@access.test', false),
  ('55555555-5555-4555-8555-555555555555', null, true),
  ('66666666-6666-4666-8666-666666666666', null, true),
  ('77777777-7777-4777-8777-777777777777', 'olive@access.test', false);
insert into private.admins (user_id) values
  ('11111111-1111-4111-8111-111111111111'), ('66666666-6666-4666-8666-666666666666');
insert into public.profiles (user_id, display_name) values ('55555555-5555-4555-8555-555555555555', 'Gus')
  on conflict (user_id) do update set display_name = excluded.display_name;

-- A legacy one-use code still waiting, and a host who redeemed one before the release.
insert into public.host_codes (code, note) values ('XEGACYAA', 'unused'), ('XEGACYBB', 'used');
insert into public.hosts (user_id, code, created_at)
  values ('77777777-7777-4777-8777-777777777777', 'XEGACYBB', now() - interval '3 days');

-- A small catalog in its own season, so start_game can build a board.
insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 66, date '2001-01-01', r.round, 'ACCESS ' || r.round::text || ' ' || c,
       case when r.round = 'final' then null else 200 * n end, 'clue', 'response',
       'access-test-' || r.round::text || '-' || c || '-' || n
from (values ('single'::public.round, 6, 5), ('double'::public.round, 6, 5), ('final'::public.round, 1, 1))
  as r (round, cats, per)
cross join lateral generate_series(1, r.cats) as c
cross join lateral generate_series(1, r.per) as n;

-- 1. Tables and privileges
select has_table('public', 'host_codes', 'host_codes exists');
select has_table('public', 'hosts', 'hosts exists');
select has_table('private', 'admins', 'admins exists');
select has_table('private', 'host_code_rotation', 'host_code_rotation exists');
select is((select count(*) from private.host_code_rotation)::int, 1, 'there is exactly one rotation row');
select ok((select relrowsecurity from pg_class where oid = 'private.admins'::regclass), 'admins has RLS');
select ok((select relrowsecurity from pg_class where oid = 'private.host_code_rotation'::regclass), 'rotation has RLS');

select tests.as_user('22222222-2222-4222-8222-222222222222');
select throws_ok($$ select * from public.host_codes $$, '42501', null, 'a player cannot read host codes');
select throws_ok($$ select * from public.hosts $$, '42501', null, 'a player cannot read hosts');
select throws_ok($$ select * from private.admins $$, '42501', null, 'a player cannot read the admin list');
select throws_ok($$ select * from private.host_code_rotation $$, '42501', null, 'a player cannot read the rotation');
select throws_ok($$ insert into private.admins (user_id) values ('22222222-2222-4222-8222-222222222222') $$,
  '42501', null, 'a player cannot make themselves an admin');
select throws_ok($$ insert into public.hosts (user_id, code) values ('22222222-2222-4222-8222-222222222222', 'XEGACYAA') $$,
  '42501', null, 'a player cannot make themselves a host');

select tests.as_owner();
set local role anon;
select throws_ok($$ select * from public.hosts $$, '42501', null, 'anon cannot read hosts');
select tests.as_owner();
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use the private schema');
select ok(not has_function_privilege('anon', 'private.redeem_host_code(text)', 'execute'), 'anon cannot redeem');

select ok(not has_table_privilege(r, t, p), format('%s cannot %s %s', r, p, t))
from (values ('app_service'), ('game_engine'), ('authenticated')) as roles (r)
cross join (values ('private.admins'), ('private.host_code_rotation')) as tables (t)
cross join (values ('select'), ('insert')) as privs (p)
where (r, t, p) in (('app_service', 'private.admins', 'select'), ('game_engine', 'private.host_code_rotation', 'select'),
                    ('authenticated', 'private.admins', 'insert'));

select ok(not has_function_privilege('authenticated', f, 'execute'), format('players cannot call %s', f))
from (values ('private.new_host_code(text)'), ('private.advance_host_code(timestamptz)'), ('private.require_admin()')) as fns (f);
select ok(not has_function_privilege('app_service', 'private.admin_hosts()', 'execute'), 'app_service cannot list hosts directly');
select ok(not has_function_privilege('game_engine', 'private.admin_current_host_code()', 'execute'), 'the engine cannot read the code');
select ok(has_function_privilege('authenticated', 'private.redeem_host_code(text)', 'execute'), 'players can redeem');
select ok(has_function_privilege('authenticated', 'private.caller_is_host()', 'execute'), 'players can ask whether they can host');
select ok(has_function_privilege('game_engine', 'private.user_is_host(uuid)', 'execute'), 'the engine can check a host');

-- 2. Redeeming the current code: any number of people, case/dash/space ignored
select tests.set_rotation('RZTAAAAA', now() - interval '10 minutes', now() + interval '35 minutes');

select tests.as_user('22222222-2222-4222-8222-222222222222');
select is(private.caller_is_host(), false, 'Bob cannot host yet');
select throws_ok($$ select public.create_room('Bob') $$, '42501', null, 'creating a room needs host access');
select is(private.redeem_host_code('WRONGGGG'), false, 'a wrong code does not work');
select is(private.redeem_host_code('rzta-aaaa'), true, 'the current code works, lower case with a dash');
select is(private.caller_is_host(), true, 'Bob can host');

select tests.as_user('33333333-3333-4333-8333-333333333333');
select is(private.redeem_host_code(' RZTA AAAA '), true, 'Carol uses the same code, with spaces');
select is(private.caller_is_host(), true, 'Carol can host too');

select tests.as_owner();
select set_config('tests.bob_since', (select created_at::text from public.hosts where user_id = '22222222-2222-4222-8222-222222222222'), true);
select tests.as_user('22222222-2222-4222-8222-222222222222');
select is(private.redeem_host_code('RZTAAAAA'), true, 'a host entering the code again still can host');
select tests.as_owner();
select is((select count(*) from public.hosts where user_id = '22222222-2222-4222-8222-222222222222')::int, 1,
  'and stays one host');
select is((select created_at::text from public.hosts where user_id = '22222222-2222-4222-8222-222222222222'),
  current_setting('tests.bob_since'), 'with the original time');
select is(tests.current_code(), 'RZTAAAAA', 'redeeming does not change the code');

-- 3. Rollout: legacy codes are dead, legacy hosts keep access
select tests.as_user('44444444-4444-4444-8444-444444444444');
select is(private.redeem_host_code('XEGACYAA'), false, 'an unused one-use code no longer works');
select tests.as_user('77777777-7777-4777-8777-777777777777');
select is(private.caller_is_host(), true, 'a host from before the release can still host');

-- 4. Scheduled rotation: 5-minute grace for the previous code
select tests.set_rotation('SCHEDAAA', now() - interval '46 minutes', now() - interval '1 minute');
select tests.as_user('44444444-4444-4444-8444-444444444444');
select is(private.redeem_host_code('SCHEDAAA'), true, 'the previous code works 1 minute after rotation');
select tests.as_owner();
select isnt(tests.current_code(), 'SCHEDAAA', 'a new code is current');
select is((select previous_code from private.host_code_rotation), 'SCHEDAAA', 'the old code is the previous one');
select is((select previous_valid_until - current_started_at from private.host_code_rotation), interval '5 minutes',
  'the grace lasts 5 minutes from the rotation');
select is((select rotates_at - current_started_at from private.host_code_rotation), interval '45 minutes',
  'the new code lasts 45 minutes');
delete from public.hosts where user_id = '44444444-4444-4444-8444-444444444444';

select tests.set_rotation('SCHEDBBB', now() - interval '51 minutes', now() - interval '6 minutes');
select tests.as_user('44444444-4444-4444-8444-444444444444');
select is(private.redeem_host_code('SCHEDBBB'), false, 'the previous code fails 6 minutes after rotation');
select tests.as_owner();
select set_config('tests.edge', (select current_code from private.host_code_rotation), true);
update private.host_code_rotation set previous_valid_until = now() where singleton;
select tests.as_user('44444444-4444-4444-8444-444444444444');
select is(private.redeem_host_code(current_setting('tests.edge')), true, 'the new code works');
select tests.as_owner();
delete from public.hosts where user_id = '44444444-4444-4444-8444-444444444444';

-- Several idle windows: one new code, on the most recent 45-minute boundary
select tests.set_rotation('XDXEAAAA', timestamptz '2026-01-01 10:00+00', timestamptz '2026-01-01 10:45+00');
select set_config('tests.codes_before', (select count(*) from public.host_codes)::text, true);
-- Boundaries 10:45, 11:30, 12:15, 13:00: at 13:01 the 13:00 window is current.
select private.advance_host_code(timestamptz '2026-01-01 13:01+00');
select is((select current_started_at from private.host_code_rotation), timestamptz '2026-01-01 13:00+00',
  'after idle windows the code starts on the latest boundary');
select is((select rotates_at from private.host_code_rotation), timestamptz '2026-01-01 13:45+00', 'and rotates 45 minutes later');
select is((select previous_code from private.host_code_rotation), null, 'with no grace for a code nobody saw');
select is((select count(*) from public.host_codes)::int, current_setting('tests.codes_before')::int + 1,
  'only one code is created for the skipped windows');

-- 5. Admin access: concealed denial for everyone but listed accounts
select tests.set_rotation('ADMXNAAA', now() - interval '5 minutes', now() + interval '40 minutes');

select tests.as_user('44444444-4444-4444-8444-444444444444');
select throws_ok($$ select * from private.admin_current_host_code() $$, '42501', 'not found', 'a non-admin account is refused');
select throws_ok($$ select * from private.admin_hosts() $$, '42501', 'not found', 'a non-admin cannot list hosts');
select tests.as_user('55555555-5555-4555-8555-555555555555');
select throws_ok($$ select * from private.admin_current_host_code() $$, '42501', 'not found', 'a guest gets the same refusal');
select tests.as_user('66666666-6666-4666-8666-666666666666');
select throws_ok($$ select * from private.admin_rotate_host_code('ADMXNAAA') $$, '42501', 'not found',
  'an anonymous user on the admin list is still refused');
select tests.as_owner();
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select * from private.admin_current_host_code() $$, '42501', 'not found', 'no caller is refused');

-- 6. Admin: read and rotate
select tests.as_user('11111111-1111-4111-8111-111111111111');
select is((select code from private.admin_current_host_code()), 'ADMXNAAA', 'an admin reads the current code');
select is((select previous_valid_until from private.admin_current_host_code()), null, 'no grace is reported when none is left');
select isnt((select code from private.admin_rotate_host_code('admx-naaa')), 'ADMXNAAA', 'Rotate now makes a new code');
select tests.as_owner();
select set_config('tests.manual', tests.current_code(), true);
select ok((select rotates_at - current_started_at = interval '45 minutes' and current_started_at > now() - interval '1 minute'
           and previous_code is null from private.host_code_rotation), 'the next rotation is 45 minutes from now, no grace');
select tests.as_user('11111111-1111-4111-8111-111111111111');
select is((select code from private.admin_rotate_host_code('ADMXNAAA')), current_setting('tests.manual'),
  'a second rotate of the same code returns the new code without rotating again');
select tests.as_user('44444444-4444-4444-8444-444444444444');
select is(private.redeem_host_code('ADMXNAAA'), false, 'the retired code fails at once');

-- 7. Admin: hosts, notes, removal
select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.as_owner();
insert into public.hosts (user_id, code, created_at)
  values ('55555555-5555-4555-8555-555555555555', 'ADMXNAAA', now() + interval '1 second');
-- Within one transaction now() is fixed: give Bob an earlier time than Carol.
update public.hosts set created_at = now() - interval '1 minute' where user_id = '22222222-2222-4222-8222-222222222222';
select tests.as_user('11111111-1111-4111-8111-111111111111');
select is((select array_agg(user_id::text order by ord) from (
  select user_id, row_number() over () as ord from private.admin_hosts()) h),
  array['55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333',
        '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777'],
  'hosts are listed newest first');
select results_eq($$ select kind, email, last_played_as from private.admin_hosts()
                     where user_id = '55555555-5555-4555-8555-555555555555' $$,
  $$ values ('guest', null::text, 'Gus') $$, 'a guest shows as a guest with their last name');
select results_eq($$ select kind, email from private.admin_hosts() where user_id = '22222222-2222-4222-8222-222222222222' $$,
  $$ values ('account', 'bob@access.test') $$, 'an account shows its email');
select is((select note from private.admin_set_host_note('22222222-2222-4222-8222-222222222222', '  Thursday trivia  ')),
  'Thursday trivia', 'a note is trimmed');
select is((select note from private.admin_set_host_note('22222222-2222-4222-8222-222222222222', '   ')), null,
  'a blank note clears it');
select throws_ok($$ select * from private.admin_set_host_note('22222222-2222-4222-8222-222222222222', repeat('x', 201)) $$,
  '22023', null, 'a note over 200 characters is refused');
select is((select count(*) from private.admin_set_host_note('99999999-9999-4999-8999-999999999999', 'x'))::int, 0,
  'a note for someone who is not a host changes nothing');

select lives_ok($$ select private.admin_remove_host('22222222-2222-4222-8222-222222222222') $$, 'an admin removes a host');
select lives_ok($$ select private.admin_remove_host('22222222-2222-4222-8222-222222222222') $$, 'removing again is harmless');
select tests.as_user('22222222-2222-4222-8222-222222222222');
select is(private.caller_is_host(), false, 'the removed host cannot host');

-- 8. With host access: a room, and Start only while access lasts
select tests.as_user('33333333-3333-4333-8333-333333333333');
select lives_ok($$ select set_config('tests.r', public.create_room('Carol')::text, true) $$, 'a host can create a room');
select tests.as_owner();
update public.rooms set seasons = '{66}' where id = current_setting('tests.r')::uuid;
select tests.as_user('11111111-1111-4111-8111-111111111111');
select private.admin_remove_host('33333333-3333-4333-8333-333333333333');
select tests.as_owner();
set local role game_engine;
select throws_ok($$ select public.start_game(current_setting('tests.r')::uuid) $$, '42501', null,
  'Start is refused once an admin removes host access');
select tests.as_owner();
insert into public.hosts (user_id, code) values ('33333333-3333-4333-8333-333333333333', 'ADMXNAAA');
set local role game_engine;
select lives_ok($$ select public.start_game(current_setting('tests.r')::uuid) $$, 'Start works with host access');

-- caller_is_admin(): the Home row's check, about the caller only
select tests.as_user('11111111-1111-4111-8111-111111111111');
select is(private.caller_is_admin(), true, 'caller_is_admin: true for a listed account');
select tests.as_user('44444444-4444-4444-8444-444444444444');
select is(private.caller_is_admin(), false, 'caller_is_admin: false for a signed-in non-admin');
select tests.as_user('66666666-6666-4666-8666-666666666666');
select is(private.caller_is_admin(), false, 'caller_is_admin: false for an anonymous user on the list');
select tests.as_user('99999999-9999-4999-8999-999999999999');
select is(private.caller_is_admin(), false, 'caller_is_admin: false for an unknown user');
select tests.as_owner();
set local role anon;
select throws_ok($$ select private.caller_is_admin() $$, '42501', null, 'anon cannot call caller_is_admin');

-- Removed from the admin list: refused on the next call
select tests.as_owner();
delete from private.admins where user_id = '11111111-1111-4111-8111-111111111111';
select tests.as_user('11111111-1111-4111-8111-111111111111');
select throws_ok($$ select * from private.admin_hosts() $$, '42501', 'not found', 'a removed admin is refused at once');
select is(private.caller_is_admin(), false, 'caller_is_admin: false once removed from the list');

select * from finish();
rollback;
