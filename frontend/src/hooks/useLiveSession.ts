import { useActiveSession } from "./useSessionData";
import { useTicker } from "./useTicker";

/**
 * Live values for the open session.
 *
 * The server returns the authoritative durations at fetch time. Between
 * fetches we extrapolate from the server timestamp, which keeps the display
 * smooth without ever becoming the source of truth. On refresh, navigation or
 * window focus, the query refetches and the server wins again.
 */
export function useLiveSession() {
  const query = useActiveSession();
  const session = query.data ?? null;
  const isActive = session?.status === "ACTIVE";
  const now = useTicker(Boolean(session));
  const syncedAt = query.dataUpdatedAt || now;
  const sinceSeconds = session ? Math.max(0, (now - syncedAt) / 1000) : 0;

  if (!session) {
    return {
      session: null,
      query,
      focusedSeconds: 0,
      interruptedSeconds: 0,
      pausedSeconds: 0,
      elapsedSeconds: 0,
      progress: 0,
    };
  }

  const openInterruption = session.interruptions.some((item) => item.isOpen);
  const focusedSeconds =
    session.focusedSeconds + (isActive && !openInterruption ? sinceSeconds : 0);
  const interruptedSeconds =
    session.interruptedSeconds + (isActive && openInterruption ? sinceSeconds : 0);
  const pausedSeconds =
    session.pausedSeconds + (session.status === "PAUSED" ? sinceSeconds : 0);
  const elapsedSeconds = session.elapsedSeconds + sinceSeconds;
  const progress = session.targetDuration
    ? Math.min(1, focusedSeconds / session.targetDuration)
    : (focusedSeconds % 3600) / 3600;

  return {
    session,
    query,
    focusedSeconds,
    interruptedSeconds,
    pausedSeconds,
    elapsedSeconds,
    progress,
  };
}
