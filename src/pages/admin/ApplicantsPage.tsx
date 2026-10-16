import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../../lib/supabase";
import { downloadCsv } from "../../lib/csv";
import type { ApplicationStatus, Database } from "../../types/database";

type Application = Database["public"]["Tables"]["applications"]["Row"];
type Session = Database["public"]["Tables"]["sessions"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Applicant = Application & {
  applicantName: string;
  applicantEmail: string;
  phone: string;
  sessionName: string;
  departmentName: string;
};

const pageSize = 10;
const statusLabels: Record<ApplicationStatus, string> = {
  pending: "Pending",
  admitted: "Admitted",
  not_eligible: "Not eligible"
};

function isApplicationStatus(value: string): value is ApplicationStatus {
  return value === "pending" || value === "admitted" || value === "not_eligible";
}

function useApplicantRows() {
  return useQuery({
    queryKey: ["admin-applicants"],
    queryFn: async (): Promise<Applicant[]> => {
      const supabase = getSupabaseClient();
      const [applicationsResult, profilesResult, sessionsResult] =
        await Promise.all([
          supabase.from("applications").select("*").order("submitted_at", { ascending: false }),
          supabase.from("profiles").select("*"),
          supabase.from("sessions").select("*")
        ]);
      if (applicationsResult.error) throw applicationsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (sessionsResult.error) throw sessionsResult.error;

      const profiles = new Map<string, Profile>(
        profilesResult.data.map((profile) => [profile.id, profile])
      );
      const sessions = new Map<string, Session>(
        sessionsResult.data.map((session) => [session.id, session])
      );
      const userIds = [...new Set(applicationsResult.data.map((app) => app.user_id))];
      const { data: authUsers, error: usersError } = await supabase.rpc(
        "admin_applicant_email_lookup",
        { p_user_ids: userIds }
      );
      if (usersError) throw usersError;
      const emails = new Map(
        (authUsers ?? []).map((entry) => [entry.user_id, entry.email ?? ""])
      );
      const { data: applicantDepartments, error: departmentsError } = await supabase.rpc(
        "admin_applicant_department_lookup",
        { p_application_ids: applicationsResult.data.map((application) => application.id) }
      );
      if (departmentsError) throw departmentsError;
      const departments = new Map(
        (applicantDepartments ?? []).map((entry) => [
          entry.application_id,
          entry.department_name
        ])
      );

      return applicationsResult.data.map((application) => ({
        ...application,
        applicantName: profiles.get(application.user_id)?.full_name ?? "Unknown applicant",
        phone: profiles.get(application.user_id)?.phone ?? "",
        applicantEmail: emails.get(application.user_id) ?? "",
        sessionName: sessions.get(application.session_id)?.name ?? "Unknown session",
        departmentName: departments.get(application.id) ?? ""
      }));
    }
  });
}

export function ApplicantsPage() {
  const applicantsQuery = useApplicantRows();
  const sessionsQuery = useQuery({
    queryKey: ["admin-sessions-filter"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("sessions")
        .select("id, name")
        .order("opens_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");
  const [sessionId, setSessionId] = useState("all");
  const [minimumScore, setMinimumScore] = useState("");
  const [maximumScore, setMaximumScore] = useState("");
  const [page, setPage] = useState(1);

  const filteredApplicants = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const min = minimumScore === "" ? null : Number(minimumScore);
    const max = maximumScore === "" ? null : Number(maximumScore);
    return (applicantsQuery.data ?? []).filter((applicant) => {
      if (status !== "all" && applicant.status !== status) return false;
      if (sessionId !== "all" && applicant.session_id !== sessionId) return false;
      if (
        searchTerm &&
        !`${applicant.applicantName} ${applicant.applicantEmail}`
          .toLowerCase()
          .includes(searchTerm)
      ) {
        return false;
      }
      if (min !== null && (applicant.score === null || applicant.score < min)) return false;
      if (max !== null && (applicant.score === null || applicant.score > max)) return false;
      return true;
    });
  }, [applicantsQuery.data, search, status, sessionId, minimumScore, maximumScore]);

  const pageCount = Math.max(1, Math.ceil(filteredApplicants.length / pageSize));
  const visibleApplicants = filteredApplicants.slice((page - 1) * pageSize, page * pageSize);

  function updateFilter<T>(
    setter: Dispatch<SetStateAction<T>>,
    value: T
  ) {
    setter(value);
    setPage(1);
  }

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">
        Admissions
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-slate-900">Applicants</h1>
        <button
          className="rounded-md border border-primary-700 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50"
          disabled={!filteredApplicants.length}
          onClick={() =>
            downloadCsv(
              "springvilla-applicants.csv",
              ["Name", "Email", "Phone", "Session", "Status", "Score", "Department", "Submitted", "Reviewed"],
              filteredApplicants.map((applicant) => [
                applicant.applicantName,
                applicant.applicantEmail,
                applicant.phone,
                applicant.sessionName,
                statusLabels[applicant.status],
                applicant.score,
                applicant.departmentName,
                applicant.submitted_at,
                applicant.reviewed_at
              ])
            )
          }
          type="button"
        >
          Export filtered applicants CSV
        </button>
      </div>
      <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Search name or email</span>
          <input
            className="form-input"
            onChange={(event) => updateFilter(setSearch, event.target.value)}
            placeholder="Search applicants"
            type="search"
            value={search}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-600">Status</span>
          <select
            className="form-input"
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === "all" || isApplicationStatus(value)) {
                updateFilter(setStatus, value);
              }
            }}
            value={status}
          >
            <option value="all">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-600">Session</span>
          <select
            className="form-input"
            onChange={(event) => updateFilter(setSessionId, event.target.value)}
            value={sessionId}
          >
            <option value="all">All sessions</option>
            {(sessionsQuery.data ?? []).map((session) => (
              <option key={session.id} value={session.id}>{session.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-600">Minimum score</span>
          <input
            className="form-input"
            max="100"
            min="0"
            onChange={(event) => updateFilter(setMinimumScore, event.target.value)}
            type="number"
            value={minimumScore}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-600">Maximum score</span>
          <input
            className="form-input"
            max="100"
            min="0"
            onChange={(event) => updateFilter(setMaximumScore, event.target.value)}
            type="number"
            value={maximumScore}
          />
        </label>
      </div>

      {applicantsQuery.isPending && <p className="py-10 text-slate-600">Loading applicants…</p>}
      {applicantsQuery.isError && (
        <p className="py-10 text-red-700" role="alert">
          Could not load applicants: {applicantsQuery.error.message}
        </p>
      )}
      {sessionsQuery.isError && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          Could not load session filters: {sessionsQuery.error.message}
        </p>
      )}
      {applicantsQuery.data && filteredApplicants.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600">
          No applicants match these filters.
        </p>
      )}
      {visibleApplicants.length > 0 && (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3"><span className="sr-only">View</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleApplicants.map((applicant) => (
                  <tr key={applicant.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{applicant.applicantName}</p>
                      <p className="text-slate-500">{applicant.applicantEmail || "Email unavailable"}</p>
                    </td>
                    <td className="px-4 py-4">{applicant.sessionName}</td>
                    <td className="px-4 py-4">{applicant.score ?? "—"}</td>
                    <td className="px-4 py-4"><StatusBadge status={applicant.status} /></td>
                    <td className="px-4 py-4">{new Date(applicant.submitted_at).toLocaleDateString()}</td>
                    <td className="px-4 py-4">
                      <Link className="font-semibold text-primary-800 hover:underline" to={`/admin/applicants/${applicant.id}`}>
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-5 space-y-3 md:hidden">
            {visibleApplicants.map((applicant) => (
              <li className="rounded-xl border border-slate-200 bg-white p-4" key={applicant.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900">{applicant.applicantName}</h2>
                    <p className="truncate text-sm text-slate-500">{applicant.applicantEmail || "Email unavailable"}</p>
                  </div>
                  <StatusBadge status={applicant.status} />
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {applicant.sessionName} · Score {applicant.score ?? "—"}
                </p>
                <Link className="mt-4 inline-block font-semibold text-primary-800 hover:underline" to={`/admin/applicants/${applicant.id}`}>
                  Review application
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-between text-sm text-slate-600">
            <span>
              Showing {filteredApplicants.length === 0 ? 0 : (page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, filteredApplicants.length)} of {filteredApplicants.length}
            </span>
            <div className="flex gap-2">
              <button
                className="rounded-md border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                type="button"
              >
                Previous
              </button>
              <span className="self-center">{page} / {pageCount}</span>
              <button
                className="rounded-md border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50"
                disabled={page >= pageCount}
                onClick={() => setPage((value) => value + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const colors: Record<ApplicationStatus, string> = {
    pending: "bg-amber-50 text-amber-800",
    admitted: "bg-primary-50 text-primary-800",
    not_eligible: "bg-slate-100 text-slate-700"
  };
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status]}`}>
      {statusLabels[status]}
    </span>
  );
}
