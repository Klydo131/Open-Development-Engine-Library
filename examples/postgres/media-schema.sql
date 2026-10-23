-- PostgreSQL 15+. Install after course-portal-schema.sql and group-workspace-schema.sql.
-- A trusted HTTP server authenticates the actor, scans uploads, then uses this
-- dedicated role. Never grant it to anon/authenticated or a browser-facing login.
begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='library_media_service') then
    create role library_media_service nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant usage on schema portal_private to library_media_service;

create function portal_private.media_metadata_ok(p_media jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare name text; extension text; expected_mime text; expected_type text;
begin
  if jsonb_typeof(p_media) is distinct from 'object' or
    not p_media ?& array['id','name','mime','size','sha256','mediaType'] or
    (p_media-array['id','name','mime','size','sha256','mediaType'])<>'{}'::jsonb then return false; end if;
  if not portal_private.uuid_ok(p_media->'id') or p_media->>'id'<>lower(p_media->>'id') or
    not portal_private.text_ok(p_media->'name',255,true) or
    jsonb_typeof(p_media->'mime') is distinct from 'string' or
    jsonb_typeof(p_media->'mediaType') is distinct from 'string' or
    jsonb_typeof(p_media->'sha256') is distinct from 'string' or
    p_media->>'sha256' !~ '^[0-9a-f]{64}$' or
    jsonb_typeof(p_media->'size') is distinct from 'number' or
    p_media->>'size' !~ '^[0-9]+$' or
    (p_media->>'size')::numeric not between 1 and 10485760 then return false; end if;
  name:=p_media->>'name';
  if name ~ '[\x01-\x1f\x7f-\x9f/\\]' or name in ('.','..') then return false; end if;
  extension:=lower(regexp_replace(name,'^.*\.',''));
  expected_mime:=case extension when 'pdf' then 'application/pdf' when 'mp3' then 'audio/mpeg'
    when 'wav' then 'audio/wav' when 'm4a' then 'audio/mp4' when 'mp4' then 'video/mp4'
    when 'webm' then 'video/webm' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' end;
  expected_type:=case when extension='pdf' then 'document' when extension in ('mp3','wav','m4a') then 'audio'
    when extension in ('mp4','webm') then 'video' when extension in ('png','jpg','jpeg') then 'image' end;
  return coalesce(p_media->>'mime'=expected_mime and p_media->>'mediaType'=expected_type,false);
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
create function portal_private.media_signature_ok(p_media jsonb,p_bytes bytea) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare extension text:=lower(regexp_replace(p_media->>'name','^.*\.',''));
begin
  return coalesce(case extension
    when 'pdf' then substring(p_bytes from 1 for 5)=convert_to('%PDF-','UTF8')
    when 'mp3' then substring(p_bytes from 1 for 3)=convert_to('ID3','UTF8') or
      (get_byte(p_bytes,0)=255 and (get_byte(p_bytes,1)&224)=224)
    when 'wav' then substring(p_bytes from 1 for 4)=convert_to('RIFF','UTF8') and substring(p_bytes from 9 for 4)=convert_to('WAVE','UTF8')
    when 'm4a' then substring(p_bytes from 5 for 4)=convert_to('ftyp','UTF8')
    when 'mp4' then substring(p_bytes from 5 for 4)=convert_to('ftyp','UTF8')
    when 'webm' then substring(p_bytes from 1 for 4)=decode('1a45dfa3','hex')
    when 'png' then substring(p_bytes from 1 for 8)=decode('89504e470d0a1a0a','hex')
    when 'jpg' then substring(p_bytes from 1 for 3)=decode('ffd8ff','hex')
    when 'jpeg' then substring(p_bytes from 1 for 3)=decode('ffd8ff','hex')
    else false end,false);
exception when array_subscript_error then return false;
end $$;

create table portal_private.media_blobs (
  id uuid primary key,
  media jsonb not null check(portal_private.media_metadata_ok(media)),
  bytes bytea not null check(octet_length(bytes) between 1 and 10485760),
  uploaded_by uuid not null references portal_private.accounts(id),
  check(media->>'id'=id::text),
  check((media->>'size')::numeric=octet_length(bytes)),
  check(media->>'sha256'=encode(sha256(bytes),'hex')),
  check(portal_private.media_signature_ok(media,bytes))
);
alter table portal_private.media_blobs enable row level security;
revoke all on portal_private.media_blobs from public,anon,authenticated,library_media_service;

create function portal_private.put_media(p_actor_id uuid,p_media jsonb,p_bytes bytea) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- Explicit identity is supplied only by the verified request server; do not
  -- trust a browser claim, mutable session setting or administrator role label.
  if not exists(select 1 from portal_private.accounts a join portal_private.administrators d on d.user_id=a.id
    where a.id=p_actor_id and a.verified) then
    raise exception 'Administrator permission required.' using errcode='42501';
  end if;
  if not portal_private.media_metadata_ok(p_media) or p_bytes is null or
    octet_length(p_bytes) not between 1 and 10485760 or
    (p_media->>'size')::numeric<>octet_length(p_bytes) or
    p_media->>'sha256'<>encode(sha256(p_bytes),'hex') or
    not portal_private.media_signature_ok(p_media,p_bytes) then
    raise exception 'Invalid media data.' using errcode='22023';
  end if;
  -- All writers share this transaction lock. The count and total are checked
  -- together before insertion, including concurrently uploaded files.
  perform pg_advisory_xact_lock(713994002);
  if (select count(*)>=100 or coalesce(sum(octet_length(bytes)),0)+octet_length(p_bytes)>104857600 from portal_private.media_blobs) then
    raise exception 'Media storage limit reached.' using errcode='22023';
  end if;
  insert into portal_private.media_blobs(id,media,bytes,uploaded_by) values((p_media->>'id')::uuid,p_media,p_bytes,p_actor_id);
end $$;

create function portal_private.get_media(p_actor_id uuid,p_id uuid) returns table(media jsonb,bytes bytea)
language sql stable security definer set search_path='' as $$
  select b.media,b.bytes from portal_private.media_blobs b
  where b.id=p_id and exists(select 1 from portal_private.accounts a where a.id=p_actor_id and a.verified)
    and (exists(select 1 from portal_private.administrators d where d.user_id=p_actor_id)
      or (exists(select 1 from public.portal_group_members m where m.user_id=p_actor_id)
        and exists(select 1 from public.portal_courses c join public.portal_course_materials cm on cm.course_id=c.id
          cross join lateral jsonb_array_elements(cm.lessons) lesson
          where c.status='published' and lesson->'attachment'=b.media)))
$$;

-- Course validation compares the complete immutable metadata to an actual blob.
-- A made-up UUID, altered name, digest, size or media type cannot be published.
create or replace function portal_private.attachment_available(p_attachment jsonb) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from portal_private.media_blobs where media=p_attachment)
$$;
revoke all on function portal_private.media_metadata_ok(jsonb),portal_private.media_signature_ok(jsonb,bytea),
  portal_private.attachment_available(jsonb),portal_private.put_media(uuid,jsonb,bytea),portal_private.get_media(uuid,uuid)
  from public,anon,authenticated,library_media_service;
grant execute on function portal_private.put_media(uuid,jsonb,bytea),portal_private.get_media(uuid,uuid) to library_media_service;
commit;
