# SpringVilla College of Technology Admissions Portal

The portal provides the React/Vite application shell; Supabase schema,
row-level security, admission decision RPC, private document storage, seed
data; Supabase email/password authentication, verification and password
reset screens; applicant submission and history; role-aware admin
dashboards, applicant review, decisions, and admission settings; and an
active-student dashboard with announcements, private academic records, and
client-generated PDF admission letters. Phase 8 adds runtime error handling,
global notifications, and manual acceptance/release checks in [TESTING.md](./TESTING.md).

Student result and fee reads are scoped to the active student's own database
record by row-level security. Fee records are display-only; the portal does
not provide a payment flow.

The fifth migration adds registrar student management and student email
lookup, requires the database RPC for student status changes, and audits
student, result, fee, announcement, session, and department writes using
database triggers. The sixth migration scopes profile, application, document,
student, result, fee, and Storage reads to admissions reviewers or student
managers as appropriate. Admissions officers cannot read enrolled-student
records, and registrars cannot read applicant supporting documents. The admin
panel supports searchable/paginated student lists, department assignment,
suspension/reactivation, result and fee CRUD, announcement CRUD, filter-aware
applicant CSV export, student CSV export, and a filterable super-admin audit
log. CSV exports quote fields, escape embedded quotes, include a UTF-8 BOM for
Excel, and neutralize spreadsheet formula prefixes.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A Supabase project
- Supabase CLI for local development and database deployment
- Netlify account for hosted deployment

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` from the Supabase project API settings. The anon
   key is intended for browser use; never put a service-role key or Resend key
   in a `VITE_` variable.
3. Run the application with `npm run dev`. Use `npm run typecheck` for the
   TypeScript check and `npm run build` for a production build.

In Supabase Authentication settings, enable email confirmations and set the
local site URL to `http://localhost:5173`. Add the local URL and your deployed
site URL to the allowed redirect URLs so signup verification and password
recovery can return to the portal. Public registration creates only student
accounts; the role in signup metadata is never used.

The application restores the persisted Supabase session on refresh, then loads
the user's profile, most recent application, and student record. Admin roles
are directed to `/admin`; applicants are directed to `/apply` or `/status`;
active admitted students can access `/dashboard/*`; suspended accounts are
shown the school contact notice. These UI guards complement, but do not replace,
the database RLS policies.

## Supabase migration and seed

The included `supabase/config.toml` enables the seed script for local resets.
Start a local Supabase stack and apply the migration and seed with:

```powershell
supabase login
supabase start
supabase db reset
```

To deploy the migration to a hosted project:

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

To seed an already-migrated hosted project, run the seed SQL once from the
Supabase SQL Editor. The seed creates five departments and the `2026/2027`
session with a cut off of 50 and a window ending 60 days after seeding.

The migration creates private `passport-photos` and `application-documents`
Storage buckets. Policies restrict inserts and student reads to objects under
the user's UUID folder; reviewers and student managers can read only photos
and documents linked to records their roles can access. Bucket size and MIME
type limits are set in Supabase as well as intended for client-side validation.
Applicants can delete their own unlinked supporting documents and passport
photos before their first application; submitted attachments cannot be
deleted. Passport photos are JPG/PNG up to 2 MB; supporting documents are
PDF/JPG/PNG up to 5 MB. Upload object names using `{user_id}/{filename}`.

The second migration adds server-side Nigerian phone and minimum-age checks
for new applicant profiles and the `submit_application` RPC. The RPC validates
the currently open session and atomically creates the application, saves the
passport path, and records all supporting documents.

The third migration adds a role-checked RPC that returns applicant email
addresses to admissions officers and super admins only. The admin decision
screen calls `decide_application`, which enforces the current session cut off
and persists `cutoff_at_decision` at decision time. Session cut off edits do not
modify decided applications.

The fourth migration adds super-admin account management and invitation-safe
profile creation. Only an Auth invitation marked by Supabase's server-managed
`invited_at` field can set an administrator role; normal public signups remain
students. Invited admin profiles are not required to provide applicant phone
or date-of-birth details.

Application receipt, admission and non-eligibility emails use the
`send-notification` Edge Function. It verifies the caller, reads the current
application and recipient details with the service role, and sends branded
email through Resend. Failures are written to `audit_log` and never roll back
an application submission or decision. The admin-management page invites new
staff through the `create-admin` Edge Function; role changes and
deactivation/reactivation are restricted to super admins and recorded in the
audit log. Inactive profiles no longer receive staff privileges from database
role helpers or protected Edge Functions.

Configure and verify your sender domain in Resend. Set the function secrets
only in Supabase (never add them to a `VITE_` variable). Supabase provides the
project URL, anon key and service-role key to the Edge Function runtime; the
service-role key must never be put in frontend configuration.

```powershell
supabase secrets set RESEND_API_KEY=re_your_key EMAIL_FROM="SpringVilla Admissions <admissions@example.edu>" APP_URL=https://your-portal.example.edu
supabase functions deploy
```

Email delivery is attempted after application submission and does not undo or
block a saved application or decision. Delivery failures are logged in the
browser console, Edge Function logs, and the database audit log.

## Create the first super admin

1. In Supabase Authentication settings, enable email confirmation for student
   signups.
2. Sign up the trusted administrator using the public signup flow once it is
   available, and confirm the email if confirmation is enabled. Signup always
   creates a `student` profile; public metadata cannot assign an admin role.
3. In the Supabase SQL Editor, run the following, replacing the email with the
   trusted administrator's exact email:

```sql
update public.profiles p
set role = 'super_admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('admin@example.com');
```

The SQL Editor is a trusted administrative environment; never expose database
owner or service-role credentials in the browser. Apply all migrations first;
super admins can then invite and manage staff from **Admin management** in the
portal. New invitees receive a Supabase invitation email and set their password
before logging in.

## Admission decision rule

The browser must call `public.decide_application(...)` to approve or reject an
application; it must never update application status directly. The RPC checks
the caller's role and score, reads the session cut off, blocks below-cut-off
admissions, snapshots the cut off in `cutoff_at_decision`, creates the
admission record and writes an audit entry in the same transaction. Each
applicant can submit at most one application per session, and inserts are
allowed only while that session is open. Later cut-off changes do not rewrite
previous decisions.

## Deployment

1. Build and verify locally with `npm run typecheck` and `npm run build`.
2. Connect the repository to Netlify. The included `netlify.toml` sets the
   build command to `npm run build`, publishes `dist`, and routes SPA requests
   to `/index.html`.
3. Set these site environment variables in Netlify (Site configuration >
   Environment variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy all Supabase Edge Functions after linking the project and setting
   the secrets:

   ```powershell
   supabase link --project-ref YOUR_PROJECT_REF
   supabase secrets set RESEND_API_KEY=re_your_key EMAIL_FROM="SpringVilla Admissions <admissions@example.edu>" APP_URL=https://YOUR_SITE.netlify.app
   supabase functions deploy
   ```

   Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` to Edge Function runtime environments. Never
   set the service-role key or Resend API key in Netlify or a `VITE_` variable.
5. In Supabase Dashboard > Authentication > URL Configuration, set **Site
   URL** to the deployed Netlify origin (for example,
   `https://YOUR_SITE.netlify.app`) and add that origin and the local
   development origin to **Redirect URLs**. Keep the callback paths used by
   verification, invitation, and password recovery links within the allowed
   redirects.
6. After deploy, run the account-role, RLS, auth-email, and responsive manual
   checks in [TESTING.md](./TESTING.md).

The `.env` and `.env.*` patterns are ignored by git; `.env.example` is
intentionally tracked and contains only placeholders/public client settings.
