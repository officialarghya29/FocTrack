import type { ReactNode } from "react";
import { formatDuration } from "../../utils/format";

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export function ChartTooltip({
  active,
  payload,
  label,
  total,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  total?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-line bg-elev px-3 py-2 shadow-[var(--shadow)]">
      <p className="micro mb-1.5">{label}</p>
      <ul className="space-y-1">
        {payload.map((entry) => {
          const numeric = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
          return (
            <li key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2 text-[11px]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted">{entry.name}</span>
              <span className="numeral ml-auto text-ink">
                {total || String(entry.dataKey).includes("Seconds")
                  ? formatDuration(numeric)
                  : numeric}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ChartFrame({
  children,
  height = 240,
  empty,
}: {
  children?: ReactNode;
  height?: number;
  empty?: boolean;
}) {
  return (
    <div style={{ height }} className="w-full">
      {empty ? (
        <div className="flex h-full items-center justify-center rounded-md border border-dashed border-line">
          <p className="micro">No data in this range</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export const chartAxisProps = {
  stroke: "var(--muted)",
  fontSize: 10,
  tickLine: false,
  axisLine: false,
  fontFamily: "var(--font-mono)",
} as const;

export const chartGridProps = {
  stroke: "var(--line)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;
