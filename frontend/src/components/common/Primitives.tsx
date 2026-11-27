import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="micro mb-2 flex items-center gap-2">
          <span className="inline-block h-1 w-1 rounded-full bg-accent" />
          {eyebrow}
        </p>
        <h1 className="text-[26px] font-semibold leading-[1.15] sm:text-[32px]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint && <span className="micro hidden sm:inline">{hint}</span>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "accent" | "danger" | "muted";
}) {
  const toneClass =
    tone === "accent"
      ? "text-accent"
      : tone === "danger"
        ? "text-danger"
        : tone === "muted"
          ? "text-muted"
          : "text-ink";
  return (
    <div className="min-w-0">
      <p className="micro truncate">{label}</p>
      <p className={`numeral mt-2 text-2xl font-medium leading-none ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1.5 truncate text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted">
        {icon ?? <Inbox size={18} strokeWidth={1.5} />}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      )}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger/[0.06] p-5">
      <div className="flex items-center gap-2 text-danger">
        <AlertTriangle size={16} />
        <span className="text-sm font-medium">Could not load this section</span>
      </div>
      <p className="text-[13px] text-muted">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  // The hosted API runs on a free instance that sleeps when idle. The first
  // request of the day can take a while to wake it, so say so instead of
  // leaving a bare spinner that looks broken.
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="flex flex-col gap-2 py-10 text-muted" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
        <span className="micro">{label}</span>
      </div>
      {slow && (
        <p className="pl-[26px] text-[11px] leading-relaxed text-muted/80">
          Still connecting. The hosted API sleeps when idle, so the first request can take up to a
          minute. This page will load as soon as it responds.
        </p>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-10 animate-pulse rounded-md bg-surface/60"
          style={{ animationDelay: `${index * 80}ms` }}
        />
      ))}
    </div>
  );
}

export function StatusDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
