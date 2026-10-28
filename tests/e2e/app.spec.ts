import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("an older tab can retry after another tab renews the shared session", async ({ page, context }) => {
  await page.goto("/");
  const initial = page.waitForResponse((r) => r.url().endsWith("/api/draw"));
  await page.getByRole("button", { name: "Find a bottle" }).click();
  expect((await initial).status()).toBe(200);
  await page.keyboard.press("Escape");
  // Expiration removes the shared cookie, while the first tab retains its CSRF token.
  await context.clearCookies();
  const newer = await context.newPage();
  await newer.goto("/");
  const renewed = newer.waitForResponse((r) => r.url().endsWith("/api/draw"));
  await newer.getByRole("button", { name: "Find a bottle" }).click();
  expect((await renewed).status()).toBe(200);
  await page.getByRole("button", { name: "Find a bottle" }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh your visit");
  const retried = page.waitForResponse((r) => r.url().endsWith("/api/draw"));
  await page.getByRole("button", { name: "Find a bottle" }).click();
  expect((await retried).status()).toBe(200);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await newer.close();
});

test("finding again recovers from an expired abandoned credential", async ({ page }) => {
  const keys: string[] = [];
  await page.route("**/api/draw", (route) => {
    keys.push(route.request().postDataJSON().requestKey);
    return route.fulfill({
      status: keys.length === 2 ? 410 : 200,
      contentType: "application/json",
      body: JSON.stringify(keys.length === 1 ? { token: "unopened" } : keys.length === 2
        ? { error: "expired", message: "This bottle drifted away. Try again." }
        : { empty: true }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Find a bottle" }).click();
  await expect(page.getByRole("heading", { name: "A bottle found you." })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Find a bottle" }).click();
  await expect(page.getByRole("alert")).toContainText("This bottle drifted away");
  await page.getByRole("button", { name: "Find a bottle" }).click();
  await expect(page.getByText("The sea is quiet")).toBeVisible();
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[1]);
});

test("desktop and mobile composition, keyboard, zoom, long Unicode draft, accessibility", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto("/");
    await expect(page).toHaveTitle(/Drift/);
    await expect(
      page.getByRole("heading", { name: "Some words are meant to drift." }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`home-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Cast a bottle" }).click();
    await expect(page.getByLabel("Your message")).toBeVisible();
    await page.getByLabel("Your message").fill("海🌊".repeat(250));
    await expect(page.getByText("500 / 500")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Seal & send" }),
    ).toBeEnabled();
    await page.getByLabel("Your message").fill("海🌊".repeat(251));
    await expect(
      page.getByRole("button", { name: "Seal & send" }),
    ).toBeDisabled();
    if (width === 390 || width === 1440) {
      await page
        .getByLabel("Your message")
        .fill(
          "Some days, the smallest things are enough.\n\nA warm cup. An open window. The sea.",
        );
      await page.screenshot({ path: testInfo.outputPath(`write-${width}.png`) });
      const a11y = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(a11y.violations).toEqual([]);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cast a bottle" }),
    ).toBeFocused();
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    document.body.style.zoom = "2";
  });
  await page.getByRole("button", { name: "About & privacy" }).click();
  await expect(
    page.getByRole("heading", { name: "A visit, not a profile." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("two anonymous visitors submit, find, open plain text and report; actual API and reduced motion", async ({
  browser,
}, testInfo) => {
  const author = await browser.newContext({ reducedMotion: "reduce" }),
    reader = await browser.newContext({ reducedMotion: "reduce" });
  const a = await author.newPage(),
    b = await reader.newPage();
  await a.goto("/");
  await a.getByRole("button", { name: "Cast a bottle" }).click();
  const message =
    "Take the long way home today.\n\n愿你一路有光。\n<img src=x onerror=alert(1)>";
  await a.getByLabel("Your message").fill(message);
  await a.getByRole("button", { name: "Seal & send" }).click();
  await expect(
    a.getByRole("heading", { name: "Your words are on their way." }),
  ).toBeVisible();
  await a
    .getByRole("button", { name: "Back to the sea", exact: true })
    .last()
    .click();
  await a.getByRole("button", { name: "Find a bottle" }).click();
  await expect(a.getByText("The sea is quiet")).toBeVisible();
  await b.goto("/");
  await b.getByRole("button", { name: "Find a bottle" }).click();
  await expect(
    b.getByRole("heading", { name: "A bottle found you." }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Open the bottle" }).click();
  await expect(b.locator("blockquote")).toHaveText(message);
  await expect(b.locator("blockquote img")).toHaveCount(0);
  await b.screenshot({ path: testInfo.outputPath("read-1440.png"), fullPage: true });
  await b.getByRole("button", { name: "Report", exact: true }).click();
  await b.getByRole("button", { name: "Report this bottle" }).click();
  await expect(
    b.getByText("Thank you. Your report has been received."),
  ).toBeVisible();
  await b.keyboard.press("Escape");
  await expect(b.getByRole("button", { name: "Find a bottle" })).toBeFocused();
  await author.close();
  await reader.close();
});

test("an unavailable optional animation still lets the visitor read the opened bottle", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route(/\/assets\/Ritual-[^/]+\.js$/, (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Find a bottle" }).click();
  await page.getByRole("button", { name: "Open the bottle" }).click();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("blockquote")).toBeVisible();
});
test("failed submission keeps draft, never plays success; toggles respond", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Turn atmosphere off" }).click();
  await expect(page.locator(".app")).toHaveClass(/quiet/);
  await page.getByRole("button", { name: "Enable ocean sound" }).click();
  await expect(
    page.getByRole("button", { name: "Mute ocean sound" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Mute ocean sound" }).click();
  await page.getByRole("button", { name: "Cast a bottle" }).click();
  await page.getByLabel("Your message").fill("Keep this thought safe.");
  await page.route("**/api/bottles", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "unavailable",
        message: "The tide is unsettled. Please try again.",
      }),
    }),
  );
  await page.getByRole("button", { name: "Seal & send" }).click();
  await expect(page.getByRole("alert")).toContainText("The tide is unsettled");
  await expect(page.getByLabel("Your message")).toHaveValue(
    "Keep this thought safe.",
  );
  await expect(page.locator(".ritual")).toHaveCount(0);
});

test("ritual waits for API success, can be skipped, and opens with motion", async ({
  browser,
}) => {
  const author = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await author.newPage();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/bottles", async (route) => {
    await hold;
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Cast a bottle" }).click();
  await page
    .getByLabel("Your message")
    .fill("May the next wave bring something kind.");
  await page.getByRole("button", { name: "Seal & send" }).click();
  await expect(
    page.getByRole("button", { name: "Entrusting your words…" }),
  ).toBeVisible();
  await expect(page.locator(".ritual")).toHaveCount(0);
  release();
  await expect(
    page.getByRole("button", { name: /Skip the moment/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Skip the moment/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your words are on their way." }),
  ).toBeVisible();
  const reader = await browser.newContext({ reducedMotion: "no-preference" });
  const reading = await reader.newPage();
  await reading.goto("/");
  await reading.getByRole("button", { name: "Find a bottle" }).click();
  await reading.getByRole("button", { name: "Open the bottle" }).click();
  await expect(reading.locator(".ritual")).toBeVisible();
  await reading.emulateMedia({ reducedMotion: "reduce" });
  await expect(reading.locator("blockquote")).toBeVisible();
  await expect(reading.locator(".ritual")).toHaveCount(0);
  await author.close();
  await reader.close();
});
