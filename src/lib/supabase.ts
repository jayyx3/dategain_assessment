import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Whether Supabase is configured (env vars present) */
export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseServiceKey.length > 0;

// Server-side client (used in API routes) — uses service role key for full access
export function getServerSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Client-side client (used in browser) — uses anon key
export function getClientSupabase(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey);
}
