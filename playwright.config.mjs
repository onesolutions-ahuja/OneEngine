import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.ONEPOS_E2E_BASE_URL || "https://onesolutions-ahuja.github.io/OneEngine/";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI && process.env.ONEPOS_E2E_RETRIES !== "0" ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 900 } } },
    { name: "tablet-chromium", use: { ...devices["iPad (gen 7)"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
