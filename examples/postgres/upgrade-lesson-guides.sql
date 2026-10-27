-- Upgrade an existing portal as the role that owns its private functions.
-- Existing records, revisions, RLS policies and function owners/grants are retained.
-- Review operator customizations and rehearse on a backup before applying.
-- CREATE OR REPLACE retains ownership and grants: https://www.postgresql.org/docs/15/sql-createfunction.html
begin;
set local search_path = '';
do $$
begin
  if to_regprocedure('portal_private.text_ok(jsonb,integer,boolean)') is null
    or to_regprocedure('portal_private.materials_ok(jsonb)') is null
    or to_regprocedure('portal_private.save_course(jsonb,uuid)') is null
    or to_regclass('public.portal_course_materials') is null then
    raise exception 'Install the course portal schema before upgrading lesson guides.' using errcode='22023';
  end if;
  if exists(select 1 from pg_proc p where p.oid = any(array[
      to_regprocedure('portal_private.text_ok(jsonb,integer,boolean)'),
      to_regprocedure('portal_private.materials_ok(jsonb)'),
      to_regprocedure('portal_private.save_course(jsonb,uuid)'),
      to_regprocedure('portal_private.teaching_ok(jsonb,boolean)')])
    and pg_get_userbyid(p.proowner) <> current_user) then
    raise exception 'Run the lesson guide upgrade as the existing portal function owner.' using errcode='42501';
  end if;
end $$;
create or replace function portal_private.teaching_ok(value jsonb, complete boolean default false) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(value) is distinct from 'object' or complete is null then return false; end if;
  if not value ?& array['goal','connection','workedExample','practice','checkQuestion','checkExplanation']
    or (value - array['goal','connection','workedExample','practice','checkQuestion','checkExplanation']) <> '{}'::jsonb then return false; end if;
  return portal_private.text_ok(value->'goal',500,complete)
    and portal_private.text_ok(value->'connection',2000)
    and portal_private.text_ok(value->'workedExample',6000,complete)
    and portal_private.text_ok(value->'practice',2000,complete)
    and portal_private.text_ok(value->'checkQuestion',2000,complete)
    and portal_private.text_ok(value->'checkExplanation',6000,complete);
end $$;

create or replace function portal_private.materials_ok(items jsonb) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare item jsonb; ids text[] := '{}'; parsed_id uuid;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) > 50 then return false; end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) is distinct from 'object' or
      not item ?& array['id','title','text','sourceUrl','credit','rights'] or
      (item - array['id','title','text','sourceUrl','credit','rights','mediaType','attachment','teaching']) <> '{}'::jsonb or
      not portal_private.text_ok(item->'id',36,true) or
      (item->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or
      not portal_private.text_ok(item->'title',160,true) or
      not portal_private.text_ok(item->'text',20000) or
      not portal_private.text_ok(item->'sourceUrl',2048) or
      not portal_private.text_ok(item->'credit',500) or not portal_private.text_ok(item->'rights',500) or
      (item ? 'mediaType' and (jsonb_typeof(item->'mediaType') is distinct from 'string' or item->>'mediaType' not in ('text','document','audio','video','image','link'))) or
      (item ? 'teaching' and not portal_private.teaching_ok(item->'teaching')) or
      (item ? 'attachment' and not portal_private.attachment_available(item->'attachment'))
    then return false; end if;
    parsed_id := (item->>'id')::uuid;
    if parsed_id::text = any(ids) then return false; end if;
    ids := array_append(ids,parsed_id::text);
    -- The generic adapter additionally parses canonical HTTP(S) URLs. These server
    -- checks reject credentials, controls and non-HTTP(S) schemes on direct RPCs.
    if item->>'sourceUrl' <> '' and ((item->>'sourceUrl') !~ '^https?://[^/@[:space:]]+[^[:space:]]*$'
      or split_part(split_part(item->>'sourceUrl','://',2),'/',1) like '%@%') then return false; end if;
  end loop;
  return true;
end $$;

create or replace function portal_private.save_course(p_course jsonb,p_expected_revision uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target_id uuid; current_revision uuid; next_revision uuid := gen_random_uuid(); result jsonb;
begin
  if not portal_private.is_admin() then raise exception 'Administrator permission required.' using errcode='42501'; end if;
  if jsonb_typeof(p_course) is distinct from 'object' or not p_course ?& array['id','revision','title','summary','language','status','lessons']
    or (p_course - array['id','revision','title','summary','language','status','lessons']) <> '{}'::jsonb
    or octet_length(p_course::text) > 262144
    or not portal_private.text_ok(p_course->'title',160,true) or not portal_private.text_ok(p_course->'summary',2000,true)
    or not portal_private.text_ok(p_course->'language',35,true) or not portal_private.materials_ok(p_course->'lessons')
    or jsonb_typeof(p_course->'id') is distinct from 'string' or jsonb_typeof(p_course->'revision') is distinct from 'string'
    or char_length(p_course->>'id') <> 36 or char_length(p_course->>'revision') <> 36
    or (p_course->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or (p_course->>'revision') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or (p_course->>'status') not in ('draft','published') or jsonb_typeof(p_course->'status') is distinct from 'string'
    or (p_course->>'status' = 'published' and jsonb_array_length(p_course->'lessons') = 0)
    or (p_course->>'status' = 'published' and exists(select 1 from jsonb_array_elements(p_course->'lessons') item
      where (not portal_private.text_ok(item->'text',20000,true) and item->>'sourceUrl' = '' and not coalesce(portal_private.attachment_available(item->'attachment'),false))
        or not portal_private.text_ok(item->'credit',500,true) or not portal_private.text_ok(item->'rights',500,true)
        or (item ? 'teaching' and not portal_private.teaching_ok(item->'teaching',true))))
  then raise exception 'Invalid or oversized course.' using errcode='22023'; end if;
  target_id := (p_course->>'id')::uuid;
  perform (p_course->>'revision')::uuid;
  -- Lock before comparing; a racing second save observes the winner's revision.
  select revision into current_revision from public.portal_courses where id = target_id for update;
  if found then
    if p_expected_revision is null or current_revision <> p_expected_revision then
      raise exception 'Course changed.' using errcode='40001'; end if;
    update public.portal_courses set revision=next_revision,title=p_course->>'title',summary=p_course->>'summary',
      language=p_course->>'language',status=p_course->>'status' where id=target_id;
  else
    if p_expected_revision is not null then raise exception 'Course changed.' using errcode='40001'; end if;
    insert into public.portal_courses(id,revision,title,summary,language,status)
      values(target_id,next_revision,p_course->>'title',p_course->>'summary',p_course->>'language',p_course->>'status');
  end if;
  insert into public.portal_course_materials(course_id,lessons) values(target_id,p_course->'lessons')
    on conflict(course_id) do update set lessons=excluded.lessons;
  result := jsonb_set(jsonb_set(p_course,'{id}',to_jsonb(target_id)),'{revision}',to_jsonb(next_revision));
  return result;
exception when unique_violation then raise exception 'Course changed.' using errcode='40001';
end $$;
revoke all on function portal_private.teaching_ok(jsonb,boolean) from public,anon,authenticated;
commit;
