-- Core enums and tables for SpringVilla College of Technology.
create type public.app_role as enum (
  'student',
  'admissions_officer',
  'registrar',
  'super_admin'
);

create type public.application_status as enum (
  'pending',
  'admitted',
  'not_eligible'
);

create type public.student_status as enum ('active', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text,
  date_of_birth date,
  photo_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  cutoff_mark numeric not null check (cutoff_mark between 0 and 100),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.sessions(id),
  previous_school text not null check (length(btrim(previous_school)) > 0),
  status public.application_status not null default 'pending',
  score numeric check (score between 0 and 100),
  cutoff_at_decision numeric check (
    cutoff_at_decision is null or cutoff_at_decision between 0 and 100
  ),
  remarks text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create index applications_session_status_idx
  on public.applications (session_id, status);
create index applications_user_submitted_idx
  on public.applications (user_id, submitted_at desc);

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  file_path text not null,
  doc_type text not null default 'result',
  created_at timestamptz not null default now()
);

create index application_documents_application_idx
  on public.application_documents (application_id);

create sequence public.admission_number_seq;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  application_id uuid not null unique references public.applications(id),
  admission_number text not null unique,
  department_id uuid references public.departments(id),
  status public.student_status not null default 'active',
  created_at timestamptz not null default now()
);

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
  return new;
end
$$;

create trigger protect_student_identity_fields
  before update on public.students
  for each row execute function public.protect_student_identity_fields();

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  body text not null check (length(btrim(body)) > 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course text not null,
  score numeric not null check (score between 0 and 100),
  grade text,
  semester text,
  created_at timestamptz not null default now()
);

create index results_student_idx on public.results (student_id);

create table public.fee_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  description text not null,
  amount_due numeric not null check (amount_due >= 0),
  amount_paid numeric not null default 0 check (amount_paid >= 0),
  updated_at timestamptz not null default now()
);

create index fee_records_student_idx on public.fee_records (student_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Security-definer helpers read only the caller's authorization or public session state.
create or replace function public.current_role_name()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_role_name() in ('admissions_officer', 'registrar', 'super_admin'),
    false
  )
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_name() = 'super_admin', false)
$$;

create or replace function public.is_active_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students
    where user_id = auth.uid() and status = 'active'
  )
$$;

create or replace function public.session_is_open(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions
    where id = p_session and now() between opens_at and closes_at
  )
$$;

-- Public signup always creates a student profile; user metadata cannot set the role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, date_of_birth)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Authenticated users may edit their profile details, but cannot promote or disable themselves.
create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_super_admin()
     and (
       new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.id is distinct from old.id
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'Only a super admin can change protected profile fields';
  end if;
  return new;
end
$$;

create trigger protect_profile_security_fields
  before update on public.profiles
  for each row execute function public.protect_profile_security_fields();

-- Application decisions are atomic and cannot be made by direct client-side updates.
create or replace function public.decide_application(
  p_application_id uuid,
  p_score numeric,
  p_decision text,
  p_remarks text default null,
  p_department_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications%rowtype;
  v_cutoff numeric;
begin
  if coalesce(
    public.current_role_name() in ('admissions_officer', 'super_admin'),
    false
  ) is not true then
    raise exception 'Not allowed to decide applications';
  end if;

  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'Score must be between 0 and 100';
  end if;

  if p_decision is null or p_decision not in ('admit', 'reject') then
    raise exception 'Invalid decision';
  end if;

  select *
    into v_app
    from public.applications
    where id = p_application_id
    for update;

  if not found then
    raise exception 'Application not found';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'Application already decided';
  end if;

  select cutoff_mark
    into v_cutoff
    from public.sessions
    where id = v_app.session_id;

  if v_cutoff is null then
    raise exception 'Application session not found';
  end if;

  if p_decision = 'admit' then
    if p_score < v_cutoff then
      raise exception 'Score % is below the cut off mark of %', p_score, v_cutoff;
    end if;

    update public.applications
      set status = 'admitted',
          score = p_score,
          cutoff_at_decision = v_cutoff,
          remarks = p_remarks,
          reviewed_by = auth.uid(),
          reviewed_at = now()
      where id = p_application_id;

    insert into public.students (
      user_id,
      application_id,
      admission_number,
      department_id
    )
    values (
      v_app.user_id,
      p_application_id,
      'SVC/' || to_char(now(), 'YYYY') || '/' ||
        lpad(nextval('public.admission_number_seq')::text, 6, '0'),
      p_department_id
    );
  else
    update public.applications
      set status = 'not_eligible',
          score = p_score,
          cutoff_at_decision = v_cutoff,
          remarks = p_remarks,
          reviewed_by = auth.uid(),
          reviewed_at = now()
      where id = p_application_id;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'decide_application:' || p_decision,
    'application',
    p_application_id,
    jsonb_build_object('score', p_score, 'cutoff', v_cutoff)
  );
end
$$;

revoke all on function public.decide_application(uuid, numeric, text, text, uuid)
  from public, anon;
grant execute on function public.decide_application(uuid, numeric, text, text, uuid)
  to authenticated;

-- Enable RLS for every application-owned table.
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.departments enable row level security;
alter table public.applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.students enable row level security;
alter table public.announcements enable row level security;
alter table public.results enable row level security;
alter table public.fee_records enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles_read_own_or_staff"
  on public.profiles for select
  using (id = auth.uid() or public.is_staff());

create policy "profiles_update_own_or_super_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());

create policy "sessions_read_authenticated"
  on public.sessions for select
  using (auth.uid() is not null);

create policy "sessions_write_super_admin"
  on public.sessions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "departments_read_authenticated"
  on public.departments for select
  using (auth.uid() is not null);

create policy "departments_write_super_admin"
  on public.departments for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "applications_read_own_or_staff"
  on public.applications for select
  using (user_id = auth.uid() or public.is_staff());

create policy "applications_insert_own_open_session"
  on public.applications for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and score is null
    and cutoff_at_decision is null
    and reviewed_by is null
    and reviewed_at is null
    and public.session_is_open(session_id)
  );

