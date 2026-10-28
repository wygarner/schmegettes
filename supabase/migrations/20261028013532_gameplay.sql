-- Gameplay: a clue ends answered or unanswered. Called by game/ as game_engine.
-- Product rules: docs/product-docs/features/gameplay/.
create function public.finish_clue(target_board_clue uuid, final_state public.clue_state)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if final_state not in ('answered', 'unanswered') then
    raise exception 'a clue finishes as answered or unanswered' using errcode = '22023';
  end if;
  -- Safe to call again: a finished clue keeps its first state.
  update public.board_clues set state = final_state
  where id = target_board_clue and state in ('unplayed', 'active');
end;
$$;
revoke all on function public.finish_clue(uuid, public.clue_state) from public;
grant execute on function public.finish_clue(uuid, public.clue_state) to game_engine;
