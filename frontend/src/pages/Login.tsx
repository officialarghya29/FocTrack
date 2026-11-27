import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  AuthDivider,
  AuthLayout,
  FormError,
  describeAuthError,
  safeNext,
} from "../components/auth/AuthLayout";
import { GoogleButton } from "../components/auth/GoogleButton";

export function LoginPage() {
  const { login, google } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const destination = safeNext(params.get("next"));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(destination, { replace: true });
    } catch (failure) {
      setError(describeAuthError(failure));
    } finally {
      setBusy(false);
    }
  };

  const googleSignIn = async (credential: string) => {
    setError(null);
    setBusy(true);
    try {
      await google(credential);
      navigate(destination, { replace: true });
    } catch (failure) {
      setError(describeAuthError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      description="Your sessions, categories and analytics are private to your account."
      footer={
        <>
          New to FocTrack?{" "}
          <Link
            to={`/signup${destination !== "/" ? `?next=${encodeURIComponent(destination)}` : ""}`}
            className="font-medium text-ink underline decoration-line underline-offset-2 hover:text-accent"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="login-email" className="label">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            className="field"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="login-password" className="label">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="mb-1.5 text-[11px] text-muted hover:text-ink"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            className="field"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <FormError message={error} />

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={busy || !email.trim() || !password}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <AuthDivider />
      <GoogleButton onCredential={(credential) => void googleSignIn(credential)} />
    </AuthLayout>
  );
}
