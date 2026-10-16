import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabaseClient } from "../lib/supabase";

export function LogoutButton({ inverse = false }: { inverse?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function logout() {
    setError(null);
    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut();
      if (signOutError) throw signOutError;
      navigate("/login", { replace: true });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to sign out. Please try again."
      );
    }
  }

  return (
    <span>
      <button
        className={`text-sm font-semibold ${
          inverse ? "text-green-100 hover:text-white" : "text-slate-600 hover:text-primary-800"
        }`}
        onClick={() => void logout()}
        type="button"
      >
        Sign out
      </button>
      {error && (
        <span className="ml-2 text-xs text-red-700" role="alert">
          Sign out failed: {error}
        </span>
      )}
    </span>
  );
}
