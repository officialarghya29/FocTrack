import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../services/api";
import {
  AuthLayout,
  FormError,
  describeAuthError,
} from "../components/auth/AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (failure) {
      setError(describeAuthError(failure));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        description="If that address has a password account, a reset link is on its way. The link expires in 30 minutes and works once."
        footer={
          <Link
            to="/login"
            className="font-medium text-ink underline decoration-line underline-offset-2 hover:text-accent"
          >
            Back to sign in
          </Link>
        }
      >
        <div className="rounded-md border border-line bg-base/60 px-4 py-3 text-[12px] leading-relaxed text-muted">
          Nothing after a few minutes? Check spam, then request another link. Google
          accounts recover access through Google.
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter the email on your account and we will send a one-time reset link."
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
          <label htmlFor="forgot-email" className="label">
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            className="field"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <FormError message={error} />

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={busy || !email.trim()}
        >
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthLayout>
  );
}
