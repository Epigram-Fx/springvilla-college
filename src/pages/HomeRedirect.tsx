import { Navigate } from "react-router-dom";
import { getStudentHome, isAdminRole, useAuth } from "../auth/AuthProvider";
import { LoadingScreen } from "../components/LoadingScreen";

export function HomeRedirect() {
  const { user, profile, application, student, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate replace to="/login" />;
  if (!profile) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl font-bold text-slate-900">Account unavailable</h1>
        <p className="mt-3 text-slate-600">Your account profile could not be loaded. Please refresh.</p>
      </main>
    );
  }
  if (!profile.is_active || student?.status === "suspended") {
    return <Navigate replace to="/suspended" />;
  }
  return (
    <Navigate
      replace
      to={isAdminRole(profile.role) ? "/admin" : getStudentHome(application, student)}
    />
  );
}
