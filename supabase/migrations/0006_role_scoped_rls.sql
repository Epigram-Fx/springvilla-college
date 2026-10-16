create or replace function public.can_review_applications()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_role_name() in ('admissions_officer', 'super_admin'),
    false
  )
$$;

create or replace function public.can_manage_students()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_role_name() in ('registrar', 'super_admin'),
    false
  )
$$;

create or replace function public.admin_applicant_department_lookup(
  p_application_ids uuid[]
)
returns table (application_id uuid, department_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_review_applications() then
    raise exception 'Not allowed to view applicant departments';
  end if;

  return query
  select s.application_id, d.name
  from public.students s
  join public.departments d on d.id = s.department_id
  where s.application_id = any(p_application_ids);
end
$$;

revoke all on function public.admin_applicant_department_lookup(uuid[])
  from public, anon;
grant execute on function public.admin_applicant_department_lookup(uuid[])
  to authenticated;

drop policy if exists "profiles_read_own_or_staff" on public.profiles;
create policy "profiles_read_own_or_authorized_staff"
  on public.profiles for select
  using (
    id = auth.uid()
    or (
      public.can_review_applications()
      and exists (
        select 1 from public.applications a where a.user_id = profiles.id
      )
    )
    or (
      public.can_manage_students()
      and exists (
        select 1 from public.students s where s.user_id = profiles.id
      )
    )
  );

drop policy if exists "applications_read_own_or_staff" on public.applications;
create policy "applications_read_own_or_authorized_staff"
  on public.applications for select
  using (
    user_id = auth.uid()
    or public.can_review_applications()
    or (
      public.can_manage_students()
      and exists (
        select 1 from public.students s
        where s.application_id = applications.id
      )
    )
  );

drop policy if exists "documents_read_own_or_staff"
  on public.application_documents;
create policy "documents_read_own_or_application_reviewers"
  on public.application_documents for select
  using (
    public.can_review_applications()
    or exists (
      select 1
      from public.applications a
      where a.id = application_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "students_read_own_or_staff" on public.students;
create policy "students_read_own_or_student_managers"
  on public.students for select
  using (user_id = auth.uid() or public.can_manage_students());

drop policy if exists "announcements_read_active_students_or_staff"
  on public.announcements;
create policy "announcements_read_active_students_or_managers"
  on public.announcements for select
  using (public.is_active_student() or public.can_manage_students());

drop policy if exists "results_read_own_active_or_staff" on public.results;
create policy "results_read_own_active_or_student_managers"
  on public.results for select
  using (
    public.can_manage_students()
    or exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.user_id = auth.uid()
        and s.status = 'active'
    )
  );

drop policy if exists "results_write_registrar_or_super_admin" on public.results;
create policy "results_write_student_managers"
  on public.results for all
  using (public.can_manage_students())
  with check (public.can_manage_students());

drop policy if exists "fees_read_own_active_or_staff" on public.fee_records;
create policy "fees_read_own_active_or_student_managers"
  on public.fee_records for select
  using (
    public.can_manage_students()
    or exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.user_id = auth.uid()
        and s.status = 'active'
    )
  );

drop policy if exists "fees_write_registrar_or_super_admin" on public.fee_records;
create policy "fees_write_student_managers"
  on public.fee_records for all
  using (public.can_manage_students())
  with check (public.can_manage_students());
