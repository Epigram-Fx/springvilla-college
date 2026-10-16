create or replace function public.admin_student_email_lookup(p_user_ids uuid[])
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(
    public.current_role_name() in ('registrar', 'super_admin'),
    false
  ) then
    raise exception 'Not allowed to view student email addresses';
  end if;

  return query
  select u.id, u.email::text
  from auth.users u
  where u.id = any(p_user_ids)
    and exists (
      select 1 from public.students s where s.user_id = u.id
    );
end
$$;

revoke all on function public.admin_student_email_lookup(uuid[]) from public, anon;
grant execute on function public.admin_student_email_lookup(uuid[]) to authenticated;

create or replace function public.protect_student_identity_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_super_admin()
     and (
       new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.application_id is distinct from old.application_id
       or new.admission_number is distinct from old.admission_number
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'Only a super admin can change protected student fields';
  end if;

  if new.status is distinct from old.status
     and coalesce(current_setting('app.allow_student_status_change', true), '') <> 'on' then
    raise exception 'Student status changes must use the admin student status function';
  end if;

  return new;
end
$$;

create or replace function public.admin_update_student(
  p_student_id uuid,
  p_department_id uuid,
  p_update_department boolean,
  p_status public.student_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_id uuid;
begin
  if coalesce(
    public.current_role_name() not in ('registrar', 'super_admin'),
    true
  ) then
    raise exception 'Only a registrar or super admin can update student records';
  end if;

  if p_update_department is null then
    raise exception 'The department update flag is required';
  end if;

  if not p_update_department and p_status is null then
    raise exception 'Provide a department or status update';
  end if;

  perform set_config('app.allow_student_status_change', 'on', true);
  update public.students
  set department_id = case
        when p_update_department then p_department_id
        else department_id
      end,
      status = coalesce(p_status, status)
  where id = p_student_id
  returning id into v_updated_id;
  perform set_config('app.allow_student_status_change', 'off', true);

  if v_updated_id is null then
    raise exception 'Student record was not found';
  end if;
end
$$;

revoke all on function public.admin_update_student(uuid, uuid, boolean, public.student_status)
  from public, anon;
grant execute on function public.admin_update_student(uuid, uuid, boolean, public.student_status)
  to authenticated;

create or replace function public.audit_sensitive_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id uuid;
  v_action text;
begin
  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
  end if;

  v_id := coalesce(
    nullif(v_new ->> 'id', '')::uuid,
    nullif(v_old ->> 'id', '')::uuid
  );
  v_action := lower(tg_table_name) || '_' || lower(tg_op);

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    v_action,
    tg_table_name,
    v_id,
    jsonb_build_object('old', v_old, 'new', v_new)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger audit_student_changes
  after insert or update or delete on public.students
  for each row execute function public.audit_sensitive_record_change();

create trigger audit_result_changes
  after insert or update or delete on public.results
  for each row execute function public.audit_sensitive_record_change();

create trigger audit_fee_record_changes
  after insert or update or delete on public.fee_records
  for each row execute function public.audit_sensitive_record_change();

create trigger audit_announcement_changes
  after insert or update or delete on public.announcements
  for each row execute function public.audit_sensitive_record_change();

create trigger audit_session_changes
  after insert or update or delete on public.sessions
  for each row execute function public.audit_sensitive_record_change();

create trigger audit_department_changes
  after insert or update or delete on public.departments
  for each row execute function public.audit_sensitive_record_change();
