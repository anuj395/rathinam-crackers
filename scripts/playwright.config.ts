import { defineConfig } from "@playwright/test";

const BASE_URL = process.env["VERIFIER_BASE_URL"] ?? "http://localhost:80";

// Allow using a system-installed Chromium (e.g. nixpkgs `chromium`) so the test
// can run on hosts where Playwright's bundled browser is missing system libs.
const SYSTEM_CHROMIUM = process.env["PLAYWRIGHT_CHROMIUM_PATH"];

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true,
    launchOptions: SYSTEM_CHROMIUM ? { executablePath: SYSTEM_CHROMIUM } : {},
  },
});
