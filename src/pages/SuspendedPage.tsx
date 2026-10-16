import { LogoutButton } from "../components/LogoutButton";

export function SuspendedPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-20 text-center">
      <div aria-hidden="true" className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-2xl text-amber-800">
        !
      </div>
      <h1 className="mt-6 text-3xl font-bold text-slate-900">Your account is suspended</h1>
      <p className="mt-3 leading-7 text-slate-600">
        Your account is currently unavailable. Please contact the school for assistance.
      </p>
      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
