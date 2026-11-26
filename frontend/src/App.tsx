import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/Dashboard";
import { FocusPage } from "./pages/Focus";
import { HistoryPage } from "./pages/History";
import { AnalyticsPage } from "./pages/Analytics";
import { SettingsPage } from "./pages/Settings";
import { NotFoundPage } from "./pages/NotFound";

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
