-- Row-level security tests. Run with `mise run db:test` (supabase test db).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Two users, each hosting a room.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'carol@example.test');

-- Hosting is invite-only; these fixture users can host. The gate itself is tested in
-- private_access.test.sql.
insert into public.host_codes (code) values ('TESTHSTS');
insert into public.hosts (user_id, code)
select id, 'TESTHSTS' from auth.users where email like '%@example.test';
insert into public.profiles (user_id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Alice'),
  ('22222222-2222-4222-8222-222222222222', 'Bob'),
  ('33333333-3333-4333-8333-333333333333', 'Carol');
insert into public.rooms (id, code, host_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ALICE', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'BOBBY', '22222222-2222-4222-8222-222222222222');
insert into public.clues (season, round, category, value, clue_text, correct_response, source_key)
values (1, 'single', 'TEST', 200, 'A clue', 'What is a response?', 'test-1');

-- Act as Alice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.rooms), 1, 'a user sees only rooms they belong to');
select is((select code from public.rooms), 'ALICE', 'that room is their own');
select is((select count(*)::int from public.room_members), 1, 'members of other rooms are hidden');
select throws_ok($$ select * from public.clues $$, '42501', null, 'users cannot read the clue catalog');
select throws_ok(
  $$ insert into public.rooms (code, host_id) values ('FAKED', '22222222-2222-4222-8222-222222222222') $$,
  '42501', null, 'a user cannot create a room for someone else'
);

-- Alice joins Bob's room by code.
select is(public.join_room('bobby', 'Alice'), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 'join_room finds a room by code');
select is((select count(*)::int from public.rooms), 2, 'after joining, the room is visible');
select is(
  (select count(*)::int from public.profiles where user_id = '22222222-2222-4222-8222-222222222222'),
  1, 'fellow members'' profiles are visible'
);
select is(
  (select count(*)::int from public.profiles where user_id = '33333333-3333-4333-8333-333333333333'),
  0, 'strangers'' profiles are hidden'
);

-- Rooms are created and changed only through functions (create_room, game/'s lobby calls).
select throws_ok(
  $$ insert into public.rooms (code, host_id) values ('ALIC2', '11111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'a user cannot insert a room directly'
);
select throws_ok(
  $$ update public.rooms set status = 'open' where host_id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'a host cannot change room status directly'
);
select * from finish();
rollback;
