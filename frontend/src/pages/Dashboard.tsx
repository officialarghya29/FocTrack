import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Database,
  Flame,
  Play,
  Sparkles,
  Timer,
} from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { useLiveSession } from "../hooks/useLiveSession";
import {
  ErrorState,
  LoadingBlock,
  PageHeader,
  SectionHeading,
  StatTile,
} from "../components/common/Primitives";
import { FocusScoreCard } from "../components/dashboard/FocusScoreCard";
import { WeeklyChart } from "../components/dashboard/WeeklyChart";
import { RecentSessions } from "../components/dashboard/RecentSessions";
import { CategoryBreakdown } from "../components/dashboard/CategoryBreakdown";
import {
  formatDuration,
  formatLongDate,
  formatTime,
  greeting,
} from "../utils/format";

export function DashboardPage() {
  const { profile, notify, errorMessage, refreshAll } = useApp();
  const { session: active, focusedSeconds: activeFocusedSeconds } = useLiveSession();

  const overviewQuery = useQuery({ queryKey: ["overview"], queryFn: api.overview });
  const categoriesQuery = useQuery({
    queryKey: ["analytics", "categories", 7],
    queryFn: () => api.categoryAnalytics(7),
  });

  const demoMutation = useMutation({
    mutationFn: api.seedDemo,
    onSuccess: async (result) => {
      notify(result.message, "success");
      await refreshAll();
    },
    onError: (error) => notify(errorMessage(error), "error"),
  });

  const clearDemoMutation = useMutation({
    mutationFn: api.clearDemo,
    onSuccess: async (result) => {
      notify(result.message, "success");
      await refreshAll();
    },
    onError: (error) => notify(errorMessage(error), "error"),
  });

  if (overviewQuery.isLoading) return <LoadingBlock label="Loading your day" />;
  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <ErrorState
        message={errorMessage(overviewQuery.error) || "The overview could not be loaded."}
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  const overview = overviewQuery.data;
  const hasData = overview.totals.sessions > 0;
  const hasDemo = overview.totals.demoSessions > 0;
  const change = overview.weekChangePercent;
  const todayLabel = new Date(`${overview.today}T00:00:00`).toLocaleDateString([], {
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title={`${greeting()}, ${profile?.username ?? "there"}`}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CalendarClock size={12} className="text-muted" />
            {formatLongDate(new Date())}
            <span className="text-muted/40">/</span>
            <span className="text-muted">All durations in your local timezone</span>
          </span>
        }
        actions={
          active ? (
            <Link to="/focus" className="btn btn-primary">
              <Timer size={15} />
              {active.status === "PAUSED" ? "Resume paused session" : "Return to session"}
            </Link>
          ) : (
            <Link to="/focus" className="btn btn-primary">
              <Play size={14} /> Start focus session
            </Link>
          )
        }
      />

      {active && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-accent/25 bg-accent/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              {active.status === "ACTIVE" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              )}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <div>
              <p className="text-[13px] font-medium">
                {active.status === "ACTIVE" ? "Session running" : "Session paused"}: {active.title}
              </p>
              <p className="text-[11px] text-muted">
                {formatDuration(activeFocusedSeconds)} focused · started{" "}
                {formatTime(active.startedAt)}
              </p>
            </div>
          </div>
          <Link to="/focus" className="btn btn-sm shrink-0">
            Open timer <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {hasDemo && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-violet/30 bg-violet/[0.05] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Sparkles size={15} className="text-violet" />
            <div>
              <p className="text-[13px] font-medium">Demo data is loaded</p>
              <p className="text-[11px] text-muted">
                {Math.round(overview.totals.demoSessions)} sample sessions are included in these
                numbers. Every one is labelled.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={() => clearDemoMutation.mutate()}
            disabled={clearDemoMutation.isPending}
          >
            {clearDemoMutation.isPending ? "Removing…" : "Remove demo data"}
          </button>
        </div>
      )}

      {!hasData && (
        <section className="mb-4 rounded-lg border border-dashed border-line bg-elev/40 p-5 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="micro mb-2">First measurement</p>
              <h2 className="text-lg font-semibold">Nothing is estimated here yet</h2>
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
                FocTrack only shows what it has measured. Start a real session, or load a clearly
                labelled sample so you can explore the analytics before committing.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/focus" className="btn btn-primary">
                <Play size={14} /> Start a session
              </Link>
              <button
                type="button"
                className="btn"
                onClick={() => demoMutation.mutate()}
                disabled={demoMutation.isPending}
              >
                <Database size={14} />
                {demoMutation.isPending ? "Seeding…" : "Load sample data"}
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="panel p-5 sm:p-6 lg:col-span-7" aria-label="Today">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="micro">Today</p>
              <p className="mt-1 text-[13px] text-muted">{todayLabel}</p>
            </div>
            <span className="chip">
              <Flame size={10} className={overview.currentStreakDays > 0 ? "text-warn" : ""} />
              {overview.currentStreakDays} day streak
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div>
              <p className="numeral text-[46px] font-light leading-none tracking-tight sm:text-[56px]">
                {formatDuration(overview.todayFocusedSeconds)}
              </p>
              <p className="mt-2 text-[11px] text-muted">focused today</p>
            </div>
            <div className="text-right">
              <p className="numeral text-xl">{formatDuration(overview.weekFocusedSeconds)}</p>
              <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted">
                last 7 days
                {change !== null && (
                  <span
                    className={`ml-1 inline-flex items-center gap-0.5 font-mono text-[10px] ${
                      change >= 0 ? "text-positive" : "text-danger"
                    }`}
                  >
                    {change >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {Math.abs(change).toFixed(0)}%
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-3 gap-3 border-t border-line pt-5">
            <StatTile
              label="Interrupted"
              value={formatDuration(overview.todayInterruptedSeconds)}
              tone={overview.todayInterruptedSeconds > 0 ? "danger" : "muted"}
            />
            <StatTile label="Sessions" value={overview.todaySessions} tone="muted" />
            <StatTile
              label="Avg session"
              value={
                overview.todaySessions > 0
                  ? formatDuration(overview.todayAverageSessionSeconds)
                  : "—"
              }
              tone="muted"
            />
          </div>
        </section>

        <div className="lg:col-span-5">
          <FocusScoreCard />
        </div>

        <section className="panel p-5 lg:col-span-8" aria-label="Weekly trend">
          <SectionHeading
            title="Weekly focus"
            hint="Focused vs interrupted · last 7 days"
            action={
              <Link to="/analytics" className="text-[11px] text-muted hover:text-ink">
                Analytics ↗
              </Link>
            }
          />
          <WeeklyChart points={overview.weeklyTrend} />
        </section>

        <section className="panel p-5 lg:col-span-4" aria-label="Categories">
          <SectionHeading title="Categories" hint="Last 7 days" />
          <CategoryBreakdown slices={categoriesQuery.data?.slices ?? []} />
          {overview.topCategory && (
            <p className="mt-5 border-t border-line pt-3 text-[11px] text-muted">
              Most focused category:{" "}
              <span className="text-ink">{overview.topCategory.name}</span>
            </p>
          )}
        </section>

        <section className="panel p-5 lg:col-span-12" aria-label="Recent sessions">
          <SectionHeading title="Recent sessions" hint="Newest first" />
          <RecentSessions sessions={overview.recentSessions} />
        </section>
      </div>
    </div>
  );
}
