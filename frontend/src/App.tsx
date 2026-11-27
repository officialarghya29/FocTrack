import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";

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

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
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
