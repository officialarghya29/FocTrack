import { AlertTriangle, Check, Info, X } from "lucide-react";
import { useApp } from "../../context/AppContext";

const icons = {
  info: Info,
  success: Check,
  error: AlertTriangle,
};

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[84px] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = icons[toast.tone];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-line bg-elev px-4 py-3 shadow-[var(--shadow)]"
          >
            <Icon
              size={15}
              className={
                toast.tone === "error"
                  ? "mt-0.5 shrink-0 text-danger"
                  : toast.tone === "success"
                    ? "mt-0.5 shrink-0 text-accent"
                    : "mt-0.5 shrink-0 text-muted"
              }
            />
            <p className="flex-1 text-[13px] leading-snug text-ink">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="rounded p-0.5 text-muted hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
