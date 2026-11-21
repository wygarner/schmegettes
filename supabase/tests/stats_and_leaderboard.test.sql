-- All-time stats and leaderboard. Run with `mise run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

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

-- Fixed accounts. Opp is the score-setting opponent for generated games.
insert into auth.users (id, email, is_anonymous) values
  ('23900000-0000-4000-8000-000000000001', 'alice@stats.test', false),
  ('23900000-0000-4000-8000-000000000002', 'opponent@stats.test', false),
  ('23900000-0000-4000-8000-000000000003', null, true),
  ('23900000-0000-4000-8000-000000000004', 'new@stats.test', false),
  ('23900000-0000-4000-8000-000000000005', 'nine@stats.test', false),
  ('23900000-0000-4000-8000-000000000006', 'perfect@stats.test', false),
  ('23900000-0000-4000-8000-000000000007', 'zero12@stats.test', false),
  ('23900000-0000-4000-8000-000000000008', 'zero10@stats.test', false),
  ('23900000-0000-4000-8000-000000000009', 'tiea@stats.test', false),
  ('23900000-0000-4000-8000-000000000010', 'tieb@stats.test', false),
  ('23900000-0000-4000-8000-000000000011', 'aftertie@stats.test', false),
  ('23900000-0000-4000-8000-000000000012', 'delete@stats.test', false);
insert into public.profiles (user_id, display_name, account_name) values
  ('23900000-0000-4000-8000-000000000001', 'Alice', 'Alice'),
  ('23900000-0000-4000-8000-000000000002', 'Opp', 'Opp'),
  ('23900000-0000-4000-8000-000000000003', 'Guest', null),
  ('23900000-0000-4000-8000-000000000004', 'New', 'New'),
  ('23900000-0000-4000-8000-000000000005', 'Nine', 'Nine'),
  ('23900000-0000-4000-8000-000000000006', 'Perfect', 'Perfect'),
  ('23900000-0000-4000-8000-000000000007', 'Zero12', 'Zero12'),
  ('23900000-0000-4000-8000-000000000008', 'Zero10', 'Zero10'),
  ('23900000-0000-4000-8000-000000000009', 'Tie A', 'Tie A'),
  ('23900000-0000-4000-8000-000000000010', 'Tie B', 'Tie B'),
  ('23900000-0000-4000-8000-000000000011', 'After tie', 'After tie'),
  ('23900000-0000-4000-8000-000000000012', 'Delete me', 'Delete me');

insert into public.clues (id, season, round, category, value, clue_text, correct_response, source_key) values
  ('23910000-0000-4000-8000-000000000001', 239, 'single', 'Stats', 100, 'c', 'r', 'stats-single'),
  ('23910000-0000-4000-8000-000000000002', 239, 'double', 'Stats', 200, 'c', 'r', 'stats-double'),
  ('23910000-0000-4000-8000-000000000003', 239, 'final', 'Stats', null, 'c', 'r', 'stats-final');

-- A generated two-player game. winner=true gives target 1 and Opp 0; false reverses them.
create function tests.add_game(target uuid, winner boolean, game_status public.game_status default 'finished',
  target_role public.player_role default 'contestant', target_score integer default 0, left_game boolean default false)
returns uuid language plpgsql as $$
declare g uuid := gen_random_uuid(); t uuid := gen_random_uuid(); o uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into public.games (id, status, finished_at) values
    (g, game_status, case when game_status = 'in_progress' then null else clock_timestamp() end);
  insert into public.game_players (id, game_id, user_id, role, display_name, left_at) values
    (t, g, target, target_role, 'Target', case when left_game then now() else null end),
    (o, g, '23900000-0000-4000-8000-000000000002', 'contestant', 'Opp', null);
  insert into public.board_clues (id, game_id, round, column_index, row_index, category, value, clue_id)
    values (b, g, 'single', 0, 0, 'Stats', 100, '23910000-0000-4000-8000-000000000001');
  if target_score <> 0 then
    insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta)
      values (gen_random_uuid(), g, b, t, 'x', 'voice',
        (case when target_score > 0 then 'correct' else 'incorrect' end)::public.verdict, target_score);
  end if;
  insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta)
    values (gen_random_uuid(), g, b, o, 'x', 'voice', 'correct',
      case when winner then least(target_score - 1, -1) else greatest(target_score + 1, 1) end);
  return g;
end;
$$;

-- Alice: solo win 100, shared win 200, second -50, and a left-game win 300.
select set_config('tests.g1', tests.add_game('23900000-0000-4000-8000-000000000001', true, 'finished', 'contestant', 100)::text, true);
select set_config('tests.g2', tests.add_game('23900000-0000-4000-8000-000000000001', true, 'finished', 'contestant', 200)::text, true);
select set_config('tests.g3', tests.add_game('23900000-0000-4000-8000-000000000001', false, 'finished', 'contestant', -50)::text, true);
select set_config('tests.g4', tests.add_game('23900000-0000-4000-8000-000000000001', true, 'finished', 'contestant', 300, true)::text, true);
-- Make g2 a shared first by matching Opp's score.
update public.answers set score_delta = 200 where game_id = current_setting('tests.g2')::uuid
  and game_player_id <> (select id from public.game_players where game_id = current_setting('tests.g2')::uuid and user_id = '23900000-0000-4000-8000-000000000001');
-- Replace g4's target score with a right and wrong Daily Double totaling 300.
delete from public.answers where game_id = current_setting('tests.g4')::uuid
  and game_player_id = (select id from public.game_players where game_id = current_setting('tests.g4')::uuid and user_id = '23900000-0000-4000-8000-000000000001');
update public.board_clues set round = 'double', is_daily_double = true, clue_id = '23910000-0000-4000-8000-000000000002'
  where game_id = current_setting('tests.g4')::uuid;
insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta)
select gen_random_uuid(), gp.game_id, bc.id, gp.id, 'x', 'voice', 'correct', 400
from public.game_players gp join public.board_clues bc on bc.game_id = gp.game_id
where gp.game_id = current_setting('tests.g4')::uuid and gp.user_id = '23900000-0000-4000-8000-000000000001';
insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta)
select gen_random_uuid(), gp.game_id, bc.id, gp.id, 'x', 'voice', 'incorrect', -100
from public.game_players gp join public.board_clues bc on bc.game_id = gp.game_id
where gp.game_id = current_setting('tests.g4')::uuid and gp.user_id = '23900000-0000-4000-8000-000000000001';
-- Final right and pending appeal in g2; neither changes the score.
insert into public.board_clues (id, game_id, round, column_index, row_index, category, value, clue_id) values
  ('23920000-0000-4000-8000-000000000001', current_setting('tests.g2')::uuid, 'final', 0, 0, 'Stats', 0, '23910000-0000-4000-8000-000000000003'),
  ('23920000-0000-4000-8000-000000000002', current_setting('tests.g2')::uuid, 'single', 1, 0, 'Stats', 0, '23910000-0000-4000-8000-000000000001');
insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta)
select gen_random_uuid(), gp.game_id, '23920000-0000-4000-8000-000000000001', gp.id, 'x', 'typed', 'correct', 0
from public.game_players gp where gp.game_id = current_setting('tests.g2')::uuid and gp.user_id = '23900000-0000-4000-8000-000000000001';
insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta)
select gen_random_uuid(), gp.game_id, '23920000-0000-4000-8000-000000000002', gp.id, 'x', 'voice', 'appeal_pending', 0
from public.game_players gp where gp.game_id = current_setting('tests.g2')::uuid and gp.user_id = '23900000-0000-4000-8000-000000000001';
-- Exercise final verdicts by changing the ordinary g2/g3 answers.
update public.answers set verdict = 'overridden_correct' where game_id = current_setting('tests.g2')::uuid and score_delta = 200
  and game_player_id = (select id from public.game_players where game_id = current_setting('tests.g2')::uuid and user_id = '23900000-0000-4000-8000-000000000001');
update public.answers set verdict = 'overridden_incorrect' where game_id = current_setting('tests.g3')::uuid and score_delta = -50;

-- Excluded: an abandoned contestant game and a finished watched game.
select tests.add_game('23900000-0000-4000-8000-000000000001', true, 'abandoned', 'contestant', 999);
select tests.add_game('23900000-0000-4000-8000-000000000001', true, 'finished', 'spectator', 999);

select tests.as_user('23900000-0000-4000-8000-000000000001');
select is((select games from private.my_stats()), 4, 'only finished contestant games count');
select is((select wins from private.my_stats()), 3, 'solo, shared-first, and left-game wins count');
select is((select win_rate from private.my_stats()), 75, 'win rate rounds down');
select is((select average_score from private.my_stats()), 138, 'average score rounds to the nearest dollar');
select is((select best_score from private.my_stats()), 300, 'best score');
select is((select best_game_id from private.my_stats()), current_setting('tests.g4')::uuid, 'best game links to the latest highest score');
select is((select career_total from private.my_stats()), 550::bigint, 'career total');
select is((select correct from private.my_stats()), '{"right":3,"judged":5}'::jsonb, 'regular accuracy uses final verdicts and excludes pending');
select is((select daily_doubles from private.my_stats()), '{"right":1,"wrong":1}'::jsonb, 'Daily Double record');
select is((select final from private.my_stats()), '{"right":1,"wrong":0}'::jsonb, 'Final record');
select is((select leaderboard->>'state' from private.my_stats()), 'needs-games', 'fewer than ten games needs games');

select tests.as_user('23900000-0000-4000-8000-000000000004');
select is((select games from private.my_stats()), 0, 'new account gets an empty stats row');
select ok((select wins is null and average_score is null and correct->'right' = 'null'::jsonb from private.my_stats()), 'empty stats are null');
select throws_ok($$ select private.leaderboard() $$, 'P0001', 'no counted games', 'no-game account cannot read leaderboard');
select tests.as_user('23900000-0000-4000-8000-000000000003', true);
select throws_ok($$ select * from private.my_stats() $$, '42501', 'not signed in', 'guest cannot read stats');
select throws_ok($$ select private.leaderboard() $$, '42501', 'not signed in', 'guest cannot read leaderboard');

select tests.as_owner();
select ok(not has_function_privilege('anon', 'private.my_stats()', 'execute'), 'anon cannot execute my_stats');
select ok(not has_function_privilege('anon', 'private.leaderboard()', 'execute'), 'anon cannot execute leaderboard');
select ok(not has_function_privilege('authenticated', 'private.counted_games(uuid)', 'execute'), 'counted_games is internal');

-- Nine games does not rank; the tenth does immediately.
select tests.add_game('23900000-0000-4000-8000-000000000005', true) from generate_series(1, 9);
select tests.as_user('23900000-0000-4000-8000-000000000005');
select is((private.leaderboard()->>'myState'), 'needs-games', 'nine games is not ranked');
select tests.as_owner();
select tests.add_game('23900000-0000-4000-8000-000000000005', true);
select tests.as_user('23900000-0000-4000-8000-000000000005');
select is((private.leaderboard()->>'myState'), 'ranked', 'the tenth finished game ranks immediately');

-- Visibility changes remove the caller immediately.
update public.profiles set show_on_leaderboard = false where user_id = '23900000-0000-4000-8000-000000000005';
select is((private.leaderboard()->>'myState'), 'hidden', 'visibility off hides immediately');
select ok(not (private.leaderboard()->'rows' @> '[{"name":"Nine"}]'::jsonb), 'hidden player is absent from rows');

-- Full ties share a rank and the following rank skips. Zero-win players prove the games tie-break.
select tests.as_owner();
select tests.add_game('23900000-0000-4000-8000-000000000006', true) from generate_series(1, 10);
select tests.add_game('23900000-0000-4000-8000-000000000007', false) from generate_series(1, 12);
select tests.add_game('23900000-0000-4000-8000-000000000008', false) from generate_series(1, 10);
select tests.add_game('23900000-0000-4000-8000-000000000009', true) from generate_series(1, 5);
select tests.add_game('23900000-0000-4000-8000-000000000009', false) from generate_series(1, 5);
select tests.add_game('23900000-0000-4000-8000-000000000010', true) from generate_series(1, 5);
select tests.add_game('23900000-0000-4000-8000-000000000010', false) from generate_series(1, 5);
select tests.add_game('23900000-0000-4000-8000-000000000011', true) from generate_series(1, 4);
select tests.add_game('23900000-0000-4000-8000-000000000011', false) from generate_series(1, 6);
select tests.add_game('23900000-0000-4000-8000-000000000012', true) from generate_series(1, 10);
select is((select rank from private.ranked_players() where user_id = '23900000-0000-4000-8000-000000000009'),
          (select rank from private.ranked_players() where user_id = '23900000-0000-4000-8000-000000000010'), 'full ties share rank');
select is((select min(rank) from private.ranked_players() where rank >
            (select rank from private.ranked_players() where user_id = '23900000-0000-4000-8000-000000000010')),
          (select rank from private.ranked_players() where user_id = '23900000-0000-4000-8000-000000000010') + 2, 'rank after a two-way tie skips');
select ok((select rank from private.ranked_players() where user_id = '23900000-0000-4000-8000-000000000007') <
          (select rank from private.ranked_players() where user_id = '23900000-0000-4000-8000-000000000008'), 'more games breaks a zero-win tie');

delete from auth.users where id = '23900000-0000-4000-8000-000000000012';
select ok(not exists (select 1 from private.ranked_players() where name = 'Delete me'), 'deleting an account removes it immediately');

-- The exact public row shape has no identifier or email key.
select tests.as_user('23900000-0000-4000-8000-000000000006');
select is((select array_agg(key order by key) from jsonb_object_keys(private.leaderboard()->'rows'->0) key),
  array['games','isMe','name','rank','winRate','wins'], 'leaderboard row exposes only approved fields');

select * from finish();
rollback;
