import { NavLink, Outlet } from "react-router-dom";
import { Brand } from "../components/Brand";
import { LogoutButton } from "../components/LogoutButton";

const links = [
  { to: "/dashboard", label: "Overview", end: true },
  { to: "/dashboard/records", label: "Results & fees", end: false }
];

export function StudentLayout() {
  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-5 md:flex">
        <Brand />
        <nav className="mt-10 space-y-2" aria-label="Student navigation">
          {links.map((link) => (
            <NavLink
              className={({ isActive }) =>
                `block rounded-lg px-4 py-3 text-sm font-semibold ${
                  isActive ? "bg-primary-50 text-primary-800" : "text-slate-600 hover:bg-slate-50"
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
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 md:hidden">
          <Brand />
          <LogoutButton />
        </header>
        <nav
          aria-label="Student navigation"
          className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white p-2 md:hidden"
        >
          {links.map((link) => (
            <NavLink
              className={({ isActive }) =>
                `flex-1 rounded-md px-2 py-3 text-center text-sm font-semibold ${
                  isActive ? "text-primary-800" : "text-slate-500"
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
        <main className="mx-auto max-w-6xl px-5 py-8 pb-24 md:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
