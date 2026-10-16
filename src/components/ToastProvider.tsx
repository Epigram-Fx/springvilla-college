import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

type ToastKind = "success" | "error" | "info";
type ToastInput = { id: number; kind: ToastKind; message: string };
type ToastContextValue = {
  showToast: (kind: ToastKind, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const toastDurationMs = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastInput[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++nextId.current;
      setToasts((current) => [...current.slice(-3), { id, kind, message }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismissToast(id), toastDurationMs)
      );
    },
    [dismissToast]
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    []
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 top-3 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96"
        role="region"
      >
        {toasts.map((toast) => (
          <div
            className={`pointer-events-auto flex w-full items-start justify-between gap-4 rounded-lg border px-4 py-3 shadow-lg ${
              toast.kind === "error"
                ? "border-red-200 bg-white text-red-900"
                : toast.kind === "success"
                  ? "border-primary-200 bg-white text-primary-900"
                  : "border-slate-200 bg-white text-slate-900"
            }`}
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
          >
            <p className="text-sm font-medium">{toast.message}</p>
            <button
              aria-label="Dismiss notification"
              className="shrink-0 rounded px-1 text-lg leading-5 text-slate-500 hover:bg-slate-100"
              onClick={() => dismissToast(toast.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
