import { defineConfig } from "@playwright/test";
const state = `.wrangler/e2e-${Date.now()}`;
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "artifacts/e2e",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:8791", trace: "retain-on-failure" },
  webServer: {
    command: `npm run build && npx wrangler d1 migrations apply DB --local --env local --persist-to ${state} && npx wrangler dev tests/e2e/worker.ts --env local --port 8791 --persist-to ${state} --var ALLOWED_ORIGIN:http://127.0.0.1:8791 --var TURNSTILE_SITE_KEY:e2e-fixture-site-key --var TURNSTILE_SECRET:e2e-fixture-secret`,
    url: "http://127.0.0.1:8791",
    timeout: 120000,
    reuseExistingServer: false,
  },
});
