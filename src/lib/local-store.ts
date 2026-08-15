/**
 * In-memory fallback store for local development when Supabase isn't configured.
 * Data resets on server restart — this is only for testing the UI.
 */

import { getReferencePrice } from "./price";
import { getUTCToday, getUTCYesterday } from "./utils";

// ─── Types ───────────────────────────────────────────────────
interface Player {
  id: string;
  username: string;
  created_at: string;
}

interface DailyRound {
  date: string;
  lock_price: number;
  resolved: boolean;
  resolved_price: number | null;
  status: "PENDING" | "RESOLVED" | "VOID";
}

interface Guess {
  id: string;
  player_id: string;
  date: string;
  direction: "UP" | "DOWN";
  correct: boolean | null;
  created_at: string;
}

interface Streak {
  player_id: string;
  current: number;
  max: number;
  last_played_date: string | null;
  total_correct: number;
  total_played: number;
}

// ─── In-memory data ──────────────────────────────────────────
const players: Map<string, Player> = new Map();
const rounds: Map<string, DailyRound> = new Map();
const guesses: Map<string, Guess> = new Map(); // key: `${player_id}_${date}`
const streaks: Map<string, Streak> = new Map();

let idCounter = 1;
function genId(): string {
  return `local-${Date.now()}-${idCounter++}`;
}

// Pre-seed yesterday as a resolved round for demo
function seedDemoData() {
  const yesterday = getUTCYesterday();
  if (!rounds.has(yesterday)) {
    rounds.set(yesterday, {
      date: yesterday,
      lock_price: 67542.3,
      resolved: true,
      resolved_price: 68105.8,
      status: "RESOLVED",
    });
  }
}
seedDemoData();

// ─── Player operations ───────────────────────────────────────
export function localCreatePlayer(username: string): Player {
  // Check if exists
  for (const p of players.values()) {
    if (p.username === username) return p;
  }
  const player: Player = {
    id: genId(),
    username,
    created_at: new Date().toISOString(),
  };
  players.set(player.id, player);
  streaks.set(player.id, {
    player_id: player.id,
    current: 0,
    max: 0,
    last_played_date: null,
    total_correct: 0,
    total_played: 0,
  });
  return player;
}

// ─── Today's round ───────────────────────────────────────────
export async function localGetToday(playerId: string) {
  const today = getUTCToday();

  // Ensure today's round exists
  if (!rounds.has(today)) {
    try {
      const { price } = await getReferencePrice();
      rounds.set(today, {
        date: today,
        lock_price: price,
        resolved: false,
        resolved_price: null,
        status: "PENDING",
      });
    } catch {
      // Fallback price if API fails
      rounds.set(today, {
        date: today,
        lock_price: 67890.5,
        resolved: false,
        resolved_price: null,
        status: "PENDING",
      });
    }
  }

  const round = rounds.get(today)!;
  const guessKey = `${playerId}_${today}`;
  const guess = guesses.get(guessKey) || null;
  const streak = streaks.get(playerId) || {
    current: 0,
    max: 0,
    total_correct: 0,
    total_played: 0,
  };

  // Check yesterday's result
  const yesterday = getUTCYesterday();
  const yesterdayRound = rounds.get(yesterday) || null;
  const yesterdayGuess = guesses.get(`${playerId}_${yesterday}`) || null;

  let yesterdayResult = null;
  if (yesterdayGuess && yesterdayRound?.resolved) {
    yesterdayResult = {
      date: yesterday,
      direction: yesterdayGuess.direction,
      correct: yesterdayGuess.correct,
      lockPrice: yesterdayRound.lock_price,
      resolvedPrice: yesterdayRound.resolved_price!,
      status: yesterdayRound.status,
    };
  }

  // Calculate next midnight UTC
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  return {
    date: round.date,
    lockPrice: round.lock_price,
    status: round.status,
    hasGuessed: !!guess,
    guess: guess
      ? { direction: guess.direction, correct: guess.correct }
      : null,
    streak: {
      current: streak.current,
      max: streak.max,
      totalCorrect: streak.total_correct,
      totalPlayed: streak.total_played,
    },
    nextResolutionAt: tomorrow.toISOString(),
    yesterdayResult,
  };
}

// ─── Guess ───────────────────────────────────────────────────
export function localSubmitGuess(
  playerId: string,
  direction: "UP" | "DOWN"
): { ok: boolean; error?: string; guess?: { direction: string; date: string } } {
  const today = getUTCToday();
  const guessKey = `${playerId}_${today}`;

  // Already guessed?
  if (guesses.has(guessKey)) {
    return { ok: false, error: "You've already made your guess today. One guess per day!" };
  }

  // Check round exists
  if (!rounds.has(today)) {
    return { ok: false, error: "Today's round hasn't started yet." };
  }

  // Missed-day detection
  const streak = streaks.get(playerId);
  if (streak && streak.last_played_date) {
    const lastPlayed = streak.last_played_date;
    const yesterday = getUTCYesterday();
    if (lastPlayed !== yesterday && lastPlayed !== today) {
      streak.current = 0;
    }
  }

  // Create guess
  const guess: Guess = {
    id: genId(),
    player_id: playerId,
    date: today,
    direction,
    correct: null,
    created_at: new Date().toISOString(),
  };
  guesses.set(guessKey, guess);

  // Update streak stats
  if (streak) {
    streak.last_played_date = today;
    streak.total_played += 1;
  }

  return { ok: true, guess: { direction, date: today } };
}

// ─── Stats ───────────────────────────────────────────────────
export function localGetStats(playerId: string) {
  const streak = streaks.get(playerId) || {
    current: 0,
    max: 0,
    total_correct: 0,
    total_played: 0,
  };

  // Get recent results
  const recentResults: string[] = [];
  const allGuesses = Array.from(guesses.values())
    .filter((g) => g.player_id === playerId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  for (const g of allGuesses) {
    if (g.correct === null) recentResults.push("P");
    else if (g.correct) recentResults.push("W");
    else recentResults.push("L");
  }

  const winRate =
    streak.total_played > 0
      ? Math.round((streak.total_correct / streak.total_played) * 100)
      : 0;

  return {
    current: streak.current,
    max: streak.max,
    totalCorrect: streak.total_correct,
    totalPlayed: streak.total_played,
    winRate,
    recentResults,
  };
}
