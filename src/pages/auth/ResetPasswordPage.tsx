import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../../auth/AuthProvider";
import { AuthCard } from "../../components/AuthCard";
import { AuthSubmitButton } from "../../components/AuthSubmitButton";
import { FormField } from "../../components/FormField";
import { FormMessage } from "../../components/FormMessage";
import { getSupabaseClient } from "../../lib/supabase";

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string()
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match."
  });
type Values = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function submit({ password }: Values) {
    setServerError(null);
    try {
      const { error } = await getSupabaseClient().auth.updateUser({ password });
      if (error) throw error;
      setUpdated(true);
      window.setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (cause) {
      setServerError(
        cause instanceof Error ? cause.message : "Unable to update your password."
      );
    }
  }

  return (
    <AuthCard title="Choose a new password" description="Set a new password for your account.">
      {loading ? (
        <p className="mt-6 text-sm text-slate-600">Verifying your reset link…</p>
      ) : !user ? (
        <div className="mt-6 space-y-4">
          <FormMessage>Your reset link is invalid or expired. Request a new link to continue.</FormMessage>
          <Link className="font-semibold text-primary-800 hover:underline" to="/forgot-password">
            Request another link
          </Link>
        </div>
      ) : updated ? (
        <div className="mt-6 space-y-4">
          <FormMessage kind="success">Password updated. Redirecting to your portal…</FormMessage>
          <Link className="font-semibold text-primary-800 hover:underline" to="/">
            Continue
          </Link>
        </div>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(submit)} noValidate>
          {serverError && <FormMessage>{serverError}</FormMessage>}
          <FormField error={errors.password?.message} label="New password">
            <input
              autoComplete="new-password"
              className="form-input"
              type="password"
              {...register("password")}
            />
          </FormField>
          <FormField error={errors.confirmPassword?.message} label="Confirm new password">
            <input
              autoComplete="new-password"
              className="form-input"
              type="password"
              {...register("confirmPassword")}
            />
          </FormField>
          <AuthSubmitButton loading={isSubmitting}>Update password</AuthSubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
