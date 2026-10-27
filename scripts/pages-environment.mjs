// Only public, browser-visible settings belong here. Never load service keys.
import { readFileSync } from "node:fs";
const configured = JSON.parse(
  readFileSync(
    new URL("../config/supabase.public.json", import.meta.url),
    "utf8",
  ),
);
function isPublicKey(key) {
  if (key.startsWith("sb_publishable_")) return true;
  try {
    return (
      JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
        .role === "anon"
    );
  } catch {
    return false;
  }
}
export function pagesEnvironment(env = process.env) {
  if (env.SUPABASE_UNCONFIGURED_TEST === "1")
    return {
      ...env,
      GITHUB_PAGES: "true",
      NEXT_PUBLIC_BASE_PATH: env.NEXT_PUBLIC_BASE_PATH ?? "/averiqchat",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    };
  const url = env.NEXT_PUBLIC_SUPABASE_URL || configured.url;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || configured.publishableKey;
  if (!url || !key || !isPublicKey(key))
    throw new Error(
      "Pages requires a project URL and a public publishable/anon key; secret/service-role keys are forbidden",
    );
  return {
    ...env,
    GITHUB_PAGES: "true",
    NEXT_PUBLIC_BASE_PATH: env.NEXT_PUBLIC_BASE_PATH ?? "/averiqchat",
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
  };
}
