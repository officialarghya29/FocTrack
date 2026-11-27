import { Link } from "react-router-dom";
import { AuthLayout } from "../components/auth/AuthLayout";

export function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Password reset is not available yet"
      description="This deployment has no transactional email provider configured, so FocTrack cannot send a reset link. Rather than pretend, the reset flow is switched off."
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
        <p>
          If you use Google sign-in, recover access through your Google account. If you
          signed up with a password and have lost it, the account owner (the deployment
          operator) can reset it directly in the database.
        </p>
        <p className="mt-2">
          Password reset and email verification are documented as the next reliability
          milestone rather than a working feature.
        </p>
      </div>
    </AuthLayout>
  );
}
