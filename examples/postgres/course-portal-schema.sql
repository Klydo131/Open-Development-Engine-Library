-- PostgreSQL 15+ course catalog. Install with a trusted database-owner connection.
-- The deployer provisions anon/authenticated roles and trusted account synchronization.
-- Only a trusted request server may set library.actor_id within a transaction.
begin;
create schema if not exists portal_private;
revoke all on schema portal_private from public;
grant usage on schema portal_private to anon, authenticated;

create table portal_private.accounts (
  id uuid primary key,
  email text not null,
  verified boolean not null default false
);
alter table portal_private.accounts enable row level security;
revoke all on portal_private.accounts from public,anon,authenticated;

create function portal_private.actor_id() returns uuid
language sql stable security invoker set search_path = '' as $$
  select nullif(current_setting('library.actor_id',true),'')::uuid
$$;

create table portal_private.administrators (
  user_id uuid primary key references portal_private.accounts(id) on delete cascade
);
alter table portal_private.administrators enable row level security;
revoke all on portal_private.administrators from public, anon, authenticated;
-- Bootstrap/revoke administrators only from a trusted database-owner connection:
-- insert into portal_private.administrators(user_id) values ('CONFIRMED-USER-UUID');
-- Never grant roles from user_metadata, browser UI, email domain or self-signup.

create function portal_private.signed_in() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from portal_private.accounts where id=portal_private.actor_id() and verified)
$$;
create function portal_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select portal_private.signed_in() and exists
    (select 1 from portal_private.administrators where user_id = (select portal_private.actor_id()))
$$;
revoke all on function portal_private.signed_in(), portal_private.is_admin() from public;
grant execute on function portal_private.signed_in(), portal_private.is_admin() to anon, authenticated;

