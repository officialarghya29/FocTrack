import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategorySlice, Insights, MonthPoint, TrendPoint, WeekPoint } from "../../types";
import { formatDuration, formatHours, percent } from "../../utils/format";
import { ChartFrame, ChartTooltip, chartAxisProps, chartGridProps } from "./ChartBits";

const NO_ANIMATION = false;

export function FocusTrendChart({ points }: { points: TrendPoint[] }) {
  const hasData = points.some((point) => point.focusedSeconds > 0);
  return (
    <ChartFrame height={260} empty={!hasData}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 6, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="focusFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid {...chartGridProps} />
          <XAxis
            dataKey="label"
            {...chartAxisProps}
            dy={6}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis {...chartAxisProps} tickFormatter={(value: number) => formatHours(value)} />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="focusedSeconds"
            name="Focused"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#focusFill)"
            isAnimationActive={NO_ANIMATION}
          />
          <Area
            type="monotone"
            dataKey="interruptedSeconds"
            name="Interrupted"
            stroke="var(--danger)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="transparent"
            dot={false}
            isAnimationActive={NO_ANIMATION}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function WeeklyBars({ points }: { points: WeekPoint[] }) {
  const hasData = points.some((point) => point.focusedSeconds > 0);
  return (
    <ChartFrame height={220} empty={!hasData}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="label" {...chartAxisProps} dy={6} minTickGap={16} />
          <YAxis {...chartAxisProps} tickFormatter={(value: number) => formatHours(value)} />
          <Tooltip cursor={{ fill: "var(--surface)", opacity: 0.4 }} content={<ChartTooltip />} />
          <Bar
            dataKey="focusedSeconds"
            name="Focused"
            fill="var(--accent)"
            radius={[2, 2, 0, 0]}
            maxBarSize={30}
            isAnimationActive={NO_ANIMATION}
          />
          <Bar
            dataKey="interruptedSeconds"
            name="Interrupted"
            fill="var(--danger)"
            fillOpacity={0.5}
            radius={[2, 2, 0, 0]}
            maxBarSize={30}
            isAnimationActive={NO_ANIMATION}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function MonthlyBars({ points }: { points: MonthPoint[] }) {
  const hasData = points.some((point) => point.focusedSeconds > 0);
  return (
    <ChartFrame height={220} empty={!hasData}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="label" {...chartAxisProps} dy={6} minTickGap={16} />
          <YAxis {...chartAxisProps} tickFormatter={(value: number) => formatHours(value)} />
          <Tooltip cursor={{ fill: "var(--surface)", opacity: 0.4 }} content={<ChartTooltip />} />
          <Bar
            dataKey="focusedSeconds"
            name="Focused"
            fill="var(--cyan)"
            radius={[2, 2, 0, 0]}
            maxBarSize={38}
            isAnimationActive={NO_ANIMATION}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function CategoryDonut({ slices }: { slices: CategorySlice[] }) {
  if (slices.length === 0) {
    return <ChartFrame height={220} empty />;
  }
  const total = slices.reduce((sum, slice) => sum + slice.focusedSeconds, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="focusedSeconds"
              nameKey="name"
              innerRadius={54}
              outerRadius={82}
              paddingAngle={2}
              stroke="var(--bg-elev)"
              strokeWidth={2}
              isAnimationActive={NO_ANIMATION}
            >
              {slices.map((slice) => (
                <Cell key={`${slice.categoryId ?? "none"}-${slice.name}`} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip total />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full min-w-0 space-y-2">
        {slices.slice(0, 6).map((slice) => (
          <li
            key={`${slice.categoryId ?? "none"}-${slice.name}-legend`}
            className="flex items-center gap-2 text-[11px]"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="truncate text-muted">{slice.name}</span>
            <span className="numeral ml-auto shrink-0">
              {total > 0 ? percent(slice.focusedSeconds / total) : "0%"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TimeOfDayChart({ insights }: { insights: Insights }) {
  const buckets = insights.timeOfDay.buckets.map((bucket) => ({
    ...bucket,
    hours: Number((bucket.focusedSeconds / 3600).toFixed(2)),
  }));
  const hasData = buckets.some((bucket) => bucket.focusedSeconds > 0);
  return (
    <ChartFrame height={210} empty={!hasData}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={buckets}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
        >
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" {...chartAxisProps} tickFormatter={(value: number) => `${value}h`} />
          <YAxis
            type="category"
            dataKey="label"
            {...chartAxisProps}
            width={86}
            tick={{ fontSize: 10, fill: "var(--muted)" }}
          />
          <Tooltip cursor={{ fill: "var(--surface)", opacity: 0.4 }} content={<ChartTooltip />} />
          <Bar
            dataKey="focusedSeconds"
            name="Focused"
            fill="var(--violet)"
            radius={[0, 2, 2, 0]}
            maxBarSize={16}
            isAnimationActive={NO_ANIMATION}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function DurationDistributionChart({ insights }: { insights: Insights }) {
  const buckets = insights.durationDistribution.buckets;
  const hasData = buckets.some((bucket) => bucket.sessions > 0);
  return (
    <ChartFrame height={200} empty={!hasData}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="label" {...chartAxisProps} dy={6} />
          <YAxis {...chartAxisProps} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--surface)", opacity: 0.4 }} content={<ChartTooltip />} />
          <Bar
            dataKey="sessions"
            name="Sessions"
            fill="var(--cyan)"
            radius={[2, 2, 0, 0]}
            maxBarSize={38}
            isAnimationActive={NO_ANIMATION}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function InterruptionReasons({ insights }: { insights: Insights }) {
  const reasons = insights.interruptionReasons;
  if (reasons.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line px-3 py-8 text-center text-[11px] text-muted">
        No interruptions recorded in this range.
      </p>
    );
  }
  const max = Math.max(...reasons.map((reason) => reason.seconds));
  return (
    <ul className="space-y-3">
      {reasons.map((reason) => (
        <li key={reason.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[12px]">{reason.label}</span>
            <span className="numeral shrink-0 text-[11px] text-muted">
              {formatDuration(reason.seconds)} · {reason.count}×
            </span>
          </div>
          <div className="mt-1.5 h-[3px] w-full rounded-full bg-line">
            <div
              className="h-full rounded-full bg-danger/70"
              style={{ width: `${Math.max(3, (reason.seconds / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
