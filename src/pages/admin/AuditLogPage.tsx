import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormMessage } from "../../components/FormMessage";
import { getSupabaseClient } from "../../lib/supabase";

const pageSize = 20;

export function AuditLogPage() {
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const auditQuery = useQuery({
    queryKey: ["admin-audit-log", actionFilter, entityFilter, fromDate, toDate, page],
    queryFn: async () => {
      let query = getSupabaseClient()
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (actionFilter.trim()) query = query.ilike("action", `%${actionFilter.trim()}%`);
      if (entityFilter.trim()) query = query.ilike("entity", `%${entityFilter.trim()}%`);
      if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00`);
      if (toDate) query = query.lte("created_at", `${toDate}T23:59:59.999`);
      const { data, count, error } = await query;
      if (error) throw error;
      return { entries: data, total: count ?? 0 };
    }
  });

  const pageCount = Math.max(1, Math.ceil((auditQuery.data?.total ?? 0) / pageSize));

  return (
    <section>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">Super admin</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Audit log</h1>
        <p className="mt-2 text-sm text-slate-600">
          Review recorded administrative and student-data changes.
        </p>
      </header>

      <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Filter label="Action" type="search" value={actionFilter} onChange={(value) => { setActionFilter(value); setPage(1); }} />
        <Filter label="Entity" type="search" value={entityFilter} onChange={(value) => { setEntityFilter(value); setPage(1); }} />
        <Filter label="From date" type="date" value={fromDate} onChange={(value) => { setFromDate(value); setPage(1); }} />
        <Filter label="To date" type="date" value={toDate} onChange={(value) => { setToDate(value); setPage(1); }} />
      </div>

      <div className="mt-5">
        {auditQuery.isPending ? (
          <p className="py-8 text-slate-600">Loading audit entries…</p>
        ) : auditQuery.isError ? (
          <FormMessage>{auditQuery.error.message}</FormMessage>
        ) : auditQuery.data.entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            No audit entries match these filters.
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {auditQuery.data.entries.map((entry) => (
                <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={entry.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-slate-900">{entry.action}</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {entry.entity} · {entry.entity_id ?? "No record ID"}
                      </p>
                    </div>
                    <time className="text-xs text-slate-500" dateTime={entry.created_at}>
                      {new Date(entry.created_at).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-2 break-all text-xs text-slate-500">
                    Actor: {entry.actor_id ?? "System"}
                  </p>
                  {entry.details && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-semibold text-primary-800">
                        Change details
                      </summary>
                      <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, auditQuery.data.total)} of {auditQuery.data.total}
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
      </div>
    </section>
  );
}

function Filter({
  label,
  type,
  value,
  onChange
}: {
  label: string;
  type: "search" | "date";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        className="form-input mt-1"
        onChange={(event) => onChange(event.currentTarget.value)}
        type={type}
        value={value}
      />
    </label>
  );
}
