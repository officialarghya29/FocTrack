import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../services/api";
import {
  AuthLayout,
  FormError,
  describeAuthError,
} from "../components/auth/AuthLayout";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (failure) {
      setError(describeAuthError(failure));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout
        title="This reset link is incomplete"
        description="The link is missing its token. Request a new one from the sign-in page."
        footer={
          <Link
            to="/forgot-password"
            className="font-medium text-ink underline decoration-line underline-offset-2 hover:text-accent"
          >
            Request a new link
          </Link>
        }
      >
        <p className="text-[12px] text-muted">
          Reset links expire after 30 minutes and can be used once.
        </p>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout
        title="Password changed"
        description="Every other session has been signed out. Use your new password to sign in."
        footer={
          <Link
            to="/login"
            className="font-medium text-ink underline decoration-line underline-offset-2 hover:text-accent"
          >
            Sign in
          </Link>
        }
      >
        <p className="text-[12px] text-muted">
          The link you used is now spent and cannot be replayed.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      description="This signs out every other session. Your sessions and history stay intact."
      footer={
        <Link
          to="/login"
          className="font-medium text-ink underline decoration-line underline-offset-2 hover:text-accent"
        >
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="reset-password" className="label">
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            className="field"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="mt-1.5 text-[10px] text-muted">
            At least 10 characters. A passphrase of several words is easier and stronger.
          </p>
        </div>
        <div>
          <label htmlFor="reset-confirm" className="label">
            Confirm new password
          </label>
          <input
            id="reset-confirm"
            type="password"
            className="field"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>

        <FormError message={error} />

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={busy || password.length < 10}
        >
          {busy ? "Saving…" : "Set new password"}
        </button>
      </form>
    </AuthLayout>
  );
}
