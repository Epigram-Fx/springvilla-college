import { Link } from "react-router-dom";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link className="inline-flex items-center gap-3" to="/" aria-label="SpringVilla home">
      <img alt="" className="h-10 w-10" height="40" src="/logo.svg" width="40" />
      <span
        className={`text-sm font-bold leading-tight sm:text-base ${
          inverse ? "text-white" : "text-slate-900"
        }`}
      >
        SpringVilla College
        <span className={`block text-xs font-medium ${inverse ? "text-green-100" : "text-slate-500"}`}>
          of Technology
        </span>
      </span>
    </Link>
  );
}
