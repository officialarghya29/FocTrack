export const INTERRUPTION_REASONS = [
  { value: "phone", label: "Phone" },
  { value: "social_media", label: "Social media" },
  { value: "notifications", label: "Notifications" },
  { value: "conversation", label: "Conversation" },
  { value: "browsing", label: "Browsing" },
  { value: "fatigue", label: "Fatigue" },
  { value: "other", label: "Other" },
] as const;

export const TARGET_PRESETS = [
  { minutes: 15, label: "15 min" },
  { minutes: 25, label: "25 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "60 min" },
] as const;

export const ACCENT_SWATCHES = [
  { value: "#B7F36B", name: "Lime" },
  { value: "#62DCEB", name: "Cyan" },
  { value: "#A78BFA", name: "Violet" },
  { value: "#F3B65D", name: "Amber" },
  { value: "#F07878", name: "Coral" },
  { value: "#7FD1A6", name: "Sage" },
] as const;

export const CATEGORY_COLORS = [
  "#B7F36B",
  "#62DCEB",
  "#A78BFA",
  "#F3B65D",
  "#7FD1A6",
  "#F07878",
  "#E8A0C8",
  "#9BA7B1",
] as const;

export const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "duration", label: "Longest focus" },
] as const;
