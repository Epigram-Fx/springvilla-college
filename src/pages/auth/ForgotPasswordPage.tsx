import { useState } from "react";
import { Link } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard } from "../../components/AuthCard";
import { AuthSubmitButton } from "../../components/AuthSubmitButton";
import { FormField } from "../../components/FormField";
import { FormMessage } from "../../components/FormMessage";
import { getSupabaseClient } from "../../lib/supabase";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address.")
});
type Values = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function submit({ email }: Values) {
    setMessage(null);
    setServerError(null);
    try {
      const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      setMessage("If an account exists for this address, a password reset link has been sent.");
    } catch (cause) {
      setServerError(
        cause instanceof Error ? cause.message : "Unable to send a reset link."
      );
    }
  }

  return (
    <AuthCard title="Reset your password" description="We’ll email you a secure password reset link.">
      <form className="mt-6 space-y-4" onSubmit={handleSubmit(submit)} noValidate>
        {serverError && <FormMessage>{serverError}</FormMessage>}
        {message && <FormMessage kind="success">{message}</FormMessage>}
        <FormField error={errors.email?.message} label="Email address">
          <input autoComplete="email" className="form-input" type="email" {...register("email")} />
        </FormField>
        <AuthSubmitButton loading={isSubmitting}>Send reset link</AuthSubmitButton>
      </form>
      <Link className="mt-6 inline-block text-sm font-semibold text-primary-800 hover:underline" to="/login">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
