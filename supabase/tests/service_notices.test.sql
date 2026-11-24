-- Service notice activity, isolation, validation, and audit trail (GH-252).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;
create function tests.as_owner() returns void language plpgsql as $$ begin reset role; end; $$;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email, is_anonymous) values
  ('25200000-0000-4000-8000-000000000001', 'admin@notices.test', false),
  ('25200000-0000-4000-8000-000000000002', 'player@notices.test', false);
insert into private.admins (user_id) values ('25200000-0000-4000-8000-000000000001');

select has_table('public', 'notices', 'notices exists');
select has_table('private', 'notice_history', 'notice history exists');
select ok((select relrowsecurity from pg_class where oid = 'public.notices'::regclass), 'notices has RLS');
select ok((select relrowsecurity from pg_class where oid = 'private.notice_history'::regclass), 'history has RLS');
select is((select count(*) from pg_policies where tablename in ('notices', 'notice_history')),
  0::bigint, 'notice tables have no direct policies');

select tests.as_user('25200000-0000-4000-8000-000000000002');
select throws_ok($$ select * from public.notices $$, '42501', null, 'a player cannot select notices directly');
select throws_ok($$ select * from private.admin_post_notice('incident', 'No', '', null, null, null) $$,
  '42501', 'not found', 'a non-admin cannot post');
select throws_ok($$ select * from private.admin_edit_notice(gen_random_uuid(), '{"title":"No"}') $$,
  '42501', 'not found', 'a non-admin cannot edit');
select throws_ok($$ select * from private.admin_resolve_notice(gen_random_uuid(), 'No') $$,
  '42501', 'not found', 'a non-admin cannot resolve');

select tests.as_user('25200000-0000-4000-8000-000000000001');
select set_config('tests.incident', (select id::text from private.admin_post_notice(
  'incident', 'Buzzers lag', 'Looking into it', 'https://status.example/help', null, null)), true);
select is((select revision from private.admin_edit_notice(current_setting('tests.incident')::uuid,
  '{"body":"Games still work"}')), 2, 'editing increments the revision');
select is((select revision from private.admin_resolve_notice(current_setting('tests.incident')::uuid,
  'Fixed now')), 3, 'resolving increments the revision');
select throws_ok($$ select * from private.admin_post_notice('maintenance', 'Bad', '', null, null, null) $$,
  '23514', null, 'maintenance requires times');
select throws_ok($$ select * from private.admin_post_notice('incident', repeat('x', 61), '', null, null, null) $$,
  '23514', null, 'title is limited to 60 characters');
select throws_ok($$ select * from private.admin_post_notice('incident', 'Bad link', '', 'http://example.com', null, null) $$,
  '23514', null, 'links must use https');

select tests.as_owner();
select is((select count(*) from private.notice_history where notice_id = current_setting('tests.incident')::uuid),
  3::bigint, 'post, edit, and resolve each leave history');
select is((select count(*) from private.notice_history where notice_id = current_setting('tests.incident')::uuid
  and actor = '25200000-0000-4000-8000-000000000001'), 3::bigint, 'history records the actor');

-- Fixed-clock rows exercise all server-side activity rules without changing the database clock.
insert into public.notices
  (id, kind, title, body, starts_at, ends_at, resolved_at, resolution, created_by, created_at) values
  ('25210000-0000-4000-8000-000000000001', 'incident', 'Open', '', null, null, null, null,
   '25200000-0000-4000-8000-000000000001', '2026-01-01 00:00Z'),
  ('25210000-0000-4000-8000-000000000002', 'incident', 'Resolved', '', null, null, '2026-01-02 00:00Z', 'Done',
   '25200000-0000-4000-8000-000000000001', '2026-01-01 00:00Z'),
  ('25210000-0000-4000-8000-000000000003', 'maintenance', 'Window', '', '2026-01-03 10:00Z', '2026-01-03 11:00Z', null, null,
   '25200000-0000-4000-8000-000000000001', '2026-01-01 00:00Z'),
  ('25210000-0000-4000-8000-000000000004', 'whats_new', 'Old release', '', null, null, null, null,
   '25200000-0000-4000-8000-000000000001', '2026-01-01 00:00Z'),
  ('25210000-0000-4000-8000-000000000005', 'whats_new', 'New release', '', null, null, null, null,
   '25200000-0000-4000-8000-000000000001', '2026-01-05 00:00Z');

select tests.as_user('25200000-0000-4000-8000-000000000002');
select ok(exists (select 1 from private.active_notices('2026-01-03 09:00Z') where title = 'Open' and phase = 'active'),
  'an unresolved incident is active');
select ok(exists (select 1 from private.active_notices('2026-01-02 23:59Z') where title = 'Resolved' and phase = 'resolved'),
  'a resolved incident remains for 24 hours');
select ok(not exists (select 1 from private.active_notices('2026-01-03 00:01Z') where title = 'Resolved'),
  'a resolved incident disappears after 24 hours');
select ok(exists (select 1 from private.active_notices('2026-01-03 09:00Z') where title = 'Window' and phase = 'upcoming'),
  'maintenance is upcoming before its start');
select ok(exists (select 1 from private.active_notices('2026-01-03 10:30Z') where title = 'Window' and phase = 'now'),
  'maintenance is now during its window');
select ok(not exists (select 1 from private.active_notices('2026-01-03 11:01Z') where title = 'Window'),
  'maintenance disappears after its end');
select ok(not exists (select 1 from private.active_notices('2026-01-06 00:00Z') where title = 'Old release'),
  'a newer whats-new replaces the older one');
select ok(exists (select 1 from private.active_notices('2026-01-18 23:59Z') where title = 'New release'),
  'whats-new remains for 14 days');
select ok(not exists (select 1 from private.active_notices('2026-01-19 00:01Z') where title = 'New release'),
  'whats-new disappears after 14 days');
select results_eq(
  $$ select kind from private.active_notices('2026-01-05 12:00Z') where title in ('Open', 'New release') $$,
  $$ values ('incident'::text), ('whats_new'::text) $$,
  'active notices are priority ordered');

select * from finish();
rollback;
