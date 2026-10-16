import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { FormMessage } from "../../components/FormMessage";
import { useToast } from "../../components/ToastProvider";
import { downloadCsv } from "../../lib/csv";
import { getSupabaseClient } from "../../lib/supabase";
import type { Database } from "../../types/database";

type Student = Database["public"]["Tables"]["students"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type StudentDirectoryEntry = Student & {
  fullName: string;
  email: string;
  phone: string;
  sessionName: string;
  departmentName: string;
  score: number | null;
  submittedAt: string;
  reviewedAt: string;
};

const pageSize = 10;

export function StudentsPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "success" } | null>(null);

  const studentsQuery = useQuery({
    queryKey: ["admin-students"],
    queryFn: async (): Promise<StudentDirectoryEntry[]> => {
      const supabase = getSupabaseClient();
      const [studentsResult, profilesResult, applicationsResult, sessionsResult, departmentsResult] =
        await Promise.all([
          supabase.from("students").select("*").order("created_at", { ascending: false }),
          supabase.from("profiles").select("*"),
          supabase
            .from("applications")
            .select("id, session_id, score, submitted_at, reviewed_at"),
          supabase.from("sessions").select("id, name"),
          supabase.from("departments").select("id, name")
        ]);
      if (studentsResult.error) throw studentsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (applicationsResult.error) throw applicationsResult.error;
      if (sessionsResult.error) throw sessionsResult.error;
      if (departmentsResult.error) throw departmentsResult.error;

      const profiles = new Map<string, Profile>(
        profilesResult.data.map((profile) => [profile.id, profile])
      );
      const applicationSessions = new Map(
        applicationsResult.data.map((application) => [application.id, application.session_id])
      );
      const applicationScores = new Map(
        applicationsResult.data.map((application) => [application.id, application.score])
      );
      const applicationDates = new Map(
        applicationsResult.data.map((application) => [
          application.id,
          { submittedAt: application.submitted_at, reviewedAt: application.reviewed_at }
        ])
      );
      const sessions = new Map(sessionsResult.data.map((session) => [session.id, session.name]));
      const departments = new Map(
        departmentsResult.data.map((department) => [department.id, department.name])
      );
      const userIds = [...new Set(studentsResult.data.map((student) => student.user_id))];
      const { data: authUsers, error: emailError } = await supabase.rpc(
        "admin_student_email_lookup",
        { p_user_ids: userIds }
      );
      if (emailError) throw emailError;
      const emails = new Map(
        (authUsers ?? []).map((entry) => [entry.user_id, entry.email ?? ""])
      );

      return studentsResult.data.map((student) => ({
        ...student,
        fullName: profiles.get(student.user_id)?.full_name ?? "Unknown student",
        phone: profiles.get(student.user_id)?.phone ?? "",
        email: emails.get(student.user_id) ?? "",
        sessionName:
          sessions.get(applicationSessions.get(student.application_id) ?? "") ??
          "Unknown session",
        score: applicationScores.get(student.application_id) ?? null,
        submittedAt: applicationDates.get(student.application_id)?.submittedAt ?? "",
        reviewedAt: applicationDates.get(student.application_id)?.reviewedAt ?? "",
        departmentName: departments.get(student.department_id ?? "") ?? "Not assigned"
      }));
    }
  });

  const departmentsQuery = useQuery({
    queryKey: ["admin-student-departments"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("departments")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    }
  });

  const updateStudent = useMutation({
    mutationFn: async ({
      id,
      values
    }: {
      id: string;
      values: { department_id?: string | null; status?: Student["status"] };
    }) => {
      const { error } = await getSupabaseClient().rpc("admin_update_student", {
        p_student_id: id,
        p_department_id: values.department_id ?? null,
        p_update_department: Object.hasOwn(values, "department_id"),
        p_status: values.status ?? null
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage({ text: "Student record updated.", kind: "success" });
      showToast("success", "Student record updated.");
      await queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      await queryClient.invalidateQueries({ queryKey: ["student-overview"] });
    },
    onError: (error) => {
      showToast(
        "error",
        error instanceof Error ? error.message : "Could not update student."
      );
      setMessage({
        text: error instanceof Error ? error.message : "Could not update student.",
        kind: "error"
      });
    }
  });

  const removeStudent = useMutation({
    mutationFn: async (student: StudentDirectoryEntry) => {
      const confirmation = window.prompt(
        `This permanently removes the student record for ${student.fullName} (${student.admission_number}).\n\nType the admission number exactly to confirm.`
      );
      if (confirmation === null) return false;
      if (confirmation.trim() !== student.admission_number) {
        throw new Error("The admission number did not match. Student was not removed.");
      }
      const { error } = await getSupabaseClient()
        .from("students")
        .delete()
        .eq("id", student.id);
      if (error) throw error;
      return true;
    },
    onSuccess: async (removed) => {
      if (!removed) return;
      setMessage({ text: "Student record removed. The action was written to the audit log.", kind: "success" });
      showToast("success", "Student record removed.");
      await queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    },
    onError: (error) => {
      showToast(
        "error",
        error instanceof Error ? error.message : "Could not remove student."
      );
      setMessage({
        text: error instanceof Error ? error.message : "Could not remove student.",
        kind: "error"
      });
    }
  });

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (studentsQuery.data ?? []).filter((student) =>
      !term ||
      `${student.fullName} ${student.email} ${student.phone} ${student.admission_number}`
        .toLowerCase()
        .includes(term)
    );
  }, [search, studentsQuery.data]);

  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const visibleStudents = filteredStudents.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">Registrar</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Students</h1>
        </div>
        <button
          className="rounded-md border border-primary-700 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50"
          disabled={!filteredStudents.length}
          onClick={() =>
            downloadCsv(
              "springvilla-students.csv",
              ["Name", "Email", "Phone", "Session", "Status", "Score", "Department", "Application submitted", "Decision date", "Student record created"],
              filteredStudents.map((student) => [
                student.fullName,
                student.email,
                student.phone,
                student.sessionName,
                student.status,
                null,
                student.departmentName,
                student.submittedAt,
                student.reviewedAt,
                student.created_at
              ])
            )
          }
          type="button"
        >
          Export students CSV
        </button>
      </header>

      <label className="mt-6 block max-w-lg">
        <span className="mb-1 block text-xs font-semibold text-slate-600">
          Search name, email, phone or admission number
        </span>
        <input
          className="form-input"
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          placeholder="Search students"
          type="search"
          value={search}
        />
      </label>

      {message && <div className="mt-4"><FormMessage kind={message.kind}>{message.text}</FormMessage></div>}
      {departmentsQuery.isError && (
        <div className="mt-4">
          <FormMessage>
            {departmentsQuery.error instanceof Error
              ? departmentsQuery.error.message
              : "Could not load departments."}
          </FormMessage>
        </div>
      )}
      {studentsQuery.isPending ? (
        <p className="py-10 text-slate-600">Loading students…</p>
      ) : studentsQuery.isError ? (
        <div className="py-8"><FormMessage>{studentsQuery.error.message}</FormMessage></div>
      ) : filteredStudents.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600">
          No students match your search.
        </p>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {visibleStudents.map((student) => (
              <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" key={student.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900">{student.fullName}</h2>
                    <p className="mt-1 break-all text-sm text-slate-600">
                      {student.email} · {student.phone || "No phone"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {student.admission_number} · {student.sessionName}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    student.status === "active"
                      ? "bg-primary-50 text-primary-800"
                      : "bg-amber-50 text-amber-800"
                  }`}>
                    {student.status === "active" ? "Active" : "Suspended"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
                  <label className="text-sm font-medium text-slate-700">
                    Department
                    <select
                      className="form-input mt-1"
                      disabled={departmentsQuery.isPending || updateStudent.isPending}
                      onChange={(event) => {
                        setMessage(null);
                        updateStudent.mutate({
                          id: student.id,
                          values: { department_id: event.currentTarget.value || null }
                        });
                      }}
                      value={student.department_id ?? ""}
                    >
                      <option value="">Not assigned</option>
                      {(departmentsQuery.data ?? []).map((department) => (
                        <option key={department.id} value={department.id}>{department.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={updateStudent.isPending}
                    onClick={() => {
                      const nextStatus = student.status === "active" ? "suspended" : "active";
                      if (
                        student.status === "active" &&
                        !window.confirm(
                          `Suspend ${student.fullName}? They will lose dashboard access.`
                        )
                      ) {
                        return;
                      }
                      setMessage(null);
                      updateStudent.mutate({
                        id: student.id,
                        values: { status: nextStatus }
                      });
                    }}
                    type="button"
                  >
                    {student.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                  <Link
                    className="rounded-md bg-primary-700 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-primary-800"
                    to={`/admin/students/${student.id}`}
                  >
                    Results & fees
                  </Link>
                  {profile?.role === "super_admin" && <button
                    className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    disabled={removeStudent.isPending}
                    onClick={() => removeStudent.mutate(student)}
                    type="button"
                  >
                    Remove
                  </button>}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-between gap-3 text-sm text-slate-600">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredStudents.length)} of {filteredStudents.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                type="button"
              >
                Previous
              </button>
              <span>{page} / {pageCount}</span>
              <button
                className="rounded-md border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => current + 1)}
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
