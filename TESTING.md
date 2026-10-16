# Manual acceptance and release test

Run this checklist against a Supabase project after applying all migrations
and deploying both Edge Functions. Use a private browser window per account
where practical. Do not use real applicant data.

## Test accounts and fixtures

Prepare six accounts:

1. **Applicant A** — verified student account with a pending application.
2. **Applicant B** — verified student account with a `not_eligible` decision;
   record its score, `cutoff_at_decision`, and remarks.
3. **Admitted student** — active student with a decided application,
   department, one result, and one fee record.
4. **Admissions officer** — active admin account.
5. **Registrar** — active admin account.
6. **Super admin** — active admin account.

Create two admission sessions for Applicant B's checks: the decided session
and a different session that can be opened after the first decision. Give the
sessions different cut-off marks.

## Four admission acceptance criteria

### 1. Applicant access is restricted

- Sign in as Applicant A and confirm `/status` shows Pending Review.
- Visit `/dashboard` and `/dashboard/records` directly. Both must redirect to
  `/status`; no dashboard or records data should render.
- Visit `/admin` directly. It must redirect to the applicant's student home.
- After submission, try deleting one of the application's attached storage
  objects using that applicant's session. The delete must be denied; deleting
  an unlinked supporting document may succeed. A passport photo can be
  deleted only before the account has an application history.
- From an unauthenticated browser, request the Supabase REST endpoints for
  `profiles`, `applications`, `students`, `results`, and `fee_records`. No
  applicant/student rows may be returned.
- Sign in as the admitted student and confirm `/status` redirects to
  `/dashboard`.

### 2. Below-cut-off approval is blocked in the UI and database

- As admissions officer, open a pending application and enter a score below
  the current session cut off. Confirm the warning is shown and Approve is
  disabled.
- Call `decide_application` for that same pending application with
  `p_decision = 'admit'` and the below-cut-off score using the authenticated
  officer's session. The database must reject it and leave the application
  pending.
- Confirm an officer can reject a pending application at any valid score.
- Confirm the registrar cannot open applicant review controls or execute the
  decision RPC successfully.

### 3. A not-eligible decision displays its decision-time values

- Sign in as Applicant B and confirm `/status` shows the decided score,
  decision-time cut off, remarks, and the next future session opening date (or
  “To be announced” if none exists).
- Change the decided session's live cut off as super admin. Refresh Applicant
  B's status page. The displayed cut off must remain the saved
  `cutoff_at_decision`, unchanged by the live setting.
- Confirm Reapply is hidden until a different session is currently open.
  Open that new session, reapply, and verify a new application row is created
  while the previous decision remains in history.

### 4. Changing the cut off preserves prior decisions

- Record a decided application's `status`, `score`, and `cutoff_at_decision`.
- Change that session's live cut off as super admin.
- Verify the recorded application fields and the student's status page are
  unchanged. Verify a still-pending application uses the new live cut off
  when the next decision is attempted.

## Role and administration checks

- Admissions officer: can view applicants and decide; cannot manage students,
  read enrolled-student profiles/results/fees, read student-only passport
  photos not linked to an application, announcements, admission settings,
  admins, or audit log.
- Registrar: can search/manage students, assign departments, enter/edit/delete
  results and fee records, and manage announcements; cannot decide applicants,
  read unadmitted applicant profiles or their supporting documents, manage
  admins/settings, remove student records, or view audit log.
- Super admin: can access each permitted area, manage admin roles, and view
  the audit log.
- Attempt a student status update directly through the REST table endpoint.
  It must fail; use `admin_update_student` for authorized suspension or
  reactivation.
- Suspend the admitted student as staff. Within the status refresh interval,
  an already-open dashboard must redirect to `/suspended`. Direct requests for
  results, fees, and announcements must return no student-visible rows.
- Reactivate the student and confirm dashboard access returns. Confirm the
  suspension and reactivation appear in the super-admin audit log.
- Try removing a student as registrar (must fail). As super admin, remove a
  test student after typing its exact admission number; confirm the student,
  dependent results/fees, and audit events behave as expected.
- Create, edit, and delete an announcement and confirm each operation appears
  in the audit log and the active student's dashboard updates.
- Add, edit, and delete a result and a fee record. Confirm each change appears
  in the audit log. Confirm the student sees only their own records.

## CSV, authentication email, and responsive checks

- Apply applicant status/session/score filters and export CSV. Confirm only
  matching rows are present. Export students as well.
- Open both CSV files in Excel. Check that UTF-8 names display correctly,
  commas and quotes remain in their cells, and formula-like text is not
  executed.
- Complete signup verification, forgot-password, password-reset, and invited
  admin flows from the deployed Netlify site. Every link must return to the
  configured live domain and the correct route.
- Test at 360px, 768px, and a desktop viewport. Confirm no horizontal page
  overflow, and lists/forms remain usable.
- Keyboard-only: tab through navigation, forms, dialogs, and actions; confirm
  visible focus, logical order, and Enter/Space activation. Check that errors
  are announced and the global toast can be dismissed.

## RLS and private-storage source/deployment verification

Run the following as a project owner in the Supabase SQL Editor after all
migrations. All application tables should report RLS enabled:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Confirm both portal buckets are private:

```sql
select id, name, public
from storage.buckets
where id in ('passport-photos', 'application-documents');
```

Inspect all policies on the Storage objects table (also check for policies
created outside this project that could broaden access):

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
  'profiles', 'sessions', 'departments', 'applications',
  'application_documents', 'students', 'announcements',
  'results', 'fee_records', 'audit_log'
))
or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;
```

No application table or portal bucket should allow anonymous/public reads.
Verify the policy result against the role checks above and test the REST/Storage
requests using an anon key without a user JWT. A source review is not a
substitute for testing policies deployed in the target Supabase project.
