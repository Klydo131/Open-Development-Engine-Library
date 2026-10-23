-- Optional Supabase Auth bridge. Install after examples/postgres/course-portal-schema.sql.
-- Enable email confirmation and disable anonymous sign-ins before deployment.
begin;
create or replace function portal_private.actor_id() returns uuid
language sql stable security invoker set search_path='' as $$
  select case when coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then null else auth.uid() end
$$;
create function portal_private.sync_auth_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    delete from portal_private.accounts where id=old.id;
    return old;
  end if;
  insert into portal_private.accounts(id,email,verified)
    values(new.id,coalesce(new.email,''),new.email_confirmed_at is not null)
    on conflict(id) do update set email=excluded.email,verified=excluded.verified;
  return new;
end $$;
revoke all on function portal_private.sync_auth_account() from public,anon,authenticated;
create trigger portal_auth_account_sync after insert or update of email,email_confirmed_at or delete on auth.users
  for each row execute function portal_private.sync_auth_account();
insert into portal_private.accounts(id,email,verified)
  select id,coalesce(email,''),email_confirmed_at is not null from auth.users
  on conflict(id) do update set email=excluded.email,verified=excluded.verified;
commit;
