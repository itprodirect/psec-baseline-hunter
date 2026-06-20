import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next build && npx next start --hostname 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/packet-highway`,
    env: {
      ...process.env,
      AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
      S3_BUCKET: process.env.S3_BUCKET ?? "placeholder",
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
