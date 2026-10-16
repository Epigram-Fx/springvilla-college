import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { getSupabaseClient } from "../lib/supabase";
import type { ApplicationStatus } from "../types/database";

type HistoricalApplication = {
  id: string;
  session_id: string;
  status: ApplicationStatus;
  score: number | null;
  cutoff_at_decision: number | null;
  submitted_at: string;
  sessionName: string;
};

const statusText: Record<ApplicationStatus, string> = {
  pending: "Pending review",
  admitted: "Admitted",
  not_eligible: "Not eligible"
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

export function StatusPage() {
  const { application, user } = useAuth();
  const historyQuery = useQuery({
    queryKey: ["application-history", user?.id],
    enabled: Boolean(user && application),
    queryFn: async () => {
      if (!user) throw new Error("You must be signed in to view your applications.");
      const supabase = getSupabaseClient();
      const { data: applications, error: applicationsError } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", user.id)
        .order("submitted_at", { ascending: false });
      if (applicationsError) throw applicationsError;

      const sessionIds = [...new Set(applications.map((item) => item.session_id))];
      if (sessionIds.length === 0) return [] as HistoricalApplication[];

      const { data: sessions, error: sessionsError } = await supabase
        .from("sessions")
        .select("id, name, opens_at")
        .in("id", sessionIds);
      if (sessionsError) throw sessionsError;

      const sessionNames = new Map(
        sessions.map((session) => [session.id, session.name])
      );
      return applications.map((item) => ({
        id: item.id,
        session_id: item.session_id,
        status: item.status,
        score: item.score,
        cutoff_at_decision: item.cutoff_at_decision,
        submitted_at: item.submitted_at,
        sessionName: sessionNames.get(item.session_id) ?? "Admission session"
      }));
    }
  });

  const sessionsQuery = useQuery({
    queryKey: ["reapplication-sessions", user?.id, application?.session_id],
    enabled: application?.status === "not_eligible" && Boolean(user),
    queryFn: async () => {
      if (!user || !application) {
        throw new Error("Sign in to view admission sessions.");
      }
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();
      const [openResult, nextResult, applicationsResult] = await Promise.all([
        supabase
          .from("sessions")
          .select("id, name, opens_at")
          .lte("opens_at", now)
          .gte("closes_at", now)
          .order("opens_at", { ascending: true })
          .limit(20),
        supabase
          .from("sessions")
          .select("id, name, opens_at")
          .gt("opens_at", now)
          .order("opens_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("applications")
          .select("session_id")
          .eq("user_id", user.id)
      ]);
      if (openResult.error) throw openResult.error;
      if (nextResult.error) throw nextResult.error;
      if (applicationsResult.error) throw applicationsResult.error;

      const appliedSessionIds = new Set(
        applicationsResult.data.map((item) => item.session_id)
      );
      const newOpenSession =
        openResult.data.find(
          (session) =>
            session.id !== application.session_id &&
            !appliedSessionIds.has(session.id)
        ) ?? null;
      return {
        newOpenSession,
        nextSession: nextResult.data
      };
    }
  });

  if (!application) {
    return <p className="p-8 text-slate-700">No application was found for this account.</p>;
  }

  const currentSessionName =
    historyQuery.data?.find((item) => item.id === application.id)?.sessionName ??
    "your admission session";

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">
          Application status
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          {statusText[application.status]}
        </h1>
        {application.status === "pending" ? (
          <>
            <p className="mt-4 leading-7 text-slate-600">
              Your application is with our admissions team for review. We’ll
              email you when there is an update.
            </p>
            <dl className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-slate-500">Admission session</dt>
                <dd className="mt-1 font-semibold text-slate-900">{currentSessionName}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Submitted</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {formatDate(application.submitted_at)}
                </dd>
              </div>
            </dl>
          </>
        ) : application.status === "not_eligible" ? (
          <>
            <p className="mt-4 leading-7 text-slate-600">
              Your application did not meet the admission requirements. Your
              previous application remains in your history.
            </p>
            <dl className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-slate-500">Your score</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">
                  {application.score ?? "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Cut off at decision</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">
                  {application.cutoff_at_decision ?? "Not recorded"}
                </dd>
              </div>
            </dl>
            {application.remarks && (
              <p className="mt-5 rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
                <strong>Review remarks:</strong> {application.remarks}
              </p>
            )}
            {sessionsQuery.isPending && (
              <p className="mt-5 text-sm text-slate-600">Checking the next admission window…</p>
            )}
            {sessionsQuery.isError && (
              <p className="mt-5 text-sm text-red-700" role="alert">
                Could not load admission windows: {sessionsQuery.error.message}
              </p>
            )}
            {sessionsQuery.data && (
              <>
                <p className="mt-5 text-sm text-slate-700">
                  Next window:{" "}
                  {sessionsQuery.data.nextSession ? (
                    <>
                      <strong>{sessionsQuery.data.nextSession.name}</strong>, opening{" "}
                      {formatDate(sessionsQuery.data.nextSession.opens_at)}.
                    </>
                  ) : (
                    <strong>To be announced.</strong>
                  )}
                </p>
                {sessionsQuery.data.newOpenSession && (
                  <Link
                    className="mt-6 inline-flex rounded-md bg-primary-700 px-5 py-3 font-semibold text-white hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2"
                    to="/apply?reapply=1"
                  >
                    Reapply for {sessionsQuery.data.newOpenSession.name}
                  </Link>
                )}
              </>
            )}
          </>
        ) : (
          <p className="mt-4 leading-7 text-slate-600">
            Your admission record is being prepared. Please contact the
            admissions office if you need help.
          </p>
        )}
      </div>

      {historyQuery.isPending && (
        <p className="mt-8 text-sm text-slate-600">Loading your application history…</p>
      )}
      {historyQuery.isError && (
        <p className="mt-8 text-sm text-red-700" role="alert">
          Could not load application history: {historyQuery.error.message}
        </p>
      )}
      {historyQuery.data && historyQuery.data.length > 1 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-900">Application history</h2>
          <ul className="mt-4 space-y-3">
            {historyQuery.data.map((item) => (
              <li
                className="rounded-xl border border-slate-200 bg-white p-4"
                key={item.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{item.sessionName}</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {statusText[item.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Submitted {formatDate(item.submitted_at)}
                  {item.score !== null && ` · Score ${item.score}`}
                  {item.cutoff_at_decision !== null &&
                    ` · Cut off at decision ${item.cutoff_at_decision}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