create function portal_private.text_ok(value jsonb, maximum integer, required boolean default false)
returns boolean language sql immutable security invoker set search_path = '' as $$
  -- Match JavaScript String.length (UTF-16 units) and String.trim, not PostgreSQL's
  -- code-point length and default ASCII-space trim. https://tc39.es/ecma262/#sec-string.prototype.trim
  select coalesce(jsonb_typeof(value) = 'string'
    and char_length(value #>> '{}') + regexp_count((value #>> '{}') collate "C", U&'[\+010000-\+10ffff]') <= maximum
    and (not required or length(btrim(value #>> '{}', U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff')) > 0)
    and (value #>> '{}') !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', false)
$$;
create function portal_private.attachment_available(p_attachment jsonb) returns boolean
language sql stable security definer set search_path='' as $$ select false $$;
create function portal_private.teaching_ok(value jsonb, complete boolean default false) returns boolean
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
create function portal_private.materials_ok(items jsonb) returns boolean
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

create table public.portal_courses (
  id uuid primary key,
  revision uuid not null default gen_random_uuid(),
  title text not null check (portal_private.text_ok(to_jsonb(title),160,true)),
  summary text not null check (portal_private.text_ok(to_jsonb(summary),2000,true)),
  language text not null check (portal_private.text_ok(to_jsonb(language),35,true) and language ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' and language !~ '[[:space:]]'),
  status text not null check (status in ('draft','published'))
);
create index portal_courses_status_title on public.portal_courses(status,title,id);
create table public.portal_course_materials (
  course_id uuid primary key references public.portal_courses(id) on delete cascade,
  lessons jsonb not null check (portal_private.materials_ok(lessons)),
  check (octet_length(lessons::text) <= 262144)
);
create table public.portal_support_threads (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references portal_private.accounts(id) on delete cascade,
  course_id uuid references public.portal_courses(id) on delete set null,
  subject text not null check (portal_private.text_ok(to_jsonb(subject),160,true)),
  message text not null check (portal_private.text_ok(to_jsonb(message),5000,true)),
  reply text not null default '' check (portal_private.text_ok(to_jsonb(reply),5000)),
  status text not null default 'open' check (status in ('open','answered')),
  revision uuid not null default gen_random_uuid(),
  check ((status = 'answered') = portal_private.text_ok(to_jsonb(reply),5000,true))
);
create index portal_support_learner on public.portal_support_threads(learner_id,id);
alter table public.portal_courses enable row level security;
alter table public.portal_course_materials enable row level security;
alter table public.portal_support_threads enable row level security;
create policy course_catalog_read on public.portal_courses for select to anon, authenticated
  using (status = 'published' or (select portal_private.is_admin()));
create policy course_material_read on public.portal_course_materials for select to authenticated
  using ((select portal_private.signed_in()) and exists
    (select 1 from public.portal_courses c where c.id = course_id and
      (c.status = 'published' or (select portal_private.is_admin()))));
create policy support_read on public.portal_support_threads for select to authenticated
  using ((select portal_private.signed_in()) and
    (learner_id = (select portal_private.actor_id()) or (select portal_private.is_admin())));
revoke all on public.portal_courses, public.portal_course_materials, public.portal_support_threads from public, anon, authenticated;
grant select on public.portal_courses, public.portal_course_materials to anon, authenticated;
grant select on public.portal_support_threads to authenticated;
-- No direct client INSERT/UPDATE/DELETE grants. Only the narrowly gated functions
-- below can mutate records, so revision checks cannot be bypassed through REST.

create function public.portal_role() returns text
language sql stable security invoker set search_path = '' as $$
  select case when not portal_private.signed_in() then 'anonymous'
    when portal_private.is_admin() then 'admin' else 'learner' end
$$;
create function public.portal_list_courses() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  select coalesce(jsonb_agg(record order by title,id), '[]'::jsonb) into result from (
    select c.title,c.id,jsonb_build_object('id',c.id,'revision',c.revision,'title',c.title,
      'summary',c.summary,'language',c.language,'status',c.status,
      'lessons',coalesce(m.lessons,'[]'::jsonb)) record
    from public.portal_courses c left join public.portal_course_materials m on m.course_id = c.id
    order by c.title,c.id limit 101
  ) visible;
  if jsonb_array_length(result) > 100 or octet_length(result::text) > 4194304 then
    raise exception 'Catalog limit reached; operator pagination is required.' using errcode='22023'; end if;
  return result;
end $$;
create function public.portal_support() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  select coalesce(jsonb_agg(record order by id),'[]'::jsonb) into result from (
    select id,jsonb_strip_nulls(jsonb_build_object('id',id,'learnerId',learner_id,'courseId',course_id,
      'subject',subject,'message',message,'reply',reply,'status',status,'revision',revision)) record
    from public.portal_support_threads order by id limit 101
  ) visible;
  if jsonb_array_length(result) > 100 or octet_length(result::text) > 4194304 then
    raise exception 'Support limit reached; operator pagination is required.' using errcode='22023'; end if;
  return result;
end $$;

create function portal_private.save_course(p_course jsonb,p_expected_revision uuid) returns jsonb
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
create function portal_private.ask_support(p_question jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare target_course uuid;
begin
  if not portal_private.signed_in() then raise exception 'Sign in required.' using errcode='42501'; end if;
  if jsonb_typeof(p_question) is distinct from 'object' or not p_question ?& array['subject','message']
    or (p_question - array['subject','message','courseId']) <> '{}'::jsonb
    or not portal_private.text_ok(p_question->'subject',160,true) or not portal_private.text_ok(p_question->'message',5000,true)
  then raise exception 'Invalid support request.' using errcode='22023'; end if;
  if p_question ? 'courseId' then
    if jsonb_typeof(p_question->'courseId') is distinct from 'string' then raise exception 'Invalid course.' using errcode='22023'; end if;
    target_course := (p_question->>'courseId')::uuid;
    if not exists(select 1 from public.portal_courses where id=target_course and (status='published' or portal_private.is_admin())) then
      raise exception 'Course unavailable.' using errcode='42501'; end if;
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Request creation requires READ COMMITTED isolation.' using errcode='25000'; end if;
  -- Serialize accepted writes while allowing inbox reads. A fresh snapshot after
  -- the lock observes the preceding writer before enforcing the reader's bound.
  lock table public.portal_support_threads in share row exclusive mode;
  if (select count(*) from public.portal_support_threads) >= 100 then
    raise exception 'Request capacity reached; operator pagination is required.' using errcode='22023'; end if;
  insert into public.portal_support_threads(learner_id,course_id,subject,message)
    values(portal_private.actor_id(),target_course,p_question->>'subject',p_question->>'message');
end $$;
create function portal_private.reply_support(p_id uuid,p_reply text,p_expected_revision uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not portal_private.is_admin() then raise exception 'Administrator permission required.' using errcode='42501'; end if;
  if p_reply is null or not portal_private.text_ok(to_jsonb(p_reply),5000,true) or p_expected_revision is null then
    raise exception 'Invalid support reply.' using errcode='22023'; end if;
  update public.portal_support_threads set reply=p_reply,status='answered',revision=gen_random_uuid()
    where id=p_id and revision=p_expected_revision;
  if not found then raise exception 'Support request changed.' using errcode='40001'; end if;
end $$;
-- Public wrappers run with the caller's privileges. Privileged bodies remain in
-- the unexposed schema and independently verify the current caller on every call.
create function public.portal_save_course(p_course jsonb,p_expected_revision uuid) returns jsonb
language sql security invoker set search_path='' as $$ select portal_private.save_course(p_course,p_expected_revision) $$;
create function public.portal_ask_support(p_question jsonb) returns void
language sql security invoker set search_path='' as $$ select portal_private.ask_support(p_question) $$;
create function public.portal_reply_support(p_id uuid,p_reply text,p_expected_revision uuid) returns void
language sql security invoker set search_path='' as $$ select portal_private.reply_support(p_id,p_reply,p_expected_revision) $$;

revoke all on all functions in schema portal_private from public, anon, authenticated;
grant execute on function portal_private.actor_id(),portal_private.signed_in(),portal_private.is_admin() to anon,authenticated;
grant execute on function portal_private.save_course(jsonb,uuid),portal_private.ask_support(jsonb),portal_private.reply_support(uuid,text,uuid) to authenticated;
revoke all on function public.portal_role(),public.portal_list_courses(),public.portal_support(),public.portal_save_course(jsonb,uuid),public.portal_ask_support(jsonb),public.portal_reply_support(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.portal_list_courses() to anon,authenticated;
grant execute on function public.portal_role(),public.portal_support(),public.portal_save_course(jsonb,uuid),public.portal_ask_support(jsonb),public.portal_reply_support(uuid,text,uuid) to authenticated;
alter default privileges in schema portal_private revoke execute on functions from public;
commit;
