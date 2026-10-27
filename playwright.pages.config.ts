import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "pages.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:3100",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "node scripts/serve-pages.mjs",
    url: "http://127.0.0.1:3100/averiqchat/",
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
