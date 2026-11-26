import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CircleAlert,
  CircleStop,
  Clock3,
  Coffee,
  LogOut,
  Pause,
  Play,
  Plus,
  Radio,
  TimerReset,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useLiveSession } from "../hooks/useLiveSession";
import { useSessionMutations } from "../hooks/useSessionData";
import { useIdlePrompt } from "../hooks/useIdlePrompt";
import { useTargetAlert } from "../hooks/useTargetAlert";
import { useTicker } from "../hooks/useTicker";
import { formatClock, formatDuration, formatTime } from "../utils/format";
import { PageHeader, EmptyState, LoadingBlock, ErrorState } from "../components/common/Primitives";
import { ConfirmDialog } from "../components/common/Modal";
import { TimerDial } from "../components/timer/TimerDial";
import { SessionSetup } from "../components/timer/SessionSetup";
import {
  InterruptionDialog,
  type InterruptionDraft,
} from "../components/timer/InterruptionDialog";
import { SessionSummaryDialog } from "../components/timer/SessionSummaryDialog";
import type { Interruption, Session } from "../types";

function OpenInterruptionTimer({ item }: { item: Interruption }) {
  const running = item.endedAt === null;
  const now = useTicker(running);
  const live = running
    ? Math.max(0, (now - new Date(item.startedAt).getTime()) / 1000)
    : item.durationSeconds;
  return <span className="numeral text-[11px] text-danger">{formatClock(live)}</span>;
}

