import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider } from "../../context/AppContext";
import { SessionSetup } from "./SessionSetup";
import { api } from "../../services/api";

vi.mock("../../services/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    settings: vi.fn(),
    profile: vi.fn(),
    categories: vi.fn(),
    createSession: vi.fn(),
    updateSettings: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

const mocked = vi.mocked(api);

function renderSetup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppProvider>
        <SessionSetup />
      </AppProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.settings.mockResolvedValue({
    theme: "dark",
    accentColor: "#B7F36B",
    defaultTargetDuration: 1500,
    notificationsEnabled: false,
    soundEnabled: true,
    autoIdleDetectionEnabled: false,
    idleThresholdSeconds: 120,
    updatedAt: new Date().toISOString(),
  });
  mocked.profile.mockResolvedValue({
    id: 1,
    username: "Arghya",
    email: null,
    createdAt: new Date().toISOString(),
    memberSinceDays: 3,
    totalSessions: 4,
  });
  mocked.categories.mockResolvedValue([
    {
      id: 2,
      name: "Programming",
      color: "#62DCEB",
      isDefault: true,
      createdAt: new Date().toISOString(),
    },
  ]);
  mocked.createSession.mockResolvedValue({
    id: 10,
    title: "Read paper",
    notes: null,
    status: "ACTIVE",
    category: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    targetDuration: 1500,
    focusedSeconds: 0,
    interruptedSeconds: 0,
    pausedSeconds: 0,
    elapsedSeconds: 0,
    interruptionCount: 0,
    interruptions: [],
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

describe("SessionSetup", () => {
  it("requires a title before starting", async () => {
    renderSetup();
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/give the session a name/i);
    expect(mocked.createSession).not.toHaveBeenCalled();
  });

  it("starts a session with the selected category and target", async () => {
    renderSetup();
    await screen.findByText("Programming");

    await userEvent.type(screen.getByLabelText(/what are you working on/i), "Read paper");
    await userEvent.click(screen.getByRole("button", { name: "Programming" }));
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await waitFor(() => expect(mocked.createSession).toHaveBeenCalledTimes(1));
    expect(mocked.createSession.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        title: "Read paper",
        categoryId: 2,
        targetDuration: 1500,
      })
    );
  });
});
