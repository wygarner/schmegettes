-- Private access: one-use host codes and the hosting gate. Run with `mise run db:test`.
-- Rules: docs/product-docs/features/private-access/. Users act as authenticated with
-- request.jwt.claims; Start runs as game_engine, as game/ calls it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

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
grant execute on all functions in schema tests to public;

-- Bob gets host access during the test; Carol tries a spent code; Alice never hosts.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@access.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@access.test'),
  ('33333333-3333-4333-8333-333333333333', 'carol@access.test');
insert into public.host_codes (code, note) values ('TESTAAAA', 'for Bob'), ('TESTBBBB', 'spare');

-- A small catalog in its own season, so start_game can build a board.
insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 66, date '2001-01-01', r.round, 'ACCESS ' || r.round::text || ' ' || c,
       case when r.round = 'final' then null else 200 * n end, 'clue', 'response',
       'access-test-' || r.round::text || '-' || c || '-' || n
from (values ('single'::public.round, 6, 5), ('double'::public.round, 6, 5), ('final'::public.round, 1, 1))
  as r (round, cats, per)
cross join lateral generate_series(1, r.cats) as c
cross join lateral generate_series(1, r.per) as n;

select set_config('tests.unused_before', (select count(*) from public.host_codes where used_at is null)::text, true);
select set_config('tests.total_before', (select count(*) from public.host_codes)::text, true);

-- Tables and privileges
select has_table('public', 'host_codes', 'host_codes exists');
select has_table('public', 'hosts', 'hosts exists');

select tests.as_user('11111111-1111-4111-8111-111111111111');
select throws_ok($$ select * from public.host_codes $$, '42501', null, 'a player cannot read host codes');
select throws_ok($$ select * from public.hosts $$, '42501', null, 'a player cannot read hosts');
select throws_ok($$ insert into public.host_codes (code) values ('ZZZZZZZZ') $$, '42501', null, 'a player cannot add a code');
select throws_ok($$ insert into public.hosts (user_id, code) values ('11111111-1111-4111-8111-111111111111', 'TESTBBBB') $$,
  '42501', null, 'a player cannot make themselves a host');

select tests.as_owner();
set local role anon;
select throws_ok($$ select * from public.host_codes $$, '42501', null, 'anon cannot read host codes');
select throws_ok($$ select * from public.hosts $$, '42501', null, 'anon cannot read hosts');
select tests.as_owner();
select ok(not has_table_privilege('app_service', 'public.hosts', 'select'), 'app_service cannot read hosts');

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use the private schema');
select ok(not has_function_privilege('anon', 'private.redeem_host_code(text)', 'execute'), 'anon cannot redeem');
select ok(not has_function_privilege('authenticated', 'private.new_host_code(text)', 'execute'), 'players cannot mint codes');
select ok(has_function_privilege('authenticated', 'private.redeem_host_code(text)', 'execute'), 'players can redeem');
select ok(has_function_privilege('authenticated', 'private.caller_is_host()', 'execute'), 'players can ask whether they can host');
select ok(has_function_privilege('game_engine', 'private.user_is_host(uuid)', 'execute'), 'the engine can check a host');

-- No host access: no room
select tests.as_user('22222222-2222-4222-8222-222222222222');
select is(private.caller_is_host(), false, 'Bob cannot host yet');
select throws_ok($$ select public.create_room('Bob') $$, '42501', null, 'creating a room needs host access');
select is(private.redeem_host_code('WRONGGGG'), false, 'a wrong code does not work');

-- Redeeming: case, dashes, and spaces don't matter; the code is spent and replaced
select is(private.redeem_host_code('test-aaaa'), true, 'a valid code works, typed in lower case with a dash');
select tests.as_owner();
select is((select used_by from public.host_codes where code = 'TESTAAAA'), '22222222-2222-4222-8222-222222222222'::uuid,
  'the code is spent by Bob');
select is((select code from public.hosts where user_id = '22222222-2222-4222-8222-222222222222'), 'TESTAAAA', 'Bob is a host');
select is((select count(*) from public.host_codes where used_at is null)::text, current_setting('tests.unused_before'),
  'a new unused code replaces the spent one');
select is((select count(*) from public.host_codes)::text, (current_setting('tests.total_before')::integer + 1)::text,
  'exactly one code was created');

select tests.as_user('33333333-3333-4333-8333-333333333333');
select is(private.redeem_host_code('TESTAAAA'), false, 'a spent code does not work again');
select is(private.caller_is_host(), false, 'Carol is not a host');

select tests.as_user('22222222-2222-4222-8222-222222222222');
select is(private.redeem_host_code('TESTBBBB'), true, 'a host entering another code still can host');
select tests.as_owner();
select ok((select used_at is null from public.host_codes where code = 'TESTBBBB'), 'and that code stays unspent');

select tests.as_user('33333333-3333-4333-8333-333333333333');
select is(private.redeem_host_code(' test bbbb '), true, 'spaces are ignored');

-- With host access: a room, and Start only while access lasts
select tests.as_user('22222222-2222-4222-8222-222222222222');
select lives_ok($$ select set_config('tests.r', public.create_room('Bob')::text, true) $$, 'a host can create a room');
select tests.as_owner();
update public.rooms set seasons = '{66}' where id = current_setting('tests.r')::uuid;
delete from public.hosts where user_id = '22222222-2222-4222-8222-222222222222';
set local role game_engine;
select throws_ok($$ select public.start_game(current_setting('tests.r')::uuid) $$, '42501', null,
  'Start is refused once host access is removed');
select tests.as_owner();
insert into public.hosts (user_id, code) values ('22222222-2222-4222-8222-222222222222', 'TESTAAAA');
set local role game_engine;
select lives_ok($$ select public.start_game(current_setting('tests.r')::uuid) $$, 'Start works with host access');

select * from finish();
rollback;
