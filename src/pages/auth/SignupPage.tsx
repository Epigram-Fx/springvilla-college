import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard } from "../../components/AuthCard";
import { AuthSubmitButton } from "../../components/AuthSubmitButton";
import { FormField } from "../../components/FormField";
import { FormMessage } from "../../components/FormMessage";
import { getSupabaseClient } from "../../lib/supabase";

function isAtLeast15(dateOfBirth: string): boolean {
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  const today = new Date();
  const threshold = new Date(
    today.getFullYear() - 15,
    today.getMonth(),
    today.getDate()
  );
  return Number.isFinite(dob.getTime()) && dob <= threshold;
}

function getLatestEligibleDateOfBirth(): string {
  const today = new Date();
  const date = new Date(
    today.getFullYear() - 15,
    today.getMonth(),
    today.getDate()
  );
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

const phoneSchema = z
  .string()
  .trim()
  .transform((phone) => phone.replace(/[\s()-]/g, ""))
  .refine(
    (phone) => /^(?:\+234[789][01]\d{8}|0[789][01]\d{8})$/.test(phone),
    "Enter a valid Nigerian mobile number, such as +2348012345678 or 08012345678."
  )
  .transform((phone) => (phone.startsWith("0") ? `+234${phone.slice(1)}` : phone));

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name."),
    email: z.string().trim().email("Enter a valid email address."),
    phone: phoneSchema,
    dateOfBirth: z
      .string()
      .date("Enter a valid date of birth.")
      .refine(isAtLeast15, "Applicants must be at least 15 years old."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string()
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match."
  });

type Values = z.infer<typeof schema>;

export function SignupPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function submit({ fullName, email, phone, dateOfBirth, password }: Values) {
    setServerError(null);
    try {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone,
            date_of_birth: dateOfBirth
          },
          emailRedirectTo: `${window.location.origin}/`
        }
      });
      if (error) throw error;
      if (data.session) {
        navigate("/", { replace: true });
      } else {
        setConfirmationSent(true);
      }
    } catch (cause) {
      setServerError(
        cause instanceof Error ? cause.message : "Unable to create your account."
      );
    }
  }

  return (
    <AuthCard
      title={confirmationSent ? "Check your email" : "Create your applicant account"}
      description={
        confirmationSent
          ? "We sent a verification link to your email. Confirm your address before signing in."
          : "Your account is created with the student role. Admin accounts are managed by the school."
      }
    >
      {confirmationSent ? (
        <div className="mt-6">
          <FormMessage kind="success">Email verification is required before you can continue.</FormMessage>
          <Link className="mt-5 inline-block text-sm font-semibold text-primary-800 hover:underline" to="/login">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(submit)} noValidate>
          {serverError && <FormMessage>{serverError}</FormMessage>}
          <FormField error={errors.fullName?.message} label="Full name">
            <input autoComplete="name" className="form-input" {...register("fullName")} />
          </FormField>
          <FormField error={errors.email?.message} label="Email address">
            <input autoComplete="email" className="form-input" type="email" {...register("email")} />
          </FormField>
          <FormField error={errors.phone?.message} label="Phone number">
            <input
              autoComplete="tel"
              className="form-input"
              inputMode="tel"
              placeholder="+2348012345678"
              type="tel"
              {...register("phone")}
            />
          </FormField>
          <FormField error={errors.dateOfBirth?.message} label="Date of birth">
            <input
              autoComplete="bday"
              className="form-input"
              max={getLatestEligibleDateOfBirth()}
              type="date"
              {...register("dateOfBirth")}
            />
          </FormField>
          <FormField error={errors.password?.message} label="Password">
            <input
              autoComplete="new-password"
              className="form-input"
              type="password"
              {...register("password")}
            />
          </FormField>
          <FormField error={errors.confirmPassword?.message} label="Confirm password">
            <input
              autoComplete="new-password"
              className="form-input"
              type="password"
              {...register("confirmPassword")}
            />
          </FormField>
          <AuthSubmitButton loading={isSubmitting}>Create account</AuthSubmitButton>
        </form>
      )}
      {!confirmationSent && (
        <p className="mt-6 text-center text-sm text-slate-600">
          Already registered?{" "}
          <Link className="font-semibold text-primary-800 hover:underline" to="/login">
            Sign in
          </Link>
        </p>
      )}
    </AuthCard>
  );
}
