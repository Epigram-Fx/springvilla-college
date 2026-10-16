import { Link } from "react-router-dom";

export function App() {
  return (
    <main className="min-h-screen bg-white px-6 py-16 text-slate-800">
      <section className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-700">
          SpringVilla College of Technology
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Admissions portal
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
          The foundation is ready. Applicant registration and the admissions
          workflow will be added in the next phase.
        </p>
        <Link
          className="mt-8 inline-flex rounded-md bg-primary-700 px-5 py-3 font-semibold text-white hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2"
          to="/"
        >
          Portal home
        </Link>
      </section>
    </main>
  );
}
