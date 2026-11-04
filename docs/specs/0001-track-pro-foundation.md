# 0001. track-pro foundation: stack, data model and core features

**Date**: 2026-11-04
**Status**: In Progress

## Summary

track-pro is a focus timer that turns each finished session into a square on a 365 day grid, like GitHub's contribution graph. This spec fixes the stack (Next.js, Clerk, Neon, Drizzle, Vercel Blob), the data model, how the timer survives a closed tab, and the build order. Everything in the PRD is in scope; the build starts with one thin working slice (sign in, run a timer, see a square) and then grows.

## Context

Greenfield project, solo builder, hosted on Vercel with serverless Neon Postgres. Goals from the PRD: sub 200ms loads, no lost progress if a tab closes, five themes, optional notes and screenshots per session. Reference product: timelapps.club.

## Requirements

**User stories**:
- As a maker, I sign in with Google or GitHub and land on my dashboard without extra forms.
- As a maker, I run a focus timer with play, pause and complete, and my time is never lost.
- As a maker, I see my last 365 days as a shaded grid and hover for details.
- As a maker, I attach notes and a screenshot to a finished session.
- As a maker, I pick a clock style and a theme.

**Acceptance criteria**:
- **AC-1**: Sign in works with Google and GitHub through Clerk. A signed in visitor to `/` is redirected to `/dashboard`; a signed out visitor to `/dashboard` is sent to sign in.
- **AC-2**: The first protected request creates the User and UserSettings rows (lazy upsert). Repeat requests do not duplicate them.
- **AC-3**: Start accepts a target in hours or minutes (1 minute to 12 hours). Only one active session per user.
- **AC-4**: Pause and resume exclude paused time. Elapsed is computed from timestamps, so refresh, tab close and a second device show the same value.
- **AC-5**: Reaching the target plays a chime and shows overtime (+mm:ss). Time keeps counting until Complete.
- **AC-6**: Complete writes one TimeEntry. `durationSec` is computed on the server from the ActiveSession, never taken from the client. Sessions under 60 seconds are discarded after a confirm.
- **AC-7**: Closing the browser mid session and reopening restores the clock in the right state, using the server session, with localStorage as the instant first paint.
- **AC-8**: Heatmap shows the last 365 days ending today in the user's timezone. Levels by minutes per day: 0, under 60, 60 to 119, 120 to 239, 240 or more. Hover shows e.g. "4h focused on Oct 24" or "No focus on Oct 24".
- **AC-9**: Complete opens a dialog with optional notes (max 2000 chars) and an optional drag and drop image (png, jpg, webp, gif, max 5 MB). Skipping is one click. Notes and image can be edited later from the day view.
- **AC-10**: Clock style (digital or wall clock) and theme (system, light, dark, matrix, cyberpunk) persist to UserSettings and render without a flash on reload.
- **AC-11**: Users can only read, write and delete their own data.
- **AC-12**: Dashboard first paint is server rendered (heatmap data fetched on the server); the clock is a client component. Target LCP under 200ms on a warm edge.

## Decision

**Chosen option**: Option 1, a Next.js monolith on Vercel with Clerk, Neon and Drizzle.

Use server actions for mutations and server components for reads. No separate API service.

**Implementation skills**: none installed yet. Use `/design` guidance and the `ui-ux-pro-max` and `frontend-design` skills for the UI.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict) | Shared types from DB to UI. |
| Framework | Next.js latest stable, App Router, Server Actions | Fixed by PRD; server rendering gives the fast first paint. |
| Package manager | pnpm | Fast, strict, works on Windows and Vercel. |
| Primary DB | Neon Postgres via `@neondatabase/serverless` (HTTP driver) | Serverless friendly, no connection pool trouble on Vercel. |
| ORM | Drizzle + drizzle-kit migrations | No codegen, light, SQL style aggregation for the heatmap. |
| Auth | Clerk, Google and GitHub OAuth, `clerkMiddleware` | Fixed by PRD. Persistent sessions and optional Google One Tap give the "frictionless" return visit. |
| UI | Tailwind CSS v4, shadcn/ui, lucide icons | Fixed by PRD. |
| Themes | `next-themes` with CSS variable tokens, theme also stored in a cookie | No flash, easy to add themes. |
| File storage | Vercel Blob, client upload with a server issued token | Same platform, no extra account. |
| Validation | Zod on every server action | One schema per input. |
| Dates | `date-fns` and `date-fns-tz` | Local day bucketing. |
| Tests | Vitest (logic), Playwright (one smoke flow) | Timer math and heatmap bucketing are the risky parts. |
| Hosting | Vercel (Neon via Vercel integration) | Fixed by PRD. |
| Observability | Vercel Analytics and runtime logs; Sentry later | Enough for a solo launch. |

