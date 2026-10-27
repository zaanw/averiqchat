// Creates and removes only temporary acceptance accounts. No secrets go to files/logs.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
const configured = JSON.parse(
  readFileSync(
    new URL("../config/supabase.public.json", import.meta.url),
    "utf8",
  ),
);
const projectRef = new URL(configured.url).hostname.split(".")[0];
if (process.env.LIVE_TEST_PROJECT_REF !== projectRef)
  throw new Error(
    "Set LIVE_TEST_PROJECT_REF to the exact project ref to explicitly authorize temporary test accounts in that project",
  );
if (!process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error("SUPABASE_ACCESS_TOKEN is required");
const r = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`,
  {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(30000),
  },
);
if (!r.ok) throw new Error(`Cannot obtain test credentials: HTTP ${r.status}`);
const keys = await r.json();
const service = keys.find((key) => key.id === "service_role")?.api_key;
if (!service)
  throw new Error(
    "No service-role credential available; tests were not started",
  );
const commit = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout.trim();
mkdirSync("release-evidence", { recursive: true });
const resultPath = "release-evidence/vitest-live.json";
rmSync(resultPath, { force: true });
const startedAt = new Date().toISOString();
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/supabase.integration.test.ts",
    "--reporter=json",
    `--outputFile=${resultPath}`,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      TEST_SUPABASE_URL: configured.url,
      TEST_SUPABASE_ANON_KEY: configured.publishableKey,
      TEST_SUPABASE_SERVICE_ROLE_KEY: service,
      TEST_SUPABASE_ALLOW_PROJECT: projectRef,
    },
  },
);
let raw = null;
try {
  raw = JSON.parse(readFileSync(resultPath, "utf8"));
} catch {
  /* A missing report cannot be treated as success. */
}
const evidence = {
  commit,
  projectRef,
  startedAt,
  finishedAt: new Date().toISOString(),
  completed: result.status === 0 && raw?.success === true,
  passed: raw?.numPassedTests ?? 0,
  failed: raw?.numFailedTests ?? 0,
  skipped: raw?.numPendingTests ?? 0,
  total: raw?.numTotalTests ?? 0,
};
writeFileSync(
  "release-evidence/acceptance.json",
  JSON.stringify(evidence, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify(evidence));
process.exitCode =
  evidence.completed && evidence.skipped === 0 && evidence.passed >= 6 ? 0 : 1;
