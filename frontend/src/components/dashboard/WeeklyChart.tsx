import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "../../types";
import { formatHours } from "../../utils/format";
import { ChartFrame, ChartTooltip, chartAxisProps, chartGridProps } from "../analytics/ChartBits";

export function WeeklyChart({ points }: { points: TrendPoint[] }) {
  const hasData = points.some((point) => point.focusedSeconds + point.interruptedSeconds > 0);

  return (
    <div>
      <ChartFrame height={244} empty={!hasData}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barGap={2}>
            <CartesianGrid {...chartGridProps} />
            <XAxis dataKey="label" {...chartAxisProps} dy={6} />
            <YAxis {...chartAxisProps} tickFormatter={(value: number) => formatHours(value)} />
            <Tooltip
              cursor={{ fill: "var(--surface)", opacity: 0.5 }}
              content={<ChartTooltip />}
            />
            <Bar
              dataKey="focusedSeconds"
              name="Focused"
              stackId="day"
              fill="var(--accent)"
              radius={[2, 2, 0, 0]}
              maxBarSize={34}
              isAnimationActive={false}
            />
            <Bar
              dataKey="interruptedSeconds"
              name="Interrupted"
              stackId="day"
              fill="var(--danger)"
              fillOpacity={0.55}
              radius={[2, 2, 0, 0]}
              maxBarSize={34}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      <div className="mt-3 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[10px] text-muted">
          <span className="h-1.5 w-3 rounded-sm bg-accent" /> Focused
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted">
          <span className="h-1.5 w-3 rounded-sm bg-danger/60" /> Interrupted
        </span>
        <span className="ml-auto hidden text-[10px] text-muted sm:block">
          {points.reduce((sum, point) => sum + point.sessions, 0)} sessions
        </span>
      </div>
    </div>
  );
}
