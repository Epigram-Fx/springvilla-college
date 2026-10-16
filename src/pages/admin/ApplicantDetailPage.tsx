import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormMessage } from "../../components/FormMessage";
import { getSupabaseClient } from "../../lib/supabase";
import type { Database } from "../../types/database";
import { StatusBadge } from "./ApplicantsPage";

type Application = Database["public"]["Tables"]["applications"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Session = Database["public"]["Tables"]["sessions"]["Row"];
type Department = Database["public"]["Tables"]["departments"]["Row"];
type Document = Database["public"]["Tables"]["application_documents"]["Row"];
type ApplicantDetails = {
  application: Application;
  profile: Profile;
  email: string | null;
  session: Session;
  documents: Array<Document & { url: string }>;
  photoUrl: string | null;
};

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("below the cut off")) {
    return "The score is below this session's cut off. An application cannot be approved.";
  }
  if (message.includes("Application already decided")) {
    return "This application has already been decided. Refresh to see the latest status.";
  }
  if (message.includes("Not allowed")) {
    return "Your account does not have permission to decide applications.";
  }
  return message;
}

export function ApplicantDetailPage() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [score, setScore] = useState("");
  const [remarks, setRemarks] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [decision, setDecision] = useState<"admit" | "reject" | null>(null);

  const detailQuery = useQuery({
    queryKey: ["admin-applicant", applicationId],
    enabled: Boolean(applicationId),
    queryFn: async (): Promise<ApplicantDetails> => {
      if (!applicationId) throw new Error("Application id is missing.");
      const supabase = getSupabaseClient();
      const { data: application, error: applicationError } = await supabase
        .from("applications")
        .select("*")
        .eq("id", applicationId)
        .single();
      if (applicationError) throw applicationError;

      const [profileResult, sessionResult, documentsResult, emailResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", application.user_id).single(),
        supabase.from("sessions").select("*").eq("id", application.session_id).single(),
        supabase
          .from("application_documents")
          .select("*")
          .eq("application_id", application.id)
          .order("created_at"),
        supabase.rpc("admin_applicant_email_lookup", {
          p_user_ids: [application.user_id]
        })
      ]);
      if (profileResult.error) throw profileResult.error;
      if (sessionResult.error) throw sessionResult.error;
      if (documentsResult.error) throw documentsResult.error;
      if (emailResult.error) throw emailResult.error;

      const photoUrlResult = profileResult.data.photo_path
        ? await supabase.storage
            .from("passport-photos")
            .createSignedUrl(profileResult.data.photo_path, 600)
        : null;
      if (photoUrlResult?.error) throw photoUrlResult.error;

      const documents = await Promise.all(
        documentsResult.data.map(async (document) => {
          const { data, error } = await supabase.storage
            .from("application-documents")
            .createSignedUrl(document.file_path, 600);
          if (error) throw error;
          return { ...document, url: data.signedUrl };
        })
      );

      return {
        application,
        profile: profileResult.data,
        email: emailResult.data[0]?.email ?? null,
        session: sessionResult.data,
        documents,
        photoUrl: photoUrlResult?.data.signedUrl ?? null
      };
    }
  });

  const departmentsQuery = useQuery({
    queryKey: ["admin-departments"],
    queryFn: async (): Promise<Pick<Department, "id" | "name">[]> => {
      const { data, error } = await getSupabaseClient()
        .from("departments")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    }
  });

  const decisionMutation = useMutation({
    mutationFn: async (choice: "admit" | "reject") => {
      if (!applicationId || !detailQuery.data) {
        throw new Error("Application details are unavailable.");
      }
      const numericScore = Number(score);
      if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
        throw new Error("Enter a score between 0 and 100.");
      }
      if (choice === "admit" && numericScore < detailQuery.data.session.cutoff_mark) {
        throw new Error(
          `Score ${numericScore} is below the cut off mark of ${detailQuery.data.session.cutoff_mark}.`
        );
      }
      const { error } = await getSupabaseClient().rpc("decide_application", {
        p_application_id: applicationId,
        p_score: numericScore,
        p_decision: choice,
        p_remarks: remarks.trim() || null,
        p_department_id: choice === "admit" ? departmentId || null : null
      });
      if (error) throw error;
      void getSupabaseClient().functions
        .invoke("send-notification", {
          body: {
            type: choice === "admit" ? "admitted" : "not_eligible",
            application_id: applicationId
          }
        })
        .then(({ error: emailError }) => {
          if (emailError) {
            console.error("Decision saved, but applicant email failed.", emailError);
          }
        })
        .catch((emailError: unknown) => {
          console.error("Decision saved, but applicant email failed.", emailError);
        });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-applicant", applicationId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-applicants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] })
      ]);
      setDecision(null);
      navigate("/admin/applicants", { replace: true });
    }
  });

  if (detailQuery.isPending) {
    return <p className="py-10 text-slate-600">Loading applicant details…</p>;
  }
  if (detailQuery.isError) {
    return (
      <section>
        <Link className="font-semibold text-primary-800 hover:underline" to="/admin/applicants">← Applicants</Link>
        <p className="mt-6 text-red-700" role="alert">Could not load applicant: {detailQuery.error.message}</p>
      </section>
    );
  }

  const { application, profile, email, session, documents, photoUrl } = detailQuery.data;
  const numericScore = score === "" ? null : Number(score);
  const scoreIsValid =
    numericScore !== null &&
    Number.isFinite(numericScore) &&
    numericScore >= 0 &&
    numericScore <= 100;
  const belowCutoff =
    scoreIsValid && numericScore !== null && numericScore < session.cutoff_mark;
  const canDecide = application.status === "pending";

  return (
    <section className="mx-auto max-w-5xl">
      <Link className="font-semibold text-primary-800 hover:underline" to="/admin/applicants">← Back to applicants</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">Applicant review</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{profile.full_name}</h1>
          <p className="mt-1 text-slate-600">{email ?? "Email unavailable"}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-6">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">Applicant profile</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Info label="Phone" value={profile.phone ?? "Not provided"} />
              <Info label="Date of birth" value={profile.date_of_birth ?? "Not provided"} />
              <Info label="Previous school" value={application.previous_school} />
              <Info label="Session" value={session.name} />
              <Info label="Submitted" value={new Date(application.submitted_at).toLocaleString()} />
            </dl>
            {photoUrl ? (
              <a className="mt-5 inline-block" href={photoUrl} rel="noreferrer" target="_blank">
                <img
                  alt={`Passport photo of ${profile.full_name}`}
                  className="h-36 w-36 rounded-lg border border-slate-200 object-cover"
                  src={photoUrl}
                />
                <span className="mt-1 block text-sm font-semibold text-primary-800">Open passport photo</span>
              </a>
            ) : (
              <p className="mt-5 text-sm text-slate-500">No passport photo uploaded.</p>
            )}
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">Supporting documents</h2>
            {documents.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No supporting documents found.</p>
            ) : (
              <ul className="mt-4 space-y-5">
                {documents.map((document) => {
                  const isPdf = document.file_path.toLowerCase().endsWith(".pdf");
                  const isImage = /\.(jpe?g|png)$/i.test(document.file_path);
                  return (
                    <li className="rounded-lg border border-slate-200 p-3" key={document.id}>
                      <a
                        className="font-semibold text-primary-800 hover:underline"
                        href={document.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open {document.doc_type} document
                      </a>
                      {isImage && (
                        <img
                          alt={`${document.doc_type} document preview`}
                          className="mt-3 max-h-80 max-w-full rounded-md object-contain"
                          src={document.url}
                        />
                      )}
                      {isPdf && (
                        <iframe
                          className="mt-3 h-96 w-full rounded-md border border-slate-200"
                          src={document.url}
                          title={`${document.doc_type} PDF preview`}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-900">Review decision</h2>
          <p className="mt-3 rounded-lg bg-primary-50 p-3 text-sm text-primary-900">
            Session cut off: <strong>{session.cutoff_mark}</strong> / 100
          </p>
          {application.status !== "pending" && (
            <p className="mt-4 text-sm text-slate-600">
              This application has a final decision. Its cut off snapshot is{" "}
              <strong>{application.cutoff_at_decision ?? "not recorded"}</strong>.
            </p>
          )}
          {decisionMutation.isError && (
            <div className="mt-4"><FormMessage>{readableError(decisionMutation.error)}</FormMessage></div>
          )}
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Score</span>
              <input
                className="form-input"
                disabled={!canDecide || decisionMutation.isPending}
                max="100"
                min="0"
                onChange={(event) => setScore(event.target.value)}
                type="number"
                value={score}
              />
            </label>
            {belowCutoff && (
              <p className="text-sm font-medium text-red-700" role="alert">
                Score is below the cut off. Approve is disabled; you may reject this application.
              </p>
            )}
            {score !== "" && !scoreIsValid && (
              <p className="text-sm text-red-700" role="alert">Enter a score from 0 to 100.</p>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Department</span>
              <select
                className="form-input"
                disabled={!canDecide || decisionMutation.isPending}
                onChange={(event) => setDepartmentId(event.target.value)}
                value={departmentId}
              >
                <option value="">Select department (optional)</option>
                {(departmentsQuery.data ?? []).map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </label>
            {departmentsQuery.isError && (
              <p className="text-sm text-red-700" role="alert">
                Could not load departments: {departmentsQuery.error.message}
              </p>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Remarks</span>
              <textarea
                className="form-input min-h-28 resize-y"
                disabled={!canDecide || decisionMutation.isPending}
                onChange={(event) => setRemarks(event.target.value)}
                value={remarks}
              />
            </label>
            {canDecide && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  className="rounded-md bg-primary-700 px-3 py-3 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!scoreIsValid || belowCutoff || decisionMutation.isPending}
                  onClick={() => setDecision("admit")}
                  type="button"
                >
                  Approve
                </button>
                <button
                  className="rounded-md border border-red-300 px-3 py-3 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                  disabled={!scoreIsValid || decisionMutation.isPending}
                  onClick={() => setDecision("reject")}
                  type="button"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {decision && (
        <div
          aria-labelledby="decision-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-slate-900" id="decision-title">
              Confirm {decision === "admit" ? "approval" : "rejection"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This decision is final. {decision === "admit"
                ? `Approve ${profile.full_name} with score ${score}?`
                : `Mark ${profile.full_name} as not eligible with score ${score}?`}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700"
                disabled={decisionMutation.isPending}
                onClick={() => setDecision(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-primary-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
                disabled={decisionMutation.isPending}
                onClick={() => decisionMutation.mutate(decision)}
                type="button"
              >
                {decisionMutation.isPending ? "Saving…" : `Confirm ${decision}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-900">{value}</dd>
    </div>
  );
}
