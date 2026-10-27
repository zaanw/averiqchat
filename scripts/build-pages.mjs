import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      GITHUB_PAGES: "true",
      NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? "/averiqchat",
    },
  },
);
process.exit(result.status ?? 1);
