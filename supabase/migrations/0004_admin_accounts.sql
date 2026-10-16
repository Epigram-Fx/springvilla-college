-- Only Auth invitations (identified by Supabase's server-managed invited_at)
-- may set an administrator role from invitation metadata. Public signup is
-- always a student, regardless of user-supplied metadata.
create or replace function public.current_role_name()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role := 'student';
begin
  if new.invited_at is not null
     and new.raw_user_meta_data ->> 'springvilla_admin_role' in (
       'admissions_officer',
       'registrar',
       'super_admin'
     ) then
    v_role := (new.raw_user_meta_data ->> 'springvilla_admin_role')::public.app_role;
  end if;

  insert into public.profiles (id, role, full_name, phone, date_of_birth)
  values (
    new.id,
    v_role,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    case when v_role = 'student' then new.raw_user_meta_data ->> 'phone' end,
    case
      when v_role = 'student'
        then nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date
    end
  );
  return new;
end
$$;

create or replace function public.validate_profile_application_details()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role = 'student' then
    if new.phone is null or new.phone !~ '^\+234[789][01][0-9]{8}$' then
      raise exception 'Enter a valid Nigerian mobile number in international format';
    end if;

    if new.date_of_birth is null
       or new.date_of_birth > (current_date - interval '15 years')::date then
      raise exception 'Applicants must be at least 15 years old';
    end if;
  end if;

  return new;
end
$$;

create or replace function public.admin_list_accounts()
returns table (
  id uuid,
  email text,
  full_name text,
  role public.app_role,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can list administrator accounts';
  end if;

  return query
  select p.id, u.email::text, p.full_name, p.role, p.is_active, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role in ('admissions_officer', 'registrar', 'super_admin')
  order by p.created_at desc;
end
$$;

revoke all on function public.admin_list_accounts() from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;

create or replace function public.admin_update_account(
  p_user_id uuid,
  p_role public.app_role,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can update administrator accounts';
  end if;

  if p_role is null and p_is_active is null then
    raise exception 'Provide a role or active status to update';
  end if;

  if p_role is not null
     and p_role not in ('admissions_officer', 'registrar', 'super_admin') then
    raise exception 'Invalid administrator role';
  end if;

  if p_user_id = auth.uid()
     and (
       p_role is distinct from 'super_admin'::public.app_role
       or p_is_active is false
     ) then
    raise exception 'You cannot demote or deactivate your own account';
  end if;

  update public.profiles
  set role = coalesce(p_role, role),
      is_active = coalesce(p_is_active, is_active)
  where id = p_user_id
    and role in ('admissions_officer', 'registrar', 'super_admin')
  returning id into v_updated_id;

  if v_updated_id is null then
    raise exception 'Administrator account was not found';
  end if;

  insert into public.audit_log (
    actor_id,
    action,
    entity,
    entity_id,
    details
  )
  values (
    auth.uid(),
    'admin_account_updated',
    'profile',
    p_user_id,
    jsonb_build_object('role', p_role, 'is_active', p_is_active)
  );
end
$$;

revoke all on function public.admin_update_account(uuid, public.app_role, boolean)
  from public, anon;
grant execute on function public.admin_update_account(uuid, public.app_role, boolean)
  to authenticated;
