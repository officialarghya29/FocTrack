import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { Session } from "../../types";
import { formatDateShort, formatDuration, formatTime } from "../../utils/format";
import { EmptyState } from "../common/Primitives";

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "text-accent",
  CANCELLED: "text-muted/70",
  ACTIVE: "text-cyan",
  PAUSED: "text-warn",
};

export function RecentSessions({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No sessions recorded yet"
        description="Completed and cancelled sessions will appear here with their real measured durations."
      >
        <Link to="/focus" className="btn btn-sm">
          Start a session
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="-mx-5 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {["Session", "Started", "Focused", "Interrupted", "Status"].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="micro whitespace-nowrap px-5 py-2 font-normal first:pl-5 sm:first:pl-0"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {sessions.map((session) => (
            <tr key={session.id} className="group transition-colors hover:bg-surface/40">
              <td className="max-w-[260px] px-5 py-3 first:pl-5 sm:first:pl-0">
                <div className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: session.category?.color ?? "var(--muted)" }}
                  />
                  <span className="truncate text-[13px]">{session.title}</span>
                </div>
                <p className="mt-0.5 truncate pl-3.5 text-[10px] text-muted">
                  {session.category?.name ?? "Uncategorized"}
                  {session.isDemo && " · demo"}
                </p>
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <span className="text-[12px]">{formatDateShort(session.startedAt)}</span>
                <span className="ml-2 text-[10px] text-muted">{formatTime(session.startedAt)}</span>
              </td>
              <td className="numeral whitespace-nowrap px-5 py-3 text-[12px]">
                {formatDuration(session.focusedSeconds)}
              </td>
              <td className="numeral whitespace-nowrap px-5 py-3 text-[12px] text-muted">
                {session.interruptionCount > 0 ? (
                  <>
                    {formatDuration(session.interruptedSeconds)}
                    <span className="ml-1.5 text-[10px]">({session.interruptionCount})</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <span
                  className={`font-mono text-[9px] uppercase tracking-micro ${STATUS_COLOR[session.status] ?? "text-muted"}`}
                >
                  {session.status.toLowerCase()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end px-5 pt-3 sm:px-0">
        <Link
          to="/history"
          className="inline-flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-ink"
        >
          Full history <ArrowUpRight size={12} />
        </Link>
      </div>
    </div>
  );
}
