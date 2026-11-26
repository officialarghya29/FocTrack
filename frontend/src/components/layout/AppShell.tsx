import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { Wordmark } from "../common/Logo";
import { Toasts } from "../common/Toasts";
import { useLiveSession } from "../../hooks/useLiveSession";
import { formatClock } from "../../utils/format";
import { Link } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { LoadingBlock } from "../common/Primitives";

function MobileThemeButton() {
  const { settings, updateSettings } = useApp();
  const resolved =
    settings?.theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : (settings?.theme ?? "dark");
  return (
    <button
      type="button"
      aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
      className="rounded-md p-2 text-muted transition-colors hover:text-ink"
      onClick={() => void updateSettings({ theme: resolved === "dark" ? "light" : "dark" })}
    >
      {resolved === "dark" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}

function MobileTopBar() {
  const { session: data, focusedSeconds } = useLiveSession();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-base/95 px-4 py-3 backdrop-blur lg:hidden">
      <Link to="/" aria-label="FocTrack home">
        <Wordmark compact />
      </Link>
      <div className="flex items-center gap-1">
        {data && (
          <Link
            to="/focus"
            className="mr-1 flex items-center gap-2 rounded-full border border-accent/30 px-2.5 py-1"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full bg-accent ${
                data.status === "ACTIVE" ? "animate-pulse" : "opacity-40"
              }`}
            />
            <span className="numeral text-[11px]">{formatClock(focusedSeconds)}</span>
          </Link>
        )}
        <MobileThemeButton />
      </div>
    </header>
  );
}

export function AppShell() {
  return (
    <div className="relative z-[1] flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-28 pt-6 sm:px-8 sm:pt-8 lg:px-10 lg:pb-16 lg:pt-10">
          <Suspense fallback={<LoadingBlock label="Loading view" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav />
      <Toasts />
    </div>
  );
}
