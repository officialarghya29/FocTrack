import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../services/api";
import type { Profile, Settings, Theme } from "../types";

type ToastTone = "info" | "success" | "error";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface AppContextValue {
  settings: Settings | undefined;
  profile: Profile | undefined;
  settingsLoading: boolean;
  profileLoading: boolean;
  updateSettings: (patch: Partial<Omit<Settings, "updatedAt">>) => Promise<void>;
  updateProfile: (patch: { username: string; email?: string | null }) => Promise<void>;
  notify: (message: string, tone?: ToastTone) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  refreshAll: () => Promise<void>;
  errorMessage: (error: unknown) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

let toastId = 0;

function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return theme;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixWithBlack(hex: string, amount: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [
    Math.round(r * (1 - amount)),
    Math.round(g * (1 - amount)),
    Math.round(b * (1 - amount)),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Applies the theme plus a contrast-safe accent. On light surfaces the chosen
 * hue is darkened so accent text stays readable; the stored preference is
 * never modified.
 */
function applyTheme(theme: Theme, accent: string) {
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  const rgb =
    resolved === "light" ? mixWithBlack(accent, 0.45) : hexToRgb(accent);
  root.dataset.theme = resolved;
  root.style.setProperty("--accent", `rgb(${rgb.join(" ")})`);
  root.style.setProperty("--accent-rgb", rgb.join(" "));
  root.style.setProperty(
    "--accent-ink",
    luminance(rgb) > 0.45 ? "#0B0F0C" : "#FFFFFF"
  );
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0C0F12" : "#F5F6F3");
  window.localStorage.setItem("foctrack.theme", `${theme}|${accent}`);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: api.profile });

  useEffect(() => {
    if (settingsQuery.data) {
      applyTheme(settingsQuery.data.theme, settingsQuery.data.accentColor);
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    const pref = window.localStorage.getItem("foctrack.theme");
    if (pref) {
      const [theme, accent] = pref.split("|");
      if (theme && accent) applyTheme(theme as Theme, accent);
    } else {
      applyTheme("dark", "#B7F36B");
    }
  }, []);

  useEffect(() => {
    if (settingsQuery.data?.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (settingsQuery.data) {
        applyTheme("system", settingsQuery.data.accentColor);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settingsQuery.data]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = ++toastId;
      setToasts((current) => [...current.slice(-3), { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 4200);
    },
    []
  );

  const errorMessage = useCallback((error: unknown) => {
    if (error instanceof ApiError) return error.message;
    if (error instanceof Error) return error.message;
    return "Something went wrong. Please try again.";
  }, []);

  const settingsMutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data);
      applyTheme(data.theme, data.accentColor);
    },
  });

  const profileMutation = useMutation({
    mutationFn: api.updateProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(["profile"], data);
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const updateSettings = useCallback(
    async (patch: Partial<Omit<Settings, "updatedAt">>) => {
      try {
        await settingsMutation.mutateAsync(patch);
      } catch (error) {
        notify(errorMessage(error), "error");
        // Re-apply the server truth so the toggle does not lie.
        void queryClient.invalidateQueries({ queryKey: ["settings"] });
        throw error;
      }
    },
    [errorMessage, notify, queryClient, settingsMutation]
  );

  const updateProfile = useCallback(
    async (patch: { username: string; email?: string | null }) => {
      try {
        await profileMutation.mutateAsync(patch);
        notify("Profile updated.", "success");
      } catch (error) {
        notify(errorMessage(error), "error");
        throw error;
      }
    },
    [errorMessage, notify, profileMutation]
  );

  const refreshAll = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const value = useMemo<AppContextValue>(
    () => ({
      settings: settingsQuery.data,
      profile: profileQuery.data,
      settingsLoading: settingsQuery.isLoading,
      profileLoading: profileQuery.isLoading,
      updateSettings,
      updateProfile,
      notify,
      toasts,
      dismissToast,
      refreshAll,
      errorMessage,
    }),
    [
      dismissToast,
      errorMessage,
      notify,
      profileQuery.data,
      profileQuery.isLoading,
      refreshAll,
      settingsQuery.data,
      settingsQuery.isLoading,
      toasts,
      updateProfile,
      updateSettings,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
