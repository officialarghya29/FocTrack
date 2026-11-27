import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Check,
  Database,
  Download,
  Info,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import type { Category, ImportSummary } from "../types";
import { ACCENT_SWATCHES, CATEGORY_COLORS } from "../utils/constants";
import { PageHeader, SectionHeading } from "../components/common/Primitives";
import { ConfirmDialog } from "../components/common/Modal";
import { formatDuration } from "../utils/format";

function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </label>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? "border-accent bg-accent/25" : "border-line bg-surface"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
            checked ? "left-[18px] bg-accent" : "left-0.5 bg-muted"
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsPage() {
  const { settings, profile, updateSettings, updateProfile, notify, errorMessage, refreshAll } =
    useApp();
  const queryClient = useQueryClient();

  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newColor, setNewColor] = useState<string>(CATEGORY_COLORS[0]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(CATEGORY_COLORS[0]);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setEmail(profile.email ?? "");
    }
  }, [profile]);

  const addCategory = useMutation({
    mutationFn: api.createCategory,
    onSuccess: async () => {
      setNewCategory("");
      notify("Category created.", "success");
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => notify(errorMessage(error), "error"),
  });

  const renameCategory = useMutation({
    mutationFn: ({ id, name, color }: { id: number; name: string; color: string }) =>
      api.updateCategory(id, { name, color }),
    onSuccess: async () => {
      setEditing(null);
      notify("Category updated.", "success");
      await queryClient.invalidateQueries();
    },
    onError: (error) => notify(errorMessage(error), "error"),
  });

  const removeCategory = useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      notify("Category deleted. Its sessions are now uncategorized.", "success");
      await queryClient.invalidateQueries();
    },
    onError: (error) => notify(errorMessage(error), "error"),
  });

  const seedDemo = useMutation({
    mutationFn: api.seedDemo,
    onSuccess: async (result) => {
      notify(result.message, "success");
      await refreshAll();
    },
    onError: (error) => notify(errorMessage(error), "error"),
  });

  const clearDemo = useMutation({
    mutationFn: api.clearDemo,
    onSuccess: async (result) => {
      setConfirmClearDemo(false);
      notify(result.message, "success");
      await refreshAll();
    },
    onError: (error) => notify(errorMessage(error), "error"),
  });

  const wipeData = useMutation({
    mutationFn: api.deleteAllData,
    onSuccess: async (result) => {
      setConfirmWipe(false);
      notify(`${result.deletedSessions} sessions deleted.`, "success");
      await refreshAll();
    },
    onError: (error) => notify(errorMessage(error), "error"),
  });

  const importCsv = useMutation({
    mutationFn: api.importCsv,
    onSuccess: async (result) => {
      setImportResult(result);
      setImportError(null);
      notify(
        result.skipped > 0
          ? `Imported ${result.imported} sessions; skipped ${result.skipped}.`
          : `Imported ${result.imported} sessions.`,
        result.skipped > 0 ? "info" : "success"
      );
      await refreshAll();
    },
    onError: (error) => {
      setImportResult(null);
      setImportError(errorMessage(error));
      notify(errorMessage(error), "error");
    },
  });

  if (!settings || !profile) {
    return (
      <div className="flex items-center gap-3 py-20 text-muted" role="status">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
        <span className="micro">Loading settings</span>
      </div>
    );
  }

  const notificationPermission =
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported";

  const toggleNotifications = async (next: boolean) => {
    if (!next) {
      await updateSettings({ notificationsEnabled: false });
      return;
    }
    if (!("Notification" in window)) {
      notify("This browser does not support notifications.", "error");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      notify("Notification permission was not granted, so the setting stays off.", "error");
      return;
    }
    if (await updateSettings({ notificationsEnabled: true })) {
      notify("Target reminders are on.", "success");
    }
  };

  const saveProfile = async () => {
    if (!username.trim()) {
      notify("A profile name is required.", "error");
      return;
    }
    await updateProfile({ username: username.trim(), email: email.trim() || null });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Preferences and data"
        description="Everything here is stored with your profile. Nothing is shared or sent to a third party."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel p-5">
          <SectionHeading title="Profile" hint="Local profile mode" />
          <div className="space-y-4">
            <div>
              <label htmlFor="profile-name" className="label">
                Display name
              </label>
              <input
                id="profile-name"
                className="field"
                value={username}
                maxLength={80}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="profile-email" className="label">
                Email <span className="text-muted/60">(optional, never sent anywhere)</span>
              </label>
              <input
                id="profile-email"
                type="email"
                className="field"
                value={email}
                maxLength={255}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-[11px] text-muted">
                {`Joined ${new Date(profile.createdAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}`}{" "}
                · {profile.totalSessions} completed
              </p>
              <button type="button" className="btn btn-sm" onClick={() => void saveProfile()}>
                Save profile
              </button>
            </div>
          </div>
          <p className="mt-4 rounded-md border border-line bg-base/60 px-3 py-2 text-[10px] leading-relaxed text-muted">
            FocTrack runs as a single local profile. There are no passwords and no account system,
            so the app never pretends to offer secure multi-user authentication.
          </p>
        </section>

        <section className="panel p-5">
          <SectionHeading title="Appearance" hint="Theme and accent" />
          <p className="label">Theme</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(["dark", "light", "system"] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => void updateSettings({ theme })}
                aria-pressed={settings.theme === theme}
                className={`rounded-md border px-3 py-2.5 text-left text-xs capitalize transition-colors ${
                  settings.theme === theme
                    ? "border-accent/60 bg-accent/10"
                    : "border-line text-muted hover:border-muted/50"
                }`}
              >
                {theme}
                <span className="mt-1 block font-mono text-[9px] uppercase tracking-micro text-muted">
                  {theme === "system" ? "follows OS" : `${theme} palette`}
                </span>
              </button>
            ))}
          </div>

          <p className="label mt-5">Accent colour</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_SWATCHES.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                onClick={() => void updateSettings({ accentColor: swatch.value })}
                aria-label={`Use ${swatch.name} accent`}
                aria-pressed={settings.accentColor.toUpperCase() === swatch.value.toUpperCase()}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-105 ${
                  settings.accentColor.toUpperCase() === swatch.value.toUpperCase()
                    ? "border-ink"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: swatch.value }}
              >
                {settings.accentColor.toUpperCase() === swatch.value.toUpperCase() && (
                  <Check size={13} className="text-[#0B0F0C]" />
                )}
              </button>
            ))}
          </div>

          <p className="label mt-5">Default session target</p>
          <div className="flex items-center gap-2">
            <select
              aria-label="Default session target in minutes"
              className="field w-32"
              value={settings.defaultTargetDuration / 60}
              onChange={(event) =>
                void updateSettings({ defaultTargetDuration: Number(event.target.value) * 60 })
              }
            >
              {[15, 25, 30, 45, 60, 90].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted">
              = {formatDuration(settings.defaultTargetDuration)}
            </span>
          </div>
        </section>

        <section className="panel p-5">
          <SectionHeading title="Behaviour" hint="Transparent by design" />
          <div className="divide-y divide-hairline">
            <Toggle
              id="toggle-notifications"
              checked={settings.notificationsEnabled}
              onChange={(next) => void toggleNotifications(next)}
              label="Target reminders"
              description={
                notificationPermission === "denied"
                  ? "Browser permission is blocked. Re-enable notifications in your browser settings first."
                  : "Show a system notification when a running session reaches its target."
              }
            />
            <Toggle
              id="toggle-sound"
              checked={settings.soundEnabled}
              onChange={(next) => void updateSettings({ soundEnabled: next })}
              label="Completion tone"
              description="Play a short tone when the target is reached. No audio is loaded from the network."
            />
            <Toggle
              id="toggle-idle"
              checked={settings.autoIdleDetectionEnabled}
              onChange={(next) => void updateSettings({ autoIdleDetectionEnabled: next })}
              label="Inactivity prompt"
              description="After a quiet period, ask whether to log an interruption. It never logs one automatically and never records keystrokes or screen content."
            />
          </div>
          {settings.autoIdleDetectionEnabled && (
            <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
              <label htmlFor="idle-threshold" className="text-[11px] text-muted">
                Quiet period before prompting
              </label>
              <select
                id="idle-threshold"
                className="field h-8 w-28 text-xs"
                value={settings.idleThresholdSeconds}
                onChange={(event) =>
                  void updateSettings({ idleThresholdSeconds: Number(event.target.value) })
                }
              >
                {[60, 120, 300, 600].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds / 60} min
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="mt-4 flex items-start gap-2 rounded-md border border-line bg-base/60 px-3 py-2">
            <Bell size={12} className="mt-0.5 shrink-0 text-muted" />
            <p className="text-[10px] leading-relaxed text-muted">
              Notification permission: <span className="text-ink">{notificationPermission}</span>.
              FocTrack never requests permission until you switch reminders on.
            </p>
          </div>
        </section>

        <section className="panel p-5">
          <SectionHeading title="Categories" hint="Used to group sessions" />
          <div className="space-y-1.5">
            {categories.data?.map((category) => (
              <div
                key={category.id}
                className="flex items-center gap-2 rounded-md border border-transparent px-1 py-1.5 hover:border-line"
              >
                {editing?.id === category.id ? (
                  <>
                    <input
                      type="color"
                      aria-label={`Colour for ${category.name}`}
                      value={editColor}
                      onChange={(event) => setEditColor(event.target.value)}
                      className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                    />
                    <input
                      className="field h-8 flex-1 text-xs"
                      value={editName}
                      aria-label={`Name for ${category.name}`}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-primary h-8 px-2"
                      onClick={() =>
                        renameCategory.mutate({
                          id: category.id,
                          name: editName,
                          color: editColor,
                        })
                      }
                      disabled={renameCategory.isPending}
                      aria-label="Save category"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm h-8 px-2"
                      onClick={() => setEditing(null)}
                      aria-label="Cancel editing"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="flex-1 truncate text-[13px]">{category.name}</span>
                    {category.isDefault && <span className="micro opacity-50">default</span>}
                    <button
                      type="button"
                      aria-label={`Edit ${category.name}`}
                      className="p-1 text-muted hover:text-ink"
                      onClick={() => {
                        setEditing(category);
                        setEditName(category.name);
                        setEditColor(category.color);
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${category.name}`}
                      className="p-1 text-muted hover:text-danger"
                      onClick={() => setDeleteTarget(category)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <form
            className="mt-4 flex items-center gap-2 border-t border-line pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newCategory.trim()) return;
              addCategory.mutate({ name: newCategory.trim(), color: newColor });
            }}
          >
            <input
              className="field h-9 flex-1 text-xs"
              placeholder="New category name"
              maxLength={60}
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              aria-label="New category name"
            />
            <select
              className="field h-9 w-20 text-xs"
              value={newColor}
              onChange={(event) => setNewColor(event.target.value)}
              aria-label="New category colour"
            >
              {CATEGORY_COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="btn btn-sm h-9"
              disabled={addCategory.isPending || !newCategory.trim()}
            >
              <Plus size={13} /> Add
            </button>
          </form>
        </section>

        <section className="panel p-5 xl:col-span-2">
          <SectionHeading title="Data" hint="Export, import, demo mode, deletion" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-line p-4">
              <Download size={15} className="text-cyan" />
              <p className="mt-2 text-[13px] font-medium">Export everything</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Download a JSON file with your profile, settings, categories, sessions and
                interruptions.
              </p>
              <a href={api.exportUrl()} className="btn btn-sm mt-3 w-full" download>
                Export JSON
              </a>
            </div>

            <div className="rounded-md border border-line p-4">
              <Upload size={15} className="text-accent" />
              <p className="mt-2 text-[13px] font-medium">Import CSV</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Add completed sessions from a UTF-8 CSV. Malformed rows are reported by line and
                skipped; valid rows are kept.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Choose a CSV file to import"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) importCsv.mutate(file);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className="btn btn-sm mt-3 w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={importCsv.isPending}
              >
                {importCsv.isPending ? "Importing…" : "Choose CSV"}
              </button>
              <a
                href={api.csvTemplateUrl()}
                download
                className="mt-2 block text-center text-[10px] text-muted underline decoration-line underline-offset-2 hover:text-ink"
              >
                Download template
              </a>
              {importError && (
                <p role="alert" className="mt-2 text-[10px] leading-relaxed text-danger">
                  {importError}
                </p>
              )}
              {importResult && (
                <div className="mt-2 rounded border border-line bg-base/60 px-2 py-1.5 text-[10px] leading-relaxed text-muted">
                  <p>
                    <span className="text-accent">{importResult.imported} imported</span>
                    {" · "}
                    {importResult.skipped} skipped
                    {importResult.categoriesCreated > 0 &&
                      ` · ${importResult.categoriesCreated} categories added`}
                  </p>
                  {importResult.errors.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {importResult.errors.slice(0, 3).map((item) => (
                        <li key={`${item.row}-${item.message}`} className="text-danger/80">
                          Row {item.row}: {item.message}
                        </li>
                      ))}
                      {importResult.errors.length > 3 && (
                        <li>+{importResult.errors.length - 3} more row errors</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-md border border-line p-4">
              <Database size={15} className="text-violet" />
              <p className="mt-2 text-[13px] font-medium">Demo data</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Add or remove clearly labelled sample sessions. Real data is never touched.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm flex-1"
                  onClick={() => seedDemo.mutate()}
                  disabled={seedDemo.isPending}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="btn btn-sm flex-1"
                  onClick={() => setConfirmClearDemo(true)}
                  disabled={clearDemo.isPending}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="rounded-md border border-danger/25 bg-danger/[0.04] p-4">
              <Trash2 size={15} className="text-danger" />
              <p className="mt-2 text-[13px] font-medium">Delete all sessions</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Permanently removes every session and interruption. Categories and settings stay.
              </p>
              <button
                type="button"
                className="btn btn-danger btn-sm mt-3 w-full"
                onClick={() => setConfirmWipe(true)}
              >
                Delete history
              </button>
            </div>
          </div>
        </section>

        <section className="panel p-5 xl:col-span-2">
          <SectionHeading title="About FocTrack" hint="v1.0.0" />
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <ShieldCheck size={13} className="text-positive" /> Privacy
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                No keystroke logging, no screenshots, no browsing history. Inactivity detection is
                opt-in and only keeps an in-memory timestamp.
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <Info size={13} className="text-cyan" /> Focus score
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                100 × (0.80 × focus ratio + 0.20 × consistency). An application-defined indicator,
                not a clinically validated measurement.
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <Volume2 size={13} className="text-warn" /> Storage
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Sessions are stored in SQLite on the machine running the API. Browser storage only
                remembers your theme preference.
              </p>
            </div>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <a
              href="https://github.com/officialarghya29/FocTrack"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-micro text-muted transition-colors hover:text-ink"
            >
              Source repository ↗
            </a>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && removeCategory.mutate(deleteTarget.id)}
        title={`Delete ${deleteTarget?.name ?? "category"}?`}
        description="Sessions in this category are kept, but they become uncategorized. This cannot be undone."
        confirmLabel="Delete category"
        destructive
        busy={removeCategory.isPending}
      />

      <ConfirmDialog
        open={confirmClearDemo}
        onClose={() => setConfirmClearDemo(false)}
        onConfirm={() => clearDemo.mutate()}
        title="Remove demo data?"
        description="Only sessions flagged as demo data are removed. Your measured sessions stay untouched."
        confirmLabel="Remove demo data"
        destructive
        busy={clearDemo.isPending}
      />

      <ConfirmDialog
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        onConfirm={() => wipeData.mutate()}
        title="Delete all session history?"
        description="Every session and interruption will be permanently deleted. Export first if you want a copy. Categories, settings and your profile are kept."
        confirmLabel="Delete everything"
        destructive
        busy={wipeData.isPending}
      />
    </div>
  );
}
