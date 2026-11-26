import { useEffect, useRef } from "react";

function playTone() {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.36);
    oscillator.onended = () => void context.close();
  } catch {
    /* audio is a nicety; never break the timer over it */
  }
}

/** Fires once per session when the focused time reaches the target. */
export function useTargetAlert({
  sessionId,
  targetSeconds,
  focusedSeconds,
  notificationsEnabled,
  soundEnabled,
  title,
}: {
  sessionId: number | null;
  targetSeconds: number | null;
  focusedSeconds: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  title: string;
}) {
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId || !targetSeconds) return;
    if (focusedSeconds < targetSeconds) return;
    if (firedFor.current === sessionId) return;
    firedFor.current = sessionId;

    if (notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("FocTrack — target reached", {
          body: `${title} reached its ${Math.round(targetSeconds / 60)} minute target.`,
          silent: true,
        });
      } catch {
        /* notifications can fail silently in some browsers */
      }
    }
    if (soundEnabled) playTone();
  }, [focusedSeconds, notificationsEnabled, sessionId, soundEnabled, targetSeconds, title]);
}
