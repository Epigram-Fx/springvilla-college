import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { AdmissionLetterDownload } from "../components/AdmissionLetter";
import { FormMessage } from "../components/FormMessage";
import { getSupabaseClient } from "../lib/supabase";

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

export function StudentDashboardPage() {
  const { user, profile, student } = useAuth();
  const navigate = useNavigate();
  const overviewQuery = useQuery({
    queryKey: ["student-overview", user?.id, student?.id, profile?.photo_path],
    enabled: Boolean(user && student?.id),
    queryFn: async () => {
      if (!user || !student) throw new Error("Your student account could not be loaded.");
      const supabase = getSupabaseClient();
      const { data: currentStudent, error: studentError } = await supabase
        .from("students")
        .select("*")
        .eq("id", student.id)
        .eq("user_id", user.id)
        .single();
      if (studentError) throw studentError;
      if (currentStudent.status !== "active") {
        throw new Error("ACCOUNT_SUSPENDED");
      }

      const [applicationResult, announcementsResult, departmentResult, photoResult] =
        await Promise.all([
          supabase
            .from("applications")
            .select("session_id")
            .eq("id", currentStudent.application_id)
            .eq("user_id", user.id)
            .single(),
          supabase
            .from("announcements")
            .select("*")
            .order("created_at", { ascending: false }),
          currentStudent.department_id
            ? supabase
                .from("departments")
                .select("name")
                .eq("id", currentStudent.department_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          profile?.photo_path
            ? supabase.storage
                .from("passport-photos")
                .createSignedUrl(profile.photo_path, 3600)
            : Promise.resolve({ data: null, error: null })
        ]);
      if (applicationResult.error) throw applicationResult.error;
      if (announcementsResult.error) throw announcementsResult.error;
      if (departmentResult.error) throw departmentResult.error;
      if (photoResult.error) throw photoResult.error;

      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("name")
        .eq("id", applicationResult.data.session_id)
        .single();
      if (sessionError) throw sessionError;

      return {
        department: departmentResult.data?.name ?? "Not assigned",
        session: session.name,
        photoUrl: photoResult.data?.signedUrl ?? null,
        announcements: announcementsResult.data
      };
    }
  });

  useEffect(() => {
    if (
      overviewQuery.error instanceof Error &&
      overviewQuery.error.message === "ACCOUNT_SUSPENDED"
    ) {
      navigate("/suspended", { replace: true });
    }
  }, [navigate, overviewQuery.error]);

  const data = overviewQuery.data;
  const letterDetails = {
    studentName: profile?.full_name ?? "Student",
    admissionNumber: student?.admission_number ?? "",
    department: data?.department ?? "Not assigned",
    session: data?.session ?? ""
  };

  return (
    <section className="space-y-8">
      <header className="rounded-2xl bg-primary-800 px-6 py-8 text-white sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-green-100">
          Student dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          Welcome, {profile?.full_name ?? "Student"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-green-50">
          Your admission is active. Find your student details and the latest
          college updates here.
        </p>
      </header>

      {overviewQuery.isPending && (
        <p aria-live="polite" className="text-sm text-slate-600">
          Loading your student information…
        </p>
      )}
      {overviewQuery.isError &&
        !(
          overviewQuery.error instanceof Error &&
          overviewQuery.error.message === "ACCOUNT_SUSPENDED"
        ) && (
          <FormMessage>
            {overviewQuery.error instanceof Error
              ? overviewQuery.error.message
              : "Unable to load your student information."}
          </FormMessage>
        )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <InfoCard label="Admission number" value={student?.admission_number ?? "—"} />
            <InfoCard label="Department" value={data.department} />
            <InfoCard label="Academic session" value={data.session} />
          </div>

          <section
            aria-labelledby="profile-heading"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              {data.photoUrl ? (
                <img
                  alt={`Passport photo of ${profile?.full_name ?? "student"}`}
                  className="h-32 w-32 rounded-xl border border-slate-200 object-cover"
                  src={data.photoUrl}
                />
              ) : (
                <div
                  aria-label="No passport photo on file"
                  className="grid h-32 w-32 place-items-center rounded-xl bg-primary-50 text-4xl font-bold text-primary-800"
                >
                  {(profile?.full_name ?? "S").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-slate-900" id="profile-heading">
                  Profile
                </h2>
                <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <ProfileDetail label="Full name" value={profile?.full_name ?? "—"} />
                  <ProfileDetail label="Email" value={user?.email ?? "—"} />
                  <ProfileDetail label="Phone" value={profile?.phone ?? "—"} />
                  <ProfileDetail
                    label="Date of birth"
                    value={profile?.date_of_birth ? formatDate(profile.date_of_birth) : "—"}
                  />
                </dl>
                <div className="mt-5">
                  <AdmissionLetterDownload details={letterDetails} />
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="announcements-heading">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-900" id="announcements-heading">
                Announcements
              </h2>
              <span className="text-sm text-slate-500">Newest first</span>
            </div>
            {data.announcements.length ? (
              <ul className="space-y-3">
                {data.announcements.map((announcement) => (
                  <li
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                    key={announcement.id}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">{announcement.title}</h3>
                      <time className="text-xs text-slate-500" dateTime={announcement.created_at}>
                        {formatDate(announcement.created_at)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {announcement.body}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                There are no announcements at the moment.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-500">{label}</h2>
      <p className="mt-2 break-words text-lg font-bold text-slate-900">{value}</p>
    </article>
  );
}

function ProfileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}
