-- Wagers: Daily Doubles and Final Schmegettes. Called by game/ as game_engine.
-- Rules: docs/product-docs/features/wagers/.

-- Final Schmegettes answers are typed. Postgres can't use a new enum value in the transaction
-- that adds it, so nothing below names 'typed'; record_answer already takes the source as a
-- parameter.
alter type public.answer_source add value if not exists 'typed';

-- One wager per player per wagered clue: the Daily Double picker, or each Final finalist.
-- Final answers are kept here once submitted, so a game server restart doesn't lose them.
-- Wagers are secret until the reveal; outcomes reach players only as answers rows.
create table public.wagers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  board_clue_id uuid not null references public.board_clues (id) on delete cascade,
  game_player_id uuid not null references public.game_players (id) on delete cascade,
  amount integer not null check (amount >= 0),
  answer text check (char_length(answer) <= 200),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (board_clue_id, game_player_id)
);
create index wagers_game_idx on public.wagers (game_id);

alter table public.wagers enable row level security;
revoke all on public.wagers from public, anon, authenticated;
grant select, insert, update on public.wagers to game_engine;
create policy engine_wagers on public.wagers for all to game_engine using (true) with check (true);
-- No authenticated policy or grant: nobody sees a wager before the reveal.

-- The first wager wins; a repeat (a retried write, a late second wager) changes nothing.
create function public.record_wager(target_board_clue uuid, target_user uuid, wager_amount integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  clue public.board_clues;
  player uuid;
begin
  select * into clue from public.board_clues where id = target_board_clue;
  if not found then
    raise exception 'board clue not found' using errcode = 'P0002';
  end if;
  select gp.id into player from public.game_players gp
  where gp.game_id = clue.game_id and gp.user_id = target_user and gp.role = 'contestant';
  if player is null then
    raise exception 'not a contestant in this game' using errcode = 'P0002';
  end if;

  insert into public.wagers (game_id, board_clue_id, game_player_id, amount)
  values (clue.game_id, clue.id, player, wager_amount)
  on conflict (board_clue_id, game_player_id) do nothing;
end;
$$;

-- Locks a finalist's typed answer. Only the first submission counts.
create function public.submit_final_answer(target_board_clue uuid, target_user uuid, answer_text text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.wagers w set answer = answer_text, submitted_at = now()
  from public.game_players gp
  where w.board_clue_id = target_board_clue
    and w.game_player_id = gp.id
    and gp.user_id = target_user
    and w.submitted_at is null;
end;
$$;

revoke all on function public.record_wager(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.submit_final_answer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_wager(uuid, uuid, integer) to game_engine;
grant execute on function public.submit_final_answer(uuid, uuid, text) to game_engine;

-- During a game, players see only clues that have been shown: an unrevealed row would tell
-- them where the Daily Doubles are and the Final category. Once the game ends, everything
-- is visible for history.
drop policy board_clues_select on public.board_clues;
create policy board_clues_select on public.board_clues for select to authenticated
  using (
    public.is_game_member(game_id)
    and (
      revealed_at is not null
      or exists (select 1 from public.games g where g.id = game_id and g.status <> 'in_progress')
    )
  );
