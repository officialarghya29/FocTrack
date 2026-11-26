import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { INTERRUPTION_REASONS } from "../../utils/constants";

export interface InterruptionDraft {
  reason: string;
  customReason?: string;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: InterruptionDraft) => Promise<void> | void;
  busy?: boolean;
  defaultReason?: string;
}

export function InterruptionDialog({
  open,
  onClose,
  onSubmit,
  busy = false,
  defaultReason = "phone",
}: Props) {
  const [reason, setReason] = useState(defaultReason);
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason(defaultReason);
      setCustomReason("");
      setNotes("");
      setError(null);
    }
  }, [open, defaultReason]);

  const submit = async () => {
    if (reason === "other" && customReason.trim().length === 0) {
      setError("Describe the distraction so your history stays useful.");
      return;
    }
    setError(null);
    await onSubmit({
      reason,
      customReason: customReason.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log an interruption"
      description="Your session keeps running. This time is recorded as interrupted, not focused."
      footer={
        <>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? "Logging…" : "Log interruption"}
          </button>
        </>
      }
    >
      <fieldset>
        <legend className="label">What pulled you away?</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {INTERRUPTION_REASONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={reason === option.value}
              onClick={() => setReason(option.value)}
              className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                reason === option.value
                  ? "border-accent/60 bg-accent/10 text-ink"
                  : "border-line text-muted hover:border-muted/50 hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {reason === "other" && (
        <div className="mt-4">
          <label htmlFor="custom-reason" className="label">
            Custom reason
          </label>
          <input
            id="custom-reason"
            className="field"
            value={customReason}
            maxLength={120}
            onChange={(event) => setCustomReason(event.target.value)}
            placeholder="Delivery at the door, urgent call…"
          />
        </div>
      )}

      <div className="mt-4">
        <label htmlFor="interruption-notes" className="label">
          Notes <span className="text-muted/60">(optional)</span>
        </label>
        <textarea
          id="interruption-notes"
          className="field h-20 resize-none py-2"
          maxLength={500}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Anything worth remembering later."
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
