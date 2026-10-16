export function FormMessage({
  children,
  kind = "error"
}: {
  children: string;
  kind?: "error" | "success";
}) {
  return (
    <p
      className={`rounded-md px-3 py-2 text-sm ${
        kind === "error"
          ? "bg-red-50 text-red-800"
          : "bg-primary-50 text-primary-800"
      }`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
