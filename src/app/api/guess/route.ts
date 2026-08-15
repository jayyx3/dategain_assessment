import { NextResponse } from "next/server";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getUTCToday } from "@/lib/utils";
import { localSubmitGuess } from "@/lib/local-store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { playerId, direction } = body;

    if (!playerId || !direction) {
      return NextResponse.json(
        { error: "playerId and direction are required" },
        { status: 400 }
      );
    }

    if (direction !== "UP" && direction !== "DOWN") {
      return NextResponse.json(
        { error: "direction must be UP or DOWN" },
        { status: 400 }
      );
    }

    // ─── Local fallback mode ───────────────────────────────
    if (!isSupabaseConfigured) {
      const result = localSubmitGuess(playerId, direction);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 409 });
      }
      return NextResponse.json({ ok: true, guess: result.guess });
    }

    // ─── Supabase mode ─────────────────────────────────────
    const db = getServerSupabase();
    const today = getUTCToday();

    // 1. Check today's round exists and is PENDING
    const { data: round } = await db
      .from("daily_rounds")
      .select("date, status")
      .eq("date", today)
      .single();

    if (!round) {
      return NextResponse.json(
        { error: "Today's round hasn't started yet. Please refresh." },
        { status: 404 }
      );
    }

    if (round.status !== "PENDING") {
      return NextResponse.json(
        { error: "Today's round is already resolved or voided." },
        { status: 409 }
      );
    }

    // 2. Lazy missed-day detection
    const { data: streak } = await db
      .from("streaks")
      .select("current, max, last_played_date, total_correct, total_played")
      .eq("player_id", playerId)
      .single();

    if (streak && streak.last_played_date) {
      const lastPlayed = new Date(streak.last_played_date + "T00:00:00Z");
      const todayDate = new Date(today + "T00:00:00Z");
      const yesterday = new Date(todayDate);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      const lastPlayedStr = lastPlayed.toISOString().split("T")[0];
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      if (lastPlayedStr !== yesterdayStr && lastPlayedStr !== today) {
        await db
          .from("streaks")
          .update({ current: 0 })
          .eq("player_id", playerId);
      }
    }

    // 3. Insert guess (unique constraint is the real safety net)
    const { data: guess, error: guessErr } = await db
      .from("guesses")
      .insert({
        player_id: playerId,
        date: today,
        direction,
      })
      .select("id, direction, date, created_at")
      .single();

    if (guessErr) {
      if (guessErr.code === "23505") {
        return NextResponse.json(
          { error: "You've already made your guess today. One guess per day!" },
          { status: 409 }
        );
      }
      throw guessErr;
    }

    // 4. Update last_played_date and total_played
    await db
      .from("streaks")
      .update({
        last_played_date: today,
        total_played: (streak?.total_played ?? 0) + 1,
      })
      .eq("player_id", playerId);

    return NextResponse.json({
      ok: true,
      guess: {
        direction: guess.direction,
        date: guess.date,
      },
    });
  } catch (err) {
    console.error("Guess route error:", err);
    return NextResponse.json(
      { error: "Failed to submit guess" },
      { status: 500 }
    );
  }
}
