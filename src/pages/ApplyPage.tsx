import { useEffect, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../auth/AuthProvider";
import { AuthSubmitButton } from "../components/AuthSubmitButton";
import { FormField } from "../components/FormField";
import { FormMessage } from "../components/FormMessage";
import { getSupabaseClient } from "../lib/supabase";

const MAX_PHOTO_SIZE = 2 * 1024 * 1024;
const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;
const MAX_DOCUMENT_COUNT = 10;
const PHOTO_TYPES = ["image/jpeg", "image/png"];
const DOCUMENT_TYPES = ["application/pdf", ...PHOTO_TYPES];

const schema = z.object({
  previousSchool: z.string().trim().min(2, "Enter the name of your previous school.")
});

type FormValues = z.infer<typeof schema>;
type UploadDocument = { id: string; file: File; progress: number };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function validateFile(
  file: File,
  acceptedTypes: string[],
  maxSize: number,
  label: string
): string | null {
  if (!acceptedTypes.includes(file.type)) {
    return `${label} must be ${acceptedTypes
      .map((type) => (type.split("/")[1] ?? type).toUpperCase())
      .join(", ")}.`;
  }
  if (file.size > maxSize) {
    return `${label} must be no larger than ${maxSize / (1024 * 1024)} MB.`;
  }
  return null;
}

function getExtension(file: File): string {
  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "application/pdf":
      return "pdf";
    default:
      throw new Error("Unsupported file type.");
  }
}

function uploadWithProgress(
  bucket: "passport-photos" | "application-documents",
  file: File,
  userId: string,
  onProgress: (progress: number) => void
): Promise<string> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return Promise.reject(new Error("Supabase is not configured."));
  }

  const path = `${userId}/${crypto.randomUUID()}.${getExtension(file)}`;
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return getSupabaseClient().auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error("Your session expired. Please sign in again.");

    return new Promise<string>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `${url.replace(/\/$/, "")}/storage/v1/object/${bucket}/${encodedPath}`);
      request.setRequestHeader("apikey", anonKey);
      request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      request.setRequestHeader("Content-Type", file.type);
      request.setRequestHeader("x-upsert", "false");
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
      request.addEventListener("load", () => {
        if (request.status >= 200 && request.status < 300) {
          onProgress(100);
          resolve(path);
          return;
        }
        let message = `File upload failed (${request.status}).`;
        try {
          const body: unknown = JSON.parse(request.responseText);
          if (
            body &&
            typeof body === "object" &&
            "message" in body &&
            typeof body.message === "string"
          ) {
            message = body.message;
          }
        } catch {
          if (request.responseText) message = request.responseText;
        }
        reject(new Error(message));
      });
      request.addEventListener("error", () => reject(new Error("Network error while uploading file.")));
      request.addEventListener("abort", () => reject(new Error("File upload was cancelled.")));
      request.send(file);
    });
  });
}

