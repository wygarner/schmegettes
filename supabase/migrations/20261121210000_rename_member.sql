-- The host renames another member of a lobby (docs/product-docs/features/lobby/feature-brief.md,
-- "Display names"). Same as set_member_name, but the name isn't remembered as that player's
-- prefill: a host's rename lasts for this room only. game/ checks that the caller is the host
-- and that the room is a lobby (not a resume lobby) before calling it.
create function public.rename_member(target_room uuid, target_user uuid, member_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text := public.clean_display_name(member_name);
  stored text;
begin
  perform 1 from public.rooms where id = target_room and status = 'open' for update;
  if not found then
    raise exception 'room not open' using errcode = '55000';
  end if;

  stored := public.free_member_name(target_room, cleaned, target_user);
  update public.room_members set display_name = stored
  where room_id = target_room and user_id = target_user;
  if not found then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  return stored;
end;
$$;
revoke all on function public.rename_member(uuid, uuid, text) from public;
grant execute on function public.rename_member(uuid, uuid, text) to game_engine;
