import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { localGetStats } from "@/lib/local-store";

export async function GET(request: NextRequest) {
  try {
    const playerId = request.nextUrl.searchParams.get("playerId");

    if (!playerId) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    // ─── Local fallback mode ───────────────────────────────
    if (!isSupabaseConfigured) {
      return NextResponse.json(localGetStats(playerId));
    }

    // ─── Supabase mode ─────────────────────────────────────
    const db = getServerSupabase();

    const { data: streak } = await db
      .from("streaks")
      .select("current, max, total_correct, total_played")
      .eq("player_id", playerId)
      .single();

    const { data: recentGuesses } = await db
      .from("guesses")
      .select("correct, date")
      .eq("player_id", playerId)
      .order("date", { ascending: false })
      .limit(10);

    const recentDates = recentGuesses?.map((g) => g.date) || [];
    const { data: voidRounds } = await db
      .from("daily_rounds")
      .select("date, status")
      .in("date", recentDates.length > 0 ? recentDates : ["1970-01-01"]);

    const voidDates = new Set(
      voidRounds?.filter((r) => r.status === "VOID").map((r) => r.date) || []
    );

    const recentResults = (recentGuesses || []).map((g) => {
      if (voidDates.has(g.date)) return "V";
      if (g.correct === null) return "P";
      return g.correct ? "W" : "L";
    });

    const totalCorrect = streak?.total_correct ?? 0;
    const totalPlayed = streak?.total_played ?? 0;
    const winRate = totalPlayed > 0 ? Math.round((totalCorrect / totalPlayed) * 100) : 0;

    return NextResponse.json({
      current: streak?.current ?? 0,
      max: streak?.max ?? 0,
      totalCorrect,
      totalPlayed,
      winRate,
      recentResults,
    });
  } catch (err) {
    console.error("Stats route error:", err);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
