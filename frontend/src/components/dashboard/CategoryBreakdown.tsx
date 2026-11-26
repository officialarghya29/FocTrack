import type { CategorySlice } from "../../types";
import { formatDuration, percent } from "../../utils/format";
import { EmptyState } from "../common/Primitives";

export function CategoryBreakdown({ slices }: { slices: CategorySlice[] }) {
  if (slices.length === 0) {
    return (
      <EmptyState
        title="No category data"
        description="Category distribution appears once completed sessions are tagged."
      />
    );
  }

  const max = Math.max(...slices.map((slice) => slice.focusedSeconds));

  return (
    <ul className="space-y-3.5">
      {slices.slice(0, 5).map((slice) => (
        <li key={`${slice.categoryId ?? "none"}-${slice.name}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-[12px]">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <span className="truncate">{slice.name}</span>
            </span>
            <span className="numeral shrink-0 text-[11px] text-muted">
              {formatDuration(slice.focusedSeconds)}
              <span className="ml-1.5 text-[10px] opacity-70">{percent(slice.share)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (slice.focusedSeconds / max) * 100)}%`,
                backgroundColor: slice.color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
