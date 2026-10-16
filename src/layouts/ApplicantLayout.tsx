import { Link, Outlet } from "react-router-dom";
import { Brand } from "../components/Brand";
import { LogoutButton } from "../components/LogoutButton";

export function ApplicantLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Brand />
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link className="text-primary-800 hover:text-primary-900" to="/status">
              Application status
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
