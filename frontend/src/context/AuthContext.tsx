import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  authApi,
  getRefreshToken,
  setAccessToken,
  setAuthLostHandler,
  setRefreshHandler,
  setRefreshToken,
} from "../services/api";
import type { AuthSession, AuthUser } from "../types";

export type AuthStatus = "loading" | "authed" | "anonymous";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  google: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  deleteAccount: (data: { password?: string; googleIdToken?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** One bootstrap attempt survives React's development double-mount. */
let bootstrapPromise: Promise<AuthSession | null> | null = null;

function readStoredSession(): Promise<AuthSession | null> {
  if (!bootstrapPromise) {
    const attempt = (async () => {
      const raw = getRefreshToken();
      if (!raw) return null;
      try {
        return await authApi.refresh(raw);
      } catch {
        setRefreshToken(null);
        return null;
      }
    })();
    bootstrapPromise = attempt;
    // Only concurrent mounts share the attempt. Once it settles a later mount
    // may try again (for example after the API was unreachable on first load).
    void attempt.finally(() => {
      if (bootstrapPromise === attempt) bootstrapPromise = null;
    });
  }
  return bootstrapPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setStatus("anonymous");
    // Never let one account's cached responses appear for the next sign-in.
    queryClient.clear();
  }, [queryClient]);

  const applySession = useCallback((session: AuthSession) => {
    setAccessToken(session.accessToken);
    setRefreshToken(session.refreshToken);
    setUser(session.user);
    setStatus("authed");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readStoredSession().then((session) => {
      if (cancelled) return;
      if (session) applySession(session);
      else setStatus("anonymous");
    });
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  useEffect(() => {
    setAuthLostHandler(clearSession);
    return () => setAuthLostHandler(null);
  }, [clearSession]);

  useEffect(() => {
    setRefreshHandler(async () => {
      const raw = getRefreshToken();
      if (!raw) return false;
      try {
        const session = await authApi.refresh(raw);
        applySession(session);
        return true;
      } catch {
        return false;
      }
    });
    return () => setRefreshHandler(null);
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      applySession(await authApi.login({ email, password }));
    },
    [applySession]
  );

  const register = useCallback(
    async (email: string, password: string, username: string) => {
      applySession(await authApi.register({ email, password, username }));
    },
    [applySession]
  );

  const google = useCallback(
    async (idToken: string) => {
      applySession(await authApi.google(idToken));
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    const raw = getRefreshToken();
    if (raw) {
      try {
        await authApi.logout(raw);
      } catch {
        // Local sign-out must succeed even when the API is unreachable; the
        // refresh token expires on its own.
      }
    }
    clearSession();
  }, [clearSession]);

  const logoutEverywhere = useCallback(async () => {
    await authApi.logoutAll();
    clearSession();
  }, [clearSession]);

  const changePassword = useCallback(
    async (current: string, next: string) => {
      applySession(await authApi.changePassword(current, next));
    },
    [applySession]
  );

  const deleteAccount = useCallback(
    async (data: { password?: string; googleIdToken?: string }) => {
      // A failed confirmation throws and leaves the session intact.
      await authApi.deleteAccount(data);
      clearSession();
    },
    [clearSession]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login,
      register,
      google,
      logout,
      logoutEverywhere,
      changePassword,
      deleteAccount,
    }),
    [
      changePassword,
      deleteAccount,
      google,
      login,
      logout,
      logoutEverywhere,
      register,
      status,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
