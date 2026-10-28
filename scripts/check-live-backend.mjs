// Runs in the GitHub Pages workflow. Public-key checks only; never uses admin secrets.
import assert from "node:assert/strict";
import { pagesEnvironment } from "./pages-environment.mjs";
const env = pagesEnvironment();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const settings = await fetch(`${url}/auth/v1/settings`, {
  headers: { apikey: key },
  signal: AbortSignal.timeout(30000),
});
assert.equal(
  settings.status,
  200,
  "Supabase Auth must be reachable with the public key",
);
const auth = await settings.json();
assert.equal(
  auth.external?.email,
  true,
  "Email authentication must be enabled",
);
assert.equal(
  auth.mailer_autoconfirm,
  false,
  "Email confirmation must remain enabled",
);
const profiles = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
  headers: { apikey: key },
  signal: AbortSignal.timeout(30000),
});
if (profiles.ok)
  assert.deepEqual(
    await profiles.json(),
    [],
    "Anonymous requests must not expose profiles",
  );
else
  assert.ok(
    [401, 403].includes(profiles.status),
    "Profiles API must exist and reject anonymous access",
  );
const preferences = await fetch(
  `${url}/rest/v1/conversation_preferences?select=conversation_id&limit=1`,
  {
    headers: { apikey: key },
    signal: AbortSignal.timeout(30000),
  },
);
assert.ok(
  [401, 403].includes(preferences.status),
  "Personal preferences API must exist and reject anonymous access",
);
const search = await fetch(`${url}/rest/v1/rpc/search_messages`, {
  method: "POST",
  headers: { apikey: key, "Content-Type": "application/json" },
  body: JSON.stringify({
    cid: "00000000-0000-4000-8000-000000000000",
    query_text: "health check",
  }),
  signal: AbortSignal.timeout(30000),
});
assert.ok(
  [401, 403].includes(search.status),
  "Message search RPC must exist and reject anonymous access",
);
for (const table of [
  "saved_conversations",
  "message_reactions",
  "privacy_settings",
]) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(
    [401, 403].includes(response.status),
    `${table} must exist and reject anonymous access`,
  );
}
const saved = await fetch(`${url}/rest/v1/rpc/open_saved_messages`, {
  method: "POST",
  headers: { apikey: key, "Content-Type": "application/json" },
  body: "{}",
  signal: AbortSignal.timeout(30000),
});
assert.ok(
  [401, 403].includes(saved.status),
  "Saved messages RPC must exist and reject anonymous access",
);
console.log(
  "Live Supabase checks passed: Auth reachable, email confirmation enabled, anonymous profiles, personal preferences, message search, saved notes and reactions denied. SMTP delivery and user-to-user messaging are not tested by this check.",
);