## Feature design

**Data model** (Drizzle, snake_case tables):
- `users`: `id` text PK (Clerk id), `email` text unique, `created_at`, `updated_at`.
- `user_settings`: `id` cuid PK, `user_id` unique FK to users (cascade), `clock_style` enum(DIGITAL, WALL_CLOCK) default DIGITAL, `theme` text default "system", `timezone` text default "UTC".
- `time_entries`: `id` cuid PK, `user_id` FK (cascade), `duration_sec` int > 0, `started_at` timestamptz, `ended_at` timestamptz, `notes` text null, `image_url` text null, `created_at`. Index `(user_id, started_at)`.
- `active_sessions`: `user_id` PK FK (cascade), `status` enum(RUNNING, PAUSED), `target_sec` int, `started_at` timestamptz, `accumulated_sec` int (time banked before the current run), `last_resumed_at` timestamptz null (set while RUNNING).

The first three match the PRD, plus `timezone`; `active_sessions` is new.

**State transitions**: none → RUNNING (start) · RUNNING → PAUSED (pause) · PAUSED → RUNNING (resume) · RUNNING or PAUSED → completed (row deleted, TimeEntry written) · any → discarded (cancel).
Elapsed = `accumulated_sec` + (now minus `last_resumed_at` if RUNNING).

**Server actions**:
| Action | Key inputs | Outputs | Errors |
|---|---|---|---|
| startSession | targetSec | ActiveSession | 409 if one exists, 422 on bad target |
| pauseSession / resumeSession | none | ActiveSession | 404 none, 409 wrong state |
| completeSession | notes?, imageUrl? | TimeEntry | 404 none, 422 invalid |
| discardSession | none | ok | 404 none |
| updateEntry | id, notes?, imageUrl? | TimeEntry | 403 not owner, 404 |
| deleteEntry | id | ok | 403, 404 |
| updateSettings | clockStyle?, theme?, timezone? | settings | 422 |
| `POST /api/blob/upload` | file metadata | Blob upload token | 401, 415 type, 413 size |

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Heatmap and tooltips | the user's local day | `user_settings.timezone` (set from `Intl.DateTimeFormat().resolvedOptions().timeZone` on first load, editable) |
| Heatmap | minutes per day | `SUM(duration_sec)` grouped by `date_trunc('day', started_at AT TIME ZONE tz)`, last 365 days |
| completeSession | `duration_sec` | derived on the server from `active_sessions` |
| completeSession | `started_at`, `ended_at` | `active_sessions.started_at`, server `now()` |
| Any action | user id | Clerk `auth().userId` |
| Chime at target | target | `active_sessions.target_sec` |

**Key invariants**: one active session per user (PK on `user_id`); `duration_sec` is never client supplied; every query filters by `user_id`; image URLs must come from our Blob store.

**Security model**: Clerk session required on all routes except `/`, sign in and sign up. Ownership checked in every action. Blob token route checks auth, content type and size. No PII beyond email.