create policy "documents_read_own_or_staff"
  on public.application_documents for select
  using (
    public.is_staff()
    or exists (
      select 1
      from public.applications a
      where a.id = application_id and a.user_id = auth.uid()
    )
  );

create policy "documents_insert_own_pending_application"
  on public.application_documents for insert
  with check (
    file_path like auth.uid()::text || '/%'
    and exists (
      select 1
      from public.applications a
      where a.id = application_id
        and a.user_id = auth.uid()
        and a.status = 'pending'
    )
  );

create policy "students_read_own_or_staff"
  on public.students for select
  using (user_id = auth.uid() or public.is_staff());

create policy "students_update_registrar_or_super_admin"
  on public.students for update
  using (public.current_role_name() in ('registrar', 'super_admin'))
  with check (public.current_role_name() in ('registrar', 'super_admin'));

create policy "students_delete_super_admin"
  on public.students for delete
  using (public.is_super_admin());

create policy "announcements_read_active_students_or_staff"
  on public.announcements for select
  using (public.is_active_student() or public.is_staff());

create policy "announcements_write_registrar_or_super_admin"
  on public.announcements for all
  using (public.current_role_name() in ('registrar', 'super_admin'))
  with check (public.current_role_name() in ('registrar', 'super_admin'));

create policy "results_read_own_active_or_staff"
  on public.results for select
  using (
    public.is_staff()
    or exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.user_id = auth.uid()
        and s.status = 'active'
    )
  );

create policy "results_write_registrar_or_super_admin"
  on public.results for all
  using (public.current_role_name() in ('registrar', 'super_admin'))
  with check (public.current_role_name() in ('registrar', 'super_admin'));

create policy "fees_read_own_active_or_staff"
  on public.fee_records for select
  using (
    public.is_staff()
    or exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.user_id = auth.uid()
        and s.status = 'active'
    )
  );

create policy "fees_write_registrar_or_super_admin"
  on public.fee_records for all
  using (public.current_role_name() in ('registrar', 'super_admin'))
  with check (public.current_role_name() in ('registrar', 'super_admin'));

create policy "audit_read_super_admin"
  on public.audit_log for select
  using (public.is_super_admin());

-- Private buckets and limits are set at the storage layer as well as in the client.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('passport-photos', 'passport-photos', false, 2097152, array['image/jpeg', 'image/png']),
  ('application-documents', 'application-documents', false, 5242880,
    array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "passport_photos_read_own_or_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'passport-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_staff()
    )
  );

create policy "passport_photos_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'passport-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "application_documents_read_own_or_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'application-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_staff()
    )
  );

create policy "application_documents_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
