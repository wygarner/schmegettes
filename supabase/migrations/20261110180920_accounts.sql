-- Accounts: players sign in with Apple or Google (docs/product-docs/features/accounts/).
-- Every sign-in moves the device's guest (an anonymous user) into the account: the guest
-- asks for a one-use merge ticket, signs in, and the account redeems the ticket. Account
-- changes go through functions in schema `private`, which the Data API doesn't expose.

-- The signed-in player's name (leaderboard, name prefill). display_name stays "the last name
-- used in a room". Null for guests and for accounts that haven't picked a name yet.
alter table public.profiles
  add column account_name text check (char_length(account_name) between 1 and 20);

-- Players may write only display_name directly; account_name is set by
-- private.set_account_name, which refuses guests.
revoke insert on public.profiles from authenticated;
grant insert (user_id, display_name) on public.profiles to authenticated;

-- One-use tickets, stored hashed. Owner only: no grants, no policies.
create table private.merge_tickets (
  token_hash bytea primary key,
  guest_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index merge_tickets_guest_idx on private.merge_tickets (guest_id);
alter table private.merge_tickets enable row level security;
revoke all on private.merge_tickets from public, anon, authenticated, app_service, game_engine;

-- Whether the caller is an anonymous (guest) user. Either the token or the user row saying
-- so is enough: a guest is never treated as an account.
create function private.caller_is_guest()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'is_anonymous') = 'true', false)
      or exists (select 1 from auth.users where id = (select auth.uid()) and is_anonymous);
$$;
revoke all on function private.caller_is_guest() from public;

-- Whether a user is in a room whose game is in progress.
create function private.user_in_game(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members m
    join public.rooms r on r.id = m.room_id
    where m.user_id = target_user and r.status = 'in_game'
  );
$$;
revoke all on function private.user_in_game(uuid) from public;

-- Sets the signed-in caller's name, creating their profile if needed.
create function private.set_account_name(new_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cleaned text := btrim(coalesce(new_name, ''));
begin
  if caller is null or private.caller_is_guest() then
    raise exception 'only a signed-in player has an account name' using errcode = '42501';
  end if;
  if char_length(cleaned) not between 1 and 20 then
    raise exception 'an account name is 1 to 20 characters' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, display_name, account_name) values (caller, cleaned, cleaned)
  on conflict (user_id) do update set account_name = excluded.account_name;
end;
$$;
revoke all on function private.set_account_name(text) from public;
grant execute on function private.set_account_name(text) to authenticated;

-- A new ticket for the calling guest, replacing their earlier ones. Valid for 24 hours.
create function private.create_merge_ticket()
returns table (ticket text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  secret text;
  expiry timestamptz := now() + interval '24 hours';
begin
  if caller is null
     or not exists (select 1 from auth.users u where u.id = caller and u.is_anonymous) then
    raise exception 'only a guest can ask for a merge ticket' using errcode = '42501';
  end if;
  delete from private.merge_tickets t where t.guest_id = caller;
  secret := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into private.merge_tickets (token_hash, guest_id, expires_at)
  values (sha256(convert_to(secret, 'UTF8')), caller, expiry);
  return query select secret, expiry;
end;
$$;
revoke all on function private.create_merge_ticket() from public;
grant execute on function private.create_merge_ticket() to authenticated;

-- Moves the ticket's guest into the calling account, then deletes the guest. One
-- transaction: any error leaves the ticket and the guest as they were.
--   22023  the ticket is wrong, used, expired, or the caller's own
--   42501  the caller is a guest
--   55006  the guest is in a game in progress
create function private.merge_guest(ticket text)
returns table (games_added integer, host_access_added boolean, account_was_new boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  guest uuid;
  was_new boolean;
  was_host boolean;
  added integer := 0;
begin
  if caller is null or private.caller_is_guest() then
    raise exception 'only a signed-in player can take in a guest' using errcode = '42501';
  end if;

  delete from private.merge_tickets t
  where t.token_hash = sha256(convert_to(coalesce(merge_guest.ticket, ''), 'UTF8'))
    and t.expires_at > now()
  returning t.guest_id into guest;
  if guest is null or guest = caller
     or not exists (select 1 from auth.users u where u.id = guest and u.is_anonymous) then
    raise exception 'invalid merge ticket' using errcode = '22023';
  end if;
  if private.user_in_game(guest) then
    raise exception 'the guest is in a game in progress' using errcode = '55006';
  end if;

  select coalesce((select p.account_name is null from public.profiles p where p.user_id = caller), true)
    into was_new;
  was_host := private.user_is_host(caller);

  -- Rows below point at the caller's profile, so it must exist.
  insert into public.profiles (user_id, display_name)
  select caller, p.display_name from public.profiles p where p.user_id = guest
  on conflict (user_id) do nothing;

  -- Games: move the guest's rows unless the caller was in that game too.
  with moved as (
    update public.game_players gp set user_id = caller
    where gp.user_id = guest
      and not exists (select 1 from public.game_players a where a.game_id = gp.game_id and a.user_id = caller)
    returning gp.game_id
  )
  select count(*) into added
  from moved join public.games g on g.id = moved.game_id
  where g.status in ('finished', 'abandoned');
  -- Same game, both identities: the guest's row becomes "Former player".
  update public.game_players set user_id = null, display_name = null where user_id = guest;

  update public.games set host_user_id = caller where host_user_id = guest;

  -- Seen clues: keep the later time, so a fresh board still avoids what was seen recently.
  insert into public.seen_clues (user_id, clue_id, seen_at, game_id)
  select caller, s.clue_id, s.seen_at, s.game_id from public.seen_clues s where s.user_id = guest
  on conflict (user_id, clue_id) do update set seen_at = greatest(public.seen_clues.seen_at, excluded.seen_at);

  -- Host access: either one's is enough.
  insert into public.hosts (user_id, code, created_at)
  select caller, h.code, h.created_at from public.hosts h where h.user_id = guest
  on conflict (user_id) do nothing;
  update public.host_codes set used_by = caller where used_by = guest;

  -- The rest (profile, memberships, lobbies the guest hosted, tickets) goes with the guest.
  delete from auth.users where id = guest;

  return query select added, (not was_host and private.user_is_host(caller)), was_new;
end;
$$;
revoke all on function private.merge_guest(text) from public;
grant execute on function private.merge_guest(text) to authenticated;

-- Deletes the calling account. Cascades: results become "Former player" (via
-- scrub_game_player_names), seen clues and host access go, hosted games keep a null host.
create function private.delete_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or private.caller_is_guest() then
    raise exception 'only a signed-in player can delete an account' using errcode = '42501';
  end if;
  if private.user_in_game(caller) then
    raise exception 'the caller is in a game in progress' using errcode = '55006';
  end if;
  delete from auth.users where id = caller;
end;
$$;
revoke all on function private.delete_account() from public;
grant execute on function private.delete_account() to authenticated;
