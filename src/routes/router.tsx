import { createBrowserRouter } from "react-router-dom";
import { AdminLayout } from "../layouts/AdminLayout";
import { ApplicantLayout } from "../layouts/ApplicantLayout";
import { PublicLayout } from "../layouts/PublicLayout";
import { StudentLayout } from "../layouts/StudentLayout";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminAccountsPage } from "../pages/admin/AdminAccountsPage";
import { AnnouncementsPage } from "../pages/admin/AnnouncementsPage";
import { AuditLogPage } from "../pages/admin/AuditLogPage";
import { AdminSettingsPage } from "../pages/admin/AdminSettingsPage";
import { ApplicantDetailPage } from "../pages/admin/ApplicantDetailPage";
import { ApplicantsPage } from "../pages/admin/ApplicantsPage";
import { StudentRecordsManagementPage } from "../pages/admin/StudentRecordsManagementPage";
import { StudentsPage } from "../pages/admin/StudentsPage";
import { AdmissionSupportPage } from "../pages/AdmissionSupportPage";
import { ApplyPage } from "../pages/ApplyPage";
import { ForgotPasswordPage } from "../pages/auth/ForgotPasswordPage";
import { LoginPage } from "../pages/auth/LoginPage";
import { ResetPasswordPage } from "../pages/auth/ResetPasswordPage";
import { SignupPage } from "../pages/auth/SignupPage";
import { HomeRedirect } from "../pages/HomeRedirect";
import { NotFoundPage } from "../pages/NotFoundPage";
import { StatusPage } from "../pages/StatusPage";
import { StudentDashboardPage } from "../pages/StudentDashboardPage";
import { StudentRecordsPage } from "../pages/StudentRecordsPage";
import { SuspendedPage } from "../pages/SuspendedPage";
import {
  PublicOnlyRoute,
  RequireAdmittedStudent,
  RequireApplicant,
  RequireApply,
  RequireAdmissionSupport,
  RequireRole,
  RequireSuspendedAccount
} from "./guards";

export const router = createBrowserRouter([
  {
    path: "/",
    children: [
      {
        element: <PublicLayout />,
        children: [
          {
            element: <PublicOnlyRoute />,
            children: [
              { index: true, element: <HomeRedirect /> },
              { path: "login", element: <LoginPage /> },
              { path: "signup", element: <SignupPage /> },
              { path: "forgot-password", element: <ForgotPasswordPage /> }
            ]
          },
          { path: "reset-password", element: <ResetPasswordPage /> }
        ]
      },
      {
        element: <RequireApply />,
        children: [
          {
            path: "apply",
            element: <ApplicantLayout />,
            children: [{ index: true, element: <ApplyPage /> }]
          }
        ]
      },
      {
        element: <RequireApplicant />,
        children: [
          {
            path: "status",
            element: <ApplicantLayout />,
            children: [{ index: true, element: <StatusPage /> }]
          }
        ]
      },
      {
        element: <RequireAdmittedStudent />,
        children: [
          {
            path: "dashboard",
            element: <StudentLayout />,
            children: [
              { index: true, element: <StudentDashboardPage /> },
              { path: "records", element: <StudentRecordsPage /> },
              { path: "*", element: <NotFoundPage /> }
            ]
          }
        ]
      },
      {
        path: "admin",
        element: <RequireRole />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminDashboardPage /> },
              {
                element: <RequireRole allowedRoles={["super_admin"]} />,
                children: [
                  { path: "settings", element: <AdminSettingsPage /> },
                  { path: "accounts", element: <AdminAccountsPage /> },
                  { path: "audit-log", element: <AuditLogPage /> }
                ]
              },
              {
                element: <RequireRole allowedRoles={["admissions_officer", "super_admin"]} />,
                children: [
                  { path: "applicants", element: <ApplicantsPage /> },
                  { path: "applicants/:applicationId", element: <ApplicantDetailPage /> }
                ]
              },
              {
                element: <RequireRole allowedRoles={["registrar", "super_admin"]} />,
                children: [
                  { path: "students", element: <StudentsPage /> },
                  { path: "students/:studentId", element: <StudentRecordsManagementPage /> },
                  { path: "announcements", element: <AnnouncementsPage /> }
                ]
              },
              { path: "*", element: <NotFoundPage /> }
            ]
          }
        ]
      },
      {
        element: <PublicLayout />,
        children: [
          {
            element: <RequireSuspendedAccount />,
            children: [{ path: "suspended", element: <SuspendedPage /> }]
          },
          {
            element: <RequireAdmissionSupport />,
            children: [{ path: "admission-support", element: <AdmissionSupportPage /> }]
          },
          { path: "*", element: <NotFoundPage /> }
        ]
      }
    ]
  }
]);
