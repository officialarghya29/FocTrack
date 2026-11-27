import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../common/Logo";

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative z-[1] flex min-h-dvh flex-col px-4 py-8 sm:justify-center sm:py-12">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="mb-7 flex justify-center">
          <Link to="/" aria-label="FocTrack home">
            <Wordmark />
          </Link>
        </div>

        <div className="panel p-6 shadow-[var(--shadow)] sm:p-8">
          <h1 className="text-[24px] font-semibold leading-tight">{title}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{description}</p>
          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-[12px] text-muted">{footer}</div>}

        <p className="mt-8 text-center text-[10px] leading-relaxed text-muted/70">
          FocTrack is an application-defined focus indicator, not a medical device. Your
          sessions are private to your account.
        </p>
      </div>
    </div>
  );
}

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="font-mono text-[9px] uppercase tracking-micro text-muted/70">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      aria-live="assertive"
      className="rounded-md border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] leading-relaxed text-danger"
    >
      {message}
    </p>
  );
}

export function describeAuthError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

/** Only in-app absolute paths are accepted as a post-login destination. */
export function safeNext(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
