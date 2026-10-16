import { Outlet } from "react-router-dom";
import { Brand } from "../components/Brand";

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-primary-700 text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center px-5 py-4">
          <Brand inverse />
        </div>
      </header>
      <Outlet />
      <footer className="border-t border-slate-200 bg-white px-5 py-5 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} SpringVilla College of Technology
      </footer>
    </div>
  );
}
