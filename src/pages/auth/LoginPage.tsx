import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard } from "../../components/AuthCard";
import { AuthSubmitButton } from "../../components/AuthSubmitButton";
import { FormField } from "../../components/FormField";
import { FormMessage } from "../../components/FormMessage";
import { getSupabaseClient } from "../../lib/supabase";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.")
});

type Values = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function submit(values: Values) {
    setServerError(null);
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword(values);
      if (error) throw error;
      const requestedPath = (location.state as { from?: { pathname?: string } } | null)
        ?.from?.pathname;
      const destination =
        requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
          ? requestedPath
          : "/";
      navigate(destination, { replace: true });
    } catch (cause) {
      setServerError(
        cause instanceof Error ? cause.message : "Unable to sign in. Please try again."
      );
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to continue to your SpringVilla admissions portal."
    >
      <form className="mt-6 space-y-4" onSubmit={handleSubmit(submit)} noValidate>
        {serverError && <FormMessage>{serverError}</FormMessage>}
        <FormField error={errors.email?.message} label="Email address">
          <input
            autoComplete="email"
            className="form-input"
            type="email"
            {...register("email")}
          />
        </FormField>
        <FormField error={errors.password?.message} label="Password">
          <input
            autoComplete="current-password"
            className="form-input"
            type="password"
            {...register("password")}
          />
        </FormField>
        <div className="text-right">
          <Link className="text-sm font-semibold text-primary-800 hover:underline" to="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <AuthSubmitButton loading={isSubmitting}>Sign in</AuthSubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        New applicant?{" "}
        <Link className="font-semibold text-primary-800 hover:underline" to="/signup">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
