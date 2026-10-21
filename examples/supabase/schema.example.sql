-- Reference schema for a NEW development project. Not a deployed migration.
-- Only encrypted snapshots belong here. Auth identities stay separate from lessons.
begin;
create table public.learning_room_vaults (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  envelope jsonb not null,
  constraint valid_envelope check (
    jsonb_typeof(envelope) = 'object'
    and envelope->>'format' = 'open-learning-rooms'
    and envelope->>'version' = '1'
    and envelope->>'kdf' = 'PBKDF2-SHA256'
    and envelope->>'iterations' = '600000'
    and jsonb_typeof(envelope->'ciphertext') = 'string'
    and jsonb_typeof(envelope->'iv') = 'string'
    and jsonb_typeof(envelope->'salt') = 'string'
    and length(envelope->>'iv') = 16
    and length(envelope->>'salt') = 24
    and pg_column_size(envelope) <= 44040192
    and envelope ?& array['format','version','kdf','iterations','salt','iv','ciphertext']
    and (envelope - array['format','version','kdf','iterations','salt','iv','ciphertext']) = '{}'::jsonb
  )
);
alter table public.learning_room_vaults enable row level security;
revoke all on public.learning_room_vaults from anon, authenticated;
grant select, insert, update, delete on public.learning_room_vaults to authenticated;
create policy own_vault_select on public.learning_room_vaults for select to authenticated using ((select auth.uid()) = owner_id);
create policy own_vault_insert on public.learning_room_vaults for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy own_vault_update on public.learning_room_vaults for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy own_vault_delete on public.learning_room_vaults for delete to authenticated using ((select auth.uid()) = owner_id);
commit;
