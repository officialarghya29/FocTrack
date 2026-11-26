import { formatClock } from "../../utils/format";
import type { SessionStatus } from "../../types";

interface TimerDialProps {
  focusedSeconds: number;
  progress: number;
  status: SessionStatus;
  title: string;
  categoryName: string | null;
  categoryColor: string | null;
  targetSeconds: number | null;
}

const RADIUS = 134;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TICKS = 72;

export function TimerDial({
  focusedSeconds,
  progress,
  status,
  title,
  categoryName,
  categoryColor,
  targetSeconds,
}: TimerDialProps) {
  const paused = status === "PAUSED";
  const minutes = Math.floor(focusedSeconds / 60);
  const statusLabel = paused ? "Paused" : "In focus";

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[360px]">
      <svg
        viewBox="0 0 320 320"
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={`Focus timer. ${statusLabel}. ${minutes} minutes focused.`}
      >
        <circle
          cx="160"
          cy="160"
          r={RADIUS + 9}
          fill="none"
          stroke="var(--line)"
          strokeWidth="1"
          opacity="0.55"
        />
        {Array.from({ length: TICKS }).map((_, index) => {
          const angle = (index / TICKS) * 2 * Math.PI;
          const major = index % 6 === 0;
          const inner = RADIUS - (major ? 12 : 6);
          const outer = RADIUS - 1;
          const x1 = 160 + Math.cos(angle) * inner;
          const y1 = 160 + Math.sin(angle) * inner;
          const x2 = 160 + Math.cos(angle) * outer;
          const y2 = 160 + Math.sin(angle) * outer;
          const reached = index / TICKS <= progress;
          return (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={reached ? "var(--accent)" : "var(--line)"}
              strokeWidth={major ? 1.6 : 1}
              opacity={reached ? (paused ? 0.45 : 1) : 0.9}
            />
          );
        })}

        <circle
          cx="160"
          cy="160"
          r={RADIUS - 26}
          fill="none"
          stroke="var(--line)"
          strokeWidth="1"
          opacity="0.6"
        />

        <circle
          cx="160"
          cy="160"
          r={RADIUS - 26}
          fill="none"
          stroke={paused ? "var(--warn)" : "var(--accent)"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE * progress} ${CIRCUMFERENCE}`}
          className="transition-[stroke-dasharray] duration-500 ease-linear"
          opacity={paused ? 0.7 : 1}
        />

        {progress === 0 && (
          <circle
            cx="160"
            cy={160 - (RADIUS - 26)}
            r="3"
            fill="var(--accent)"
            className="animate-pulse"
          />
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
        <p className="micro mb-4 flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              paused ? "bg-warn" : "animate-pulse bg-accent"
            }`}
          />
          {statusLabel}
        </p>
        <p
          className="numeral text-[44px] font-light leading-none tracking-tight sm:text-[52px]"
          aria-hidden="true"
        >
          {formatClock(focusedSeconds)}
        </p>
        <p className="sr-only" aria-live="polite">
          {statusLabel}. {minutes} minutes of focused time.
        </p>
        <p className="mt-4 line-clamp-2 text-[13px] font-medium leading-snug">{title}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          {categoryColor && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: categoryColor }}
            />
          )}
          {categoryName ?? "Uncategorized"}
          {targetSeconds ? ` · ${Math.round(targetSeconds / 60)}m target` : ""}
        </p>
      </div>
    </div>
  );
}
