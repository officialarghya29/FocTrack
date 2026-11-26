import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../types";

const notify = vi.fn();

vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    notify,
    errorMessage: (error: unknown) =>
      error instanceof Error ? error.message : "Something went wrong.",
  }),
}));

vi.mock("../services/api", () => ({
  api: {
    completeSession: vi.fn(),
  },
}));

import { api } from "../services/api";
import { useSessionMutations } from "./useSessionData";

const activeSession: Session = {
  id: 1,
  title: "Deep work",
  notes: null,
  status: "ACTIVE",
  category: null,
  startedAt: "2026-11-26T10:00:00Z",
  endedAt: null,
  targetDuration: 1500,
  focusedSeconds: 600,
  interruptedSeconds: 0,
  pausedSeconds: 0,
  elapsedSeconds: 600,
  interruptionCount: 0,
  interruptions: [],
  isDemo: false,
  createdAt: "2026-11-26T10:00:00Z",
  updatedAt: "2026-11-26T10:00:00Z",
};

describe("useSessionMutations", () => {
  beforeEach(() => {
    notify.mockClear();
    vi.mocked(api.completeSession).mockReset();
  });

  it("removes a finished session from the active-session cache", async () => {
    vi.mocked(api.completeSession).mockResolvedValue({
      session: { ...activeSession, status: "COMPLETED" },
      message: "Session completed.",
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["session", "active"], activeSession);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSessionMutations(1), { wrapper });
    await act(async () => {
      await result.current.complete.mutateAsync();
    });

    expect(client.getQueryData(["session", "active"])).toBeNull();
    expect(notify).toHaveBeenCalledWith("Session completed.", "success");
  });
});
