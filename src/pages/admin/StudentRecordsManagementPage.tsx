import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormMessage } from "../../components/FormMessage";
import { useToast } from "../../components/ToastProvider";
import { getSupabaseClient } from "../../lib/supabase";
import type { Database } from "../../types/database";

type Result = Database["public"]["Tables"]["results"]["Row"];
type FeeRecord = Database["public"]["Tables"]["fee_records"]["Row"];

type ResultForm = {
  course: string;
  score: string;
  grade: string;
  semester: string;
};
type FeeForm = {
  description: string;
  amount_due: string;
  amount_paid: string;
};

const emptyResult: ResultForm = { course: "", score: "", grade: "", semester: "" };
const emptyFee: FeeForm = { description: "", amount_due: "", amount_paid: "0" };

export function StudentRecordsManagementPage() {
  const { studentId } = useParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [resultForm, setResultForm] = useState<ResultForm>(emptyResult);
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [feeForm, setFeeForm] = useState<FeeForm>(emptyFee);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "success" } | null>(null);

  const recordsQuery = useQuery({
    queryKey: ["admin-student-records", studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      if (!studentId) throw new Error("Student ID is missing.");
      const supabase = getSupabaseClient();
      const [studentResult, resultsResult, feesResult] = await Promise.all([
        supabase.from("students").select("*").eq("id", studentId).single(),
        supabase.from("results").select("*").eq("student_id", studentId).order("semester").order("course"),
        supabase.from("fee_records").select("*").eq("student_id", studentId).order("updated_at", { ascending: false })
      ]);
      if (studentResult.error) throw studentResult.error;
      if (resultsResult.error) throw resultsResult.error;
      if (feesResult.error) throw feesResult.error;
      return {
        student: studentResult.data,
        results: resultsResult.data,
        fees: feesResult.data
      };
    }
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-student-records", studentId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-students"] })
    ]);
  };

  const saveResult = useMutation({
    mutationFn: async () => {
      if (!studentId) throw new Error("Student ID is missing.");
      const course = resultForm.course.trim();
      const score = Number(resultForm.score);
      if (!course) throw new Error("Enter a course name.");
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        throw new Error("Enter a score between 0 and 100.");
      }
      const values = {
        student_id: studentId,
        course,
        score,
        grade: resultForm.grade.trim() || null,
        semester: resultForm.semester.trim() || null
      };
      const supabase = getSupabaseClient();
      const response = editingResultId
        ? await supabase.from("results").update(values).eq("id", editingResultId)
        : await supabase.from("results").insert(values);
      if (response.error) throw response.error;
    },
    onSuccess: async () => {
      setResultForm(emptyResult);
      setEditingResultId(null);
      setMessage({ text: "Result saved and recorded in the audit log.", kind: "success" });
      showToast("success", "Result saved.");
      await refresh();
    },
    onError: (error) => {
      const text = error instanceof Error ? error.message : "Could not save result.";
      setMessage({ text, kind: "error" });
      showToast("error", text);
    }
  });

  const deleteResult = useMutation({
    mutationFn: async (result: Result) => {
      if (!window.confirm(`Delete the ${result.course} result from ${result.semester ?? "the unspecified semester"}?`)) {
        return false;
      }
      const { error } = await getSupabaseClient().from("results").delete().eq("id", result.id);
      if (error) throw error;
      return true;
    },
    onSuccess: async (deleted) => {
      if (!deleted) return;
      setMessage({ text: "Result deleted and recorded in the audit log.", kind: "success" });
      showToast("success", "Result deleted.");
      await refresh();
    },
    onError: (error) => {
      const text = error instanceof Error ? error.message : "Could not delete result.";
      setMessage({ text, kind: "error" });
      showToast("error", text);
    }
  });

  const saveFee = useMutation({
    mutationFn: async () => {
      if (!studentId) throw new Error("Student ID is missing.");
      const description = feeForm.description.trim();
      const amountDue = Number(feeForm.amount_due);
      const amountPaid = Number(feeForm.amount_paid);
      if (!description) throw new Error("Enter a fee description.");
      if (!Number.isFinite(amountDue) || amountDue < 0) throw new Error("Amount due must be zero or more.");
      if (!Number.isFinite(amountPaid) || amountPaid < 0) throw new Error("Amount paid must be zero or more.");
      const values = {
        student_id: studentId,
        description,
        amount_due: amountDue,
        amount_paid: amountPaid
      };
      const supabase = getSupabaseClient();
      const response = editingFeeId
        ? await supabase.from("fee_records").update(values).eq("id", editingFeeId)
        : await supabase.from("fee_records").insert(values);
      if (response.error) throw response.error;
    },
    onSuccess: async () => {
      setFeeForm(emptyFee);
      setEditingFeeId(null);
      setMessage({ text: "Fee record saved and recorded in the audit log.", kind: "success" });
      showToast("success", "Fee record saved.");
      await refresh();
    },
    onError: (error) => {
      const text = error instanceof Error ? error.message : "Could not save fee record.";
      setMessage({ text, kind: "error" });
      showToast("error", text);
    }
  });

  const deleteFee = useMutation({
    mutationFn: async (fee: FeeRecord) => {
      if (!window.confirm(`Delete the fee record "${fee.description}"?`)) return false;
      const { error } = await getSupabaseClient().from("fee_records").delete().eq("id", fee.id);
      if (error) throw error;
      return true;
    },
    onSuccess: async (deleted) => {
      if (!deleted) return;
      setMessage({ text: "Fee record deleted and recorded in the audit log.", kind: "success" });
      showToast("success", "Fee record deleted.");
      await refresh();
    },
    onError: (error) => {
      const text = error instanceof Error ? error.message : "Could not delete fee record.";
      setMessage({ text, kind: "error" });
      showToast("error", text);
    }
  });

  function startEditingResult(result: Result) {
    setEditingResultId(result.id);
    setResultForm({
      course: result.course,
      score: String(result.score),
      grade: result.grade ?? "",
      semester: result.semester ?? ""
    });
  }

  function startEditingFee(fee: FeeRecord) {
    setEditingFeeId(fee.id);
    setFeeForm({
      description: fee.description,
      amount_due: String(fee.amount_due),
      amount_paid: String(fee.amount_paid)
    });
  }

  return (
    <section className="space-y-8">
      <Link className="font-semibold text-primary-800 hover:underline" to="/admin/students">
        ← Back to students
      </Link>
      {recordsQuery.isPending ? (
        <p className="py-8 text-slate-600">Loading student records…</p>
      ) : recordsQuery.isError ? (
        <FormMessage>{recordsQuery.error.message}</FormMessage>
      ) : (
        <>
          <header>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">
              Results and fees
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              {recordsQuery.data.student.admission_number}
            </h1>
            <p className="mt-2 text-slate-600">
              Manage this student's academic and fee records.
            </p>
          </header>

          {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}

          <section className="space-y-4" aria-labelledby="result-management-heading">
            <h2 className="text-xl font-bold text-slate-900" id="result-management-heading">
              Results
            </h2>
            <form
              className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                setMessage(null);
                saveResult.mutate();
              }}
            >
              <label className="text-sm font-medium text-slate-700">
                Course
                <input className="form-input mt-1" onChange={(event) => setResultForm({ ...resultForm, course: event.currentTarget.value })} required value={resultForm.course} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Score
                <input className="form-input mt-1" max="100" min="0" onChange={(event) => setResultForm({ ...resultForm, score: event.currentTarget.value })} required type="number" value={resultForm.score} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Grade
                <input className="form-input mt-1" onChange={(event) => setResultForm({ ...resultForm, grade: event.currentTarget.value })} value={resultForm.grade} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Semester
                <input className="form-input mt-1" onChange={(event) => setResultForm({ ...resultForm, semester: event.currentTarget.value })} placeholder="e.g. 2026/2027 - First semester" value={resultForm.semester} />
              </label>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                <button className="rounded-md bg-primary-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={saveResult.isPending} type="submit">
                  {saveResult.isPending ? "Saving…" : editingResultId ? "Update result" : "Add result"}
                </button>
                {editingResultId && (
                  <button className="rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700" onClick={() => { setEditingResultId(null); setResultForm(emptyResult); }} type="button">
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
            {recordsQuery.data.results.length ? (
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {recordsQuery.data.results.map((result) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 p-4" key={result.id}>
                    <div>
                      <p className="font-semibold text-slate-900">{result.course}</p>
                      <p className="text-sm text-slate-600">
                        {result.semester ?? "Semester not specified"} · Score {result.score} · Grade {result.grade ?? "—"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => startEditingResult(result)} type="button">Edit</button>
                      <button className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700" disabled={deleteResult.isPending} onClick={() => deleteResult.mutate(result)} type="button">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No results have been entered for this student.</EmptyState>
            )}
          </section>

          <section className="space-y-4" aria-labelledby="fee-management-heading">
            <h2 className="text-xl font-bold text-slate-900" id="fee-management-heading">Fees</h2>
            <form
              className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                setMessage(null);
                saveFee.mutate();
              }}
            >
              <label className="text-sm font-medium text-slate-700">
                Description
                <input className="form-input mt-1" onChange={(event) => setFeeForm({ ...feeForm, description: event.currentTarget.value })} required value={feeForm.description} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Amount due
                <input className="form-input mt-1" min="0" onChange={(event) => setFeeForm({ ...feeForm, amount_due: event.currentTarget.value })} required type="number" value={feeForm.amount_due} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Amount paid
                <input className="form-input mt-1" min="0" onChange={(event) => setFeeForm({ ...feeForm, amount_paid: event.currentTarget.value })} required type="number" value={feeForm.amount_paid} />
              </label>
              <div className="flex gap-2 sm:col-span-3">
                <button className="rounded-md bg-primary-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={saveFee.isPending} type="submit">
                  {saveFee.isPending ? "Saving…" : editingFeeId ? "Update fee" : "Add fee"}
                </button>
                {editingFeeId && (
                  <button className="rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700" onClick={() => { setEditingFeeId(null); setFeeForm(emptyFee); }} type="button">
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
            {recordsQuery.data.fees.length ? (
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {recordsQuery.data.fees.map((fee) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 p-4" key={fee.id}>
                    <div>
                      <p className="font-semibold text-slate-900">{fee.description}</p>
                      <p className="text-sm text-slate-600">
                        Due {formatAmount(fee.amount_due)} · Paid {formatAmount(fee.amount_paid)} · Balance {formatAmount(fee.amount_due - fee.amount_paid)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => startEditingFee(fee)} type="button">Edit</button>
                      <button className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700" disabled={deleteFee.isPending} onClick={() => deleteFee.mutate(fee)} type="button">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No fee records have been entered for this student.</EmptyState>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function EmptyState({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">{children}</p>;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(value));
}