export function FocusPage() {
  const navigate = useNavigate();
  const { settings } = useApp();
  const { session, query, focusedSeconds, interruptedSeconds, pausedSeconds, elapsedSeconds, progress } =
    useLiveSession();
  const mutations = useSessionMutations(session?.id);

  const [summary, setSummary] = useState<Session | null>(null);
  const [interruptionOpen, setInterruptionOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Interruption | null>(null);
  const [idleReason, setIdleReason] = useState("phone");

  const idle = useIdlePrompt(
    Boolean(settings?.autoIdleDetectionEnabled && session?.status === "ACTIVE"),
    settings?.idleThresholdSeconds ?? 120
  );

  useTargetAlert({
    sessionId: session?.id ?? null,
    targetSeconds: session?.targetDuration ?? null,
    focusedSeconds,
    notificationsEnabled: Boolean(settings?.notificationsEnabled),
    soundEnabled: Boolean(settings?.soundEnabled),
    title: session?.title ?? "Focus session",
  });

  if (query.isLoading) return <LoadingBlock label="Recovering session state" />;
  if (query.isError) {
    return (
      <ErrorState
        message="The session state could not be loaded from the API."
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!session) {
    return (
      <>
        <SessionSetup />
        <SessionSummaryDialog
          session={summary}
          open={Boolean(summary)}
          onClose={() => setSummary(null)}
          onOverview={() => {
            setSummary(null);
            navigate("/");
          }}
        />
      </>
    );
  }

  const openInterruption = session.interruptions.find((item) => item.isOpen);

  const logInterruption = async (draft: InterruptionDraft) => {
    try {
      await mutations.addInterruption.mutateAsync(draft);
      setInterruptionOpen(false);
    } catch {
      /* the mutation surfaces its own error toast */
    }
  };

  const finish = async () => {
    try {
      const result = await mutations.complete.mutateAsync();
      setSummary(result.session);
    } catch {
      /* handled by toast */
    }
  };

  const cancel = async () => {
    try {
      await mutations.cancel.mutateAsync();
      setCancelOpen(false);
    } catch {
      /* handled by toast */
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Focus · live session"
        title="Protect the block"
        description="Focused time is derived from timestamps. Refreshing this page will not reset the clock."
        actions={
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setIdleReason("phone");
              setInterruptionOpen(true);
            }}
            disabled={session.status !== "ACTIVE"}
          >
            <Plus size={14} /> Log interruption
          </button>
        }
      />

      {idle.isIdle && (
        <div
          role="status"
          className="mb-4 flex flex-col gap-3 rounded-lg border border-warn/40 bg-warn/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <CircleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
            <div>
              <p className="text-[13px] font-medium">No activity detected for a while</p>
              <p className="text-[11px] text-muted">
                FocTrack does not assume you are distracted. Log it only if you actually were.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="btn btn-sm" onClick={idle.dismiss}>
              I&apos;m here
            </button>
            <button
              type="button"
              className="btn btn-sm border-warn/40 text-warn"
              onClick={() => {
                setIdleReason("fatigue");
                setInterruptionOpen(true);
                idle.dismiss();
              }}
            >
              Log interruption
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel px-4 py-8 sm:px-8 sm:py-10">
          <TimerDial
            focusedSeconds={focusedSeconds}
            progress={progress}
            status={session.status}
            title={session.title}
            categoryName={session.category?.name ?? null}
            categoryColor={session.category?.color ?? null}
            targetSeconds={session.targetDuration}
          />

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {session.status === "ACTIVE" ? (
              <button
                type="button"
                className="btn btn-primary h-11 min-w-[132px]"
                onClick={() => mutations.pause.mutate()}
                disabled={mutations.pause.isPending}
              >
                <Pause size={15} /> Pause
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary h-11 min-w-[132px]"
                onClick={() => mutations.resume.mutate()}
                disabled={mutations.resume.isPending}
              >
                <Play size={15} /> Resume
              </button>
            )}

            <button
              type="button"
              className="btn h-11 border-accent/40 text-accent hover:border-accent"
              onClick={() => void finish()}
              disabled={mutations.complete.isPending}
            >
              <CircleStop size={15} /> Finish
            </button>

            <button
              type="button"
              className="btn btn-ghost h-11 text-muted"
              onClick={() => setCancelOpen(true)}
            >
              <X size={15} /> Cancel
            </button>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-y-5 border-t border-line pt-6 sm:grid-cols-4">
            {[
              { label: "Wall time", value: formatClock(elapsedSeconds), icon: Clock3 },
              { label: "Interrupted", value: formatClock(interruptedSeconds), icon: Radio },
              { label: "Paused", value: formatClock(pausedSeconds), icon: Coffee },
              { label: "Started at", value: formatTime(session.startedAt), icon: TimerReset },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
                <p className="micro flex items-center gap-1.5">
                  <stat.icon size={11} /> {stat.label}
                </p>
                <p className="numeral text-[15px]">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[13px] font-medium">Interruptions</p>
              <span className="chip">{session.interruptionCount}</span>
            </div>
            {session.interruptions.length === 0 ? (
              <EmptyState
                icon={<LogOut size={16} />}
                title="No distractions logged"
                description="When something pulls you away, log it here. The session keeps running."
              />
            ) : (
              <ul className="divide-y divide-hairline">
                {session.interruptions.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        item.isOpen ? "animate-pulse bg-danger" : "bg-muted/50"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px]">{item.label}</p>
                      <p className="text-[10px] text-muted">
                        {formatTime(item.startedAt)}
                        {item.notes ? ` · ${item.notes}` : ""}
                      </p>
                    </div>
                    {item.isOpen ? (
                      <button
                        type="button"
                        className="chip border-danger/40 text-danger"
                        onClick={() => mutations.endInterruption.mutate(item.id)}
                      >
                        End
                      </button>
                    ) : (
                      <span className="numeral text-[11px] text-muted">
                        {formatDuration(item.durationSeconds)}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete interruption ${item.label}`}
                      className="text-muted/60 transition-colors hover:text-danger"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {openInterruption && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
                <span className="flex items-center gap-2 text-[11px] text-danger">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
                  Currently interrupted
                </span>
                <OpenInterruptionTimer item={openInterruption} />
              </div>
            )}
            <div className="border-t border-line p-3">
              <button
                type="button"
                className="btn w-full text-xs"
                onClick={() => {
                  setIdleReason("phone");
                  setInterruptionOpen(true);
                }}
                disabled={session.status !== "ACTIVE"}
              >
                <Plus size={13} /> Log interruption
              </button>
              {session.status !== "ACTIVE" && (
                <p className="mt-2 text-center text-[10px] text-muted">
                  Resume the session to log distractions.
                </p>
              )}
            </div>
          </div>

          <div className="panel p-4">
            <p className="micro mb-3">Session</p>
            <dl className="space-y-2 text-[12px]">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Target</dt>
                <dd className="numeral">
                  {session.targetDuration ? formatDuration(session.targetDuration) : "Open"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Progress</dt>
                <dd className="numeral">{Math.round(progress * 100)}%</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Interruptions</dt>
                <dd className="numeral">{session.interruptionCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Status</dt>
                <dd className="font-mono text-[11px] uppercase tracking-micro">{session.status}</dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-[10px] leading-relaxed text-muted">
                Focused time = active time − interruptions. Pauses sit outside both.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <InterruptionDialog
        open={interruptionOpen}
        onClose={() => setInterruptionOpen(false)}
        onSubmit={logInterruption}
        busy={mutations.addInterruption.isPending}
        defaultReason={idleReason}
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void cancel()}
        title="Cancel this session?"
        description="The session is stored as cancelled. Its focused time is excluded from your focus totals but it still counts against consistency."
        confirmLabel="Cancel session"
        destructive
        busy={mutations.cancel.isPending}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            mutations.deleteInterruption.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title="Delete this interruption?"
        description="The recorded interruption and its duration will be removed from this session. Focused time is recalculated by the server."
        confirmLabel="Delete"
        destructive
      />

      <SessionSummaryDialog
        session={summary}
        open={Boolean(summary)}
        onClose={() => setSummary(null)}
        onOverview={() => {
          setSummary(null);
          navigate("/");
        }}
      />
    </div>
  );
}
