import { NextResponse } from "next/server";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { localCreatePlayer } from "@/lib/local-store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username || typeof username !== "string" || username.trim().length < 2) {
      return NextResponse.json(
        { error: "Username must be at least 2 characters" },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();

    // ─── Local fallback mode ───────────────────────────────
    if (!isSupabaseConfigured) {
      const player = localCreatePlayer(cleanUsername);
      return NextResponse.json({
        playerId: player.id,
        username: player.username,
      });
    }

    // ─── Supabase mode ─────────────────────────────────────
    const db = getServerSupabase();

    // Try to find existing player
    const { data: existing } = await db
      .from("players")
      .select("id, username")
      .eq("username", cleanUsername)
      .single();

    if (existing) {
      await db
        .from("streaks")
        .upsert({ player_id: existing.id }, { onConflict: "player_id" });

      return NextResponse.json({
        playerId: existing.id,
        username: existing.username,
      });
    }

    // Create new player
    const { data: newPlayer, error: insertError } = await db
      .from("players")
      .insert({ username: cleanUsername })
      .select("id, username")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: racePlayer } = await db
          .from("players")
          .select("id, username")
          .eq("username", cleanUsername)
          .single();

        if (racePlayer) {
          return NextResponse.json({
            playerId: racePlayer.id,
            username: racePlayer.username,
          });
        }
      }
      throw insertError;
    }

    await db.from("streaks").insert({ player_id: newPlayer.id });

    return NextResponse.json({
      playerId: newPlayer.id,
      username: newPlayer.username,
    });
  } catch (err) {
    console.error("Player route error:", err);
    return NextResponse.json(
      { error: "Failed to create or fetch player" },
      { status: 500 }
    );
  }
}
