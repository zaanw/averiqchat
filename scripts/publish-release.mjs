// Explicit publishing entry point. Readiness failure stops before any release mutation.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
if (!/^0\.1\.0-beta\.\d+$/.test(version))
  throw new Error("Expected an explicit beta version");
const check = spawnSync(process.execPath, ["scripts/check-release.mjs"], {
  stdio: "inherit",
  env: process.env,
});
if (check.status !== 0) {
  console.error("Release was not published: readiness requirements are not met.");
  process.exit(1);
}
const head = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout.trim();
const tag = `v${version}`;
const existing = spawnSync(
  "git",
  ["ls-remote", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
  { encoding: "utf8" },
);
if (existing.status !== 0)
  throw new Error("Cannot verify existing release tag");
const refs = existing.stdout
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split(/\s+/));
const tagged = refs.find(([, ref]) => ref.endsWith("^{}"))?.[0] || refs[0]?.[0];
if (tagged && tagged !== head)
  throw new Error("Release tag belongs to another commit; refusing to move it");
const result = spawnSync(
  "gh",
  [
    "release",
    "edit",
    tag,
    "--repo",
    "zaanw/averiqchat",
    "--draft=false",
    "--prerelease",
    "--latest=false",
    "--target",
    head,
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
