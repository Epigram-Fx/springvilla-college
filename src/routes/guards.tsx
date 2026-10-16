import { Navigate, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getStudentHome, isAdminRole, useAuth } from "../auth/AuthProvider";
import { LoadingScreen } from "../components/LoadingScreen";
import { getSupabaseClient } from "../lib/supabase";
import type { AppRole } from "../types/database";

export function PublicOnlyRoute() {
  const { user, profile, application, student, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Outlet />;
  if (!profile) return <AuthDataError />;
  return <Navigate replace to={isAdminRole(profile.role) ? "/admin" : getStudentHome(application, student)} />;
}

export function RequireRole({ allowedRoles }: { allowedRoles?: AppRole[] }) {
  const { user, profile, application, student, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate replace to="/login" state={{ from: location }} />;
  if (!profile) return <AuthDataError />;
  if (!profile.is_active) return <Navigate replace to="/suspended" />;
  if (!isAdminRole(profile.role)) {
    return <Navigate replace to={getStudentHome(application, student)} />;
  }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate replace to="/admin" />;
  }
  return <Outlet />;
}

export function RequireApply() {
  const { user, profile, application, student, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const isReapplying = searchParams.get("reapply") === "1";
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate replace to="/login" />;
  if (!profile) return <AuthDataError />;
  if (isAdminRole(profile.role)) return <Navigate replace to="/admin" />;
  if (!profile.is_active || student?.status === "suspended") {
    return <Navigate replace to="/suspended" />;
  }
  if (student?.status === "active") return <Navigate replace to="/dashboard" />;
  if (application?.status === "admitted") {
    return <Navigate replace to="/admission-support" />;
  }
  if (application && !(isReapplying && application.status === "not_eligible")) {
    return <Navigate replace to="/status" />;
  }
  return <Outlet />;
}

export function RequireApplicant() {
  const { user, profile, application, student, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate replace to="/login" />;
  if (!profile) return <AuthDataError />;
  if (isAdminRole(profile.role)) return <Navigate replace to="/admin" />;
  if (!profile.is_active || student?.status === "suspended") {
    return <Navigate replace to="/suspended" />;
  }
  if (student?.status === "active") return <Navigate replace to="/dashboard" />;
  if (application?.status === "admitted") {
    return <Navigate replace to="/admission-support" />;
  }
  if (!application) return <Navigate replace to="/apply" />;
  return <Outlet />;
}

export function RequireAdmittedStudent() {
  const { user, profile, application, student, loading } = useAuth();
  const statusQuery = useQuery({
    queryKey: ["route-student-status", user?.id, student?.id],
    enabled: Boolean(user && student?.id),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 5_000,
    queryFn: async () => {
      if (!user || !student) return null;
      const { data, error } = await getSupabaseClient()
        .from("students")
        .select("id, status")
        .eq("id", student.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate replace to="/login" />;
  if (!profile) return <AuthDataError />;
  if (isAdminRole(profile.role)) return <Navigate replace to="/admin" />;
  if (!profile.is_active || student?.status === "suspended") {
    return <Navigate replace to="/suspended" />;
  }
  if (student && statusQuery.isPending) return <LoadingScreen />;
  if (student && statusQuery.isError) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Student access unavailable</h1>
        <p className="mt-3 text-slate-600">
          {statusQuery.error instanceof Error
            ? statusQuery.error.message
            : "We could not verify your current student status."}
        </p>
      </main>
    );
  }
  if (student && statusQuery.data?.status === "suspended") {
    return <Navigate replace to="/suspended" />;
  }
  if (student && statusQuery.data?.status === "active") return <Outlet />;
  if (application?.status === "admitted") {
    return <Navigate replace to="/admission-support" />;
  }
  if (application) return <Navigate replace to="/status" />;
  return <Navigate replace to="/apply" />;
}

export function RequireSuspendedAccount() {
  const { user, profile, application, student, loading } = useAuth();
  const statusQuery = useQuery({
    queryKey: ["route-student-status", user?.id, student?.id],
    enabled: Boolean(user && student?.id),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user || !student) return null;
      const { data, error } = await getSupabaseClient()
        .from("students")
        .select("id, status")
        .eq("id", student.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate replace to="/login" />;
  if (!profile) return <AuthDataError />;
  if (!profile.is_active) return <Outlet />;
  if (student && statusQuery.isPending) return <LoadingScreen />;
  if (student && statusQuery.isError) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Account status unavailable</h1>
        <p className="mt-3 text-slate-600">
          {statusQuery.error instanceof Error
            ? statusQuery.error.message
            : "We could not verify your current account status."}
        </p>
      </main>
    );
  }
  if (statusQuery.data?.status === "active") {
    return <Navigate replace to="/dashboard" />;
  }
  if (statusQuery.data?.status !== "suspended") {
    return (
      <Navigate
        replace
        to={
          isAdminRole(profile.role)
            ? "/admin"
            : getStudentHome(application, null)
        }
      />
    );
  }
  return <Outlet />;
}

export function RequireAdmissionSupport() {
  const { user, profile, application, student, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate replace to="/login" />;
  if (!profile) return <AuthDataError />;
  if (isAdminRole(profile.role)) return <Navigate replace to="/admin" />;
  if (!profile.is_active || student?.status === "suspended") {
    return <Navigate replace to="/suspended" />;
  }
  if (student?.status === "active") return <Navigate replace to="/dashboard" />;
  if (application?.status !== "admitted") {
    return <Navigate replace to={application ? "/status" : "/apply"} />;
  }
  return <Outlet />;
}

function AuthDataError() {
  const { error, refresh } = useAuth();
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Account unavailable</h1>
      <p className="mt-3 text-slate-600">
        {error ?? "Your account profile could not be loaded. Please try again."}
      </p>
      <button
        className="mt-6 rounded-md bg-primary-700 px-4 py-2 font-semibold text-white"
        onClick={() => void refresh()}
        type="button"
      >
        Retry
      </button>
    </main>
  );
}
