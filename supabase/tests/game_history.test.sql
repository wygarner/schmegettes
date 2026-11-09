-- Fresh boards and game history. Run with `mise run db:test` (supabase test db).
-- Rules: docs/product-docs/features/game-history/. Engine calls run as game_engine; reads as
-- users run as authenticated with request.jwt.claims, as in rls.test.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- ---------------------------------------------------------------------------
-- Fixtures (all rolled back)
-- ---------------------------------------------------------------------------
-- The test runner (postgres) is not a superuser on Supabase and created game_engine without
-- joining it, so it must join to `set local role game_engine`. Rolled back with the rest.
grant game_engine to current_user;
-- pgTAP lives in the extensions schema, which game_engine can't otherwise see.
grant usage on schema extensions to game_engine;

create schema tests;
grant usage on schema tests to public;

-- n categories of 5 clues (1 for final) in one season, named "{prefix} {i}".
create function tests.categories(p_season integer, p_round public.round, p_n integer, p_prefix text)
returns void language sql as $$
  insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
  select p_season, date '2001-01-01', p_round, p_prefix || ' ' || c,
         case when p_round = 'final' then null else 100 * n end,
         'clue', 'response', p_season || '-' || p_prefix || '-' || p_round || '-' || c || '-' || n
  from generate_series(1, p_n) as c
  cross join generate_series(1, case when p_round = 'final' then 1 else 5 end) as n;
$$;

-- Mark every clue in matching categories as seen by a user at a time.
create function tests.see(p_user uuid, p_season integer, p_like text, p_at timestamptz)
returns void language sql as $$
  insert into public.seen_clues (user_id, clue_id, seen_at)
  select p_user, c.id, p_at from public.clues c where c.season = p_season and c.category like p_like
  on conflict (user_id, clue_id) do update set seen_at = excluded.seen_at;
$$;

-- Reveal every clue of one round of a game. Runs as the caller (game_engine).
create function tests.reveal_round(p_game uuid, p_round public.round)
returns integer language plpgsql as $$
declare
  revealed integer := 0;
  b record;
begin
  for b in select id from public.board_clues where game_id = p_game and round = p_round loop
    perform public.reveal_clue(b.id);
    revealed := revealed + 1;
  end loop;
  return revealed;
end;
$$;

create function tests.game(p_name text) returns uuid language sql stable as $$
  select current_setting('tests.' || p_name)::uuid;
$$;

-- Ignore the seed catalog; each test season below has a known shape.
delete from public.clues;

-- Season 1: plenty of fresh categories.
select tests.categories(1, 'single', 15, 'S1');
select tests.categories(1, 'double', 15, 'D1');
select tests.categories(1, 'final', 3, 'F1');
-- Season 2: a spectator's seen categories vs a contestant's.
select tests.categories(2, 'single', 6, 'SPEC');
select tests.categories(2, 'single', 6, 'DSEEN');
select tests.categories(2, 'double', 6, 'D2');
select tests.categories(2, 'final', 1, 'F2');
-- Season 5: every category already seen by someone playing.
select tests.categories(5, 'single', 6, 'OLD');
select tests.categories(5, 'single', 2, 'NEW');
select tests.categories(5, 'single', 1, 'BOTH');
select tests.categories(5, 'double', 6, 'D5');
select tests.categories(5, 'final', 1, 'F5');

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'carol@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'dave@example.test'),
  ('55555555-5555-4555-8555-555555555555', 'sam@example.test'),
  ('66666666-6666-4666-8666-666666666666', 'xena@example.test'),
  ('77777777-7777-4777-8777-777777777777', 'eve@example.test'),
  ('88888888-8888-4888-8888-888888888888', 'fay@example.test');
