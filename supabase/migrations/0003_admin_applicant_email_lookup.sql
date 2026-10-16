create or replace function public.admin_applicant_email_lookup(p_user_ids uuid[])
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(
    public.current_role_name() in ('admissions_officer', 'super_admin'),
    false
  ) then
    raise exception 'Not allowed to view applicant email addresses';
  end if;

  return query
  select u.id, u.email::text
  from auth.users u
  where u.id = any(p_user_ids)
    and exists (
      select 1
      from public.applications a
      where a.user_id = u.id
    );
end
$$;

revoke all on function public.admin_applicant_email_lookup(uuid[])
  from public, anon;
grant execute on function public.admin_applicant_email_lookup(uuid[])
  to authenticated;
