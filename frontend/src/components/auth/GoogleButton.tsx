import { useEffect, useRef } from "react";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export const googleConfigured = Boolean(CLIENT_ID);

interface GoogleAccounts {
  initialize(options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    element: HTMLElement,
    options: {
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      width?: number;
      logo_alignment?: "left" | "center";
    }
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccounts } };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in failed to load."));
    if (!existing) document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Renders Google's official button. When no client ID is configured the
 * component renders nothing at all rather than a button that cannot work.
 */
export function GoogleButton({
  onCredential,
  text = "continue_with",
}: {
  onCredential: (credential: string) => void;
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID || !container.current) return;
    let cancelled = false;
    void loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          cancel_on_tap_outside: true,
          auto_select: false,
          callback: (response) => {
            if (response.credential) callback.current(response.credential);
          },
        });
        window.google.accounts.id.renderButton(container.current, {
          theme: "outline",
          size: "large",
          text,
          shape: "rectangular",
          width: 336,
          logo_alignment: "left",
        });
      })
      .catch(() => {
        // The password form still works; the button simply stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!CLIENT_ID) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={container} className="min-h-[40px] w-full max-w-full overflow-hidden" />
    </div>
  );
}
