-- Answer judging: record why each answer got its verdict, and when the host overrode it.
-- Rules: docs/product-docs/features/gameplay/ ("How an answer is matched") and
-- scoreboard-and-overrides/ ("Recorded"). Tuning query: docs/system-docs/operations/judge-tuning.md.
--
-- Compatible with the game server already running: its 7-argument record_answer call resolves
-- to the new function through the defaults, and update_verdict keeps its signature.

-- Mirrors MatchRule in shared/schemas/domain.schema.json.
create type public.match_rule as enum ('exact', 'spelling_slip', 'sounds_alike', 'no_match', 'nothing_heard');

-- All four are null for answers recorded before this migration (no backfill).
alter table public.answers
  -- The rule that decided the judge's verdict.
  add column match_rule public.match_rule,
  -- Every transcript the phone heard, most likely first (a typed answer has one).
  add column heard text[]
    check (heard is null or (cardinality(heard) between 1 and 5
                             and char_length(array_to_string(heard, '')) <= 1000)),
  -- The judge's verdict. update_verdict never changes it, so a flip and a flip back keep it.
  add column judge_verdict public.verdict
    check (judge_verdict is null or judge_verdict in ('correct', 'incorrect')),
  -- When the host last overrode the verdict; null if never.
  add column overridden_at timestamptz;

drop function public.record_answer(uuid, uuid, uuid, text, public.answer_source, public.verdict, integer);

create function public.record_answer(
  answer_id uuid,
  target_board_clue uuid,
  target_user uuid,
  answer_text text,
  answer_source public.answer_source,
  answer_verdict public.verdict,
  answer_score_delta integer,
  answer_match_rule public.match_rule default null,
  answer_heard text[] default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.answers where id = answer_id) then
    return;
  end if;

  insert into public.answers (id, game_id, board_clue_id, game_player_id, answer, source, verdict, score_delta,
                              match_rule, heard, judge_verdict)
  select answer_id, b.game_id, b.id, gp.id, answer_text, answer_source, answer_verdict, answer_score_delta,
         answer_match_rule, answer_heard,
         case when answer_verdict in ('correct', 'incorrect') then answer_verdict end
  from public.board_clues b
  join public.game_players gp
    on gp.game_id = b.game_id and gp.user_id = target_user and gp.role = 'contestant'
  where b.id = target_board_clue
  on conflict (id) do nothing;

  if not found then
    raise exception 'not a contestant in this game' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.record_answer(uuid, uuid, uuid, text, public.answer_source, public.verdict, integer,
  public.match_rule, text[]) from public, anon, authenticated;
grant execute on function public.record_answer(uuid, uuid, uuid, text, public.answer_source, public.verdict, integer,
  public.match_rule, text[]) to game_engine;

-- Host override or appeal result. A host override stamps overridden_at.
create or replace function public.update_verdict(answer_id uuid, answer_verdict public.verdict, answer_score_delta integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.answers
  set verdict = answer_verdict,
      score_delta = answer_score_delta,
      overridden_at = case when answer_verdict in ('overridden_correct', 'overridden_incorrect')
                           then now() else overridden_at end
  where id = answer_id;
  if not found then
    raise exception 'answer not found' using errcode = 'P0002';
  end if;
end;
$$;
