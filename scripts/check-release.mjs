// Administrative readiness report. Contains metadata only, never auth/SMTP key values.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { evaluateReadiness } from "./release-readiness.mjs";
const config = JSON.parse(
  readFileSync(
    new URL("../config/supabase.public.json", import.meta.url),
    "utf8",
  ),
);
const projectRef = new URL(config.url).hostname.split(".")[0];
const head = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout.trim();
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token)
  throw new Error(
    "SUPABASE_ACCESS_TOKEN is required for the administrative readiness check",
  );
async function read(path) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}${path}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!r.ok) throw new Error(`Readiness API ${path}: HTTP ${r.status}`);
  return r.json();
}
function evidence(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
const [auth, backups] = await Promise.all([
  read("/config/auth"),
  read("/database/backups"),
]);
const runs = spawnSync(
  "gh",
  ["api", `repos/zaanw/averiqchat/actions/runs?head_sha=${head}&per_page=100`],
  { encoding: "utf8" },
);
if (runs.status !== 0)
  throw new Error(
    "GitHub workflow metadata could not be read; readiness cannot be established",
  );
const status = spawnSync("git", ["status", "--porcelain=v1"], {
  encoding: "utf8",
});
const result = evaluateReadiness({
  clean: status.status === 0 && !status.stdout.trim(),
  head,
  version,
  projectRef,
  ci: JSON.parse(runs.stdout).workflow_runs,
  auth,
  backups,
  acceptance: evidence("release-evidence/acceptance.json"),
  manual: evidence("release-evidence/manual.json"),
});
const report = {
  commit: head,
  version,
  projectRef,
  checkedAt: new Date().toISOString(),
  ...result,
};
mkdirSync("release-evidence", { recursive: true });
writeFileSync(
  "release-evidence/readiness.json",
  JSON.stringify(report, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify(report, null, 2));
process.exitCode = result.ready ? 0 : 1;
