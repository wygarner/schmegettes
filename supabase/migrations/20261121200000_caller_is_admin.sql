-- Whether the caller is an admin, as a boolean, for the web app's Admin row on Home
-- (docs/product-docs/features/private-access/feature-brief.md, "Admin screen in the app").
-- The same test as private.require_admin(), which raises instead. It answers only about the
-- caller, so it reveals nothing about anyone else.
create function private.caller_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select true from auth.users u
    join private.admins a on a.user_id = u.id
    where u.id = (select auth.uid()) and not coalesce(u.is_anonymous, false)
  ), false);
$$;
revoke all on function private.caller_is_admin() from public;
grant execute on function private.caller_is_admin() to authenticated;
