import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import type { Session } from "../../types";
import { formatDate, formatDuration, formatTime } from "../../utils/format";
import { Modal, ConfirmDialog } from "../common/Modal";

export function SessionDetail({
  session,
  onClose,
}: {
  session: Session | null;
  onClose: () => void;
}) {
  const { notify, errorMessage } = useApp();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteSession(id),
    onSuccess: async () => {
      notify("Session deleted.", "success");
      setConfirming(false);
      onClose();
      await queryClient.invalidateQueries();
    },
    onError: (error) => notify(errorMessage(error), "error"),
  });

  if (!session) return null;

  const rows = [
    { label: "Category", value: session.category?.name ?? "Uncategorized" },
    { label: "Status", value: session.status.toLowerCase() },
    { label: "Date", value: formatDate(session.startedAt) },
    { label: "Started", value: formatTime(session.startedAt) },
    { label: "Ended", value: formatTime(session.endedAt) },
    { label: "Target", value: session.targetDuration ? formatDuration(session.targetDuration) : "Open" },
    { label: "Focused", value: formatDuration(session.focusedSeconds) },
    { label: "Interrupted", value: formatDuration(session.interruptedSeconds) },
    { label: "Paused", value: formatDuration(session.pausedSeconds) },
  ];

  return (
    <>
      <Modal
        open={Boolean(session)}
        onClose={onClose}
        title={session.title}
        description={`${formatDate(session.startedAt)} · ${formatDuration(session.focusedSeconds)} focused`}
        width="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-danger btn-sm mr-auto"
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={13} /> Delete session
            </button>
            <button type="button" className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </>
        }
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="border-b border-hairline pb-2">
              <dt className="micro">{row.label}</dt>
              <dd className="mt-1 text-[13px]">{row.value}</dd>
            </div>
          ))}
        </dl>

        {session.notes && (
          <div className="mt-5">
            <p className="micro mb-1.5">Notes</p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
              {session.notes}
            </p>
          </div>
        )}

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="micro">Interruptions</p>
            <span className="numeral text-[11px] text-muted">
              {formatDuration(session.interruptedSeconds)}
            </span>
          </div>
          {session.interruptions.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[11px] text-muted">
              No interruptions were logged in this session.
            </p>
          ) : (
            <ul className="divide-y divide-hairline rounded-md border border-line">
              {session.interruptions.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[12px]">{item.label}</p>
                    <p className="text-[10px] text-muted">
                      {formatTime(item.startedAt)} → {formatTime(item.endedAt ?? item.startedAt)}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </p>
                  </div>
                  <span className="numeral shrink-0 text-[11px] text-muted">
                    {formatDuration(item.durationSeconds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {session.isDemo && (
          <p className="mt-4 rounded border border-violet/30 bg-violet/[0.06] px-3 py-2 text-[11px] text-violet">
            This is demo data, not a measured session.
          </p>
        )}
      </Modal>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate(session.id)}
        title="Delete this session?"
        description="The session and all of its interruptions will be permanently removed. Analytics will be recalculated without it."
        confirmLabel="Delete permanently"
        destructive
        busy={remove.isPending}
      />
    </>
  );
}
