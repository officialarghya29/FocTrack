import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { PublicOnly, RequireAuth } from "./components/auth/RequireAuth";
import { AppProvider } from "./context/AppContext";

const DashboardPage = lazy(() =>
  import("./pages/Dashboard").then((module) => ({ default: module.DashboardPage }))
);
const FocusPage = lazy(() =>
  import("./pages/Focus").then((module) => ({ default: module.FocusPage }))
);
const HistoryPage = lazy(() =>
  import("./pages/History").then((module) => ({ default: module.HistoryPage }))
);
const AnalyticsPage = lazy(() =>
  import("./pages/Analytics").then((module) => ({ default: module.AnalyticsPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/Settings").then((module) => ({ default: module.SettingsPage }))
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFound").then((module) => ({ default: module.NotFoundPage }))
);
const LoginPage = lazy(() =>
  import("./pages/Login").then((module) => ({ default: module.LoginPage }))
);
const SignupPage = lazy(() =>
  import("./pages/Signup").then((module) => ({ default: module.SignupPage }))
);
const ForgotPasswordPage = lazy(() =>
  import("./pages/ForgotPassword").then((module) => ({
    default: module.ForgotPasswordPage,
  }))
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPassword").then((module) => ({
    default: module.ResetPasswordPage,
  }))
);
const VerifyEmailPage = lazy(() =>
  import("./pages/VerifyEmail").then((module) => ({
    default: module.VerifyEmailPage,
  }))
);

export default function App() {
  return (
    <Routes>
      <Route
        path="login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="signup"
        element={
          <PublicOnly>
            <SignupPage />
          </PublicOnly>
        }
      />
      <Route
        path="forgot-password"
        element={
          <PublicOnly>
            <ForgotPasswordPage />
          </PublicOnly>
        }
      />
      <Route
        path="reset-password"
        element={
          <PublicOnly>
            <ResetPasswordPage />
          </PublicOnly>
        }
      />
      {/* Works signed in or out: verification links can arrive in any tab. */}
      <Route path="verify-email" element={<VerifyEmailPage />} />

      <Route
        element={
          <RequireAuth>
            <AppProvider>
              <AppShell />
            </AppProvider>
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="focus" element={<FocusPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
