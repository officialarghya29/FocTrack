import { NavLink } from "react-router-dom";
import {
  ChartNoAxesColumn,
  History,
  LayoutGrid,
  LogOut,
  Moon,
  SlidersHorizontal,
  Sun,
  Timer,
} from "lucide-react";
import { Wordmark } from "../common/Logo";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useLiveSession } from "../../hooks/useLiveSession";
import { formatClock } from "../../utils/format";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutGrid, index: "01" },
  { to: "/focus", label: "Focus", icon: Timer, index: "02" },
  { to: "/history", label: "History", icon: History, index: "03" },
  { to: "/analytics", label: "Analytics", icon: ChartNoAxesColumn, index: "04" },
  { to: "/settings", label: "Settings", icon: SlidersHorizontal, index: "05" },
];

function ActiveSessionLink() {
  const { session: data, focusedSeconds } = useLiveSession();
  const running = data?.status === "ACTIVE";

  if (!data) return null;

  return (
    <NavLink
      to="/focus"
      className="group mb-5 block rounded-md border border-accent/25 bg-accent/[0.05] p-2.5 transition-colors hover:border-accent/50"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          {running && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        <span className="micro text-accent">
          {running ? "Session live" : "Paused"}
        </span>
      </div>
      <p className="numeral mt-1.5 text-lg leading-none">{formatClock(focusedSeconds)}</p>
      <p className="mt-1 truncate text-[11px] text-muted">{data.title}</p>
    </NavLink>
  );
}

export function ThemeToggle() {
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
      className="btn btn-ghost btn-sm w-full justify-between text-muted hover:text-ink"
      onClick={() => void updateSettings({ theme: resolved === "dark" ? "light" : "dark" })}
      aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
    >
      <span className="flex items-center gap-2 text-xs">
        {resolved === "dark" ? <Moon size={13} /> : <Sun size={13} />}
        {resolved === "dark" ? "Dark" : "Light"} theme
      </span>
      <span className="font-mono text-[9px] uppercase tracking-micro opacity-60">toggle</span>
    </button>
  );
}

export function Sidebar() {
  const { profile } = useApp();
  const { user, logout } = useAuth();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col border-r border-line bg-base px-4 py-6 lg:flex">
      <div className="px-2">
        <Wordmark />
      </div>

      <div className="my-7 h-px w-full bg-line" />

      <ActiveSessionLink />

      <nav aria-label="Primary" className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "group flex items-center gap-3 rounded-md px-2.5 py-2.5 text-[13px] transition-colors",
                isActive
                  ? "bg-surface text-ink"
                  : "text-muted hover:bg-surface/50 hover:text-ink",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  size={15}
                  strokeWidth={isActive ? 2 : 1.6}
                  className={isActive ? "text-accent" : ""}
                />
                <span className="flex-1">{item.label}</span>
                <span
                  className={`font-mono text-[9px] tracking-micro ${
                    isActive ? "text-accent" : "text-muted/50"
                  }`}
                >
                  {item.index}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <div className="rounded-md border border-line p-3">
          <p className="micro">Signed in</p>
          <p className="mt-1.5 truncate text-[13px] font-medium">
            {user?.username ?? profile?.username ?? "Account"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {user?.email ?? (profile ? `${profile.totalSessions} completed` : "")}
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 flex w-full items-center gap-1.5 rounded border border-line px-2 py-1.5 text-[11px] text-muted transition-colors hover:border-muted/50 hover:text-ink"
          >
            <LogOut size={11} /> Sign out
          </button>
        </div>
        <ThemeToggle />
        <p className="px-1 font-mono text-[9px] uppercase tracking-micro text-muted/60">
          FocTrack v1.1 · private by default
        </p>
      </div>
    </aside>
  );
}
