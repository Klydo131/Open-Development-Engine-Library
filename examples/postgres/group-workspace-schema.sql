-- Install after course-portal-schema.sql. Uses PostgreSQL 15+ without extensions.
begin;
create table public.portal_groups (
  id uuid primary key,
  revision uuid not null default gen_random_uuid(),
  title text not null check (portal_private.text_ok(to_jsonb(title),160,true)),
  description text not null check (portal_private.text_ok(to_jsonb(description),2000)),
  kind text not null check (kind in ('group','private')),
  facilitator_id uuid not null references portal_private.accounts(id)
);
create table public.portal_group_members (
  group_id uuid not null references public.portal_groups(id) on delete cascade,
  user_id uuid not null references portal_private.accounts(id) on delete cascade,
  primary key(group_id,user_id)
);
create index portal_group_members_user on public.portal_group_members(user_id,group_id);
create table public.portal_group_sessions (
  id uuid primary key,
  revision uuid not null default gen_random_uuid(),
  group_id uuid not null references public.portal_groups(id) on delete cascade,
  title text not null check (portal_private.text_ok(to_jsonb(title),160,true)),
  description text not null check (portal_private.text_ok(to_jsonb(description),2000)),
  starts_at timestamptz not null check (isfinite(starts_at)),
  duration_minutes integer not null check (duration_minutes between 1 and 1440)
);
create index portal_group_sessions_group on public.portal_group_sessions(group_id,starts_at,id);
create table public.portal_group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.portal_groups(id) on delete cascade,
  author_id uuid not null references portal_private.accounts(id) on delete cascade,
  author_role text not null check(author_role in ('admin','learner')),
  body text not null check (portal_private.text_ok(to_jsonb(body),2000,true)),
  created_at timestamptz not null default now()
);
create index portal_group_posts_group on public.portal_group_posts(group_id,created_at,id);
create table portal_private.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.portal_groups(id) on delete cascade,
  email text not null check (length(email)<=254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index portal_group_invitations_group on portal_private.group_invitations(group_id,id);
create table public.portal_teacher_requests (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references portal_private.accounts(id) on delete cascade,
  subject text not null check (portal_private.text_ok(to_jsonb(subject),160,true)),
  message text not null check (portal_private.text_ok(to_jsonb(message),2000,true)),
  room_id uuid unique references public.portal_groups(id),
  status text not null default 'open' check(status in ('open','assigned')),
  check ((status='assigned')=(room_id is not null))
);
create index portal_teacher_requests_learner on public.portal_teacher_requests(learner_id,id);
create index portal_teacher_requests_open on public.portal_teacher_requests(id) where status='open';

create function portal_private.can_read_group(p_group_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select portal_private.signed_in() and exists(select 1 from public.portal_groups g where g.id=p_group_id and
    ((portal_private.is_admin() and (g.kind='group' or g.facilitator_id=portal_private.actor_id())) or
      exists(select 1 from public.portal_group_members m where m.group_id=g.id and m.user_id=portal_private.actor_id())))
$$;
create function portal_private.can_manage_group(p_group_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select portal_private.is_admin() and portal_private.can_read_group(p_group_id)
$$;
create function portal_private.library_member() returns boolean
language sql stable security definer set search_path='' as $$
  select portal_private.signed_in() and (portal_private.is_admin() or exists
    (select 1 from public.portal_group_members where user_id=portal_private.actor_id()))
$$;
create function portal_private.group_record(p_group_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',id,'revision',revision,'title',title,'description',description,
    'kind',kind,'facilitatorId',facilitator_id) from public.portal_groups
    where id=p_group_id and portal_private.can_read_group(id)
$$;
create function portal_private.invitation_record(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',id,'groupId',group_id,'email',email,
    'expiresAt',to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'status',case when revoked_at is not null then 'revoked' when accepted_at is not null then 'accepted' else 'pending' end)
  from portal_private.group_invitations where id=p_id and portal_private.can_manage_group(group_id)
$$;
create function portal_private.bounded_records(p_rows jsonb,p_max integer) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_array_length(p_rows)>p_max or octet_length(p_rows::text)>4194304 then
    raise exception 'Workspace limit reached; operator pagination is required.' using errcode='22023';
  end if;
  return p_rows;
end $$;
create function portal_private.uuid_ok(p_value jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_typeof(p_value)='string' and (p_value#>>'{}') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',false)
$$;
alter table public.portal_groups enable row level security;
alter table public.portal_group_members enable row level security;
alter table public.portal_group_sessions enable row level security;
alter table public.portal_group_posts enable row level security;
alter table public.portal_teacher_requests enable row level security;
alter table portal_private.group_invitations enable row level security;
create policy group_read on public.portal_groups for select to authenticated using(portal_private.can_read_group(id));
create policy member_read on public.portal_group_members for select to authenticated using(portal_private.can_manage_group(group_id));
create policy session_read on public.portal_group_sessions for select to authenticated using(portal_private.can_read_group(group_id));
create policy post_read on public.portal_group_posts for select to authenticated using(portal_private.can_read_group(group_id));
create policy teacher_request_read on public.portal_teacher_requests for select to authenticated using(
  (select portal_private.signed_in()) and (learner_id=(select portal_private.actor_id()) or
    ((select portal_private.is_admin()) and (status='open' or portal_private.can_manage_group(room_id)))));
drop policy course_material_read on public.portal_course_materials;
create policy course_material_read on public.portal_course_materials for select to authenticated using(
  (select portal_private.library_member()) and exists(select 1 from public.portal_courses c where c.id=course_id and
    (c.status='published' or (select portal_private.is_admin()))));
revoke all on public.portal_groups,public.portal_group_members,public.portal_group_sessions,public.portal_group_posts,
  public.portal_teacher_requests,portal_private.group_invitations from public,anon,authenticated;
grant select on public.portal_groups,public.portal_group_members,public.portal_group_sessions,public.portal_group_posts,
  public.portal_teacher_requests to authenticated;

create function public.portal_groups() returns jsonb
language sql stable security invoker set search_path='' as $$
  select portal_private.bounded_records(coalesce(jsonb_agg(record order by title,id),'[]'::jsonb),50) from
    (select title,id,portal_private.group_record(id) record from public.portal_groups order by title,id limit 51) rows
$$;
create function portal_private.save_group(p_group jsonb,p_expected_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; previous public.portal_groups%rowtype;
begin
  if not portal_private.is_admin() then raise exception 'Administrator permission required.' using errcode='42501'; end if;
  if jsonb_typeof(p_group) is distinct from 'object' or not p_group ?& array['id','revision','title','description','kind','facilitatorId']
    or (p_group-array['id','revision','title','description','kind','facilitatorId'])<>'{}'::jsonb
    or not portal_private.text_ok(p_group->'title',160,true) or not portal_private.text_ok(p_group->'description',2000)
    or jsonb_typeof(p_group->'kind') is distinct from 'string' or p_group->>'kind' not in ('group','private')
    or not portal_private.uuid_ok(p_group->'id') or not portal_private.uuid_ok(p_group->'revision')
    or not portal_private.uuid_ok(p_group->'facilitatorId') then raise exception 'Invalid group.' using errcode='22023'; end if;
  target:=(p_group->>'id')::uuid;
  perform (p_group->>'revision')::uuid;
  select * into previous from public.portal_groups where id=target for update;
  if found then
    if not portal_private.can_manage_group(target) then raise exception 'Group unavailable.' using errcode='42501'; end if;
    if p_expected_revision is null or previous.revision<>p_expected_revision then raise exception 'Group changed.' using errcode='40001'; end if;
    if previous.kind<>p_group->>'kind' or previous.facilitator_id<>(p_group->>'facilitatorId')::uuid then raise exception 'Group identity is immutable.' using errcode='22023'; end if;
    update public.portal_groups set revision=gen_random_uuid(),title=p_group->>'title',description=p_group->>'description' where id=target;
  else
    if p_expected_revision is not null then raise exception 'Group changed.' using errcode='40001'; end if;
    if p_group->>'kind'<>'group' or (p_group->>'facilitatorId')::uuid<>portal_private.actor_id() then
      raise exception 'Private rooms require a teacher request.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(713994001);
    if (select count(*) from public.portal_groups)>=50 then raise exception 'Group limit reached.' using errcode='22023'; end if;
    insert into public.portal_groups(id,title,description,kind,facilitator_id)
      values(target,p_group->>'title',p_group->>'description','group',portal_private.actor_id());
  end if;
  return portal_private.group_record(target);
exception when unique_violation then raise exception 'Group changed.' using errcode='40001';
end $$;
create function public.portal_group_sessions(p_group_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select portal_private.bounded_records(coalesce(jsonb_agg(record order by starts_at,id),'[]'::jsonb),100) from (
    select starts_at,id,jsonb_build_object('id',id,'revision',revision,'groupId',group_id,'title',title,'description',description,
      'startsAt',to_char(starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'durationMinutes',duration_minutes) record
    from public.portal_group_sessions where group_id=p_group_id order by starts_at,id limit 101) rows
$$;
create function portal_private.save_group_session(p_session jsonb,p_expected_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; target_group uuid; previous public.portal_group_sessions%rowtype; starts timestamptz;
begin
  target_group:=(p_session->>'groupId')::uuid;
  if not portal_private.can_manage_group(target_group) then raise exception 'Administrator permission required.' using errcode='42501'; end if;
  if jsonb_typeof(p_session) is distinct from 'object' or not p_session ?& array['id','revision','groupId','title','description','startsAt','durationMinutes']
    or (p_session-array['id','revision','groupId','title','description','startsAt','durationMinutes'])<>'{}'::jsonb
    or not portal_private.text_ok(p_session->'title',160,true) or not portal_private.text_ok(p_session->'description',2000)
    or not portal_private.uuid_ok(p_session->'id') or not portal_private.uuid_ok(p_session->'revision')
    or not portal_private.uuid_ok(p_session->'groupId') or jsonb_typeof(p_session->'startsAt') is distinct from 'string'
    or p_session->>'startsAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$'
    or jsonb_typeof(p_session->'durationMinutes') is distinct from 'number'
    or p_session->>'durationMinutes' !~ '^[0-9]+$' or (p_session->>'durationMinutes')::integer not between 1 and 1440
    then raise exception 'Invalid study session.' using errcode='22023'; end if;
  target:=(p_session->>'id')::uuid; perform (p_session->>'revision')::uuid; starts:=(p_session->>'startsAt')::timestamptz;
  perform 1 from public.portal_groups where id=target_group for update;
  select * into previous from public.portal_group_sessions where id=target for update;
  if found then
    if previous.group_id<>target_group then raise exception 'Session group is immutable.' using errcode='22023'; end if;
    if p_expected_revision is null or previous.revision<>p_expected_revision then raise exception 'Session changed.' using errcode='40001'; end if;
    update public.portal_group_sessions set revision=gen_random_uuid(),title=p_session->>'title',description=p_session->>'description',
      starts_at=starts,duration_minutes=(p_session->>'durationMinutes')::integer where id=target;
  else
    if p_expected_revision is not null then raise exception 'Session changed.' using errcode='40001'; end if;
    if (select count(*) from public.portal_group_sessions where group_id=target_group)>=100 then raise exception 'Session limit reached.' using errcode='22023'; end if;
    insert into public.portal_group_sessions(id,group_id,title,description,starts_at,duration_minutes)
      values(target,target_group,p_session->>'title',p_session->>'description',starts,(p_session->>'durationMinutes')::integer);
  end if;
  return (select value from jsonb_array_elements(public.portal_group_sessions(target_group)) where value->>'id'=target::text);
exception when unique_violation then raise exception 'Session changed.' using errcode='40001';
end $$;
create function public.portal_group_posts(p_group_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select portal_private.bounded_records(coalesce(jsonb_agg(record order by created_at,id),'[]'::jsonb),100) from (
    select created_at,id,jsonb_build_object('id',id,'groupId',group_id,'authorId',author_id,'authorRole',author_role,'body',body,
      'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) record
    from public.portal_group_posts where group_id=p_group_id order by created_at,id limit 101) rows
$$;
create function portal_private.add_group_post(p_group_id uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not portal_private.can_read_group(p_group_id) then raise exception 'Group unavailable.' using errcode='42501'; end if;
  if not portal_private.text_ok(to_jsonb(p_body),2000,true) then raise exception 'Invalid discussion post.' using errcode='22023'; end if;
  perform 1 from public.portal_groups where id=p_group_id for update;
  if (select count(*) from public.portal_group_posts where group_id=p_group_id)>=100 then raise exception 'Discussion limit reached.' using errcode='22023'; end if;
  insert into public.portal_group_posts(group_id,author_id,author_role,body) values
    (p_group_id,portal_private.actor_id(),case when portal_private.is_admin() then 'admin' else 'learner' end,p_body);
end $$;
create function portal_private.remove_group_post(p_group_id uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not portal_private.can_read_group(p_group_id) then raise exception 'Group unavailable.' using errcode='42501'; end if;
  delete from public.portal_group_posts where id=p_id and group_id=p_group_id and
    (author_id=portal_private.actor_id() or portal_private.can_manage_group(p_group_id));
  if not found then raise exception 'Discussion post unavailable.' using errcode='42501'; end if;
end $$;
create function portal_private.group_invitations(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not portal_private.can_manage_group(p_group_id) then raise exception 'Administrator permission required.' using errcode='42501'; end if;
  return (select portal_private.bounded_records(coalesce(jsonb_agg(record order by id),'[]'::jsonb),100) from
    (select id,portal_private.invitation_record(id) record from portal_private.group_invitations where group_id=p_group_id order by id limit 101) rows);
end $$;
create function portal_private.create_group_invitation(p_group_id uuid,p_email text,p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if not portal_private.can_manage_group(p_group_id) then raise exception 'Administrator permission required.' using errcode='42501'; end if;
  perform 1 from public.portal_groups where id=p_group_id and kind='group' for update;
  if not found then raise exception 'Private rooms cannot be invited into.' using errcode='42501'; end if;
  if p_email is null or length(p_email)>254 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or p_email ~ '[\x01-\x1f\x7f]' or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    then raise exception 'Invalid invitation.' using errcode='22023'; end if;
  if (select count(*) from portal_private.group_invitations where group_id=p_group_id)>=100 then raise exception 'Invitation limit reached.' using errcode='22023'; end if;
  if exists(select 1 from portal_private.group_invitations where group_id=p_group_id and email=lower(p_email)
    and accepted_at is null and revoked_at is null and expires_at>now()) then
    raise exception 'A pending invitation already exists.' using errcode='22023'; end if;
  insert into portal_private.group_invitations(group_id,email,token_hash) values(p_group_id,lower(p_email),p_token_hash) returning id into target;
  return portal_private.invitation_record(target);
end $$;
create function portal_private.revoke_group_invitation(p_group_id uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not portal_private.can_manage_group(p_group_id) then raise exception 'Administrator permission required.' using errcode='42501'; end if;
  update portal_private.group_invitations set revoked_at=now() where id=p_id and group_id=p_group_id and accepted_at is null;
  if not found then raise exception 'Invitation unavailable.' using errcode='22023'; end if;
end $$;
create function portal_private.accept_group_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation portal_private.group_invitations%rowtype; account_email text;
begin
  if not portal_private.signed_in() or portal_private.is_admin() then raise exception 'Confirmed learner account required.' using errcode='42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Invitation unavailable.' using errcode='22023'; end if;
  select * into invitation from portal_private.group_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if invitation.id is null then raise exception 'Invitation unavailable.' using errcode='42501'; end if;
  -- Use the group-before-invitation lock order shared by creation and removal.
  perform 1 from public.portal_groups where id=invitation.group_id and kind='group' for update;
  if not found then raise exception 'Invitation unavailable.' using errcode='42501'; end if;
  select * into invitation from portal_private.group_invitations where id=invitation.id for update;
  select lower(email) into account_email from portal_private.accounts where id=portal_private.actor_id() and verified;
  if not found or invitation.id is null or invitation.email is distinct from account_email or invitation.accepted_at is not null
    or invitation.revoked_at is not null or invitation.expires_at<=now() then raise exception 'Invitation unavailable.' using errcode='42501'; end if;
  if (select count(*) from public.portal_group_members where group_id=invitation.group_id)>=100 then raise exception 'Member limit reached.' using errcode='22023'; end if;
  insert into public.portal_group_members(group_id,user_id) values(invitation.group_id,portal_private.actor_id()) on conflict do nothing;
  update portal_private.group_invitations set accepted_at=now() where id=invitation.id;
  return portal_private.group_record(invitation.group_id);
end $$;
create function portal_private.group_members(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not portal_private.can_manage_group(p_group_id) then raise exception 'Administrator permission required.' using errcode='42501'; end if;
  return (select portal_private.bounded_records(coalesce(jsonb_agg(record order by user_id),'[]'::jsonb),100) from
    (select m.user_id,jsonb_build_object('userId',m.user_id,'email',a.email) record from public.portal_group_members m
      join portal_private.accounts a on a.id=m.user_id where m.group_id=p_group_id order by m.user_id limit 101) rows);
end $$;
create function portal_private.remove_group_member(p_group_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not portal_private.can_manage_group(p_group_id) then raise exception 'Administrator permission required.' using errcode='42501'; end if;
  perform 1 from public.portal_groups where id=p_group_id for update;
  update portal_private.group_invitations set revoked_at=now() where group_id=p_group_id
    and email=(select lower(email) from portal_private.accounts where id=p_user_id)
    and accepted_at is null and revoked_at is null;
  delete from public.portal_group_members where group_id=p_group_id and user_id=p_user_id;
end $$;
create function public.portal_teacher_requests() returns jsonb
language sql stable security invoker set search_path='' as $$
  select portal_private.bounded_records(coalesce(jsonb_agg(record order by id),'[]'::jsonb),100) from (
    select id,jsonb_strip_nulls(jsonb_build_object('id',id,'learnerId',learner_id,'subject',subject,'message',message,
      'status',status,'roomId',room_id)) record from public.portal_teacher_requests order by id limit 101) rows
$$;
create function portal_private.request_teacher(p_request jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not portal_private.signed_in() or portal_private.is_admin() then raise exception 'Confirmed learner account required.' using errcode='42501'; end if;
  if jsonb_typeof(p_request) is distinct from 'object' or not p_request ?& array['subject','message']
    or (p_request-array['subject','message'])<>'{}'::jsonb or not portal_private.text_ok(p_request->'subject',160,true)
    or not portal_private.text_ok(p_request->'message',2000,true) then raise exception 'Invalid teacher request.' using errcode='22023'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Request creation requires READ COMMITTED isolation.' using errcode='25000'; end if;
  -- Match the staff reader's total bound, including requests already assigned.
  lock table public.portal_teacher_requests in share row exclusive mode;
  if (select count(*) from public.portal_teacher_requests) >= 100 then
    raise exception 'Request capacity reached; operator pagination is required.' using errcode='22023'; end if;
  if (select count(*) from public.portal_teacher_requests where learner_id=portal_private.actor_id())>=100 then raise exception 'Teacher request limit reached.' using errcode='22023'; end if;
  insert into public.portal_teacher_requests(learner_id,subject,message) values(portal_private.actor_id(),p_request->>'subject',p_request->>'message');
end $$;
create function portal_private.create_private_room(p_request_id uuid,p_title text,p_description text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.portal_teacher_requests%rowtype; target uuid:=gen_random_uuid();
begin
  if not portal_private.is_admin() then raise exception 'Administrator permission required.' using errcode='42501'; end if;
  if not portal_private.text_ok(to_jsonb(p_title),160,true) or not portal_private.text_ok(to_jsonb(p_description),2000)
    then raise exception 'Invalid private room.' using errcode='22023'; end if;
  select * into request from public.portal_teacher_requests where id=p_request_id for update;
  if not found or request.status<>'open' then raise exception 'Teacher request changed.' using errcode='40001'; end if;
  perform pg_advisory_xact_lock(713994001);
  if (select count(*) from public.portal_groups)>=50 then raise exception 'Group limit reached.' using errcode='22023'; end if;
  insert into public.portal_groups(id,title,description,kind,facilitator_id) values(target,p_title,p_description,'private',portal_private.actor_id());
  insert into public.portal_group_members(group_id,user_id) values(target,request.learner_id);
  update public.portal_teacher_requests set status='assigned',room_id=target where id=p_request_id;
  return portal_private.group_record(target);
end $$;

create function public.portal_save_group(p_group jsonb,p_expected_revision uuid) returns jsonb language sql security invoker set search_path='' as $$ select portal_private.save_group(p_group,p_expected_revision) $$;
create function public.portal_save_group_session(p_session jsonb,p_expected_revision uuid) returns jsonb language sql security invoker set search_path='' as $$ select portal_private.save_group_session(p_session,p_expected_revision) $$;
create function public.portal_add_group_post(p_group_id uuid,p_body text) returns void language sql security invoker set search_path='' as $$ select portal_private.add_group_post(p_group_id,p_body) $$;
create function public.portal_remove_group_post(p_group_id uuid,p_id uuid) returns void language sql security invoker set search_path='' as $$ select portal_private.remove_group_post(p_group_id,p_id) $$;
create function public.portal_group_invitations(p_group_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select portal_private.group_invitations(p_group_id) $$;
create function public.portal_create_group_invitation(p_group_id uuid,p_email text,p_token_hash text) returns jsonb language sql security invoker set search_path='' as $$ select portal_private.create_group_invitation(p_group_id,p_email,p_token_hash) $$;
create function public.portal_revoke_group_invitation(p_group_id uuid,p_id uuid) returns void language sql security invoker set search_path='' as $$ select portal_private.revoke_group_invitation(p_group_id,p_id) $$;
create function public.portal_accept_group_invitation(p_token text) returns jsonb language sql security invoker set search_path='' as $$ select portal_private.accept_group_invitation(p_token) $$;
create function public.portal_group_members(p_group_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select portal_private.group_members(p_group_id) $$;
create function public.portal_remove_group_member(p_group_id uuid,p_user_id uuid) returns void language sql security invoker set search_path='' as $$ select portal_private.remove_group_member(p_group_id,p_user_id) $$;
create function public.portal_request_teacher(p_request jsonb) returns void language sql security invoker set search_path='' as $$ select portal_private.request_teacher(p_request) $$;
create function public.portal_create_private_room(p_request_id uuid,p_title text,p_description text) returns jsonb language sql security invoker set search_path='' as $$ select portal_private.create_private_room(p_request_id,p_title,p_description) $$;

revoke all on all functions in schema portal_private from public,anon,authenticated;
grant execute on function portal_private.actor_id(),portal_private.signed_in(),portal_private.is_admin(),portal_private.library_member() to anon,authenticated;
grant execute on function portal_private.save_course(jsonb,uuid),portal_private.ask_support(jsonb),portal_private.reply_support(uuid,text,uuid),
  portal_private.can_read_group(uuid),portal_private.can_manage_group(uuid),portal_private.group_record(uuid),portal_private.bounded_records(jsonb,integer),
  portal_private.save_group(jsonb,uuid),portal_private.save_group_session(jsonb,uuid),portal_private.add_group_post(uuid,text),
  portal_private.remove_group_post(uuid,uuid),portal_private.group_invitations(uuid),portal_private.create_group_invitation(uuid,text,text),
  portal_private.revoke_group_invitation(uuid,uuid),portal_private.accept_group_invitation(text),portal_private.group_members(uuid),
  portal_private.remove_group_member(uuid,uuid),portal_private.request_teacher(jsonb),portal_private.create_private_room(uuid,text,text) to authenticated;
revoke all on function public.portal_groups(),public.portal_save_group(jsonb,uuid),public.portal_group_sessions(uuid),public.portal_save_group_session(jsonb,uuid),
  public.portal_group_posts(uuid),public.portal_add_group_post(uuid,text),public.portal_remove_group_post(uuid,uuid),public.portal_group_invitations(uuid),
  public.portal_create_group_invitation(uuid,text,text),public.portal_revoke_group_invitation(uuid,uuid),public.portal_accept_group_invitation(text),
  public.portal_group_members(uuid),public.portal_remove_group_member(uuid,uuid),public.portal_teacher_requests(),public.portal_request_teacher(jsonb),
  public.portal_create_private_room(uuid,text,text) from public,anon,authenticated;
grant execute on function public.portal_groups(),public.portal_save_group(jsonb,uuid),public.portal_group_sessions(uuid),public.portal_save_group_session(jsonb,uuid),
  public.portal_group_posts(uuid),public.portal_add_group_post(uuid,text),public.portal_remove_group_post(uuid,uuid),public.portal_group_invitations(uuid),
  public.portal_create_group_invitation(uuid,text,text),public.portal_revoke_group_invitation(uuid,uuid),public.portal_accept_group_invitation(text),
  public.portal_group_members(uuid),public.portal_remove_group_member(uuid,uuid),public.portal_teacher_requests(),public.portal_request_teacher(jsonb),
  public.portal_create_private_room(uuid,text,text) to authenticated;
commit;
