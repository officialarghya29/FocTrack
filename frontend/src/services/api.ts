import type {
  ActionResponse,
  CategoriesAnalytics,
  Category,
  DailyAnalytics,
  FocusScore,
  ImportSummary,
  Insights,
  MonthlyAnalytics,
  Overview,
  Profile,
  Session,
  SessionList,
  Settings,
  WeeklyAnalytics,
} from "../types";

const RAW_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";
const BASE = RAW_BASE.replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * A single request may not stay pending forever.
 *
 * The hosted API runs on a free instance that stops when idle and takes tens
 * of seconds to start again. Without a deadline a waking instance can leave a
 * request hanging indefinitely, which is exactly what an endless loading
 * screen looks like. Aborting turns that into a retryable failure.
 */
const REQUEST_TIMEOUT_MS = 30_000;

// Status 0 is a request that never produced a response (timeout or abort).
// 5xx responses from the platform proxy (502/503/504) or the app (500) are
// transient while an instance boots, so they are retryable too.
const RETRYABLE_STATUSES = new Set([0, 500, 502, 503, 504]);

/**
 * Retry policy for read queries.
 *
 * A cold free-tier instance answers with a gateway error or drops the
 * connection while it boots. Those are worth retrying; a validation, auth or
 * conflict response is not.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown
): boolean {
  if (failureCount >= 4) return false;
  if (error instanceof ApiError) return RETRYABLE_STATUSES.has(error.status);
  return true;
}

export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

/** Today the longest wait is about two minutes of retries, which outlasts the
 * slowest observed free-instance start without hiding a genuinely dead API. */
async function fetchWithTimeout(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(
        "The API did not respond in time. It may be starting up.",
        0
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function tzOffset(): number {
  return new Date().getTimezoneOffset();
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const detail =
      (payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : null) ??
      `Request failed with status ${response.status}.`;
    throw new ApiError(detail, response.status);
  }

  return payload as T;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetchWithTimeout(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  return parseResponse<T>(response);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function body(data: unknown): RequestInit {
  return { body: JSON.stringify(data) };
}

export const api = {
  health: () => request<{ status: string; version: string }>("/health"),

  profile: () => request<Profile>("/profile"),
  updateProfile: (data: { username: string; email?: string | null }) =>
    request<Profile>("/profile", { method: "PATCH", ...body(data) }),

  settings: () => request<Settings>("/settings"),
  updateSettings: (data: Partial<Omit<Settings, "updatedAt">>) =>
    request<Settings>("/settings", { method: "PATCH", ...body(data) }),

  categories: () => request<Category[]>("/categories"),
  createCategory: (data: { name: string; color: string }) =>
    request<Category>("/categories", { method: "POST", ...body(data) }),
  updateCategory: (id: number, data: { name?: string; color?: string }) =>
    request<Category>(`/categories/${id}`, { method: "PATCH", ...body(data) }),
  deleteCategory: (id: number) =>
    request<void>(`/categories/${id}`, { method: "DELETE" }),

  activeSession: () => request<Session | null>("/sessions/active"),
  sessions: (query: Query) => request<SessionList>(withQuery("/sessions", query)),
  session: (id: number) => request<Session>(`/sessions/${id}`),
  createSession: (data: {
    title: string;
    categoryId?: number | null;
    targetDuration?: number | null;
    notes?: string | null;
  }) => request<Session>("/sessions", { method: "POST", ...body(data) }),
  updateSession: (
    id: number,
    data: { title?: string; categoryId?: number | null; notes?: string | null }
  ) => request<Session>(`/sessions/${id}`, { method: "PATCH", ...body(data) }),
  pauseSession: (id: number) =>
    request<ActionResponse>(`/sessions/${id}/pause`, { method: "POST" }),
  resumeSession: (id: number) =>
    request<ActionResponse>(`/sessions/${id}/resume`, { method: "POST" }),
  completeSession: (id: number) =>
    request<ActionResponse>(`/sessions/${id}/complete`, { method: "POST" }),
  cancelSession: (id: number) =>
    request<ActionResponse>(`/sessions/${id}/cancel`, { method: "POST" }),
  deleteSession: (id: number) =>
    request<void>(`/sessions/${id}`, { method: "DELETE" }),

  addInterruption: (
    sessionId: number,
    data: { reason: string; customReason?: string | null; notes?: string | null }
  ) =>
    request<Session>(`/sessions/${sessionId}/interruptions`, {
      method: "POST",
      ...body(data),
    }),
  endInterruption: (id: number) =>
    request<Session>(`/interruptions/${id}/end`, { method: "POST" }),
  deleteInterruption: (id: number) =>
    request<Session>(`/interruptions/${id}`, { method: "DELETE" }),

  overview: () =>
    request<Overview>(withQuery("/analytics/overview", { tzOffsetMinutes: tzOffset() })),
  daily: (days: number) =>
    request<DailyAnalytics>(
      withQuery("/analytics/daily", { days, tzOffsetMinutes: tzOffset() })
    ),
  weekly: (weeks = 8) =>
    request<WeeklyAnalytics>(
      withQuery("/analytics/weekly", { weeks, tzOffsetMinutes: tzOffset() })
    ),
  monthly: (months = 6) =>
    request<MonthlyAnalytics>(
      withQuery("/analytics/monthly", { months, tzOffsetMinutes: tzOffset() })
    ),
  categoryAnalytics: (days: number) =>
    request<CategoriesAnalytics>(
      withQuery("/analytics/categories", { days, tzOffsetMinutes: tzOffset() })
    ),
  focusScore: (days = 7) =>
    request<FocusScore>(
      withQuery("/analytics/focus-score", { days, tzOffsetMinutes: tzOffset() })
    ),
  insights: (days = 30) =>
    request<Insights>(
      withQuery("/analytics/insights", { days, tzOffsetMinutes: tzOffset() })
    ),

  seedDemo: () =>
    request<{ created: number; message: string }>("/demo/seed", { method: "POST" }),
  clearDemo: () =>
    request<{ removed: number; message: string }>("/demo", { method: "DELETE" }),
  deleteAllData: () =>
    request<{ deletedSessions: number; message: string }>("/data", {
      method: "DELETE",
    }),
  exportUrl: () => `${BASE}/export`,
  csvTemplateUrl: () => `${BASE}/import/csv/template`,
  importCsv: async (file: File): Promise<ImportSummary> => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetchWithTimeout(`${BASE}/import/csv`, {
      method: "POST",
      body: form,
    });
    return parseResponse<ImportSummary>(response);
  },
};
