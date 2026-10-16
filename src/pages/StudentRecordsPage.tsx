import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { FormMessage } from "../components/FormMessage";
import { getSupabaseClient } from "../lib/supabase";
import type { Database } from "../types/database";

type Result = Database["public"]["Tables"]["results"]["Row"];
type FeeRecord = Database["public"]["Tables"]["fee_records"]["Row"];

const currencyFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2
});

export function StudentRecordsPage() {
  const { student } = useAuth();
  const recordsQuery = useQuery({
    queryKey: ["student-records", student?.id],
    enabled: Boolean(student?.id),
    queryFn: async () => {
      if (!student) throw new Error("Your student account could not be loaded.");
      const supabase = getSupabaseClient();
      const [resultsResult, feesResult] = await Promise.all([
        supabase
          .from("results")
          .select("*")
          .eq("student_id", student.id)
          .order("semester", { ascending: true })
          .order("course", { ascending: true }),
        supabase
          .from("fee_records")
          .select("*")
          .eq("student_id", student.id)
          .order("updated_at", { ascending: false })
      ]);
      if (resultsResult.error) throw resultsResult.error;
      if (feesResult.error) throw feesResult.error;
      return { results: resultsResult.data, fees: feesResult.data };
    }
  });

  const resultsBySemester = new Map<string, Result[]>();
  for (const result of recordsQuery.data?.results ?? []) {
    const semester = result.semester?.trim() || "Semester not specified";
    const semesterResults = resultsBySemester.get(semester) ?? [];
    semesterResults.push(result);
    resultsBySemester.set(semester, semesterResults);
  }

  return (
    <section className="space-y-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">
          Student dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Results and fees</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          View your academic results and fee records. This page is for display only;
          no payments can be made through the portal.
        </p>
      </header>

      {recordsQuery.isPending && (
        <p aria-live="polite" className="text-sm text-slate-600">
          Loading your academic records…
        </p>
      )}
      {recordsQuery.isError && (
        <FormMessage>
          {recordsQuery.error instanceof Error
            ? recordsQuery.error.message
            : "Unable to load your academic records."}
        </FormMessage>
      )}

      {recordsQuery.data && (
        <>
          <section aria-labelledby="results-heading">
            <h2 className="mb-4 text-xl font-bold text-slate-900" id="results-heading">
              Results
            </h2>
            {resultsBySemester.size ? (
              <div className="space-y-5">
                {[...resultsBySemester.entries()].map(([semester, results]) => (
                  <section
                    aria-label={`Results for ${semester}`}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                    key={semester}
                  >
                    <h3 className="border-b border-slate-200 bg-primary-50 px-5 py-3 font-semibold text-primary-900">
                      {semester}
                    </h3>
                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-5 py-3 font-semibold">Course</th>
                            <th className="px-5 py-3 font-semibold">Score</th>
                            <th className="px-5 py-3 font-semibold">Grade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {results.map((result) => (
                            <tr key={result.id}>
                              <td className="px-5 py-3 font-medium text-slate-800">
                                {result.course}
                              </td>
                              <td className="px-5 py-3 text-slate-600">{result.score}</td>
                              <td className="px-5 py-3 text-slate-600">{result.grade ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ul className="divide-y divide-slate-100 sm:hidden">
                      {results.map((result) => (
                        <li className="flex items-center justify-between gap-4 px-5 py-3" key={result.id}>
                          <span className="min-w-0 font-medium text-slate-800">{result.course}</span>
                          <span className="shrink-0 text-right text-sm text-slate-600">
                            {result.score} · {result.grade ?? "No grade"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <EmptyState text="Your results will appear here when they are available." />
            )}
          </section>

          <section aria-labelledby="fees-heading">
            <h2 className="mb-4 text-xl font-bold text-slate-900" id="fees-heading">
              Fees
            </h2>
            {recordsQuery.data.fees.length ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Description</th>
                        <th className="px-5 py-3 font-semibold">Amount due</th>
                        <th className="px-5 py-3 font-semibold">Amount paid</th>
                        <th className="px-5 py-3 font-semibold">Balance</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recordsQuery.data.fees.map((fee) => (
                        <FeeRow fee={fee} key={fee.id} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-slate-100 sm:hidden">
                  {recordsQuery.data.fees.map((fee) => (
                    <li className="space-y-2 p-5" key={fee.id}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-slate-900">{fee.description}</p>
                        <FeeStatus fee={fee} />
                      </div>
                      <dl className="grid grid-cols-2 gap-2 text-sm">
                        <FeeDetail label="Amount due" amount={fee.amount_due} />
                        <FeeDetail label="Amount paid" amount={fee.amount_paid} />
                        <FeeDetail
                          label="Balance"
                          amount={fee.amount_due - fee.amount_paid}
                        />
                      </dl>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyState text="There are no fee records available." />
            )}
          </section>
        </>
      )}
    </section>
  );
}

function FeeRow({ fee }: { fee: FeeRecord }) {
  const balance = fee.amount_due - fee.amount_paid;
  return (
    <tr>
      <td className="px-5 py-3 font-medium text-slate-800">{fee.description}</td>
      <td className="px-5 py-3 text-slate-600">{formatCurrency(fee.amount_due)}</td>
      <td className="px-5 py-3 text-slate-600">{formatCurrency(fee.amount_paid)}</td>
      <td className="px-5 py-3 text-slate-600">{formatCurrency(balance)}</td>
      <td className="px-5 py-3"><FeeStatus fee={fee} /></td>
    </tr>
  );
}

function FeeStatus({ fee }: { fee: FeeRecord }) {
  const status =
    fee.amount_paid >= fee.amount_due
      ? "Paid"
      : fee.amount_paid > 0
        ? "Partial"
        : "Outstanding";
  const color =
    status === "Paid"
      ? "bg-primary-50 text-primary-800"
      : status === "Partial"
        ? "bg-amber-50 text-amber-800"
        : "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>
      {status}
    </span>
  );
}

function FeeDetail({ label, amount }: { label: string; amount: number }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{formatCurrency(amount)}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
      {text}
    </p>
  );
}

function formatCurrency(amount: number): string {
  return currencyFormatter.format(Number(amount));
}
