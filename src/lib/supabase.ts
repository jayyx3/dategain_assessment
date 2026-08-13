import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Server-side client (used in API routes) — uses service role key for full access
export function getServerSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Client-side client (used in browser) — uses anon key
export function getClientSupabase() {
  return createClient(supabaseUrl, supabaseAnonKey);
}
