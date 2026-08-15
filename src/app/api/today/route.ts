import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getReferencePrice } from "@/lib/price";
import { getUTCToday, getNextMidnightUTC } from "@/lib/utils";
import { localGetToday } from "@/lib/local-store";

export async function GET(request: NextRequest) {
  try {
    const playerId = request.nextUrl.searchParams.get("playerId");

    if (!playerId) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    // ─── Local fallback mode ───────────────────────────────
    if (!isSupabaseConfigured) {
      const data = await localGetToday(playerId);
      return NextResponse.json(data);
    }

    // ─── Supabase mode ─────────────────────────────────────
    const db = getServerSupabase();
    const today = getUTCToday();

    // 1. Get or create today's round (lazy-init)
    let { data: round } = await db
      .from("daily_rounds")
      .select("*")
      .eq("date", today)
      .single();

    if (!round) {
      try {
        const { price } = await getReferencePrice();

        const { data: newRound, error: roundErr } = await db
          .from("daily_rounds")
          .insert({ date: today, lock_price: price })
          .select("*")
          .single();

        if (roundErr) {
          if (roundErr.code === "23505") {
            const { data: raceRound } = await db
              .from("daily_rounds")
              .select("*")
              .eq("date", today)
              .single();
            round = raceRound;
          } else {
            throw roundErr;
          }
        } else {
          round = newRound;
        }
      } catch (priceErr) {
        console.error("Failed to fetch price for lazy init:", priceErr);
        return NextResponse.json(
          { error: "Could not fetch market data. Try again shortly." },
          { status: 503 }
        );
      }
    }

    if (!round) {
      return NextResponse.json({ error: "Could not load today's round" }, { status: 500 });
    }

    // 2. Check if player already guessed today
    const { data: guess } = await db
      .from("guesses")
      .select("direction, correct, created_at")
      .eq("player_id", playerId)
      .eq("date", today)
      .single();

    // 3. Get player's streak
    const { data: streak } = await db
      .from("streaks")
      .select("current, max, total_correct, total_played, last_played_date")
      .eq("player_id", playerId)
      .single();

    // 4. Check yesterday's result
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const { data: yesterdayGuess } = await db
      .from("guesses")
      .select("direction, correct")
      .eq("player_id", playerId)
      .eq("date", yesterdayStr)
      .single();

    const { data: yesterdayRound } = await db
      .from("daily_rounds")
      .select("lock_price, resolved_price, status, resolved")
      .eq("date", yesterdayStr)
      .single();

    let yesterdayResult = null;
    if (yesterdayGuess && yesterdayRound?.resolved) {
      yesterdayResult = {
        date: yesterdayStr,
        direction: yesterdayGuess.direction,
        correct: yesterdayGuess.correct,
        lockPrice: Number(yesterdayRound.lock_price),
        resolvedPrice: Number(yesterdayRound.resolved_price),
        status: yesterdayRound.status,
      };
    }

    return NextResponse.json({
      date: round.date,
      lockPrice: Number(round.lock_price),
      status: round.status,
      hasGuessed: !!guess,
      guess: guess
        ? { direction: guess.direction, correct: guess.correct }
        : null,
      streak: streak
        ? {
            current: streak.current,
            max: streak.max,
            totalCorrect: streak.total_correct,
            totalPlayed: streak.total_played,
          }
        : { current: 0, max: 0, totalCorrect: 0, totalPlayed: 0 },
      nextResolutionAt: getNextMidnightUTC(),
      yesterdayResult,
    });
  } catch (err) {
    console.error("Today route error:", err);
    return NextResponse.json(
      { error: "Failed to load today's data" },
      { status: 500 }
    );
  }
}
