import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-20 text-center">
      <p className="text-sm font-bold uppercase tracking-wider text-primary-700">404</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Page not found</h1>
      <Link className="mt-6 inline-block font-semibold text-primary-800 hover:underline" to="/">
        Return to your portal
      </Link>
    </main>
  );
}
