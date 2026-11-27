export type SessionStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type Theme = "dark" | "light" | "system";

export interface Category {
  id: number;
  name: string;
  color: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Interruption {
  id: number;
  sessionId: number;
  reason: string;
  customReason: string | null;
  label: string;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  isOpen: boolean;
}

export interface Session {
  id: number;
  title: string;
  notes: string | null;
  status: SessionStatus;
  category: Category | null;
  startedAt: string;
  endedAt: string | null;
  targetDuration: number | null;
  focusedSeconds: number;
  interruptedSeconds: number;
  pausedSeconds: number;
  elapsedSeconds: number;
  interruptionCount: number;
  interruptions: Interruption[];
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionList {
  items: Session[];
  total: number;
  limit: number;
  offset: number;
}

export interface ActionResponse {
  session: Session;
  message: string;
}

export interface Settings {
  theme: Theme;
  accentColor: string;
  defaultTargetDuration: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  autoIdleDetectionEnabled: boolean;
  idleThresholdSeconds: number;
  updatedAt: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  createdAt: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}

export interface Profile {
  id: number;
  username: string;
  email: string | null;
  createdAt: string;
  memberSinceDays: number;
  totalSessions: number;
}

export interface TrendPoint {
  label: string;
  date: string;
  focusedSeconds: number;
  interruptedSeconds: number;
  sessions: number;
  focusScore: number | null;
}

export interface WeekPoint {
  weekStart: string;
  label: string;
  focusedSeconds: number;
  interruptedSeconds: number;
  sessions: number;
}

export interface MonthPoint {
  month: string;
  label: string;
  focusedSeconds: number;
  interruptedSeconds: number;
  sessions: number;
}

export interface CategorySlice {
  categoryId: number | null;
  name: string;
  color: string;
  focusedSeconds: number;
  sessions: number;
  share: number;
}

export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  value: number;
  contribution: number;
  explanation: string;
}

export interface FocusScore {
  score: number | null;
  status: "available" | "insufficient_data";
  windowDays: number;
  focusedSeconds: number;
  interruptedSeconds: number;
  focusRatio: number;
  consistencyRatio: number;
  completedSessions: number;
  cancelledSessions: number;
  minimumSessions: number;
  components: ScoreComponent[];
  explanation: string;
}

export interface Overview {
  generatedAt: string;
  today: string;
  todayFocusedSeconds: number;
  todayInterruptedSeconds: number;
  todaySessions: number;
  todayAverageSessionSeconds: number;
  weekFocusedSeconds: number;
  weekChangePercent: number | null;
  currentStreakDays: number;
  focusScore: number | null;
  focusScoreStatus: "available" | "insufficient_data";
  topCategory: CategorySlice | null;
  weeklyTrend: TrendPoint[];
  recentSessions: Session[];
  totals: {
    focusedSeconds: number;
    sessions: number;
    interruptions: number;
    demoSessions: number;
  };
}

export interface DailyAnalytics {
  days: number;
  start: string;
  end: string;
  points: TrendPoint[];
}

export interface WeeklyAnalytics {
  weeks: number;
  points: WeekPoint[];
}

export interface MonthlyAnalytics {
  months: number;
  points: MonthPoint[];
}

export interface CategoriesAnalytics {
  totalFocusedSeconds: number;
  slices: CategorySlice[];
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  categoriesCreated: number;
  duplicateTitles: number;
  errors: ImportRowError[];
}

export interface Insights {
  consistencyDays: number;
  consistencyPercent: number;
  totalSessions: number;
  bestDay: { date: string; focusedSeconds: number } | null;
  interruptionFrequencyPerHour: number;
  interruptionReasons: { label: string; count: number; seconds: number }[];
  timeOfDay: {
    buckets: { label: string; focusedSeconds: number; sessions: number }[];
    bestWindow: string | null;
    bestWindowFocusedSeconds: number;
  };
  durationDistribution: {
    buckets: { label: string; max: number | null; sessions: number }[];
    averageSeconds: number;
    medianSeconds: number;
    longestSeconds: number;
  };
}
