import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Wordmark } from "../common/Logo";

export function AuthLoading() {
  return (
    <div
      className="relative z-[1] flex min-h-dvh flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
    >
      <Wordmark />
      <div className="flex items-center gap-2 text-muted">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent" />
        <span className="micro">Checking your session</span>
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <AuthLoading />;
  if (status === "anonymous") {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next");

  if (status === "loading") return <AuthLoading />;
  if (status === "authed") {
    return (
      <Navigate
        to={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"}
        replace
      />
    );
  }
  return <>{children}</>;
}
