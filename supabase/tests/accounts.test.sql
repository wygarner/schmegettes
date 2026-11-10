-- Accounts: merge tickets, moving a guest into an account, account names, deleting an
-- account. Run with `mise run db:test`. Rules: docs/product-docs/features/accounts/.
-- Users act as authenticated with request.jwt.claims, including is_anonymous.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

create schema tests;
grant usage on schema tests to public;

create function tests.as_user(p_user uuid, p_anonymous boolean) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', p_anonymous)::text, true);
  set local role authenticated;
end;
$$;
create function tests.as_owner() returns void language plpgsql as $$
begin
  reset role;
end;
$$;
create function tests.id(p_name text) returns uuid language sql stable as $$
  select current_setting('tests.' || p_name)::uuid;
$$;
grant execute on all functions in schema tests to public;

-- Gail is a guest with history and host access. Ann is an account. Bea plays with them.
-- Gus and Gwen are guests merged later. Ann and Gail were both in game g4 (two devices).
insert into auth.users (id, email, is_anonymous) values
  ('a0000000-0000-4000-8000-000000000001', 'ann@accounts.test', false),
  ('a0000000-0000-4000-8000-000000000002', null, true),
  ('a0000000-0000-4000-8000-000000000003', 'bea@accounts.test', false),
  ('a0000000-0000-4000-8000-000000000004', null, true),
  ('a0000000-0000-4000-8000-000000000005', null, true);
