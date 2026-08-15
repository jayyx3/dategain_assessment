import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";
import { getReferencePrice } from "@/lib/price";
import { getUTCToday, getUTCYesterday } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

    if (authHeader !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getServerSupabase();
    const yesterday = getUTCYesterday();
    const today = getUTCToday();

    // 1. Get yesterday's round
    const { data: yesterdayRound } = await db
      .from("daily_rounds")
      .select("*")
      .eq("date", yesterday)
      .single();

    if (!yesterdayRound) {
      return NextResponse.json({
        message: "No round found for yesterday. Nothing to resolve.",
      });
    }

    if (yesterdayRound.resolved) {
      return NextResponse.json({
        message: "Yesterday's round already resolved.",
      });
    }

    // 2. Fetch current price
    let resolvedPrice: number;
    let isVoid = false;

    try {
      const { price } = await getReferencePrice();
      resolvedPrice = price;
    } catch (apiErr) {
      console.error("Price API failed during resolution:", apiErr);
      // Mark as VOID — don't penalize anyone
      await db
        .from("daily_rounds")
        .update({
          resolved: true,
          status: "VOID",
        })
        .eq("date", yesterday);

      // Mark all guesses as null (neither correct nor incorrect)
      await db
        .from("guesses")
        .update({ correct: null })
        .eq("date", yesterday);

      return NextResponse.json({
        message: "Resolution VOID — price API failed. No streaks affected.",
        status: "VOID",
      });
    }

    // 3. Update yesterday's round with resolved price
    await db
      .from("daily_rounds")
      .update({
        resolved: true,
        resolved_price: resolvedPrice,
        status: "RESOLVED",
      })
      .eq("date", yesterday);

    // 4. Get all guesses for yesterday
    const { data: guesses } = await db
      .from("guesses")
      .select("id, player_id, direction")
      .eq("date", yesterday);

    if (!guesses || guesses.length === 0) {
      // No guesses to resolve
      // Create today's round
      await createTodayRound(db, today, resolvedPrice);
      return NextResponse.json({
        message: "Resolved. No guesses to evaluate.",
        resolvedPrice,
      });
    }

    // 5. Resolve each guess
    const lockPrice = Number(yesterdayRound.lock_price);
    let resolved = 0;

    for (const guess of guesses) {
      const isCorrect =
        guess.direction === "UP"
          ? resolvedPrice > lockPrice
          : resolvedPrice < lockPrice;

      // Handle exact same price → treat as wrong (extremely rare)
      const correct = resolvedPrice === lockPrice ? false : isCorrect;

      // Update guess correctness
      await db
        .from("guesses")
        .update({ correct })
        .eq("id", guess.id);

      // Update player's streak
      const { data: streak } = await db
        .from("streaks")
        .select("current, max, total_correct, total_played")
        .eq("player_id", guess.player_id)
        .single();

      if (streak) {
        const newCurrent = correct ? streak.current + 1 : 0;
        const newMax = Math.max(streak.max, newCurrent);
        const newTotalCorrect = streak.total_correct + (correct ? 1 : 0);

        await db
          .from("streaks")
          .update({
            current: newCurrent,
            max: newMax,
            total_correct: newTotalCorrect,
            last_played_date: yesterday,
          })
          .eq("player_id", guess.player_id);
      }

      resolved++;
    }

    // 6. Create today's round with fresh price
    await createTodayRound(db, today, resolvedPrice);

    return NextResponse.json({
      message: `Resolved ${resolved} guesses.`,
      resolvedPrice,
      lockPrice,
      status: "RESOLVED",
    });
  } catch (err) {
    console.error("Cron resolve error:", err);
    return NextResponse.json(
      { error: "Resolution failed" },
      { status: 500 }
    );
  }
}

async function createTodayRound(
  db: ReturnType<typeof getServerSupabase>,
  today: string,
  price: number
) {
  // Create today's round if it doesn't exist
  await db
    .from("daily_rounds")
    .upsert(
      { date: today, lock_price: price },
      { onConflict: "date" }
    );
}
