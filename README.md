# Streak: Daily Pulse

> A daily prediction game where you call whether Bitcoin's price goes **higher** or **lower** — one guess per day, no do-overs. Build your streak.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase)
![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?logo=vercel)

---

## Table of Contents

- [Why This Mechanic?](#why-this-mechanic)
- [Architecture](#architecture)
- [Features](#features)
- [Edge Cases Handled](#edge-cases-handled)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Known Limitations & Future Scope](#known-limitations--future-scope)

---

## Why This Mechanic?

The assignment asks for **"one guess per day."** Most puzzle types — word games, number puzzles, pattern matching — make a single guess feel like a lottery. You're almost certainly wrong.

A **binary UP/DOWN call** on a real market metric is different. It's an **inherently fair 50/50 bet**. The mechanic and the "one guess" constraint are designed *together*, not in conflict. Every player has equal odds, every day. What separates players is **consistency** — that's what the streak measures.

---

## Architecture

```
┌──────────────┐        ┌───────────────────┐        ┌───────────────┐
│              │        │                   │        │               │
│   Browser    │◄──────►│  Next.js API      │◄──────►│   Supabase    │
│  (React SPA) │        │  Routes (5)       │        │  PostgreSQL   │
│              │        │                   │        │               │
└──────────────┘        └───────────────────┘        └───────────────┘
                               ▲
                               │
                        ┌──────┴───────┐
                        │              │
                        │ Vercel Cron  │──── 00:00 UTC daily
                        │              │
                        └──────┬───────┘
                               │
                        ┌──────▼───────┐
                        │              │
                        │  CoinGecko   │
                        │  BTC/USD API │
                        │              │
                        └──────────────┘
```

### Data Flow

1. **Player opens app** → Frontend fetches today's locked BTC price via `/api/today`
2. **Player guesses UP or DOWN** → Guess saved via `/api/guess` (race-safe unique constraint)
3. **Midnight UTC** → Vercel Cron triggers `/api/cron/resolve`
4. **Resolution job** → Fetches new BTC price from CoinGecko, compares with lock price
5. **Streaks updated** → Correct = streak +1, Wrong = reset to 0, API fail = VOID (no penalty)
6. **Next day** → Player sees yesterday's result banner + new lock price

---

## Features

### Core Game
- **Live BTC price** — fetched from CoinGecko's public API (no key needed)
- **One guess per day** — enforced at database level via `UNIQUE (player_id, date)` constraint
- **Streak tracking** — current streak, best streak, win rate, total games
- **Yesterday's result** — shows whether you were right or wrong with price change details

### UI/UX
- **Monochrome dark theme** — professional, typography-driven design
- **Countdown timer** — live ticking clock until midnight UTC resolution
- **Today's timeline** — visual progress indicator showing where you are in the day cycle
- **Stats grid** — current streak, best, win rate, games played
- **Recent results dots** — last 10 games as colored dots (green=win, red=loss)
- **How streaks work** — inline explainer for new players

### Technical
- **Race-safe submissions** — PostgreSQL unique constraint prevents double-guessing even under concurrent requests
- **Lazy round initialization** — if today's round doesn't exist when a player visits, it's created on-the-fly
- **Missed-day detection** — if you skip a day, your streak resets lazily on next visit
- **VOID on API failure** — if CoinGecko is down at resolution time, round is voided — no unfair streak resets
- **Local fallback mode** — app works without Supabase for local development/testing

---

## Edge Cases Handled

| Scenario | How It's Handled |
|----------|-----------------|
| Player submits guess twice in same day | DB unique constraint returns 409 — even under race conditions |
| Player skips a day (doesn't open app) | Streak resets lazily when they next submit a guess |
| CoinGecko API is down at midnight | Round marked as `VOID` — no one's streak is penalized |
| Two players submit at exact same time | Each gets their own row — no conflicts (unique per player+date) |
| Price is exactly the same (no change) | Treated as wrong guess (extremely rare edge case) |
| Player clears browser data | New player created — acceptable per "no real auth" requirement |
| Server restarts during local dev | In-memory store resets — only affects local fallback mode |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 16 (App Router) | Server + client in one project, API routes built-in |
| **Language** | TypeScript | Type safety across frontend and API |
| **Styling** | Tailwind CSS v4 | Utility-first, fast iteration, `@theme` design tokens |
| **Database** | Supabase (PostgreSQL) | Free tier, instant setup, row-level security capable |
| **Hosting** | Vercel | Zero-config Next.js deployment, built-in cron support |
| **Scheduled Job** | Vercel Cron | Daily midnight resolution — no external scheduler needed |
| **Market Data** | CoinGecko API | Free, no API key required, reliable BTC/USD prices |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A Supabase account (free tier works)

### Installation

```bash
# Clone the repository
git clone https://github.com/jayyx3/dategain_assessment.git
cd dategain_assessment

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your Supabase credentials (see below)
```

### Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run [`db-setup.sql`](./db-setup.sql) to create tables
3. Run [`seed-demo.sql`](./seed-demo.sql) to insert demo data
4. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Secret key → `SUPABASE_SERVICE_ROLE_KEY`

### Run Locally

```bash
npm run dev
# Open http://localhost:3000
```

---

## Database Schema

```sql
-- 4 tables, all with proper constraints and indexes

players          -- username + UUID identity
daily_rounds     -- one row per UTC day, lock price + resolved price
guesses          -- one row per player per day (UNIQUE constraint)
streaks          -- current/max streak, win stats per player
```

See [`db-setup.sql`](./db-setup.sql) for the full schema with constraints and indexes.

### Key Constraint

```sql
-- This single line prevents all double-guess exploits:
UNIQUE (player_id, date)
```

---

## API Reference

| Endpoint | Method | Purpose | Key Detail |
|----------|--------|---------|------------|
| `/api/player` | POST | Create or fetch player | Race-safe upsert with 23505 handling |
| `/api/today` | GET | Today's round + status | Lazy-initializes round if missing |
| `/api/guess` | POST | Submit UP/DOWN guess | Returns 409 on duplicate (DB enforced) |
| `/api/stats` | GET | Player's streak & history | Win rate, recent results, best streak |
| `/api/cron/resolve` | POST | Daily resolution job | Protected by `CRON_SECRET` bearer token |

### Example: Submit a Guess

```bash
curl -X POST http://localhost:3000/api/guess \
  -H "Content-Type: application/json" \
  -d '{"playerId": "uuid-here", "direction": "UP"}'
```

**Success (200):**
```json
{ "ok": true, "guess": { "direction": "UP", "date": "2026-08-15" } }
```

**Already guessed (409):**
```json
{ "error": "You've already made your guess today. One guess per day!" }
```

---

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import repository at [vercel.com](https://vercel.com)
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
4. Deploy — Vercel auto-detects Next.js
5. Cron job is auto-configured via [`vercel.json`](./vercel.json)

---

## Known Limitations & Future Scope

### Current Limitations
- **localStorage-based identity** — clearing browser data creates a new player
- **Single metric** — currently Bitcoin only
- **Cron timing** — depends on Vercel Cron reliability (lazy-init provides fallback)

### If I Had More Time
- **Real authentication** — OAuth via Supabase Auth
- **Multiple metrics** — Gold, S&P 500, ETH — let players pick
- **Streak freeze tokens** — earn by hitting 7-day streaks, use to skip a missed day
- **Global leaderboard** — ranked by current streak, with tie-breaking by total games
- **Push notifications** — daily reminder to make your call
- **Historical chart** — show past lock prices and your prediction accuracy over time

---

## Project Structure

```
streak-daily-pulse/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── player/route.ts      # Player creation/lookup
│   │   │   ├── today/route.ts       # Today's round + lazy init
│   │   │   ├── guess/route.ts       # Guess submission (race-safe)
│   │   │   ├── stats/route.ts       # Streak & win rate
│   │   │   └── cron/resolve/route.ts # Daily resolution job
│   │   ├── globals.css              # Design system tokens
│   │   ├── layout.tsx               # Root layout + SEO
│   │   └── page.tsx                 # Single-page game UI
│   └── lib/
│       ├── supabase.ts              # DB client helpers
│       ├── price.ts                 # CoinGecko price fetch
│       ├── utils.ts                 # Date/format utilities
│       └── local-store.ts           # In-memory fallback for dev
├── db-setup.sql                     # Database schema
├── seed-demo.sql                    # Demo data
├── vercel.json                      # Cron configuration
├── .env.example                     # Env vars template
└── README.md                        # You are here
```

---

## Built By

**Jay Joshi** — Dategain Developer Challenge, Round 2

---

*Real prices. One guess. No do-overs.*
