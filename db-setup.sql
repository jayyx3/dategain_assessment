-- ============================================
-- Streak: Daily Pulse — Database Setup
-- Run this in Supabase SQL Editor
-- ============================================

-- players
create table players (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  created_at timestamptz not null default now()
);

-- daily_rounds: one row per UTC day
create table daily_rounds (
  date date primary key,
  lock_price numeric not null,
  resolved boolean not null default false,
  resolved_price numeric,
  status text not null default 'PENDING' check (status in ('PENDING', 'RESOLVED', 'VOID'))
);

-- guesses: one row per player per day
create table guesses (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  date date not null references daily_rounds(date),
  direction text not null check (direction in ('UP','DOWN')),
  correct boolean,
  created_at timestamptz not null default now(),
  unique (player_id, date)
);

-- streaks: maintained state per player
create table streaks (
  player_id uuid primary key references players(id) on delete cascade,
  current integer not null default 0,
  max integer not null default 0,
  last_played_date date,
  total_correct integer not null default 0,
  total_played integer not null default 0
);

-- Indexes
create index idx_guesses_player_date on guesses(player_id, date);
create index idx_guesses_date on guesses(date);
create index idx_streaks_current on streaks(current desc);
create index idx_daily_rounds_status on daily_rounds(status);
