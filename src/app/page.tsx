"use client";

import { useState, useEffect, useCallback } from "react";
import { formatPrice } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────
interface Streak {
  current: number;
  max: number;
  totalCorrect: number;
  totalPlayed: number;
}

interface YesterdayResult {
  date: string;
  direction: string;
  correct: boolean | null;
  lockPrice: number;
  resolvedPrice: number;
  status: string;
}

interface TodayData {
  date: string;
  lockPrice: number;
  status: string;
  hasGuessed: boolean;
  guess: { direction: string; correct: boolean | null } | null;
  streak: Streak;
  nextResolutionAt: string;
  yesterdayResult: YesterdayResult | null;
}

interface Stats {
  current: number;
  max: number;
  totalCorrect: number;
  totalPlayed: number;
  winRate: number;
  recentResults: string[];
}

type GameState = "loading" | "username" | "puzzle" | "guessed" | "error";

// ─── Component ───────────────────────────────────────────────
export default function Home() {
  const [state, setState] = useState<GameState>("loading");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [today, setToday] = useState<TodayData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [countdown, setCountdown] = useState({ h: "00", m: "00", s: "00" });
  const [errorMsg, setErrorMsg] = useState("");

  // Init
  useEffect(() => {
    const savedId = localStorage.getItem("streak_player_id");
    const savedName = localStorage.getItem("streak_username");
    if (savedId && savedName) {
      setPlayerId(savedId);
      setUsername(savedName);
    } else {
      setState("username");
    }
  }, []);

  useEffect(() => {
    if (playerId) loadGameData();
  }, [playerId]);

  // Countdown
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const tmrw = new Date(now);
      tmrw.setUTCDate(tmrw.getUTCDate() + 1);
      tmrw.setUTCHours(0, 0, 0, 0);
      const diff = tmrw.getTime() - now.getTime();
      setCountdown({
        h: String(Math.floor(diff / 3600000)).padStart(2, "0"),
        m: String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0"),
        s: String(Math.floor((diff % 60000) / 1000)).padStart(2, "0"),
      });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadGameData = useCallback(async () => {
    setState("loading");
    try {
      const [todayRes, statsRes] = await Promise.all([
        fetch(`/api/today?playerId=${playerId}`),
        fetch(`/api/stats?playerId=${playerId}`),
      ]);
      if (!todayRes.ok) throw new Error("Failed to load");
      const todayData: TodayData = await todayRes.json();
      const statsData: Stats = statsRes.ok ? await statsRes.json() : null;
      setToday(todayData);
      setStats(statsData);
      if (todayData.yesterdayResult && todayData.yesterdayResult.correct !== null) {
        setShowResult(true);
      }
      setState(todayData.hasGuessed ? "guessed" : "puzzle");
    } catch {
      setErrorMsg("Failed to load game data. Please refresh.");
      setState("error");
    }
  }, [playerId]);

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = usernameInput.trim().toLowerCase();
    if (name.length < 2) { setUsernameError("At least 2 characters"); return; }
    if (name.length > 20) { setUsernameError("Max 20 characters"); return; }
    try {
      const res = await fetch("/api/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem("streak_player_id", data.playerId);
      localStorage.setItem("streak_username", data.username);
      setPlayerId(data.playerId);
      setUsername(data.username);
    } catch (err: unknown) {
      setUsernameError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleGuess = async (direction: "UP" | "DOWN") => {
    if (submitting || !playerId || today?.hasGuessed) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, direction }),
      });
      if (!res.ok && (await res.json()).error) {
        loadGameData();
        return;
      }
      loadGameData();
    } catch {
      setErrorMsg("Failed to submit guess.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("streak_player_id");
    localStorage.removeItem("streak_username");
    setPlayerId(null);
    setUsername("");
    setToday(null);
    setStats(null);
    setShowResult(false);
    setState("username");
  };

  // ═══════════════════════════════════════════════════════════
  // LOADING
  // ═══════════════════════════════════════════════════════════
  if (state === "loading") {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center anim-fade">
          <div className="w-5 h-5 border-2 border-text-muted border-t-text-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-muted text-xs tracking-widest uppercase">Loading</p>
        </div>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // USERNAME GATE
  // ═══════════════════════════════════════════════════════════
  if (state === "username") {
    return (
      <main className="flex-1 flex items-center justify-center px-5">
        <div className="w-full max-w-sm anim-enter">
          {/* Brand */}
          <div className="mb-8">
            <p className="text-[11px] text-text-muted tracking-[0.25em] uppercase mb-2">Daily Pulse</p>
            <h1 className="text-3xl font-bold tracking-tight">streak<span className="text-text-muted">.</span></h1>
          </div>

          <p className="text-text-secondary text-sm leading-relaxed mb-8">
            Predict whether Bitcoin closes higher or lower.<br />
            One call per day. Build your streak.
          </p>

          {/* Form */}
          <form onSubmit={handleCreatePlayer} className="space-y-3 mb-10">
            <div>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(""); }}
                placeholder="username"
                maxLength={20}
                autoFocus
                autoComplete="off"
                className="w-full px-0 py-3 bg-transparent border-b border-border-light text-text-primary placeholder:text-text-muted text-sm font-mono outline-none transition-colors focus:border-text-secondary"
              />
              {usernameError && <p className="text-down text-xs mt-2">{usernameError}</p>}
            </div>
            <button
              type="submit"
              disabled={!usernameInput.trim()}
              className="w-full py-3 bg-text-primary text-bg-deep font-semibold text-sm rounded-lg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-20 disabled:cursor-not-allowed"
            >
              Start
            </button>
          </form>

          {/* How it works */}
          <div className="border-t border-border pt-6">
            <p className="text-[10px] text-text-muted tracking-[0.15em] uppercase mb-4">How it works</p>
            <div className="space-y-3">
              {[
                { step: "01", text: "See today's locked Bitcoin price" },
                { step: "02", text: "Predict: will it be higher or lower tomorrow?" },
                { step: "03", text: "Result resolves at midnight UTC" },
                { step: "04", text: "Correct = streak grows. Wrong = reset to zero." },
              ].map((item) => (
                <div key={item.step} className="flex gap-3 items-start">
                  <span className="text-[10px] font-mono text-text-muted leading-5">{item.step}</span>
                  <span className="text-xs text-text-secondary leading-5">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // ERROR
  // ═══════════════════════════════════════════════════════════
  if (state === "error") {
    return (
      <main className="flex-1 flex items-center justify-center px-5">
        <div className="text-center anim-fade">
          <p className="text-text-secondary text-sm mb-4">{errorMsg}</p>
          <button onClick={() => loadGameData()} className="text-xs text-text-muted underline underline-offset-4 hover:text-text-secondary transition-colors">Retry</button>
        </div>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // GAME SCREEN
  // ═══════════════════════════════════════════════════════════
  const streakCurrent = today?.streak.current ?? 0;
  const streakMax = today?.streak.max ?? 0;
  const winRate = stats?.totalPlayed ? stats.winRate : 0;
  const totalPlayed = stats?.totalPlayed ?? 0;

  return (
    <main className="flex-1 flex flex-col max-w-md mx-auto w-full px-5 py-6">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between mb-6 anim-fade">
        <div>
          <p className="text-[10px] text-text-muted tracking-[0.2em] uppercase">Daily Pulse</p>
          <h1 className="text-lg font-bold tracking-tight leading-tight">streak<span className="text-text-muted">.</span></h1>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums leading-none">{streakCurrent}</p>
          <p className="text-[10px] text-text-muted tracking-wider uppercase mt-0.5">
            {streakCurrent === 1 ? "day" : "days"}
          </p>
        </div>
      </header>

      {/* ── Yesterday Result ───────────────────────────────── */}
      {showResult && today?.yesterdayResult && (
        <div className="mb-5 anim-pop">
          <div className={`rounded-lg px-4 py-3.5 border ${
            today.yesterdayResult.correct
              ? "border-up-border bg-up-dim"
              : "border-down-border bg-down-dim"
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-semibold ${today.yesterdayResult.correct ? "text-up" : "text-down"}`}>
                  {today.yesterdayResult.correct ? "Correct" : "Wrong"}
                </p>
                <p className="text-text-muted text-xs mt-1">
                  {formatPrice(today.yesterdayResult.lockPrice)} → {formatPrice(today.yesterdayResult.resolvedPrice)}
                  <span className="ml-1.5">{today.yesterdayResult.resolvedPrice > today.yesterdayResult.lockPrice ? "↑" : "↓"}</span>
                </p>
              </div>
              <button onClick={() => setShowResult(false)} className="text-text-muted text-xs hover:text-text-secondary">✕</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Price Card ─────────────────────────────────────── */}
      <div className="anim-enter delay-1">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-text-muted tracking-[0.15em] uppercase">BTC / USD</p>
          <p className="text-[10px] text-text-muted font-mono">{today?.date}</p>
        </div>
        <div className="bg-bg-card rounded-xl p-5 border border-border">
          <p className="text-[10px] text-text-muted tracking-wider uppercase mb-1">Locked price</p>
          <p className="text-3xl sm:text-4xl font-bold tabular-nums tracking-tight anim-ticker">
            {today?.lockPrice ? formatPrice(today.lockPrice) : "—"}
          </p>
          <p className="text-text-muted text-xs mt-2.5">
            Will tomorrow&apos;s price be higher or lower?
          </p>
        </div>
      </div>

      {/* ── Action Area ────────────────────────────────────── */}
      <div className="mt-3 anim-enter delay-2">
        {state === "puzzle" && !today?.hasGuessed ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleGuess("UP")}
              disabled={submitting}
              className="group py-5 rounded-xl font-semibold text-sm transition-all border border-border bg-bg-card hover:border-up-border hover:bg-up-dim active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="block text-xl mb-1 transition-transform group-hover:-translate-y-0.5">↑</span>
              <span className="text-text-secondary group-hover:text-up transition-colors">Higher</span>
            </button>
            <button
              onClick={() => handleGuess("DOWN")}
              disabled={submitting}
              className="group py-5 rounded-xl font-semibold text-sm transition-all border border-border bg-bg-card hover:border-down-border hover:bg-down-dim active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="block text-xl mb-1 transition-transform group-hover:translate-y-0.5">↓</span>
              <span className="text-text-secondary group-hover:text-down transition-colors">Lower</span>
            </button>
          </div>
        ) : today?.hasGuessed ? (
          <div className="bg-bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 text-center border-b border-border">
              <p className="text-sm">
                You called{" "}
                <span className={`font-semibold ${today.guess?.direction === "UP" ? "text-up" : "text-down"}`}>
                  {today.guess?.direction === "UP" ? "↑ Higher" : "↓ Lower"}
                </span>
              </p>
            </div>
            <div className="p-4 text-center">
              <p className="text-[10px] text-text-muted tracking-[0.15em] uppercase mb-2">Resolves in</p>
              <div className="flex items-center justify-center gap-1">
                <CountdownBlock value={countdown.h} label="hr" />
                <span className="text-text-muted text-lg font-light anim-blink">:</span>
                <CountdownBlock value={countdown.m} label="min" />
                <span className="text-text-muted text-lg font-light anim-blink">:</span>
                <CountdownBlock value={countdown.s} label="sec" />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Stats Grid ─────────────────────────────────────── */}
      <div className="mt-5 anim-enter delay-3">
        <p className="text-[10px] text-text-muted tracking-[0.15em] uppercase mb-2">Your stats</p>
        <div className="grid grid-cols-4 gap-px bg-border rounded-lg overflow-hidden">
          {[
            { value: streakCurrent, label: "Current" },
            { value: streakMax, label: "Best" },
            { value: `${winRate}%`, label: "Win rate" },
            { value: totalPlayed, label: "Played" },
          ].map((item) => (
            <div key={item.label} className="bg-bg-card py-3.5 text-center">
              <p className="text-base font-bold tabular-nums">{item.value}</p>
              <p className="text-[9px] text-text-muted tracking-wider uppercase mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Recent dots */}
        {stats && stats.recentResults.length > 0 && (
          <div className="flex items-center gap-1.5 mt-3 justify-center">
            {stats.recentResults.map((r, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  r === "W" ? "bg-up" : r === "L" ? "bg-down" : r === "V" ? "bg-text-muted" : "bg-text-muted/40 animate-pulse"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── How Streaks Work ───────────────────────────────── */}
      <div className="mt-5 anim-enter delay-4">
        <div className="bg-bg-card rounded-xl border border-border p-4">
          <p className="text-[10px] text-text-muted tracking-[0.15em] uppercase mb-3">How streaks work</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded flex items-center justify-center bg-up-dim border border-up-border shrink-0">
                <span className="text-up text-[10px]">✓</span>
              </div>
              <p className="text-xs text-text-secondary">Correct prediction — streak increases by 1</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded flex items-center justify-center bg-down-dim border border-down-border shrink-0">
                <span className="text-down text-[10px]">✕</span>
              </div>
              <p className="text-xs text-text-secondary">Wrong prediction — streak resets to zero</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded flex items-center justify-center bg-bg-surface border border-border shrink-0">
                <span className="text-text-muted text-[10px]">—</span>
              </div>
              <p className="text-xs text-text-secondary">Miss a day — streak resets automatically</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Today's Timeline ──────────────────────────────── */}
      <div className="mt-5 anim-enter delay-5">
        <p className="text-[10px] text-text-muted tracking-[0.15em] uppercase mb-3">Today&apos;s timeline</p>
        <div className="relative pl-4 border-l border-border space-y-4">
          <TimelineItem
            time="00:00 UTC"
            label="Price locked"
            detail={today?.lockPrice ? formatPrice(today.lockPrice) : "—"}
            done
          />
          <TimelineItem
            time="Now"
            label={today?.hasGuessed ? "Guess submitted" : "Waiting for your call"}
            detail={today?.hasGuessed
              ? `You called ${today.guess?.direction === "UP" ? "Higher" : "Lower"}`
              : "Higher or Lower?"
            }
            done={!!today?.hasGuessed}
            active={!today?.hasGuessed}
          />
          <TimelineItem
            time="00:00 UTC"
            label="Tomorrow's resolution"
            detail="New price fetched, results calculated"
            done={false}
          />
        </div>
      </div>

      {/* ── Rules ──────────────────────────────────────────── */}
      <div className="mt-5 anim-enter delay-5">
        <div className="border border-border rounded-xl p-4">
          <p className="text-[10px] text-text-muted tracking-[0.15em] uppercase mb-3">The rules</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold">1</p>
              <p className="text-[10px] text-text-muted mt-0.5 leading-tight">Guess<br />per day</p>
            </div>
            <div>
              <p className="text-lg font-bold">0</p>
              <p className="text-[10px] text-text-muted mt-0.5 leading-tight">Do-overs<br />allowed</p>
            </div>
            <div>
              <p className="text-lg font-bold">∞</p>
              <p className="text-[10px] text-text-muted mt-0.5 leading-tight">Streak<br />potential</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="mt-8 anim-enter delay-5">
        <div className="border-t border-border pt-4 flex items-center justify-between">
          <p className="text-[10px] text-text-muted">
            Real prices via CoinGecko
          </p>
          <button onClick={handleLogout} className="text-[10px] text-text-muted hover:text-text-secondary transition-colors">
            @{username}
          </button>
        </div>
      </footer>
    </main>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function CountdownBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-bg-surface rounded-lg px-3 py-2 min-w-[52px] text-center">
      <p className="text-xl font-bold font-mono tabular-nums leading-none">{value}</p>
      <p className="text-[8px] text-text-muted uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

function TimelineItem({
  time,
  label,
  detail,
  done,
  active = false,
}: {
  time: string;
  label: string;
  detail: string;
  done: boolean;
  active?: boolean;
}) {
  return (
    <div className="relative">
      {/* Dot */}
      <div className={`absolute -left-[22px] top-0.5 w-2.5 h-2.5 rounded-full border-2 ${
        done
          ? "bg-up border-up"
          : active
            ? "bg-text-primary border-text-primary"
            : "bg-bg-deep border-text-muted"
      }`} />
      <div>
        <p className="text-[10px] text-text-muted font-mono">{time}</p>
        <p className={`text-xs font-medium mt-0.5 ${done ? "text-text-primary" : active ? "text-text-primary" : "text-text-muted"}`}>
          {label}
        </p>
        <p className="text-[11px] text-text-muted mt-0.5">{detail}</p>
      </div>
    </div>
  );
}
