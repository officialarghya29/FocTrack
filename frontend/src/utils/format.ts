/** Duration helpers. All values in this app are seconds unless stated. */

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Compact human duration: 0m, 42m, 1h 05m, 3h */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  if (safe < 60) return `${safe}s`;
  const totalMinutes = Math.round(safe / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${pad(minutes)}m`;
}

/** Hours with one decimal, for axes: 1.5h */
export function formatHours(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = safe / 3600;
  if (hours === 0) return "0h";
  if (hours < 1) {
    const minutes = Math.round(safe / 60);
    return minutes >= 60 ? "1h" : `${minutes}m`;
  }
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

export function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function toDateInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function startOfDayIso(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toISOString();
}

export function endOfDayIso(value: string): string {
  const date = new Date(`${value}T23:59:59.999`);
  return date.toISOString();
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function secondsBetween(startIso: string, endIso?: string | null): number {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, (end - new Date(startIso).getTime()) / 1000);
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}
