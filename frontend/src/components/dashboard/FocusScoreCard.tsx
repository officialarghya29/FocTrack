import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { api } from "../../services/api";
import { formatDuration, percent } from "../../utils/format";

function ScoreRing({ score }: { score: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, score));
  return (
    <div className="relative h-[132px] w-[132px]">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" strokeWidth="2" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * clamped) / 100} ${circumference}`}
        />
        {[0, 25, 50, 75].map((tick) => {
          const angle = (tick / 100) * 2 * Math.PI;
          return (
            <line
              key={tick}
              x1={60 + Math.cos(angle) * 54}
              y1={60 + Math.sin(angle) * 54}
              x2={60 + Math.cos(angle) * 57}
              y2={60 + Math.sin(angle) * 57}
              stroke="var(--muted)"
              strokeWidth="1"
              opacity="0.5"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="numeral text-[34px] font-light leading-none">
          {Number.isInteger(score) ? score : score.toFixed(1)}
        </span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-micro text-muted">of 100</span>
      </div>
    </div>
  );
}

export function FocusScoreCard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics", "focus-score", 7],
    queryFn: () => api.focusScore(7),
  });

  return (
    <section className="panel flex h-full flex-col p-5" aria-label="Focus score">
      <div className="flex items-start justify-between">
        <div>
          <p className="micro">Focus score</p>
          <p className="mt-1 text-[11px] text-muted">Last 7 days</p>
        </div>
        <span className="chip">
          <Info size={10} /> formula
        </span>
      </div>

      <div className="mt-4 flex flex-1 items-center gap-5">
        {isLoading ? (
          <div className="h-[132px] w-[132px] animate-pulse rounded-full bg-surface" />
        ) : isError ? (
          <div className="w-full">
            <p className="text-[11px] leading-relaxed text-danger">
              The focus score could not be loaded.
            </p>
            <button
              type="button"
              className="btn btn-sm mt-3"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </div>
        ) : data?.score !== null && data?.score !== undefined ? (
          <>
            <ScoreRing score={data.score} />
            <div className="min-w-0 space-y-3">
              <div>
                <p className="micro">Focus ratio</p>
                <p className="numeral text-lg">{percent(data.focusRatio, 1)}</p>
              </div>
              <div>
                <p className="micro">Consistency</p>
                <p className="numeral text-lg">{percent(data.consistencyRatio, 0)}</p>
              </div>
              <div>
                <p className="micro">Interrupted</p>
                <p className="numeral text-sm text-muted">
                  {formatDuration(data.interruptedSeconds)}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="w-full">
            <ScoreRing score={0} />
            <p className="mt-4 text-[11px] leading-relaxed text-muted">
              {data?.explanation ?? "Not enough data yet."}
            </p>
          </div>
        )}
      </div>

      <details className="group mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer list-none text-[11px] text-muted transition-colors hover:text-ink">
          How the score is calculated
        </summary>
        <div className="mt-3 space-y-2">
          <p className="font-mono text-[10px] leading-relaxed text-muted">
            100 × (0.80 × focus ratio + 0.20 × consistency)
          </p>
          {data?.components.map((component) => (
            <div key={component.key} className="text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">{component.label}</span>
                <span className="numeral">
                  {percent(component.value, 1)} · w {component.weight.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
          <p className="text-[10px] leading-relaxed text-muted">
            An application-defined indicator, not a clinical measurement. Paused time is excluded;
            cancelled sessions only affect consistency.
          </p>
        </div>
      </details>
    </section>
  );
}