insert into public.profiles (user_id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Alice'),
  ('22222222-2222-4222-8222-222222222222', 'Bob'),
  ('33333333-3333-4333-8333-333333333333', 'Carol'),
  ('44444444-4444-4444-8444-444444444444', 'Dave'),
  ('55555555-5555-4555-8555-555555555555', 'Sam'),
  ('66666666-6666-4666-8666-666666666666', 'Xena'),
  ('77777777-7777-4777-8777-777777777777', 'Eve'),
  ('88888888-8888-4888-8888-888888888888', 'Fay');

-- The host is the TV device and never plays.
-- R1: Alice hosts, Bob plays, Sam watches. R2: Carol hosts, Dave and Fay play, Alice watches.
-- R3: Carol hosts Dave and Fay on season 5. R4: a season with no clues.
insert into public.rooms (id, code, host_id, seasons) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'ROOM1', '11111111-1111-4111-8111-111111111111', '{1}'),
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'ROOM2', '33333333-3333-4333-8333-333333333333', '{2}'),
  ('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', 'ROOM3', '33333333-3333-4333-8333-333333333333', '{5}'),
  ('a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4', 'ROOM4', '33333333-3333-4333-8333-333333333333', '{9}');
insert into public.room_members (room_id, user_id, role) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', '22222222-2222-4222-8222-222222222222', 'contestant'),
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', '55555555-5555-4555-8555-555555555555', 'spectator'),
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', '44444444-4444-4444-8444-444444444444', 'contestant'),
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', '88888888-8888-4888-8888-888888888888', 'contestant'),
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', '11111111-1111-4111-8111-111111111111', 'spectator'),
  ('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', '44444444-4444-4444-8444-444444444444', 'contestant'),
  ('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', '88888888-8888-4888-8888-888888888888', 'contestant'),
  ('a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4', '44444444-4444-4444-8444-444444444444', 'contestant');

-- Season 2: Alice (spectator in R2) saw SPEC yesterday and Carol (host of R2) two days ago;
-- Dave (contestant) saw DSEEN long ago.
select tests.see('11111111-1111-4111-8111-111111111111', 2, 'SPEC%', now() - interval '1 day');
select tests.see('33333333-3333-4333-8333-333333333333', 2, 'SPEC%', now() - interval '2 days');
select tests.see('44444444-4444-4444-8444-444444444444', 2, 'DSEEN%', now() - interval '30 days');
-- Season 5: Dave saw OLD long ago, Fay saw NEW just now, both saw BOTH a year ago.
select tests.see('44444444-4444-4444-8444-444444444444', 5, 'OLD%', now() - interval '60 days');
select tests.see('88888888-8888-4888-8888-888888888888', 5, 'NEW%', now());
select tests.see('88888888-8888-4888-8888-888888888888', 5, 'BOTH%', now() - interval '365 days');
select tests.see('44444444-4444-4444-8444-444444444444', 5, 'BOTH%', now() - interval '365 days');