export function ApplyPage() {
  const { profile, user, application, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reapplying = searchParams.get("reapply") === "1";
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);
  const [documents, setDocuments] = useState<UploadDocument[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(photo);
    setPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [photo]);

  const sessionsQuery = useQuery({
    queryKey: ["application-session", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Sign in to submit an application.");
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();
      const [openResult, nextResult, applicationsResult] = await Promise.all([
        supabase
          .from("sessions")
          .select("id, name, opens_at, closes_at")
          .lte("opens_at", now)
          .gte("closes_at", now)
          .order("opens_at", { ascending: false })
          .limit(50),
        supabase
          .from("sessions")
          .select("id, name, opens_at, closes_at")
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
      return {
        openSessions: openResult.data,
        appliedSessionIds: applicationsResult.data.map((item) => item.session_id),
        nextSession: nextResult.data
      };
    },
    enabled: Boolean(user)
  });

  const openSessions = sessionsQuery.data?.openSessions ?? [];
  const appliedSessionIds = sessionsQuery.data?.appliedSessionIds ?? [];
  const activeSession =
    openSessions.find((session) => !appliedSessionIds.includes(session.id)) ?? null;
  const hasAppliedToOpenSession = openSessions.some((session) =>
    appliedSessionIds.includes(session.id)
  );

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    setFileError(null);
    setPhotoProgress(null);
    if (!file) return;
    const error = validateFile(file, PHOTO_TYPES, MAX_PHOTO_SIZE, "Passport photo");
    if (error) {
      setPhoto(null);
      setFileError(error);
      return;
    }
    setPhoto(file);
  }

  function chooseDocuments(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setFileError(null);
    if (!selectedFiles.length) return;

    for (const file of selectedFiles) {
      const error = validateFile(
        file,
        DOCUMENT_TYPES,
        MAX_DOCUMENT_SIZE,
        file.name
      );
      if (error) {
        setFileError(error);
        return;
      }
    }
    if (documents.length + selectedFiles.length > MAX_DOCUMENT_COUNT) {
      setFileError(`Upload no more than ${MAX_DOCUMENT_COUNT} supporting documents.`);
      return;
    }
    setDocuments((current) => [
      ...current,
      ...selectedFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: 0
      }))
    ]);
  }

  function removeDocument(id: string) {
    setDocuments((current) => current.filter((document) => document.id !== id));
    setFileError(null);
  }

  async function submit({ previousSchool }: FormValues) {
    setFileError(null);
    setSubmitError(null);
    if (!user) {
      setSubmitError("Your session has expired. Please sign in again.");
      return;
    }
    if (!activeSession) {
      setSubmitError("Admissions are closed. Please try again when the next session opens.");
      return;
    }
    if (!photo) {
      setFileError("Choose a passport photo before submitting.");
      return;
    }
    if (documents.length === 0) {
      setFileError("Upload at least one supporting result document.");
      return;
    }

    const uploadedPhotoPaths: string[] = [];
    const uploadedDocumentPaths: string[] = [];
    const supabase = getSupabaseClient();
    setPhotoProgress(0);
    try {
      const photoPath = await uploadWithProgress(
        "passport-photos",
        photo,
        user.id,
        setPhotoProgress
      );
      uploadedPhotoPaths.push(photoPath);

      for (const document of documents) {
        const documentPath = await uploadWithProgress(
          "application-documents",
          document.file,
          user.id,
          (progress) =>
            setDocuments((current) =>
              current.map((item) =>
                item.id === document.id ? { ...item, progress } : item
              )
            )
        );
        uploadedDocumentPaths.push(documentPath);
      }

      const { data: applicationId, error } = await supabase.rpc("submit_application", {
        p_session_id: activeSession.id,
        p_previous_school: previousSchool,
        p_passport_photo_path: photoPath,
        p_document_paths: uploadedDocumentPaths
      });
      if (error) throw error;
      if (!applicationId) throw new Error("The application was not saved. Please try again.");

      void supabase.functions
        .invoke("send-notification", {
          body: { type: "registered", application_id: applicationId }
        })
        .then(({ error: emailError }) => {
          if (emailError) {
            console.error("Application submitted, but registration email failed.", emailError);
          }
        })
        .catch((emailError: unknown) => {
          console.error("Application submitted, but registration email failed.", emailError);
        });

      await refresh();
      navigate("/status", { replace: true });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Your application could not be submitted.";
      setSubmitError(message);

      if (uploadedPhotoPaths.length) {
        const { error } = await supabase.storage
          .from("passport-photos")
          .remove(uploadedPhotoPaths);
        if (error) console.error("Could not remove an orphaned passport upload.", error);
      }
      if (uploadedDocumentPaths.length) {
        const { error } = await supabase.storage
          .from("application-documents")
          .remove(uploadedDocumentPaths);
        if (error) console.error("Could not remove orphaned supporting uploads.", error);
      }
      setPhotoProgress(null);
      setDocuments((current) =>
        current.map((document) => ({ ...document, progress: 0 }))
      );
    }
  }

  if (sessionsQuery.isPending) {
    return <p className="mx-auto max-w-3xl px-5 py-12 text-slate-600">Checking admission sessions…</p>;
  }
  if (sessionsQuery.isError) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <FormMessage>
          {`Could not load admission sessions: ${sessionsQuery.error.message}`}
        </FormMessage>
      </main>
    );
  }
  if (!activeSession) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">
            {hasAppliedToOpenSession
              ? "Application already submitted"
              : "Admissions are closed"}
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            {hasAppliedToOpenSession
              ? "You have already applied to the currently open admission session."
              : sessionsQuery.data.nextSession
                ? `The next admission window opens on ${formatDate(sessionsQuery.data.nextSession.opens_at)}.`
                : "The next admission window has not been announced yet."}
          </p>
          {application && (
            <Link
              className="mt-6 inline-block font-semibold text-primary-800 hover:underline"
              to="/status"
            >
              Return to application status
            </Link>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-12">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">
          {reapplying ? "New application" : "Admission application"}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          {reapplying ? "Apply for a new session" : `Welcome, ${profile?.full_name}`}
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          Applying for <strong>{activeSession.name}</strong>. Your application
          will be saved as a new record for this session.
        </p>
        {submitError && <div className="mt-5"><FormMessage>{submitError}</FormMessage></div>}
        {fileError && <div className="mt-5"><FormMessage>{fileError}</FormMessage></div>}

        <form className="mt-7 space-y-6" onSubmit={handleSubmit(submit)} noValidate>
          <FormField error={errors.previousSchool?.message} label="Previous school">
            <input
              autoComplete="organization"
              className="form-input"
              disabled={isSubmitting}
              {...register("previousSchool")}
            />
          </FormField>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-700">
              Passport photo <span className="font-normal text-slate-500">(JPG or PNG, up to 2 MB)</span>
            </legend>
            <input
              accept="image/jpeg,image/png"
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:font-semibold file:text-primary-800 hover:file:bg-primary-100"
              disabled={isSubmitting}
              onChange={choosePhoto}
              type="file"
            />
            {photo && (
              <div className="flex items-center gap-4 rounded-lg bg-slate-50 p-3">
                {photoPreview && (
                  <img
                    alt="Passport photo preview"
                    className="h-20 w-20 rounded-md object-cover"
                    src={photoPreview}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{photo.name}</p>
                  {photoProgress !== null && (
                    <UploadProgress progress={photoProgress} label="Passport photo" />
                  )}
                </div>
                <button
                  className="text-sm font-semibold text-red-700 hover:underline"
                  disabled={isSubmitting}
                  onClick={() => {
                    setPhoto(null);
                    setPhotoProgress(null);
                  }}
                  type="button"
                >
                  Remove
                </button>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-700">
              Result documents <span className="font-normal text-slate-500">(PDF, JPG or PNG, up to 5 MB each)</span>
            </legend>
            <input
              accept="application/pdf,image/jpeg,image/png"
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:font-semibold file:text-primary-800 hover:file:bg-primary-100"
              disabled={isSubmitting || documents.length >= MAX_DOCUMENT_COUNT}
              multiple
              onChange={chooseDocuments}
              type="file"
            />
            {documents.length > 0 && (
              <ul className="space-y-2">
                {documents.map((document) => (
                  <li
                    className="flex items-center gap-3 rounded-lg bg-slate-50 p-3"
                    key={document.id}
                  >
                    <span aria-hidden="true" className="text-primary-700">▤</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {document.file.name}
                      </p>
                      {isSubmitting && (
                        <UploadProgress
                          label={document.file.name}
                          progress={document.progress}
                        />
                      )}
                    </div>
                    <button
                      className="text-sm font-semibold text-red-700 hover:underline"
                      disabled={isSubmitting}
                      onClick={() => removeDocument(document.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500">
              Upload at least one document, up to {MAX_DOCUMENT_COUNT} files.
            </p>
          </fieldset>

          <AuthSubmitButton loading={isSubmitting}>Submit application</AuthSubmitButton>
        </form>
      </section>
    </main>
  );
}

function UploadProgress({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{progress < 100 ? "Uploading" : "Uploaded"}</span>
        <span>{progress}%</span>
      </div>
      <progress
        aria-label={`Uploading ${label}`}
        className="h-2 w-full accent-primary-700"
        max={100}
        value={progress}
      />
    </div>
  );
}