**Configuration required**: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`.

**UI direction**: dark first, minimal, mono numerals for the digital clock; the wall clock is an SVG dial with a sweeping arc. Each theme overrides semantic tokens and the five heatmap level colors (light and dark: gray to emerald; matrix: black to green/amber; cyberpunk: dark to magenta/cyan). Pages: `/` landing, `/dashboard` (clock on top, heatmap below, recent entries), `/settings`. Day click opens a drawer listing that day's entries with notes and images. Design source: no design file yet, direction proposed here; timelapps.club is inspiration only, no copying.

**Edge cases**: second tab starts a session → 409, UI syncs to the existing one. Clock drift → always recompute from timestamps, never tick counters. Offline pause → queued in localStorage and reconciled on reconnect, server wins on conflict. Sessions crossing midnight count toward the start day. Blob upload succeeds but complete fails → orphan blob, cleaned up later (see Follow-up).

**Critical test scenarios**:
- Elapsed math across start, pause, resume, refresh, verifies **AC-4**, **AC-7**
- Heatmap bucketing at 23:30 local in UTC+11 and UTC-8, verifies **AC-8**
- Complete cannot be called with a client duration, verifies **AC-6**
- User B cannot read or delete user A's entry, verifies **AC-11**
- Signed in `/` redirects, signed out `/dashboard` redirects, verifies **AC-1**

## Build plan

Approach: Tracer Bullet (assumed, no approach on record). Thin end to end thread first, then thicken.

1. Scaffold Next.js + TypeScript + Tailwind v4 + shadcn, pnpm, env template, satisfies **AC-12**
2. Clerk setup, middleware, sign in and up pages, `/` redirect rule, satisfies **AC-1**
3. Drizzle schema, first migration, Neon connection, `ensureUser` lazy upsert helper, satisfies **AC-2**, **AC-11**
4. Thread: start, complete (no pause yet), minimal digital clock, minimal heatmap from real data, satisfies **AC-3**, **AC-6**, **AC-8**
5. Full timer state machine: pause, resume, overtime, chime, localStorage mirror, restore on load, satisfies **AC-4**, **AC-5**, **AC-7**
6. Heatmap polish: 5 levels, 365 day layout, month labels, tooltip, day drawer, satisfies **AC-8**
7. Wall clock SVG visualizer and clock style setting, satisfies **AC-10**
8. Theme system: tokens, five themes, cookie plus DB persistence, satisfies **AC-10**
9. Completion dialog, notes, Blob drag and drop upload, edit and delete later, satisfies **AC-9**
10. Settings page (timezone, clock, theme), satisfies **AC-10**
11. Tests (Vitest for timer and bucketing, Playwright smoke), satisfies **AC-4**, **AC-8**, **AC-11**
12. Landing page, metadata, OG image, deploy to Vercel with Neon integration, satisfies **AC-12**

## Consequences

**Positive**:
- One deployable app, fast server rendered first paint, and a timer that survives crashes.
- Drizzle plus the HTTP driver keeps cold starts small.

**Negative / tradeoffs**:
- Server session adds a DB write on each play and pause.
- Drizzle needs hand written heatmap SQL, and schema differs from the PRD's Prisma sample.
- Chrome profile token auto login is controlled by Clerk and Google; we can enable One Tap but not guarantee it.

**Neutral**:
- `timezone` and `active_sessions` extend the PRD schema.

## Follow-up

- [ ] Sweep orphaned Blob files (scheduled cron) after launch.
- [ ] Decide whether to add streaks and weekly stats after v1.
- [ ] Add Sentry when real users arrive.

## Options considered

### Option 1: Next.js monolith, Clerk, Neon, Drizzle, Vercel Blob (chosen)
Pros: fewest moving parts, fits PRD, fast. Cons: tied to Vercel services.

### Option 2: Same stack with Prisma and Uploadthing
Pros: familiar schema syntax, typed upload routes. Cons: heavier client for serverless, one more vendor.

### Option 3: Timer fully client side (localStorage only)
Pros: no write per click, works offline. Cons: loses progress if site data is cleared, no cross device state.

## Rationale

The app is small and read heavy, so a monolith with server components gives the speed target without extra services. Drizzle suits serverless and the one non trivial query (the heatmap). Timestamp based timers backed by a server row remove drift and satisfy the "never lose progress" requirement better than counters or local only state.
