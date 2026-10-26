-- Upgrade an existing course and group installation with a database-owner connection.
-- No records are removed. An oversized installation needs pagination or a separate,
-- operator-reviewed archival plan before this bounded schema can be upgraded.
begin;
do $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Request capacity upgrade requires READ COMMITTED isolation.' using errcode='25000'; end if;
  lock table public.portal_support_threads, public.portal_teacher_requests in share row exclusive mode;
  if (select count(*) from public.portal_support_threads) > 100
    or (select count(*) from public.portal_teacher_requests) > 100 then
    raise exception 'Request capacity exceeds supported limit; preserve records and add pagination before upgrading.' using errcode='22023'; end if;
end $$;
create or replace function portal_private.ask_support(p_question jsonb) returns void
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
create or replace function portal_private.request_teacher(p_request jsonb) returns void
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
commit;
