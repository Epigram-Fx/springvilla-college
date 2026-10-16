import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { FormMessage } from "../../components/FormMessage";
import { useToast } from "../../components/ToastProvider";
import { getSupabaseClient } from "../../lib/supabase";
import type { Database } from "../../types/database";

type Announcement = Database["public"]["Tables"]["announcements"]["Row"];

export function AnnouncementsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "success" } | null>(null);

  const announcementsQuery = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const saveAnnouncement = useMutation({
    mutationFn: async () => {
      const cleanTitle = title.trim();
      const cleanBody = body.trim();
      if (!cleanTitle || !cleanBody) throw new Error("Enter both a title and announcement text.");
      const client = getSupabaseClient();
      const result = editingId
        ? await client
            .from("announcements")
            .update({ title: cleanTitle, body: cleanBody })
            .eq("id", editingId)
        : await client
            .from("announcements")
            .insert({ title: cleanTitle, body: cleanBody, created_by: user?.id ?? null });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      setTitle("");
      setBody("");
      setEditingId(null);
      setMessage({ text: "Announcement saved and recorded in the audit log.", kind: "success" });
      showToast("success", "Announcement saved.");
      await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      await queryClient.invalidateQueries({ queryKey: ["student-overview"] });
    },
    onError: (error) => {
      const text = error instanceof Error ? error.message : "Could not save announcement.";
      setMessage({ text, kind: "error" });
      showToast("error", text);
    }
  });

  const deleteAnnouncement = useMutation({
    mutationFn: async (announcement: Announcement) => {
      if (!window.confirm(`Delete the announcement “${announcement.title}”?`)) return false;
      const { error } = await getSupabaseClient()
        .from("announcements")
        .delete()
        .eq("id", announcement.id);
      if (error) throw error;
      return true;
    },
    onSuccess: async (deleted) => {
      if (!deleted) return;
      setMessage({ text: "Announcement deleted and recorded in the audit log.", kind: "success" });
      showToast("success", "Announcement deleted.");
      await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      await queryClient.invalidateQueries({ queryKey: ["student-overview"] });
    },
    onError: (error) => {
      const text = error instanceof Error ? error.message : "Could not delete announcement.";
      setMessage({ text, kind: "error" });
      showToast("error", text);
    }
  });

  function editAnnouncement(announcement: Announcement) {
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setBody(announcement.body);
    setMessage(null);
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary-700">Registrar</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Announcements</h1>
        <p className="mt-2 text-sm text-slate-600">
          Notices appear on the dashboard of active admitted students.
        </p>
      </header>

      <form
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          saveAnnouncement.mutate();
        }}
      >
        <label className="block text-sm font-medium text-slate-700">
          Notice title
          <input
            className="form-input mt-1"
            maxLength={160}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
            value={title}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Notice
          <textarea
            className="form-input mt-1 min-h-36"
            onChange={(event) => setBody(event.currentTarget.value)}
            required
            rows={5}
            value={body}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md bg-primary-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={saveAnnouncement.isPending}
            type="submit"
          >
            {saveAnnouncement.isPending
              ? "Saving…"
              : editingId
                ? "Update announcement"
                : "Post announcement"}
          </button>
          {editingId && (
            <button
              className="rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700"
              onClick={() => {
                setEditingId(null);
                setTitle("");
                setBody("");
              }}
              type="button"
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
      {announcementsQuery.isPending ? (
        <p className="py-8 text-slate-600">Loading announcements…</p>
      ) : announcementsQuery.isError ? (
        <FormMessage>{announcementsQuery.error.message}</FormMessage>
      ) : announcementsQuery.data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No announcements have been posted.
        </p>
      ) : (
        <ul className="space-y-3">
          {announcementsQuery.data.map((announcement) => (
            <li className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={announcement.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900">{announcement.title}</h2>
                  <time className="mt-1 block text-xs text-slate-500" dateTime={announcement.created_at}>
                    {new Date(announcement.created_at).toLocaleString()}
                  </time>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                    onClick={() => editAnnouncement(announcement)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700"
                    disabled={deleteAnnouncement.isPending}
                    onClick={() => deleteAnnouncement.mutate(announcement)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{announcement.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
