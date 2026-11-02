import { expect, test } from "@playwright/test";

test("analytics loads only on production and its CSP allows the beacon", async ({ page, context }) => {
  let scripts = 0;
  let beacons = 0;
  await context.route("https://static.cloudflareinsights.com/beacon.min.js", (route) => {
    scripts++;
    return route.fulfill({
      contentType: "text/javascript",
      headers: { "access-control-allow-origin": "*" },
      body: `fetch("https://cloudflareinsights.com/cdn-cgi/rum", { method: "POST", body: "test" });`,
    });
  });
  await context.route("https://cloudflareinsights.com/**", (route) => {
    beacons++;
    return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Some words are meant to drift." })).toBeVisible();
  expect(scripts).toBe(0);

  await context.route("https://drift.seiya-api.workers.dev/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:8791${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.goto("https://drift.seiya-api.workers.dev/");
  await expect(page.getByRole("heading", { name: "Some words are meant to drift." })).toBeVisible();
  await expect.poll(() => beacons).toBe(1);
  expect(scripts).toBe(1);
});
