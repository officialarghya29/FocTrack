import { Modal } from "../common/Modal";
import type { Session } from "../../types";
import { formatDuration, formatTime } from "../../utils/format";

export function SessionSummaryDialog({
  session,
  open,
  onClose,
  onOverview,
}: {
  session: Session | null;
  open: boolean;
  onClose: () => void;
  onOverview: () => void;
}) {
  if (!session) return null;

  const rows = [
    { label: "Focused time", value: formatDuration(session.focusedSeconds), accent: true },
    { label: "Interrupted", value: formatDuration(session.interruptedSeconds) },
    { label: "Paused", value: formatDuration(session.pausedSeconds) },
    { label: "Interruptions", value: String(session.interruptionCount) },
    { label: "Started", value: formatTime(session.startedAt) },
    { label: "Ended", value: formatTime(session.endedAt) },
  ];

  const targetHit =
    session.targetDuration && session.focusedSeconds >= session.targetDuration;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Session recorded"
      description={session.title}
      footer={
        <>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Stay here
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onOverview}>
            View overview
          </button>
        </>
      }
    >
      <div className="rounded-md border border-line bg-base/60 p-5">
        <p className="micro">Focused time</p>
        <p className="numeral mt-2 text-4xl font-light">{formatDuration(session.focusedSeconds)}</p>
        {session.targetDuration && (
          <p className="mt-2 text-[11px] text-muted">
            {targetHit ? "Target reached." : "Below target."} Target was{" "}
            {formatDuration(session.targetDuration)}.
          </p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-[13px] sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5 border-b border-hairline pb-2">
            <dt className="micro">{row.label}</dt>
            <dd className={`numeral ${row.accent ? "text-accent" : "text-ink"}`}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {session.interruptions.length > 0 && (
        <div className="mt-4">
          <p className="micro mb-2">Interruptions logged</p>
          <ul className="space-y-1 text-[12px]">
            {session.interruptions.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-muted">
                <span className="truncate">{item.label}</span>
                <span className="numeral shrink-0">{formatDuration(item.durationSeconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-[11px] text-muted">
        {session.status === "CANCELLED"
          ? "Cancelled sessions are kept for consistency tracking but excluded from focus totals."
          : "Paused time was excluded from focused time. Nothing here was estimated."}
      </p>
    </Modal>
  );
}
