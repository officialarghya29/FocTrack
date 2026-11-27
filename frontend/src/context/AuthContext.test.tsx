import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { RequireAuth } from "../components/auth/RequireAuth";
import { GoogleButton } from "../components/auth/GoogleButton";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  register: vi.fn(),
  google: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
  getRefreshToken: vi.fn(),
  setAccessToken: vi.fn(),
  setRefreshToken: vi.fn(),
  setRefreshHandler: vi.fn(),
  setAuthLostHandler: vi.fn(),
}));

vi.mock("../services/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  authApi: {
    refresh: mocks.refresh,
    login: mocks.login,
    logout: mocks.logout,
    logoutAll: mocks.logoutAll,
    register: mocks.register,
    google: mocks.google,
    changePassword: mocks.changePassword,
    deleteAccount: mocks.deleteAccount,
  },
  getRefreshToken: mocks.getRefreshToken,
  setAccessToken: mocks.setAccessToken,
  setRefreshToken: mocks.setRefreshToken,
  setRefreshHandler: mocks.setRefreshHandler,
  setAuthLostHandler: mocks.setAuthLostHandler,
}));

const USER = {
  id: 7,
  username: "Arghya",
  email: "arghya@example.com",
  emailVerified: true,
  hasPassword: true,
  createdAt: "2026-11-27T00:00:00Z",
};

const SESSION = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  tokenType: "bearer",
  expiresIn: 1800,
  user: USER,
};

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="email">{auth.user?.email ?? "none"}</span>
      <button type="button" onClick={() => void auth.logout()}>
        logout
      </button>
    </div>
  );
}

function renderAuth(ui = <Probe />, client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>
  );
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("AuthContext", () => {
  it("restores a session from the stored refresh token", async () => {
    mocks.getRefreshToken.mockReturnValue("stored-refresh");
    mocks.refresh.mockResolvedValue(SESSION);

    renderAuth();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
    expect(mocks.refresh).toHaveBeenCalledWith("stored-refresh");
    expect(screen.getByTestId("email")).toHaveTextContent("arghya@example.com");
    expect(mocks.setAccessToken).toHaveBeenCalledWith("access-1");
  });

  it("settles as anonymous with no stored token", async () => {
    mocks.getRefreshToken.mockReturnValue(null);

    renderAuth();

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous")
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("logs in and then clears the query cache on sign-out", async () => {
    mocks.getRefreshToken.mockReturnValue(null);
    mocks.login.mockResolvedValue(SESSION);
    mocks.logout.mockResolvedValue(undefined);

    const client = new QueryClient();
    client.setQueryData(["sessions"], [{ id: 1, title: "Private" }]);

    function LoginProbe() {
      const auth = useAuth();
      return (
        <>
          <span data-testid="status">{auth.status}</span>
          <button
            type="button"
            onClick={() => void auth.login("arghya@example.com", "password-123")}
          >
            login
          </button>
          <button type="button" onClick={() => void auth.logout()}>
            logout
          </button>
        </>
      );
    }

    renderAuth(<LoginProbe />, client);
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous")
    );

    await userEvent.click(screen.getByRole("button", { name: "login" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
    expect(mocks.setRefreshToken).toHaveBeenCalledWith("refresh-1");

    await userEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous")
    );
    expect(mocks.setAccessToken).toHaveBeenCalledWith(null);
    expect(mocks.setRefreshToken).toHaveBeenCalledWith(null);
    expect(client.getQueryData(["sessions"])).toBeUndefined();
  });
});

describe("route guard", () => {
  it("redirects an anonymous visitor to the login page", async () => {
    mocks.getRefreshToken.mockReturnValue(null);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/settings"]}>
            <Routes>
              <Route path="/login" element={<p>login page</p>} />
              <Route
                path="/settings"
                element={
                  <RequireAuth>
                    <p>private settings</p>
                  </RequireAuth>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
    expect(screen.queryByText("private settings")).not.toBeInTheDocument();
  });
});

describe("Google button", () => {
  it("renders nothing when no client id is configured", () => {
    const { container } = render(<GoogleButton onCredential={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
