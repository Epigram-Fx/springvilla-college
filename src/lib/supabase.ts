import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

let client: SupabaseClient<Database> | undefined;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env and set the project URL and anon key."
    );
  }

  client = createClient<Database>(url, anonKey);
  return client;
}
