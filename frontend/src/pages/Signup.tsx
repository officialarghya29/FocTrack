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

export function SignupPage() {
  const { register, google } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const destination = safeNext(params.get("next"));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await register(email.trim(), password, username.trim());
      navigate(destination, { replace: true });
    } catch (failure) {
      setError(describeAuthError(failure));
    } finally {
      setBusy(false);
    }
  };

  const googleSignUp = async (credential: string) => {
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
      title="Create your account"
      description="FocTrack measures focused time and interruptions. Every account starts empty — no sample data is invented for you."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={`/login${destination !== "/" ? `?next=${encodeURIComponent(destination)}` : ""}`}
            className="font-medium text-ink underline decoration-line underline-offset-2 hover:text-accent"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="signup-name" className="label">
            Display name
          </label>
          <input
            id="signup-name"
            className="field"
            autoComplete="nickname"
            required
            maxLength={80}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="signup-email" className="label">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            className="field"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="signup-password" className="label">
            Password
          </label>
          <input
            id="signup-password"
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
          <label htmlFor="signup-confirm" className="label">
            Confirm password
          </label>
          <input
            id="signup-confirm"
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
          disabled={busy || !email.trim() || !username.trim() || password.length < 10}
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <AuthDivider />
      <GoogleButton
        text="signup_with"
        onCredential={(credential) => void googleSignUp(credential)}
      />
    </AuthLayout>
  );
}
