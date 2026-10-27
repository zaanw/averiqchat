import { spawnSync } from "node:child_process";
import { pagesEnvironment } from "./pages-environment.mjs";
const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  { stdio: "inherit", env: pagesEnvironment() },
);
process.exit(result.status ?? 1);
