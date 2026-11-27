# FocTrack — Calculation reference

This document defines every number FocTrack displays. All durations are in
seconds and all stored timestamps are UTC.

## 1. Clock definitions

For a session with start `S`, close time `E`, running intervals `R` and paused
intervals `P` (excluding the time after the close):

```
wall time        = E − S
active time      = Σ R                (running intervals only)
paused time      = Σ P
interrupted time = Σ interruption intervals, clipped to active time
focused time     = max(0, active time − interrupted time)
```

An interruption can only exist while the session is running, and it is closed
automatically at any pause/close boundary. Therefore interruption intervals
never overlap paused intervals and never extend beyond the session.

### Live vs frozen values

* While a session is open, durations are derived on every request from
  `accumulated_active_seconds` + the current running interval.
* When a session closes, `focused_duration` and `interrupted_duration` are
  written once and are the values analytics uses. Closing a session twice is
  impossible (409).

### Worked example

```
09:00:00  start                       active clock starts
09:05:00  phone interruption begins
09:08:00  interruption ends           3m interrupted
09:20:00  pause                       active banked: 5m + 12m = 17m
09:30:00  resume                      paused: 10m
09:42:00  complete (no open items)    active: 17m + 12m = 29m
```

Results: focused `26m`, interrupted `3m`, paused `10m`, wall `42m`.
Focused time is 29 − 3 = 26 minutes. The 10 minute pause sits outside both
focused and interrupted time.

## 2. Focus score

```
focus ratio       = focused / (focused + interrupted)
consistency ratio = completed / (completed + cancelled)
score             = 100 × (0.80 × focus ratio + 0.20 × consistency ratio)
```

* The score is clamped to `[0, 100]` and rounded to one decimal.
* The window is the last 7 local days by default (`days` query parameter).
* **Paused time** is excluded from numerator and denominator. A break cannot
  lower the score.
* **Interrupted time** is capped at the session's active time when recorded, so
  it cannot exceed 100% or be counted twice.
* **Cancelled sessions** contribute nothing to the focus ratio (their partial
  durations are discarded) but are counted in the consistency denominator.
  A session that is still running is not counted in either.
* **Insufficient data:** fewer than 3 completed sessions, or fewer than 5
  minutes of focused + interrupted activity in the window, returns
  `status: "insufficient_data"` and a null score. The UI shows the unlock
  condition instead of a misleading number.

The score is an application-defined productivity indicator. It is not a
scientifically validated psychological measurement, and the UI says so.

## 3. Aggregation rules

| Rule | Behaviour |
|---|---|
| Session inclusion | Only `COMPLETED` sessions contribute focused/interrupted time, counts, categories, distributions and the focus ratio |
| Cancelled sessions | Kept in history and in the consistency denominator; excluded from all focus totals |
| Empty sessions | Completing a session with under 1s of activity is rejected; zero-duration records cannot be created |
| Day boundaries | Local calendar days using `tzOffsetMinutes`; a session is assigned to the day it **started** |
| Weekly buckets | ISO weeks starting Monday, in local time |
| Monthly buckets | Calendar months, in local time |
| Interruption reasons | Grouped by label; `other` uses the custom text |
| Streak | Consecutive local days with at least one completed session; if today has none yet the streak is measured from yesterday |
| Week delta | Last 7 local days compared with the 7 days before; `null` when the previous window has no focus time |
| Most productive window | Focused seconds grouped by the local hour the session started: early morning 00–06, morning 06–12, afternoon 12–17, evening 17–21, night 21–24 |
| Duration buckets | <15m, 15–30m, 30–60m, 1–2h, 2h+ of focused time |

## 4. Edge cases and how they are handled

| Case | Handling |
|---|---|
| Page refresh mid-session | `GET /sessions/active` returns the open session; the clock is rebuilt from `started_at` |
| Browser/tab throttling | No counters to throttle; display re-syncs on `visibilitychange` |
| Computer sleep | Wall-clock difference includes the sleep; paused state excludes it from focus |
| Multiple pause/resume cycles | Accumulated per cycle; covered by `test_lifecycle_can_span_multiple_pause_cycles` |
| Open interruption when pausing | Closed at the pause boundary by the server |
| Second interruption while one is open | The first is auto-closed at the new start time |
| Duplicate start requests | Service check plus unique partial index → `409` |
| Deleting a category | Sessions remain, uncategorized |
| Deleting a session | Cascades to interruptions; analytics recalculated |
| Timezone offset changes | The offset is stored with each session when it starts and used for day/hour buckets; the request offset only defines the window. Legacy rows without a stored offset fall back to it |
| Interruption longer than active time | Clipped to active time, focused time floors at zero |
| Empty database | All analytics return zeroed series, empty slices and `insufficient_data` |

## 5. Where each number is produced

| Number | Code |
|---|---|
| Session durations | `backend/app/services/session_clock.py` |
| Session state transitions | `backend/app/services/session_service.py` |
| Daily/weekly/monthly series | `backend/app/services/analytics_service.py` |
| Category shares, distributions, insights | `backend/app/services/analytics_service.py` |
| Focus score | `backend/app/analytics/focus_score.py` |
| Display formatting (local time, durations) | `frontend/src/utils/format.ts` |

The frontend never recomputes analytics. It formats what the API returns.
