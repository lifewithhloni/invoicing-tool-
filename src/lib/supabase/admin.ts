import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicSupabaseEnv, secretKey } from "@/lib/env";

/**
 * Privileged client using the secret key. It bypasses Row Level Security, so
 * use it only for Supabase Auth admin operations (creating users), and only
 * after checking the caller is an administrator.
 */
export function createAdminClient() {
  const { url } = publicSupabaseEnv();
  return createClient<Database>(url, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
