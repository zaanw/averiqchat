import { defineConfig, devices } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PAGES_PORT || "3100";
export default defineConfig({
  testDir: "tests",
  testMatch: "pages.spec.ts",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "node scripts/serve-pages.mjs",
    env: { PORT: port },
    url: `http://127.0.0.1:${port}/averiqchat/`,
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
