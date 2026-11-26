import { useEffect, useRef, useState } from "react";

/**
 * Transparent inactivity detection.
 *
 * Only the timestamp of the last interaction is kept, in memory. No keys, no
 * content and no browsing activity are recorded. An idle window never logs an
 * interruption on its own: it shows a prompt and the user decides.
 */
export function useIdlePrompt(enabled: boolean, thresholdSeconds: number) {
  const [isIdle, setIsIdle] = useState(false);
  const lastActivity = useRef(Date.now());
  const dismissed = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setIsIdle(false);
      return;
    }

    // Re-enabling starts a fresh window instead of inheriting stale idle time.
    lastActivity.current = Date.now();
    dismissed.current = false;

    const markActive = () => {
      lastActivity.current = Date.now();
      if (dismissed.current) dismissed.current = false;
      setIsIdle(false);
    };

    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "pointermove",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    document.addEventListener("visibilitychange", markActive);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const idleFor = (Date.now() - lastActivity.current) / 1000;
      if (idleFor >= thresholdSeconds && !dismissed.current) setIsIdle(true);
    }, 5000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, markActive));
      document.removeEventListener("visibilitychange", markActive);
      window.clearInterval(interval);
    };
  }, [enabled, thresholdSeconds]);

  return {
    isIdle,
    dismiss: () => {
      dismissed.current = true;
      setIsIdle(false);
    },
  };
}
