import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabase";
import type {
  ApplicationStatus,
  AppRole,
  Database
} from "../types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Application = Database["public"]["Tables"]["applications"]["Row"];
type Student = Database["public"]["Tables"]["students"]["Row"];

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  application: Application | null;
  student: Student | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadUserData = useCallback(async (nextUser: User | null) => {
    const currentRequest = ++requestId.current;
    setUser(nextUser);
    setError(null);

    if (!nextUser) {
      setProfile(null);
      setApplication(null);
      setStudent(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [profileResult, applicationResult, studentResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .eq("id", nextUser.id)
            .maybeSingle(),
          supabase
            .from("applications")
            .select("*")
            .eq("user_id", nextUser.id)
            .order("submitted_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("students")
            .select("*")
            .eq("user_id", nextUser.id)
            .maybeSingle()
        ]);

      if (profileResult.error) throw profileResult.error;
      if (applicationResult.error) throw applicationResult.error;
      if (studentResult.error) throw studentResult.error;
      if (currentRequest !== requestId.current) return;

      setProfile(profileResult.data);
      setApplication(applicationResult.data);
      setStudent(studentResult.data);
    } catch (cause) {
      if (currentRequest !== requestId.current) return;
      setProfile(null);
      setApplication(null);
      setStudent(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load your account. Please try again."
      );
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const supabase = getSupabaseClient();
      const authState = supabase.auth.onAuthStateChange((_event, session) => {
        if (active) {
          window.setTimeout(() => {
            if (active) void loadUserData(session?.user ?? null);
          }, 0);
        }
      });
      subscription = authState.data.subscription;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Authentication is not configured."
      );
      setLoading(false);
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [loadUserData]);

  const refresh = useCallback(async () => {
    try {
      const {
        data: { user: currentUser },
        error: sessionError
      } = await getSupabaseClient().auth.getUser();
      if (sessionError) throw sessionError;
      await loadUserData(currentUser);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to refresh your account. Please try again."
      );
      setLoading(false);
    }
  }, [loadUserData]);

  const value = useMemo(
    () => ({
      user,
      profile,
      application,
      student,
      loading,
      error,
      refresh
    }),
    [user, profile, application, student, loading, error, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function isAdminRole(role: AppRole | undefined): boolean {
  return (
    role === "admissions_officer" ||
    role === "registrar" ||
    role === "super_admin"
  );
}

export function getStudentHome(
  application: Pick<Application, "status"> | null,
  student: Pick<Student, "status"> | null
): string {
  if (student?.status === "suspended") return "/suspended";
  if (student?.status === "active") return "/dashboard";
  if (application?.status === "admitted") return "/admission-support";
  if (application) return "/status";
  return "/apply";
}

export function isApplicantStatus(status: ApplicationStatus): boolean {
  return status === "pending" || status === "not_eligible";
}
