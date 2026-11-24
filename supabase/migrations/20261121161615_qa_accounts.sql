-- Dedicated QA accounts and safe cleanup (GH-254). Accounts remain ordinary Supabase
-- accounts; this private marker is never readable or writable by an app role.

create table private.qa_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('host', 'contestant')),
  label text not null check (char_length(btrim(label)) between 1 and 20),
  created_at timestamptz not null default now()
);
alter table private.qa_accounts enable row level security;
revoke all on private.qa_accounts from public, anon, authenticated, app_service, game_engine;

create function private.is_qa(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.qa_accounts q where q.user_id = uid);
$$;
revoke all on function private.is_qa(uuid) from public, anon, authenticated, app_service, game_engine;

-- Security introduced the audit action allowlist before this task. Widen it additively for
-- the two QA admin operations.
alter table private.audit_log drop constraint audit_log_action_check;
alter table private.audit_log add constraint audit_log_action_check check (action in (
  'host_access_granted', 'host_access_removed', 'host_code_rotated',
  'account_created', 'guest_merged', 'password_changed', 'account_deleted', 'guests_deleted',
  'staff_access_granted', 'staff_access_revoked', 'staff_read',
  'qa_account_marked', 'qa_cleanup'
));

create function private.admin_mark_qa(target_user uuid, qa_role text, qa_label text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cleaned text := btrim(coalesce(qa_label, ''));
begin
  perform private.require_admin();
  if qa_role not in ('host', 'contestant') or char_length(cleaned) not between 1 and 20
     or not exists (
       select 1 from auth.users u where u.id = target_user and not coalesce(u.is_anonymous, false)
     ) then
    raise exception 'invalid QA account' using errcode = '22023';
  end if;

  insert into private.qa_accounts (user_id, role, label)
  values (target_user, qa_role, cleaned)
  on conflict (user_id) do update set role = excluded.role, label = excluded.label;

  insert into public.profiles (user_id, display_name, account_name, show_on_leaderboard)
  values (target_user, cleaned, cleaned, false)
  on conflict (user_id) do update
    set account_name = excluded.account_name, show_on_leaderboard = false;

  if qa_role = 'host' then
    insert into public.hosts (user_id, code, note)
    select target_user, r.current_code, 'QA host (permanent)'
    from private.host_code_rotation r where r.singleton
    on conflict (user_id) do update set note = excluded.note;
  end if;

  perform private.audit('qa_account_marked', 'user', target_user,
    jsonb_build_object('role', qa_role));
end;
$$;
revoke all on function private.admin_mark_qa(uuid, text, text) from public;
grant execute on function private.admin_mark_qa(uuid, text, text) to authenticated;

-- Candidates are selected in SQL, including the non-QA refusal. Dry runs return the exact
-- room and game ids without changing any row. Seen-clue rows have no id and are therefore
-- removed with their game but are not returned separately.
create function private.admin_qa_cleanup(older_than interval, dry_run boolean)
returns table (kind text, id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  game_ids uuid[] := array[]::uuid[];
  room_ids uuid[] := array[]::uuid[];
begin
  perform private.require_admin();
  if older_than is null or older_than < interval '0' or dry_run is null then
    raise exception 'invalid QA cleanup' using errcode = '22023';
  end if;

  select coalesce(array_agg(g.id order by g.id), array[]::uuid[]) into game_ids
  from public.games g
  where g.started_at <= now() - older_than
    and exists (select 1 from public.game_players gp where gp.game_id = g.id)
    and (g.host_user_id is null or private.is_qa(g.host_user_id))
    and not exists (
      select 1 from public.game_players gp
      where gp.game_id = g.id and (gp.user_id is null or not private.is_qa(gp.user_id))
    );

  select coalesce(array_agg(r.id order by r.id), array[]::uuid[]) into room_ids
  from public.rooms r
  where r.created_at <= now() - older_than
    and private.is_qa(r.host_id)
    and exists (select 1 from public.room_members m where m.room_id = r.id)
    and not exists (
      select 1 from public.room_members m
      where m.room_id = r.id and not private.is_qa(m.user_id)
    )
    and not exists (
      select 1 from public.games g
      where g.room_id = r.id
        and (
          (g.host_user_id is not null and not private.is_qa(g.host_user_id))
          or exists (
            select 1 from public.game_players gp
            where gp.game_id = g.id and (gp.user_id is null or not private.is_qa(gp.user_id))
          )
        )
    );

  if not dry_run then
    delete from public.seen_clues s
    where s.game_id = any(game_ids) and private.is_qa(s.user_id);
    delete from public.games g where g.id = any(game_ids);
    update public.rooms r set status = 'closed' where r.id = any(room_ids);
    delete from public.rooms r where r.id = any(room_ids);
  end if;

  perform private.audit('qa_cleanup', 'system', null, jsonb_build_object(
    'dry_run', dry_run,
    'games', cardinality(game_ids),
    'rooms', cardinality(room_ids)
  ));

  return query select 'game'::text, x from unnest(game_ids) x
  union all
  select 'room'::text, x from unnest(room_ids) x
  order by 1, 2;
end;
$$;
revoke all on function private.admin_qa_cleanup(interval, boolean) from public;
grant execute on function private.admin_qa_cleanup(interval, boolean) to authenticated;

-- Exclude QA accounts before rank() is evaluated, so they do not shift a real player's rank.
create or replace function private.ranked_players()
returns table (user_id uuid, rank bigint, name text, win_rate integer, wins integer, games integer)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select p.user_id, p.account_name as name,
      count(c.game_id)::integer as games,
      count(c.game_id) filter (where c.placement = 1)::integer as wins
    from public.profiles p
    join auth.users u on u.id = p.user_id and not u.is_anonymous
    join private.counted_games(p.user_id) c on true
    where p.account_name is not null
      and p.show_on_leaderboard
      and not private.is_qa(p.user_id)
    group by p.user_id, p.account_name
    having count(c.game_id) >= 10
  )
  select user_id,
    rank() over (order by wins::numeric / games desc, wins desc, games desc),
    name, floor(100 * wins::numeric / games)::integer, wins, games
  from totals;
$$;
revoke all on function private.ranked_players() from public, anon, authenticated, app_service, game_engine;

-- Keep the existing public shape and grants. A QA caller sees the normal board without an own
-- row and is reported as hidden, even if they toggle their profile preference later.
create or replace function private.leaderboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  counted integer;
  visible boolean;
  caller_rank integer;
  result jsonb;
begin
  if caller is null or private.caller_is_guest() then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select count(*)::integer into counted from private.counted_games(caller);
  if counted = 0 then
    raise exception 'no counted games' using errcode = 'P0001';
  end if;

  select coalesce(p.show_on_leaderboard, true) and not private.is_qa(caller) into visible
  from public.profiles p where p.user_id = caller;
  visible := coalesce(visible, not private.is_qa(caller));
  select r.rank::integer into caller_rank from private.ranked_players() r where r.user_id = caller;

  with ranked as materialized (
    select * from private.ranked_players()
  ),
  top_rows as (
    select * from ranked order by rank, wins desc, games desc, name, user_id limit 50
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', t.rank, 'name', t.name, 'winRate', t.win_rate,
        'wins', t.wins, 'games', t.games, 'isMe', t.user_id = caller
      ) order by t.rank, t.wins desc, t.games desc, t.name)
      from top_rows t
    ), '[]'::jsonb),
    'me', case when caller_rank is not null and not exists (select 1 from top_rows t where t.user_id = caller)
      then (select jsonb_build_object(
        'rank', r.rank, 'name', r.name, 'winRate', r.win_rate,
        'wins', r.wins, 'games', r.games, 'isMe', true
      ) from ranked r where r.user_id = caller)
      else null end,
    'myState', case when not visible then 'hidden' when caller_rank is not null then 'ranked' else 'needs-games' end
  ) || case when visible and caller_rank is null
       then jsonb_build_object('gamesToGo', 10 - counted)
       else '{}'::jsonb end
  into result;
  return result;
end;
$$;
revoke all on function private.leaderboard() from public, anon;
grant execute on function private.leaderboard() to authenticated;
