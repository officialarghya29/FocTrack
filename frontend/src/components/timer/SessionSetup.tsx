import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleDot, Clock3, Layers, ShieldCheck } from "lucide-react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { TARGET_PRESETS } from "../../utils/constants";
import { PageHeader } from "../common/Primitives";

export function SessionSetup() {
  const { settings, profile, notify, errorMessage } = useApp();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });

  const defaultMinutes = Math.round((settings?.defaultTargetDuration ?? 1500) / 60);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [customMinutes, setCustomMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: api.createSession,
    onSuccess: (session) => {
      queryClient.setQueryData(["session", "active"], session);
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      notify("Session started. Protect the next block.", "success");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give the session a name so your history stays readable.");
      return;
    }
    setError(null);
    mutation.mutate({
      title: trimmed,
      categoryId,
      targetDuration: minutes * 60,
      notes: notes.trim() || null,
    });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Focus · new session"
        title="Start a focused session"
        description="Pick a task, choose a target and log distractions as they happen. Focused time is measured from timestamps, never from a ticking counter."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <form onSubmit={submit} className="panel p-5 sm:p-6" aria-label="Start a focus session">
          <div>
            <label htmlFor="session-title" className="label">
              What are you working on?
            </label>
            <input
              id="session-title"
              className="field h-12 text-[15px]"
              placeholder="e.g. Rewrite the session engine"
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="label mb-0">Category</span>
              <span className="text-[11px] text-muted">
                {categories.data?.length ?? 0} available
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryId(null)}
                aria-pressed={categoryId === null}
                className={`chip transition-colors ${
                  categoryId === null
                    ? "border-accent/60 bg-accent/10 text-ink"
                    : "hover:border-muted/50 hover:text-ink"
                }`}
              >
                None
              </button>
              {categories.data?.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  aria-pressed={categoryId === category.id}
                  className={`chip transition-colors ${
                    categoryId === category.id
                      ? "border-accent/60 bg-accent/10 text-ink"
                      : "hover:border-muted/50 hover:text-ink"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span className="label">Target duration</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {TARGET_PRESETS.map((preset) => (
                <button
                  key={preset.minutes}
                  type="button"
                  onClick={() => {
                    setMinutes(preset.minutes);
                    setCustomMinutes("");
                  }}
                  aria-pressed={minutes === preset.minutes && customMinutes === ""}
                  className={`rounded-md border px-3 py-2 font-mono text-xs transition-colors ${
                    minutes === preset.minutes && customMinutes === ""
                      ? "border-accent/60 bg-accent/10 text-ink"
                      : "border-line text-muted hover:border-muted/50 hover:text-ink"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <div className="flex items-center gap-2 rounded-md border border-line px-2.5">
                <input
                  aria-label="Custom target in minutes"
                  type="number"
                  min={1}
                  max={480}
                  placeholder="Custom"
                  className="h-9 w-20 bg-transparent font-mono text-xs outline-none placeholder:text-muted/60"
                  value={customMinutes}
                  onChange={(event) => {
                    setCustomMinutes(event.target.value);
                    const parsed = Number.parseInt(event.target.value, 10);
                    if (!Number.isNaN(parsed) && parsed > 0) {
                      setMinutes(Math.min(480, parsed));
                    }
                  }}
                />
                <span className="font-mono text-[10px] uppercase text-muted">min</span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Open-ended sessions are fine too — a target only drives the progress ring.
            </p>
          </div>

          <div className="mt-5">
            <label htmlFor="session-notes" className="label">
              Notes <span className="text-muted/60">(optional)</span>
            </label>
            <textarea
              id="session-notes"
              className="field h-24 resize-none py-2.5"
              maxLength={1000}
              placeholder="Definition of done, questions to resolve…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-[11px] text-muted">
              Starting as <span className="text-ink">{profile?.username ?? "local profile"}</span>
            </p>
            <button
              type="submit"
              className="btn btn-primary h-11 px-5"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Starting…" : "Start session"}
              <ArrowRight size={15} />
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="panel p-5">
            <p className="micro mb-4">What gets measured</p>
            <ul className="space-y-4">
              {[
                {
                  icon: Clock3,
                  title: "Focused time",
                  body: "Active time minus every recorded interruption. Pauses are excluded, never counted as focus.",
                },
                {
                  icon: CircleDot,
                  title: "Interruptions",
                  body: "Every distraction is timestamped with a reason, so patterns become visible.",
                },
                {
                  icon: Layers,
                  title: "Consistency",
                  body: "Completed versus started sessions. One session at a time, enforced by the database.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <item.icon size={15} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.7} />
                  <div>
                    <p className="text-[13px] font-medium">{item.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-positive" />
              <p className="text-[13px] font-medium">Local-first by default</p>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Sessions live in your own database. Nothing is sent to a third party, and you can
              export or delete everything from Settings.
            </p>
          </div>

          {profile && profile.totalSessions === 0 && (
            <div className="rounded-lg border border-dashed border-line p-5">
              <p className="micro mb-2">First session?</p>
              <p className="text-[11px] leading-relaxed text-muted">
                Try a short 15 minute block and log the first distraction you feel. The dashboard
                stays honest until you have real data.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
