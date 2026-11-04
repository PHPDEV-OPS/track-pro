# track-pro

A minimal focus timer that turns every finished session into a square on a 365 day grid, like a contribution graph.

**Live:** https://track-pro-sage.vercel.app

## Features

- Sign in with Google or GitHub
- Focus timer with pause, resume, overtime and a full screen focus mode
- Sessions survive refresh, tab close and a second device
- Yearly heatmap in your own timezone, with a day view of past sessions
- Optional notes and screenshot per session
- Digital or wall clock, five themes (system, light, dark, matrix, cyberpunk)

## Stack

Next.js (App Router, server actions) · Clerk · Neon Postgres + Drizzle · Vercel Blob · Tailwind CSS · Vitest + Playwright

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in Clerk, Neon and Blob values
pnpm exec drizzle-kit push   # create the tables
pnpm dev
```

## Tests

```bash
pnpm test       # unit + integration (needs TEST_DATABASE_URL, a separate Neon branch)
pnpm test:e2e   # Playwright smoke test (needs E2E_CLERK_USER_EMAIL)
```
