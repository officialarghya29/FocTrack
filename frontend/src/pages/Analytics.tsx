import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import {
  ErrorState,
  LoadingBlock,
  PageHeader,
  SectionHeading,
  StatTile,
} from "../components/common/Primitives";
import {
  CategoryDonut,
  DurationDistributionChart,
  FocusTrendChart,
  InterruptionReasons,
  MonthlyBars,
  TimeOfDayChart,
  WeeklyBars,
} from "../components/analytics/Charts";
import { formatDuration, formatHours, percent } from "../utils/format";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function AnalyticsPage() {
  const { errorMessage } = useApp();
  const [days, setDays] = useState(30);

  const daily = useQuery({
    queryKey: ["analytics", "daily", days],
    queryFn: () => api.daily(days),
  });
  const weekly = useQuery({ queryKey: ["analytics", "weekly", 8], queryFn: () => api.weekly(8) });
  const monthly = useQuery({
    queryKey: ["analytics", "monthly", 6],
    queryFn: () => api.monthly(6),
  });
  const categories = useQuery({
    queryKey: ["analytics", "categories", days],
    queryFn: () => api.categoryAnalytics(days),
  });
  const insights = useQuery({
    queryKey: ["analytics", "insights", days],
    queryFn: () => api.insights(days),
  });

  if (daily.isLoading || !daily.data) {
    return <LoadingBlock label="Computing analytics" />;
  }

  if (daily.isError) {
    return (
      <ErrorState
        message={errorMessage(daily.error)}
        onRetry={() => void daily.refetch()}
      />
    );
  }

  const points = daily.data.points;
  const totalFocused = points.reduce((sum, point) => sum + point.focusedSeconds, 0);
  const totalInterrupted = points.reduce((sum, point) => sum + point.interruptedSeconds, 0);
  const totalSessions = points.reduce((sum, point) => sum + point.sessions, 0);
  const activeDays = points.filter((point) => point.sessions > 0).length;
  const hasAnyData = totalFocused + totalInterrupted > 0;

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Where your attention actually goes"
        description="Every figure on this page is aggregated from stored sessions. Nothing is sampled, smoothed or invented."
        actions={
          <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Date range">
            {RANGES.map((range) => (
              <button
                key={range.days}
                type="button"
                onClick={() => setDays(range.days)}
                aria-pressed={days === range.days}
                className={`rounded px-3 py-1.5 font-mono text-[10px] uppercase tracking-micro transition-colors ${
                  days === range.days
                    ? "bg-surface text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        }
      />

      <section className="panel mb-4 grid grid-cols-2 gap-y-6 p-5 sm:grid-cols-4" aria-label="Range summary">
        <StatTile
          label="Focused in range"
          value={formatDuration(totalFocused)}
          hint={`${activeDays} active day${activeDays === 1 ? "" : "s"}`}
          tone="accent"
        />
        <StatTile label="Sessions" value={totalSessions} hint="completed in range" />
        <StatTile
          label="Interrupted"
          value={formatDuration(totalInterrupted)}
          hint={hasAnyData ? percent(totalInterrupted / (totalFocused + totalInterrupted), 1) : "—"}
          tone={totalInterrupted > 0 ? "danger" : "muted"}
        />
        <StatTile
          label="Consistency"
          value={insights.data ? `${insights.data.consistencyDays}/${days}` : "—"}
          hint="days with a completed session"
        />
      </section>

      {!hasAnyData && (
        <div className="mb-4 rounded-lg border border-dashed border-line px-4 py-3 text-[12px] text-muted">
          There is no recorded activity in this range yet. Analytics will populate as soon as you
          complete a session.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="panel p-5 lg:col-span-8" aria-label="Daily focus trend">
          <SectionHeading title="Daily focus trend" hint={`Focused vs interrupted · ${days} days`} />
          <FocusTrendChart points={points} />
        </section>

        <section className="panel p-5 lg:col-span-4" aria-label="Category distribution">
          <SectionHeading title="Category split" hint="Share of focused time" />
          <CategoryDonut slices={categories.data?.slices ?? []} />
        </section>

        <section className="panel p-5 lg:col-span-6" aria-label="Weekly focus">
          <SectionHeading title="Weekly totals" hint="Last 8 weeks" />
          <WeeklyBars points={weekly.data?.points ?? []} />
        </section>

        <section className="panel p-5 lg:col-span-6" aria-label="Monthly focus">
          <SectionHeading title="Monthly totals" hint="Last 6 months" />
          <MonthlyBars points={monthly.data?.points ?? []} />
        </section>

        <section className="panel p-5 lg:col-span-6" aria-label="Most productive time">
          <SectionHeading
            title="Most productive windows"
            hint={
              insights.data?.timeOfDay.bestWindow
                ? `Best: ${insights.data.timeOfDay.bestWindow}`
                : undefined
            }
          />
          {insights.data ? (
            <TimeOfDayChart insights={insights.data} />
          ) : (
            <LoadingBlock label="Loading windows" />
          )}
          {insights.data?.timeOfDay.bestWindow && (
            <p className="mt-2 text-[11px] text-muted">
              Most focused time happens in the{" "}
              <span className="text-ink">{insights.data.timeOfDay.bestWindow.toLowerCase()}</span>,
              based on when completed sessions started.
            </p>
          )}
        </section>

        <section className="panel p-5 lg:col-span-6" aria-label="Session duration distribution">
          <SectionHeading
            title="Session lengths"
            hint={
              insights.data
                ? `median ${formatDuration(insights.data.durationDistribution.medianSeconds)}`
                : undefined
            }
          />
          {insights.data ? (
            <DurationDistributionChart insights={insights.data} />
          ) : (
            <LoadingBlock label="Loading distribution" />
          )}
          {insights.data && insights.data.durationDistribution.longestSeconds > 0 && (
            <p className="mt-2 text-[11px] text-muted">
              Average {formatDuration(insights.data.durationDistribution.averageSeconds)} · longest{" "}
              {formatDuration(insights.data.durationDistribution.longestSeconds)}
            </p>
          )}
        </section>

        <section className="panel p-5 lg:col-span-5" aria-label="Interruption reasons">
          <SectionHeading
            title="Why focus breaks"
            hint={
              insights.data
                ? `${insights.data.interruptionFrequencyPerHour.toFixed(1)} per focused hour`
                : undefined
            }
          />
          {insights.data ? (
            <InterruptionReasons insights={insights.data} />
          ) : (
            <LoadingBlock label="Loading reasons" />
          )}
        </section>

        <section className="panel p-5 lg:col-span-7" aria-label="Consistency and best day">
          <SectionHeading title="Consistency" hint={`Last ${days} days`} />
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p className="numeral text-4xl font-light">
                {insights.data ? `${insights.data.consistencyPercent.toFixed(0)}%` : "—"}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                of days contain at least one completed session. Showing up consistently matters more
                than one long day.
              </p>
            </div>
            <div>
              <p className="numeral text-4xl font-light">
                {insights.data?.bestDay ? formatHours(insights.data.bestDay.focusedSeconds) : "—"}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {insights.data?.bestDay
                  ? `on your best day (${new Date(
                      `${insights.data.bestDay.date}T00:00:00`
                    ).toLocaleDateString([], { day: "2-digit", month: "short" })}).`
                  : "Your best day will appear once data exists."}
              </p>
            </div>
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <p className="micro mb-2">Reading these charts</p>
            <p className="text-[11px] leading-relaxed text-muted">
              Focused time excludes recorded interruptions and all paused time. Cancelled sessions
              are never included in totals. Day boundaries follow your local timezone
              ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
