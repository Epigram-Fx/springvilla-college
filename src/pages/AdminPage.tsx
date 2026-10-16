export function AdminSectionPage({ title }: { title: string }) {
  return (
    <>
      <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
      <p className="mt-4 text-slate-600">
        {title} tools will be available in the next phase.
      </p>
    </>
  );
}
