import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormMessage } from "../../components/FormMessage";
import { useAuth } from "../../auth/AuthProvider";
import { getSupabaseClient } from "../../lib/supabase";
import type { AppRole } from "../../types/database";

type AdminRole = Exclude<AppRole, "student">;
type AdminAccount = {
  id: string;
  email: string | null;
  full_name: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
};

const adminRoles: AdminRole[] = [
  "admissions_officer",
  "registrar",
  "super_admin"
];

export function AdminAccountsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admissions_officer");
  const [message, setMessage] = useState<{
    text: string;
    kind: "error" | "success";
  } | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_list_accounts");
      if (error) throw error;
      return data;
    }
  });

  const invite = useMutation({
    mutationFn: async () => {
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new Error("Enter a valid email address.");
      }
      const { data, error } = await getSupabaseClient().functions.invoke(
        "create-admin",
        { body: { email: normalizedEmail, role } }
      );
      if (error) throw new Error(await getFunctionError(error));
      if (data?.error) throw new Error(String(data.error));
    },
    onSuccess: async () => {
      setEmail("");
      setMessage({ text: "Administrator invitation sent.", kind: "success" });
      await queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
    },
    onError: (error) => {
      setMessage({
        text: error instanceof Error ? error.message : "Invitation failed.",
        kind: "error"
      });
    }
  });

  const updateAccount = useMutation({
    mutationFn: async ({
      id,
      values
    }: {
      id: string;
      values: { role?: AdminRole; is_active?: boolean };
    }) => {
      const { error } = await getSupabaseClient().rpc("admin_update_account", {
        p_user_id: id,
        p_role: values.role ?? null,
        p_is_active: values.is_active ?? null
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage({ text: "Administrator account updated.", kind: "success" });
      await queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
    },
    onError: (error) => {
      setMessage({
        text: error instanceof Error ? error.message : "Account update failed.",
        kind: "error"
      });
    }
  });

  function setActive(
    account: Pick<AdminAccount, "id" | "full_name"> & { is_active: boolean },
    isActive: boolean
  ) {
    if (!isActive && account.id === user?.id) {
      setMessage({
        text: "You cannot deactivate your own account.",
        kind: "error"
      });
      return;
    }
    const action = isActive ? "reactivate" : "deactivate";
    if (
      !window.confirm(
        `Are you sure you want to ${action} ${account.full_name}'s administrator account?`
      )
    ) {
      return;
    }
    setMessage(null);
    updateAccount.mutate({ id: account.id, values: { is_active: isActive } });
  }

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Admin management</h1>
        <p className="mt-2 text-sm text-slate-600">
          Invite staff, manage their roles and deactivate accounts when access is no longer needed.
        </p>
      </header>

      <form
        className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          invite.mutate();
        }}
      >
        <label className="block text-sm font-medium text-slate-700">
          Staff email
          <input
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Role
          <select
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            onChange={(event) => {
              const selected = adminRoles.find(
                (adminRole) => adminRole === event.currentTarget.value
              );
              if (selected) setRole(selected);
            }}
            value={role}
          >
            {adminRoles.map((adminRole) => (
              <option key={adminRole} value={adminRole}>
                {roleLabel(adminRole)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded-md bg-primary-700 px-4 py-2 font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
          disabled={invite.isPending}
          type="submit"
        >
          {invite.isPending ? "Sending invite…" : "Invite administrator"}
        </button>
      </form>

      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}

      <section aria-labelledby="admins-heading">
        <h2 className="mb-3 text-lg font-semibold text-slate-900" id="admins-heading">
          Administrator accounts
        </h2>
        {accountsQuery.isLoading ? (
          <p className="text-sm text-slate-600">Loading administrator accounts…</p>
        ) : accountsQuery.isError ? (
          <FormMessage>
            {accountsQuery.error instanceof Error
              ? accountsQuery.error.message
              : "Unable to load administrator accounts."}
          </FormMessage>
        ) : !accountsQuery.data?.length ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            No administrator accounts found.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-200">
              {accountsQuery.data.map((account) => (
                <li
                  className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                  key={account.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {account.full_name}
                      {account.id === user?.id && (
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          You
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-slate-600">
                      {account.email ?? "Email unavailable"}
                    </p>
                    <p
                      className={`mt-1 text-xs font-semibold ${
                        account.is_active ? "text-primary-700" : "text-slate-500"
                      }`}
                    >
                      {account.is_active ? "Active" : "Deactivated"}
                    </p>
                  </div>
                  <label className="text-sm text-slate-600">
                    Role
                    <select
                      aria-label={`Role for ${account.full_name}`}
                      className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1"
                      disabled={
                        account.id === user?.id || updateAccount.isPending
                      }
                      onChange={(event) => {
                        const selected = adminRoles.find(
                          (adminRole) => adminRole === event.currentTarget.value
                        );
                        if (!selected) return;
                        setMessage(null);
                        updateAccount.mutate({
                          id: account.id,
                          values: { role: selected }
                        });
                      }}
                      value={account.role}
                    >
                      {adminRoles.map((adminRole) => (
                        <option key={adminRole} value={adminRole}>
                          {roleLabel(adminRole)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={account.id === user?.id || updateAccount.isPending}
                    onClick={() => setActive(account, !account.is_active)}
                    type="button"
                  >
                    {account.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </section>
  );
}

function roleLabel(role: AdminRole): string {
  return role.replaceAll("_", " ").replace(/\b\w/g, (character) =>
    character.toUpperCase()
  );
}

async function getFunctionError(error: { context?: unknown; message: string }) {
  if (error.context instanceof Response) {
    try {
      const body: unknown = await error.context.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
      ) {
        return body.error;
      }
    } catch {
      return error.message;
    }
  }
  return error.message;
}
