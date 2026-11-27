import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../services/api";
import { AuthLayout, describeAuthError } from "../components/auth/AuthLayout";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"working" | "verified" | "failed">("working");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("failed");
      setError("The link is missing its token. Request a new verification email.");
      return;
    }
    let cancelled = false;
    authApi
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setStatus("verified");
      })
      .catch((failure) => {
        if (!cancelled) {
          setStatus("failed");
          setError(describeAuthError(failure));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "working") {
    return (
      <AuthLayout
        title="Verifying your email"
        description="One moment while we confirm this address."
      >
        <p className="text-[12px] text-muted">This link works once and expires in 24 hours.</p>
      </AuthLayout>
    );
  }

  if (status === "verified") {
    return (
      <AuthLayout
        title="Email verified"
        description="This address is now confirmed, so it can be linked to a Google sign-in."
        footer={
          <Link
            to="/"
            className="font-medium text-ink underline decoration-line underline-offset-2 hover:text-accent"
          >
            Open FocTrack
          </Link>
        }
      >
        <p className="text-[12px] text-muted">
          You can close this tab if you are already signed in elsewhere.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="This link could not be used"
      description={error}
      footer={
        <Link
          to="/login"
          className="font-medium text-ink underline decoration-line underline-offset-2 hover:text-accent"
        >
          Back to sign in
        </Link>
      }
    >
      <p className="text-[12px] text-muted">
        Verification links expire after 24 hours. Sign in, open Settings, and request a
        new one from the account section.
      </p>
    </AuthLayout>
  );
}
