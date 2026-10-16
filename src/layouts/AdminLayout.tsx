import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Brand } from "../components/Brand";
import { LogoutButton } from "../components/LogoutButton";

export function AdminLayout() {
  const { profile } = useAuth();
  const links = [
    { to: "/admin", label: "Overview", end: true },
    ...(profile?.role === "admissions_officer"
      ? [{ to: "/admin/applicants", label: "Applicants", end: false }]
      : []),
    ...(profile?.role === "registrar" || profile?.role === "super_admin"
      ? [{ to: "/admin/students", label: "Students", end: false }]
      : []),
    ...(profile?.role === "registrar" || profile?.role === "super_admin"
      ? [{ to: "/admin/announcements", label: "Announcements", end: false }]
      : []),
    ...(profile?.role === "super_admin"
      ? [{ to: "/admin/applicants", label: "Applicants", end: false }]
      : []),
    ...(profile?.role === "super_admin"
      ? [{ to: "/admin/settings", label: "Admission settings", end: false }]
      : []),
    ...(profile?.role === "super_admin"
      ? [{ to: "/admin/accounts", label: "Admin management", end: false }]
      : []),
    ...(profile?.role === "super_admin"
      ? [{ to: "/admin/audit-log", label: "Audit log", end: false }]
      : [])
  ];

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-primary-900 p-5 text-white md:flex">
        <Brand inverse />
        <nav className="mt-10 space-y-2" aria-label="Administration navigation">
          {links.map((link) => (
            <NavLink
              className={({ isActive }) =>
                `block rounded-lg px-4 py-3 text-sm font-semibold ${
                  isActive ? "bg-white/15 text-white" : "text-green-100 hover:bg-white/10"
                }`
              }
              end={link.end}
              key={link.to}
              to={link.to}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-8">
          <LogoutButton inverse />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 md:hidden">
          <Brand />
          <LogoutButton />
        </header>
        <nav
          aria-label="Administration navigation"
          className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white p-2 md:hidden"
        >
          {links.map((link) => (
            <NavLink
              className={({ isActive }) =>
                `shrink-0 rounded-md px-3 py-2 text-sm font-semibold ${
                  isActive ? "bg-primary-50 text-primary-800" : "text-slate-600"
                }`
              }
              end={link.end}
              key={link.to}
              to={link.to}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <main className="mx-auto max-w-6xl px-5 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
