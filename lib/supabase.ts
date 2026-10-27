import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let instance: SupabaseClient | null = null;
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (
    !url ||
    !key ||
    url.includes("YOUR_PROJECT") ||
    key.includes("YOUR_SUPABASE")
  )
    return null;
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
  } catch {
    return null;
  }
  if (!instance)
    instance = createClient(url, key, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  return instance;
}
