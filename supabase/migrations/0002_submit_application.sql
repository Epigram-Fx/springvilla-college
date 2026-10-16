create or replace function public.validate_profile_application_details()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.phone is null or new.phone !~ '^\+234[789][01][0-9]{8}$' then
    raise exception 'Enter a valid Nigerian mobile number in international format';
  end if;

  if new.date_of_birth is null
     or new.date_of_birth > (current_date - interval '15 years')::date then
    raise exception 'Applicants must be at least 15 years old';
  end if;

  return new;
end
$$;

create trigger validate_profile_application_details_on_signup
  before insert on public.profiles
  for each row execute function public.validate_profile_application_details();

create trigger validate_profile_application_details_on_update
  before update of phone, date_of_birth on public.profiles
  for each row execute function public.validate_profile_application_details();

create policy "passport_photos_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'passport-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "application_documents_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "applications_insert_own_open_session"
  on public.applications;

drop policy if exists "documents_insert_own_pending_application"
  on public.application_documents;

create or replace function public.submit_application(
  p_session_id uuid,
  p_previous_school text,
  p_passport_photo_path text,
  p_document_paths text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_application_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to submit an application';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = v_user_id and email_confirmed_at is not null
  ) then
    raise exception 'Verify your email address before submitting an application';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id and role = 'student' and is_active
  ) then
    raise exception 'An active applicant account is required';
  end if;

  if exists (
    select 1
    from public.students
    where user_id = v_user_id
  ) then
    raise exception 'Enrolled students cannot submit a new application';
  end if;

  if exists (
    select 1
    from public.applications
    where user_id = v_user_id and status = 'pending'
  ) then
    raise exception 'A pending application must be decided before reapplying';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
      and phone ~ '^\+234[789][01][0-9]{8}$'
      and date_of_birth is not null
      and date_of_birth <= (current_date - interval '15 years')::date
  ) then
    raise exception 'Complete your valid Nigerian phone number and date of birth before applying';
  end if;

  if p_previous_school is null or length(btrim(p_previous_school)) < 2 then
    raise exception 'Enter the name of your previous school';
  end if;

  if p_passport_photo_path is null
     or p_passport_photo_path not like v_user_id::text || '/%'
     or position('/../' in p_passport_photo_path) > 0 then
    raise exception 'Invalid passport photo path';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'passport-photos'
      and name = p_passport_photo_path
  ) then
    raise exception 'Upload the passport photo before submitting';
  end if;

  if p_document_paths is null
     or cardinality(p_document_paths) < 1
     or cardinality(p_document_paths) > 10 then
    raise exception 'Upload between one and ten supporting documents';
  end if;

  if exists (
    select 1
    from unnest(p_document_paths) as documents(path)
    where documents.path is null
       or documents.path not like v_user_id::text || '/%'
       or position('/../' in documents.path) > 0
  ) then
    raise exception 'Invalid supporting document path';
  end if;

  if exists (
    select 1
    from unnest(p_document_paths) as documents(path)
    where not exists (
      select 1
      from storage.objects
      where bucket_id = 'application-documents'
        and name = documents.path
    )
  ) then
    raise exception 'Upload all supporting documents before submitting';
  end if;

  if not exists (
    select 1
    from public.sessions
    where id = p_session_id and now() between opens_at and closes_at
  ) then
    raise exception 'This admission session is not open';
  end if;

  insert into public.applications (user_id, session_id, previous_school)
  values (v_user_id, p_session_id, btrim(p_previous_school))
  returning id into v_application_id;

  update public.profiles
  set photo_path = p_passport_photo_path
  where id = v_user_id;

  insert into public.application_documents (application_id, file_path, doc_type)
  select v_application_id, documents.path, 'result'
  from unnest(p_document_paths) as documents(path);

  return v_application_id;
end
$$;

revoke all on function public.submit_application(uuid, text, text, text[])
  from public, anon;
grant execute on function public.submit_application(uuid, text, text, text[])
  to authenticated;
