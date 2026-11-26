import { useEffect, useState } from "react";

/**
 * Re-renders at a fixed interval so live timers can be derived from
 * timestamps. The interval only drives rendering; it never accumulates time.
 */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    // Re-sync immediately when a throttled tab becomes visible again.
    const onVisible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, intervalMs]);

  return now;
}
