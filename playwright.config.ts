import { defineConfig } from "@playwright/test";
const state = `.wrangler/e2e-${Date.now()}`;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:8787", trace: "retain-on-failure" },
  webServer: {
    command: `npm run build && npx wrangler d1 migrations apply DB --local --env local --persist-to ${state} && npx wrangler dev --env local --port 8787 --persist-to ${state} --var ALLOWED_ORIGIN:http://127.0.0.1:8787`,
    url: "http://127.0.0.1:8787",
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