-- ---------------------------------------------------------------------------
-- Game 1: a full board
-- ---------------------------------------------------------------------------
set local role game_engine;
select ok(
  set_config('tests.g1', public.start_game('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')::text, true) is not null,
  'start_game records a game'
);
select is(
  (select array[count(*) filter (where round = 'single'), count(*) filter (where round = 'double'),
                count(*) filter (where round = 'final')]::integer[]
   from public.board_clues where game_id = tests.game('g1')),
  array[24, 24, 1], 'the board has 24 single, 24 double, and 1 final clue'
);
select is(
  (select count(distinct column_index)::integer from public.board_clues
   where game_id = tests.game('g1') and round = 'single'),
  6, 'six categories per round'
);
select is(
  (select array[count(*) filter (where round = 'single' and is_daily_double),
                count(*) filter (where round = 'double' and is_daily_double)]::integer[]
   from public.board_clues where game_id = tests.game('g1')),
  array[1, 2], 'one Daily Double in single, two in double'
);
select is(
  (select count(distinct column_index)::integer from public.board_clues
   where game_id = tests.game('g1') and round = 'double' and is_daily_double),
  2, 'the two double-round Daily Doubles are in different columns'
);
select is(
  (select count(*)::integer from public.board_clues
   where game_id = tests.game('g1') and is_daily_double and row_index = 0),
  0, 'no Daily Double in the top row'
);
select is(
  (select count(*)::integer from public.board_clues
   where game_id = tests.game('g1') and is_daily_double and row_index between 1 and 3),
  3, 'every Daily Double is in rows 1-3 of the 4-row board'
);
select is(
  (select array_agg(distinct value order by value) from public.board_clues
   where game_id = tests.game('g1') and round = 'single'),
  array[200, 400, 600, 800], 'single-round values are the four row values'
);
select is(
  (select array_agg(distinct value order by value) from public.board_clues
   where game_id = tests.game('g1') and round = 'double'),
  array[400, 800, 1200, 1600], 'double-round values are the four row values'
);
select is(
  (select count(*)::integer from public.board_clues b
   where b.game_id = tests.game('g1') and b.round <> 'final'
     and b.clue_id not in (
       select x.id from (
         select c.id, row_number() over (partition by c.category_key order by c.value nulls last, c.id) as rn
         from public.clues c
         where c.category_key in (select c2.category_key from public.board_clues b2
                                  join public.clues c2 on c2.id = b2.clue_id
                                  where b2.game_id = tests.game('g1'))) x
       where x.rn <= 4)),
  0, 'each category keeps its first 4 clues in aired order'
);
select is(
  (select status::text from public.rooms where id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  'in_game', 'the room is in a game'
);
select throws_ok(
  $$ select public.start_game('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1') $$,
  '55000', 'room not open', 'a room already in a game cannot start another'
);

-- Play the single round only, then finish.
select is(tests.reveal_round(tests.game('g1'), 'single'), 24, 'reveal the single round');
select lives_ok($$ select public.end_game(tests.game('g1'), 'finished') $$, 'end game 1');
reset role;

select is(
  (select array_agg(n order by u) from (
     select s.user_id as u, count(*)::integer as n from public.seen_clues s
     join public.clues c on c.id = s.clue_id
     where c.season = 1 group by s.user_id) x),
  array[24, 24, 24], 'host, contestant, and spectator each saw the 24 revealed clues'
);
select is(
  (select count(*)::integer from public.seen_clues s join public.clues c on c.id = s.clue_id
   where c.season = 1 and c.round = 'double'),
  0, 'clues left unplayed on the board are not seen'
);
select is(
  (select array[g.status::text, r.status::text] from public.games g join public.rooms r on r.id = g.room_id
   where g.id = tests.game('g1')),
  array['finished', 'open'], 'the game is finished and the room reopens for a rematch'
);

-- ---------------------------------------------------------------------------
-- Rematch and board freshness
-- ---------------------------------------------------------------------------
set local role game_engine;
select ok(
  set_config('tests.g2', public.start_game('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')::text, true) is not null,
  'a rematch starts in the same room'
);
reset role;
select is(
  (select count(*)::integer from public.board_clues b2
   join public.clues c2 on c2.id = b2.clue_id
   where b2.game_id = tests.game('g2')
     and c2.category_key in (
       select c1.category_key from public.board_clues b1 join public.clues c1 on c1.id = b1.clue_id
       where b1.game_id = tests.game('g1') and b1.revealed_at is not null)),
  0, 'the rematch board has no category with a clue revealed in game 1'
);

set local role game_engine;
select ok(
  set_config('tests.g3', public.start_game('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2')::text, true) is not null,
  'start game 3 (Alice watching)'
);
select ok(
  set_config('tests.g4', public.start_game('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3')::text, true) is not null,
  'start_game fills a board even when every category has been seen'
);
select throws_ok(
  $$ select public.start_game('a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4') $$,
  'P0001', 'catalog too small', 'a board that cannot be filled fails'
);
reset role;

select is(
  (select count(distinct category)::integer from public.board_clues
   where game_id = tests.game('g3') and round = 'single' and category like 'SPEC%'),
  6, 'the host''s and spectators'' seen clues do not limit the board'
);
select is(
  (select count(distinct category)::integer from public.board_clues
   where game_id = tests.game('g4') and round = 'single' and category like 'OLD%'),
  6, 'when nothing is fresh, take categories seen by the fewest contestants, longest ago'
);
select is(
  (select array[(select count(*) from public.games where room_id = 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4'),
                (select count(*) from public.rooms where id = 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4' and status = 'open')]::integer[]),
  array[0, 1], 'a failed start keeps nothing and leaves the room open'
);

-- ---------------------------------------------------------------------------
-- Scores, overrides, retries (game 3: Carol hosts, Dave and Fay play, Alice watches)
-- ---------------------------------------------------------------------------
do $$ begin perform set_config('tests.b1', (select id::text from public.board_clues
  where game_id = tests.game('g3') and round = 'single' order by column_index, row_index limit 1), true); end $$;

set local role game_engine;
select lives_ok($$ select public.reveal_clue(current_setting('tests.b1')::uuid) $$, 'reveal a clue');
select lives_ok($$
  select public.record_answer('b0b0b0b0-0000-4000-8000-000000000001', current_setting('tests.b1')::uuid,
    '88888888-8888-4888-8888-888888888888', 'what is x', 'voice', 'correct', 200);
  select public.record_answer('b0b0b0b0-0000-4000-8000-000000000002', current_setting('tests.b1')::uuid,
    '44444444-4444-4444-8444-444444444444', 'what is y', 'voice', 'correct', 200);
$$, 'record two answers');
select is(
  (select array_agg(placement order by display_name) from public.game_results
   where game_id = tests.game('g3') and role = 'contestant'),
  array[1, 1], 'tied scores share first place'
);
select is(
  (select array_agg(placement) from public.game_results where game_id = tests.game('g3') and role <> 'contestant'),
  array[null, null]::integer[], 'the host and spectators have no placement'
);
select lives_ok($$
  select public.update_verdict('b0b0b0b0-0000-4000-8000-000000000002', 'overridden_correct', 600)
$$, 'override a verdict');
select is(
  (select array_agg(display_name || ':' || score || ':' || placement order by placement) from public.game_results
   where game_id = tests.game('g3') and role = 'contestant'),
  array['Dave:600:1', 'Fay:200:2'], 'an override changes the score and placement'
);
select ok(
  (select bool_and(r.score = (select coalesce(sum(a.score_delta), 0) from public.answers a
                              where a.game_player_id = r.game_player_id))
   from public.game_results r where r.game_id = tests.game('g3')),
  'every score is the sum of that player''s answers'
);

-- Retries change nothing.
select lives_ok($$
  select public.record_answer('b0b0b0b0-0000-4000-8000-000000000001', current_setting('tests.b1')::uuid,
    '88888888-8888-4888-8888-888888888888', 'what is x', 'voice', 'correct', 200);
  select public.reveal_clue(current_setting('tests.b1')::uuid);
$$, 'retry an answer and a reveal');
select is(
  (select array[(select count(*) from public.answers where game_id = tests.game('g3')),
                (select count(*) from public.seen_clues where game_id = tests.game('g3'))]::integer[]),
  array[2, 4], 'retried writes are no-ops'
);
select throws_ok(
  $$ select public.record_answer(gen_random_uuid(), current_setting('tests.b1')::uuid,
       '66666666-6666-4666-8666-666666666666', 'nope', 'voice', 'correct', 200) $$,
  'P0002', 'not a contestant in this game', 'an answer from someone outside the game is rejected'
);
select throws_ok(
  $$ select public.record_answer(gen_random_uuid(), current_setting('tests.b1')::uuid,
       '33333333-3333-4333-8333-333333333333', 'nope', 'voice', 'correct', 200) $$,
  'P0002', 'not a contestant in this game', 'the host (the TV) cannot answer'
);

-- Abandon game 3, then try to finish it.
select lives_ok($$
  select public.end_game(tests.game('g3'), 'abandoned');
  select public.end_game(tests.game('g3'), 'finished');
$$, 'abandon game 3, then end it again');
select throws_ok(
  $$ select public.end_game(tests.game('g4'), 'in_progress') $$,
  '22023', null, 'a game can only end as finished or abandoned'
);

-- Game 4: Dave leaves; Eve joins as a spectator (twice).
select lives_ok($$
  select public.player_left(tests.game('g4'), '44444444-4444-4444-8444-444444444444');
  select public.player_left(tests.game('g4'), '44444444-4444-4444-8444-444444444444');
  select public.add_spectator(tests.game('g4'), '77777777-7777-4777-8777-777777777777');
  select public.add_spectator(tests.game('g4'), '77777777-7777-4777-8777-777777777777');
  select public.reveal_clue((select id from public.board_clues where game_id = tests.game('g4') and round = 'double' limit 1));
$$, 'a player leaves, a spectator joins, a clue is revealed');
reset role;

select is(
  (select array[g.status::text, (g.finished_at is not null)::text,
                (select score::text from public.game_results where game_id = g.id and display_name = 'Fay'),
                (select count(*)::text from public.seen_clues where game_id = g.id
                   and user_id = '11111111-1111-4111-8111-111111111111')]
   from public.games g where g.id = tests.game('g3')),
  array['abandoned', 'true', '200', '1'],
  'an abandoned game keeps its end time and scores, and its revealed clues count as seen'
);
select is(
  (select array_agg(gp.user_id::text || ':' || (s.user_id is not null) order by gp.user_id)
   from public.game_players gp
   left join public.seen_clues s on s.user_id = gp.user_id and s.game_id = gp.game_id
   where gp.game_id = tests.game('g4')),
  array['33333333-3333-4333-8333-333333333333:true', '44444444-4444-4444-8444-444444444444:false',
        '77777777-7777-4777-8777-777777777777:true', '88888888-8888-4888-8888-888888888888:true'],
  'clues revealed after a player leaves are not seen by them; a late spectator''s are'
);

-- ---------------------------------------------------------------------------
-- Who can read history
-- ---------------------------------------------------------------------------
-- Bob leaves room 1.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
delete from public.room_members where user_id = '22222222-2222-4222-8222-222222222222';
select is(
  (select count(*)::integer from public.game_results where game_id = tests.game('g1')),
  3, 'after leaving the room, a player still sees the game''s results'
);
reset role;

-- Room 1 is deleted.
delete from public.rooms where id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
select is(
  (select count(*)::integer from public.games where id = tests.game('g1') and room_id is null),
  1, 'deleting a room keeps its games'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.games where id in (tests.game('g1'), tests.game('g2'))),
  2, 'a spectator still sees the games they watched after the room is deleted'
);

select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
select is(
  (select array[(select count(*) from public.games), (select count(*) from public.game_results),
                (select count(*) from public.answers), (select count(*) from public.board_clues)]::integer[]),
  array[0, 0, 0, 0], 'someone outside a game sees none of it'
);
select throws_ok($$ select * from public.seen_clues $$, '42501', null, 'users cannot read seen clues');
select throws_ok(
  $$ select public.start_game('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2') $$,
  '42501', null, 'users cannot call engine functions'
);

-- Bob renames himself; old scoreboards keep "Bob".
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
update public.profiles set display_name = 'Bobby' where user_id = '22222222-2222-4222-8222-222222222222';
select is(
  (select display_name from public.game_results
   where game_id = tests.game('g1') and user_id = '22222222-2222-4222-8222-222222222222'),
  'Bob', 'renaming does not rewrite old scoreboards'
);
reset role;

-- Dave deletes his account.
delete from auth.users where id = '44444444-4444-4444-8444-444444444444';
select is(
  (select count(*)::integer from public.seen_clues where user_id = '44444444-4444-4444-8444-444444444444'),
  0, 'a deleted account''s seen clues are gone'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select is(
  (select array_agg(display_name || ':' || score order by score desc) from public.game_results
   where game_id = tests.game('g3') and role = 'contestant'),
  array['Former player:600', 'Fay:200'], 'a deleted player stays on the scoreboard as "Former player"'
);
reset role;
select is(
  (select count(*)::integer from public.game_players where user_id is null and display_name is not null),
  0, 'a deleted player''s name is not kept'
);

-- Who hosted: recorded at Start, so "Hosted by" survives the room (My games).
select is(
  (select host_user_id::text from public.games where id = tests.game('g1')),
  '11111111-1111-4111-8111-111111111111', 'start_game records who hosted'
);
select is(
  (select host_user_id::text from public.games where id = tests.game('g3')),
  '33333333-3333-4333-8333-333333333333', 'a host who doesn''t play is recorded too'
);
select is(
  (select confdeltype::text from pg_constraint
   where conrelid = 'public.games'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                         where attrelid = 'public.games'::regclass and attname = 'host_user_id')]),
  'n', 'deleting the host''s account clears host_user_id (on delete set null)'
);

select * from finish();
rollback;