select set_config('tests.ann', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('tests.gail', 'a0000000-0000-4000-8000-000000000002', true);
select set_config('tests.bea', 'a0000000-0000-4000-8000-000000000003', true);
select set_config('tests.gus', 'a0000000-0000-4000-8000-000000000004', true);
select set_config('tests.gwen', 'a0000000-0000-4000-8000-000000000005', true);

insert into public.profiles (user_id, display_name) values
  (tests.id('ann'), 'Ann'), (tests.id('gail'), 'Gail'), (tests.id('bea'), 'Bea'), (tests.id('gus'), 'Gus');

insert into public.host_codes (code, note) values ('ACCTAAAA', 'for Gail');
update public.host_codes set used_at = now(), used_by = tests.id('gail') where code = 'ACCTAAAA';
insert into public.hosts (user_id, code) values (tests.id('gail'), 'ACCTAAAA');

insert into public.games (id, status, finished_at, host_user_id) values
  ('b0000000-0000-4000-8000-000000000001', 'finished', now(), tests.id('gail')),
  ('b0000000-0000-4000-8000-000000000002', 'abandoned', now(), tests.id('bea')),
  ('b0000000-0000-4000-8000-000000000003', 'in_progress', null, tests.id('bea')),
  ('b0000000-0000-4000-8000-000000000004', 'finished', now(), tests.id('bea'));
select set_config('tests.g1', 'b0000000-0000-4000-8000-000000000001', true);
select set_config('tests.g4', 'b0000000-0000-4000-8000-000000000004', true);
insert into public.game_players (game_id, user_id, role, display_name) values
  ('b0000000-0000-4000-8000-000000000001', tests.id('gail'), 'contestant', 'Gail'),
  ('b0000000-0000-4000-8000-000000000001', tests.id('bea'), 'contestant', 'Bea'),
  ('b0000000-0000-4000-8000-000000000002', tests.id('gail'), 'contestant', 'Gail'),
  ('b0000000-0000-4000-8000-000000000003', tests.id('gail'), 'spectator', 'Gail'),
  ('b0000000-0000-4000-8000-000000000004', tests.id('gail'), 'contestant', 'Gail'),
  ('b0000000-0000-4000-8000-000000000004', tests.id('ann'), 'contestant', 'Ann');

-- Two clues: Gail saw c1 recently and c2 long ago; Ann saw c1 long ago.
insert into public.clues (id, season, air_date, round, category, value, clue_text, correct_response, source_key) values
  ('c0000000-0000-4000-8000-000000000001', 77, date '2001-01-01', 'single', 'ACCT', 200, 'clue', 'response', 'acct-test-1'),
  ('c0000000-0000-4000-8000-000000000002', 77, date '2001-01-01', 'single', 'ACCT', 400, 'clue', 'response', 'acct-test-2');
insert into public.seen_clues (user_id, clue_id, seen_at) values
  (tests.id('gail'), 'c0000000-0000-4000-8000-000000000001', timestamptz '2026-11-01'),
  (tests.id('gail'), 'c0000000-0000-4000-8000-000000000002', timestamptz '2026-01-01'),
  (tests.id('ann'), 'c0000000-0000-4000-8000-000000000001', timestamptz '2026-02-01');

-- Bea's room is mid-game; Gail is in it for now.
insert into public.rooms (id, code, host_id, status) values
  ('d0000000-0000-4000-8000-000000000001', 'ACCTZ', tests.id('bea'), 'in_game');
insert into public.room_members (room_id, user_id, role, display_name) values
  ('d0000000-0000-4000-8000-000000000001', tests.id('gail'), 'contestant', 'Gail')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select has_table('private', 'merge_tickets', 'merge_tickets exists');
select has_column('public', 'profiles', 'account_name', 'profiles has account_name');

select tests.as_user(tests.id('gail'), true);
select throws_ok($$ select * from private.merge_tickets $$, '42501', null, 'a player cannot read merge tickets');
select throws_ok($$ insert into private.merge_tickets (token_hash, guest_id, expires_at)
                    values ('\x00', tests.id('gail'), now() + interval '1 day') $$,
  '42501', null, 'a player cannot forge a merge ticket');
select throws_ok($$ update public.profiles set account_name = 'Sneaky' where user_id = tests.id('gail') $$,
  '42501', null, 'a guest cannot set an account name directly');
select throws_ok($$ insert into public.profiles (user_id, display_name, account_name) values (tests.id('gus'), 'X', 'X') $$,
  '42501', null, 'a player cannot insert an account name directly');

select tests.as_owner();
select ok(has_function_privilege('authenticated', 'private.create_merge_ticket()', 'execute'), 'players can ask for a ticket');
select ok(has_function_privilege('authenticated', 'private.merge_guest(text)', 'execute'), 'players can redeem a ticket');
select ok(has_function_privilege('authenticated', 'private.delete_account()', 'execute'), 'players can delete their account');
select ok(has_function_privilege('authenticated', 'private.set_account_name(text)', 'execute'), 'players can set their name');
select ok(not has_function_privilege('authenticated', 'private.user_in_game(uuid)', 'execute'), 'players cannot probe other users');
select ok(not has_function_privilege('anon', 'private.merge_guest(text)', 'execute'), 'anon cannot redeem a ticket');
select ok(not has_table_privilege('app_service', 'private.merge_tickets', 'select'), 'app_service cannot read tickets');

-- ---------------------------------------------------------------------------
-- Account names
-- ---------------------------------------------------------------------------
select tests.as_user(tests.id('gail'), true);
select throws_ok($$ select private.set_account_name('Gail') $$, '42501', null, 'a guest has no account name');
-- The token says signed in, but the user row says guest.
select tests.as_user(tests.id('gail'), false);
select throws_ok($$ select private.set_account_name('Gail') $$, '42501', null, 'a guest cannot claim to be signed in');

select tests.as_user(tests.id('bea'), false);
select lives_ok($$ select private.set_account_name('  Bea B  ') $$, 'an account sets its name');
select is((select account_name from public.profiles where user_id = tests.id('bea')), 'Bea B', 'the name is trimmed');
select is((select display_name from public.profiles where user_id = tests.id('bea')), 'Bea', 'the last room name is unchanged');
select throws_ok($$ select private.set_account_name('ABCDEFGHIJKLMNOPQRSTU') $$, '22023', null, 'names are at most 20 characters');

-- ---------------------------------------------------------------------------
-- Merge tickets
-- ---------------------------------------------------------------------------
select throws_ok($$ select * from private.create_merge_ticket() $$, '42501', null, 'an account cannot ask for a ticket');

select tests.as_user(tests.id('gail'), true);
select is((select char_length(ticket) from private.create_merge_ticket()), 43, 'a guest gets a 32-byte ticket');
select set_config('tests.ticket', (select ticket from private.create_merge_ticket()), true);
select tests.as_owner();
select is((select count(*)::int from private.merge_tickets where guest_id = tests.id('gail')), 1, 'a new ticket replaces the old one');

-- ---------------------------------------------------------------------------
-- Merging Gail into Ann
-- ---------------------------------------------------------------------------
select tests.as_user(tests.id('gus'), true);
select throws_ok(format('select * from private.merge_guest(%L)', current_setting('tests.ticket')),
  '42501', null, 'a guest cannot take in another guest');

select tests.as_user(tests.id('ann'), false);
select throws_ok($$ select * from private.merge_guest('not-a-ticket') $$, '22023', null, 'a wrong ticket is refused');
select throws_ok(format('select * from private.merge_guest(%L)', current_setting('tests.ticket')),
  '55006', null, 'a guest in a game in progress is not moved');
select tests.as_owner();
select is((select count(*)::int from private.merge_tickets where guest_id = tests.id('gail')), 1, 'the ticket survives a refused merge');
update public.rooms set status = 'closed' where id = 'd0000000-0000-4000-8000-000000000001';

select tests.as_user(tests.id('ann'), false);
select results_eq(
  format('select games_added, host_access_added, account_was_new from private.merge_guest(%L)', current_setting('tests.ticket')),
  $$ values (2, true, true) $$,
  'the merge counts finished and abandoned games, adds host access, and sees a new account');
select tests.as_owner();
select is((select count(*)::int from public.game_players where user_id = tests.id('ann')), 4, 'Ann now has every game Gail was in');
select is((select count(*)::int from public.game_players where game_id = tests.id('g4') and user_id is null and display_name is null), 1,
  'in a game they shared, the guest row becomes Former player');
select is((select host_user_id from public.games where id = tests.id('g1')), tests.id('ann'), 'games Gail hosted are now hosted by Ann');
select is((select seen_at from public.seen_clues where user_id = tests.id('ann') and clue_id = 'c0000000-0000-4000-8000-000000000001'),
  timestamptz '2026-11-01', 'a clue both saw keeps the later time');
select is((select count(*)::int from public.seen_clues where user_id = tests.id('ann')), 2, 'Ann has all of Gail''s seen clues');
select ok(private.user_is_host(tests.id('ann')), 'Ann can host');
select is((select used_by from public.host_codes where code = 'ACCTAAAA'), tests.id('ann'), 'the spent code points at Ann');
select ok(not exists (select 1 from auth.users where id = tests.id('gail')), 'the guest is deleted');

select tests.as_user(tests.id('ann'), false);
select throws_ok(format('select * from private.merge_guest(%L)', current_setting('tests.ticket')),
  '22023', null, 'a ticket works once');

-- An expired ticket.
select tests.as_user(tests.id('gus'), true);
select set_config('tests.ticket', (select ticket from private.create_merge_ticket()), true);
select tests.as_owner();
update private.merge_tickets set expires_at = now() - interval '1 minute' where guest_id = tests.id('gus');
select tests.as_user(tests.id('ann'), false);
select throws_ok(format('select * from private.merge_guest(%L)', current_setting('tests.ticket')),
  '22023', null, 'an expired ticket is refused');

-- An empty guest into a named account.
select private.set_account_name('Ann');
select tests.as_user(tests.id('gwen'), true);
select set_config('tests.ticket', (select ticket from private.create_merge_ticket()), true);
select tests.as_user(tests.id('ann'), false);
select results_eq(
  format('select games_added, host_access_added, account_was_new from private.merge_guest(%L)', current_setting('tests.ticket')),
  $$ values (0, false, false) $$,
  'a returning account with an empty guest: nothing added, not new');

-- ---------------------------------------------------------------------------
-- Deleting an account
-- ---------------------------------------------------------------------------
select tests.as_user(tests.id('gus'), true);
select throws_ok($$ select private.delete_account() $$, '42501', null, 'a guest cannot delete an account');

select tests.as_owner();
update public.rooms set status = 'in_game' where id = 'd0000000-0000-4000-8000-000000000001';
select tests.as_user(tests.id('bea'), false);
select throws_ok($$ select private.delete_account() $$, '55006', null, 'an account in a game in progress cannot be deleted');

select tests.as_user(tests.id('ann'), false);
select lives_ok($$ select private.delete_account() $$, 'Ann deletes her account');
select tests.as_owner();
select is(
  (select count(*)::int from public.game_players where game_id = tests.id('g1') and user_id is null and display_name is null), 1,
  'Ann''s result stays as Former player');
select ok(not exists (select 1 from public.seen_clues where user_id = tests.id('ann'))
          and not exists (select 1 from public.hosts where user_id = tests.id('ann')),
  'her seen clues and host access are gone');

select * from finish();
rollback;
