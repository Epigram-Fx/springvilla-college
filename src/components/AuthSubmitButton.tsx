export function AuthSubmitButton({
  children,
  loading
}: {
  children: string;
  loading: boolean;
}) {
  return (
    <button
      className="w-full rounded-md bg-primary-700 px-4 py-3 font-semibold text-white hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={loading}
      type="submit"
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}
