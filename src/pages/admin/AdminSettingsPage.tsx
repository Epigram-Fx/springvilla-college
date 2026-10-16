import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { FormMessage } from "../../components/FormMessage";
import { getSupabaseClient } from "../../lib/supabase";
import type { Database } from "../../types/database";

type Session = Database["public"]["Tables"]["sessions"]["Row"];
type Department = Database["public"]["Tables"]["departments"]["Row"];

const sessionSchema = z
  .object({
    name: z.string().trim().regex(/^\d{4}\/\d{4}$/, "Use a format such as 2026/2027."),
    cutoff_mark: z
      .string()
      .trim()
      .min(1, "Enter a cut off mark.")
      .transform(Number)
      .pipe(z.number().min(0).max(100)),
    opens_at: z.string().min(1, "Set the opening date and time."),
    closes_at: z.string().min(1, "Set the closing date and time.")
  })
  .refine(
    (session) => new Date(session.closes_at) > new Date(session.opens_at),
    { path: ["closes_at"], message: "Closing time must be after opening time." }
  );

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toISOString(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Enter a valid session date.");
  return date.toISOString();
}

export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Session | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [cutoffMark, setCutoffMark] = useState("50");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [departmentEdit, setDepartmentEdit] = useState<Department | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sessionSuccess, setSessionSuccess] = useState<string | null>(null);
  const [departmentSuccess, setDepartmentSuccess] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["admin-settings-sessions"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("sessions")
        .select("*")
        .order("opens_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });
  const departmentsQuery = useQuery({
    queryKey: ["admin-settings-departments"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("departments")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    }
  });

  const saveSession = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const parsed = sessionSchema.safeParse({
        name: sessionName,
        cutoff_mark: cutoffMark,
        opens_at: opensAt,
        closes_at: closesAt
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Check the session details.");
      }
      const values = {
        name: parsed.data.name,
        cutoff_mark: parsed.data.cutoff_mark,
        opens_at: toISOString(parsed.data.opens_at),
        closes_at: toISOString(parsed.data.closes_at)
      };
      const supabase = getSupabaseClient();
      const result = editing
        ? await supabase.from("sessions").update(values).eq("id", editing.id)
        : await supabase.from("sessions").insert(values);
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      setSessionSuccess(editing ? "Session updated." : "Session created.");
      setEditing(null);
      setSessionName("");
      setCutoffMark("50");
      setOpensAt("");
      setClosesAt("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-settings-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-sessions-filter"] }),
        queryClient.invalidateQueries({ queryKey: ["application-session"] })
      ]);
    },
    onError: (error) => setFormError(error.message)
  });

  const saveDepartment = useMutation({
    mutationFn: async () => {
      const name = departmentName.trim();
      if (name.length < 2) throw new Error("Enter a department name.");
      const supabase = getSupabaseClient();
      const result = departmentEdit
        ? await supabase.from("departments").update({ name }).eq("id", departmentEdit.id)
        : await supabase.from("departments").insert({ name });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      setDepartmentSuccess(departmentEdit ? "Department updated." : "Department added.");
      setDepartmentEdit(null);
      setDepartmentName("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-settings-departments"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-departments"] })
      ]);
    }
  });

  const deleteDepartment = useMutation({
    mutationFn: async (department: Department) => {
      if (
        !window.confirm(
          `Delete ${department.name}? This cannot be undone. Departments assigned to students cannot be deleted.`
        )
      ) {
        return false;
      }
      const { error } = await getSupabaseClient()
        .from("departments")
        .delete()
        .eq("id", department.id);
      if (error) throw error;
      return true;
    },
    onSuccess: async (deleted) => {
      if (!deleted) return;
      setDepartmentSuccess("Department deleted.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-settings-departments"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-departments"] })
      ]);
    }
  });

  function startEdit(session: Session) {
    setEditing(session);
    setSessionName(session.name);
    setCutoffMark(String(session.cutoff_mark));
    setOpensAt(toDateTimeLocal(session.opens_at));
    setClosesAt(toDateTimeLocal(session.closes_at));
    setSessionSuccess(null);
    setFormError(null);
  }

  function cancelSessionEdit() {
    setEditing(null);
    setSessionName("");
    setCutoffMark("50");
    setOpensAt("");
    setClosesAt("");
    setFormError(null);
  }

  function startDepartmentEdit(department: Department) {
    setDepartmentEdit(department);
    setDepartmentName(department.name);
    setDepartmentSuccess(null);
  }

  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">Super admin</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Admission settings</h1>
      </div>

      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <strong>Cut off changes affect undecided applications only.</strong> Each
        admission decision stores a snapshot in <code>cutoff_at_decision</code>;
        editing a session never changes a past decision.
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-bold text-slate-900">
          {editing ? `Edit ${editing.name}` : "Create admission session"}
        </h2>
        {formError && <div className="mt-4"><FormMessage>{formError}</FormMessage></div>}
        {saveSession.isError && !formError && (
          <div className="mt-4"><FormMessage>{saveSession.error.message}</FormMessage></div>
        )}
        {sessionSuccess && (
          <div className="mt-4"><FormMessage kind="success">{sessionSuccess}</FormMessage></div>
        )}
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSessionSuccess(null);
            saveSession.mutate();
          }}
        >
          <Field label="Academic session (e.g. 2026/2027)">
            <input
              className="form-input"
              onChange={(event) => setSessionName(event.target.value)}
              placeholder="2026/2027"
              value={sessionName}
            />
          </Field>
          <Field label="Cut off mark (0–100)">
            <input
              className="form-input"
              max="100"
              min="0"
              onChange={(event) => setCutoffMark(event.target.value)}
              type="number"
              value={cutoffMark}
            />
          </Field>
          <Field label="Opens at">
            <input
              className="form-input"
              onChange={(event) => setOpensAt(event.target.value)}
              type="datetime-local"
              value={opensAt}
            />
          </Field>
          <Field label="Closes at">
            <input
              className="form-input"
              onChange={(event) => setClosesAt(event.target.value)}
              type="datetime-local"
              value={closesAt}
            />
          </Field>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              className="rounded-md bg-primary-700 px-4 py-2.5 font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
              disabled={saveSession.isPending}
              type="submit"
            >
              {saveSession.isPending ? "Saving…" : editing ? "Save session" : "Create session"}
            </button>
            {editing && (
              <button
                className="rounded-md border border-slate-300 px-4 py-2.5 font-semibold text-slate-700"
                onClick={cancelSessionEdit}
                type="button"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <h3 className="mt-8 text-lg font-bold text-slate-900">Sessions</h3>
        {sessionsQuery.isPending && <p className="mt-3 text-sm text-slate-600">Loading sessions…</p>}
        {sessionsQuery.isError && (
          <p className="mt-3 text-sm text-red-700" role="alert">Could not load sessions: {sessionsQuery.error.message}</p>
        )}
        {sessionsQuery.data && sessionsQuery.data.length === 0 && (
          <p className="mt-3 text-sm text-slate-600">No admission sessions yet.</p>
        )}
        {sessionsQuery.data && sessionsQuery.data.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr><th className="py-2 pr-4">Session</th><th className="py-2 pr-4">Cut off</th><th className="py-2 pr-4">Window</th><th className="py-2">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessionsQuery.data.map((session) => (
                  <tr key={session.id}>
                    <td className="py-3 pr-4 font-semibold text-slate-900">{session.name}</td>
                    <td className="py-3 pr-4">{session.cutoff_mark}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {new Date(session.opens_at).toLocaleString()} – {new Date(session.closes_at).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <button className="font-semibold text-primary-800 hover:underline" onClick={() => startEdit(session)} type="button">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-bold text-slate-900">Departments</h2>
        {saveDepartment.isError && <div className="mt-4"><FormMessage>{saveDepartment.error.message}</FormMessage></div>}
        {deleteDepartment.isError && <div className="mt-4"><FormMessage>{deleteDepartment.error.message}</FormMessage></div>}
        {departmentSuccess && <div className="mt-4"><FormMessage kind="success">{departmentSuccess}</FormMessage></div>}
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setDepartmentSuccess(null);
            saveDepartment.mutate();
          }}
        >
          <input
            aria-label="Department name"
            className="form-input"
            onChange={(event) => setDepartmentName(event.target.value)}
            placeholder="Department name"
            value={departmentName}
          />
          <button
            className="shrink-0 rounded-md bg-primary-700 px-4 py-2.5 font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
            disabled={saveDepartment.isPending}
            type="submit"
          >
            {departmentEdit ? "Save changes" : "Add department"}
          </button>
          {departmentEdit && (
            <button
              className="rounded-md border border-slate-300 px-4 py-2.5 font-semibold text-slate-700"
              onClick={() => {
                setDepartmentEdit(null);
                setDepartmentName("");
              }}
              type="button"
            >
              Cancel
            </button>
          )}
        </form>
        {departmentsQuery.isPending && <p className="mt-4 text-sm text-slate-600">Loading departments…</p>}
        {departmentsQuery.isError && (
          <p className="mt-4 text-sm text-red-700" role="alert">Could not load departments: {departmentsQuery.error.message}</p>
        )}
        {departmentsQuery.data && departmentsQuery.data.length === 0 && (
          <p className="mt-4 text-sm text-slate-600">No departments have been added.</p>
        )}
        <ul className="mt-4 divide-y divide-slate-100">
          {(departmentsQuery.data ?? []).map((department) => (
            <li className="flex items-center justify-between gap-3 py-3" key={department.id}>
              <span className="font-medium text-slate-800">{department.name}</span>
              <div className="flex gap-4">
                <button className="text-sm font-semibold text-primary-800 hover:underline" onClick={() => startDepartmentEdit(department)} type="button">Edit</button>
                <button className="text-sm font-semibold text-red-700 hover:underline" onClick={() => deleteDepartment.mutate(department)} type="button">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
