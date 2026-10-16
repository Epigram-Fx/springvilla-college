import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { getSupabaseClient } from "../../lib/supabase";
import type { ApplicationStatus } from "../../types/database";

const cards: Array<{ status: ApplicationStatus | "total"; label: string; color: string }> = [
  { status: "pending", label: "Pending", color: "bg-amber-400" },
  { status: "admitted", label: "Admitted", color: "bg-primary-600" },
  { status: "not_eligible", label: "Not eligible", color: "bg-slate-500" },
  { status: "total", label: "Total applicants", color: "bg-blue-600" }
];

export function AdminDashboardPage() {
  const { profile } = useAuth();
  const [sessionId, setSessionId] = useState("all");
  const sessionsQuery = useQuery({
    queryKey: ["admin-dashboard-sessions"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("sessions")
        .select("id, name")
        .order("opens_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });
  const dashboardQuery = useQuery({
    queryKey: ["admin-dashboard", sessionId],
    queryFn: async () => {
      const count = async (status?: ApplicationStatus) => {
        let query = getSupabaseClient()
          .from("applications")
          .select("id", { count: "exact", head: true });
        if (sessionId !== "all") query = query.eq("session_id", sessionId);
        if (status) query = query.eq("status", status);
        const { count: total, error } = await query;
        if (error) throw error;
        return total ?? 0;
      };
      const [pending, admitted, notEligible, total] = await Promise.all([
        count("pending"),
        count("admitted"),
        count("not_eligible"),
        count()
      ]);
      return { pending, admitted, not_eligible: notEligible, total };
    }
  });

  const counts = dashboardQuery.data;
  const maxCount = Math.max(
    1,
    counts?.pending ?? 0,
    counts?.admitted ?? 0,
    counts?.not_eligible ?? 0
  );

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">Overview</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold text-slate-900">Admissions dashboard</h1>
        <label className="w-full max-w-xs">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Filter by session</span>
          <select
            className="form-input"
            onChange={(event) => setSessionId(event.target.value)}
            value={sessionId}
          >
            <option value="all">All sessions</option>
            {(sessionsQuery.data ?? []).map((session) => (
              <option key={session.id} value={session.id}>{session.name}</option>
            ))}
          </select>
        </label>
      </div>
      {dashboardQuery.isPending && <p className="mt-8 text-slate-600">Loading dashboard…</p>}
      {dashboardQuery.isError && (
        <p className="mt-8 text-red-700" role="alert">
          Could not load dashboard totals: {dashboardQuery.error.message}
        </p>
      )}
      {sessionsQuery.isError && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          Could not load session filter: {sessionsQuery.error.message}
        </p>
      )}
      {counts && (
        <>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={card.status}>
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${card.color}`} />
                  <h2 className="text-sm font-semibold text-slate-600">{card.label}</h2>
                </div>
                <p className="mt-4 text-3xl font-bold text-slate-900">
                  {card.status === "total" ? counts.total : counts[card.status]}
                </p>
              </article>
            ))}
          </div>
          <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">Application overview</h2>
            <div className="mt-5 space-y-4">
              {cards.filter((card) => card.status !== "total").map((card) => {
                const value = counts[card.status];
                const percent = counts.total === 0 ? 0 : (value / maxCount) * 100;
                return (
                  <div key={card.status}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-slate-700">{card.label}</span>
                      <span className="text-slate-500">{value}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${card.color}`} style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          {profile?.role === "admissions_officer" || profile?.role === "super_admin" ? (
            <Link className="mt-6 inline-flex rounded-md bg-primary-700 px-4 py-2.5 font-semibold text-white hover:bg-primary-800" to="/admin/applicants">
              Review applicants
            </Link>
          ) : (
            <Link className="mt-6 inline-flex rounded-md bg-primary-700 px-4 py-2.5 font-semibold text-white hover:bg-primary-800" to="/admin/students">
              Manage students
            </Link>
          )}
        </>
      )}
    </section>
  );
}
