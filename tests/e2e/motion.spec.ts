import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { installTurnstileMock, testContext } from "./turnstile-mock";

const note = "Some days, the smallest things are enough.\n\nA warm cup. An open window. The sea.\n\n愿你一路有光。";
async function fixtures(page: Page) {
  await page.route("**/api/draw", r => r.fulfill({ json: { token: "local-motion-fixture" } }));
  await page.route("**/api/open", r => r.fulfill({ json: { id: "local-motion-fixture", body: note } }));
  await page.route("**/api/bottles", r => r.fulfill({ json: { status: "approved" } }));
}
async function openBottle(page: Page) {
  await page.getByRole("button", { name: "Find a bottle" }).click();
  await page.getByRole("button", { name: "Open the bottle" }).click();
  await expect(page.locator(".ritual")).toBeVisible();
}

for (const width of [390, 1440]) {
  test(`complete cinematic send and open, screenshots and recording at ${width}`, async ({ browser }, info) => {
    const context = await testContext(browser, {
      viewport: { width, height: width === 390 ? 844 : 900 },
      reducedMotion: "no-preference",
      recordVideo: { dir: info.outputPath("video"), size: { width, height: width === 390 ? 844 : 900 } },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await fixtures(page);
    await page.addInitScript(() => {
      const stats = { frames: [] as number[], longTasks: [] as number[], active: false };
      Object.assign(window, { motionStats: stats });
      let previous = 0;
      const frame = (time: number) => {
        const active = !!document.querySelector(".ritual");
        if (active && stats.active && previous) stats.frames.push(time - previous);
        stats.active = active;
        previous = time;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      new PerformanceObserver(list => {
        if (stats.active) for (const entry of list.getEntries()) stats.longTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: false });
    });
    await page.goto("/");
    await expect(page).toHaveTitle(/Drift/);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    await page.waitForTimeout(800); // capture the settled entrance, not an arbitrary animation frame
    await page.screenshot({ path: info.outputPath(`home-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Cast a bottle" }).click();
    await page.getByLabel("Your message").fill(note);
    await page.getByRole("button", { name: "Seal & send" }).waitFor();
    await page.waitForTimeout(450);
    await page.screenshot({ path: info.outputPath(`write-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Seal & send" }).click();
    await expect(page.locator(".ritual-send")).toBeVisible();
    await page.waitForTimeout(550);
    await page.screenshot({ path: info.outputPath(`send-fold-${width}.png`) });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: info.outputPath(`send-seal-${width}.png`) });
    await expect(page.locator(".app")).toHaveAttribute("data-scene", "sent");
    await expect(page.locator("#dialog-heading")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Cast a bottle" })).toBeFocused();
    await page.getByRole("button", { name: "Find a bottle" }).click();
    await expect(page.locator(".app")).toHaveAttribute("data-scene", "found");
    await page.waitForTimeout(450);
    await page.screenshot({ path: info.outputPath(`found-${width}.png`) });
    await page.getByRole("button", { name: "Open the bottle" }).click();
    await expect(page.locator(".ritual-open")).toBeVisible();
    await page.waitForTimeout(650);
    await page.screenshot({ path: info.outputPath(`open-cork-${width}.png`) });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: info.outputPath(`open-paper-${width}.png`) });
    await expect(page.locator(".app")).toHaveAttribute("data-scene", "read");
    await expect(page.locator("blockquote")).toHaveText(note);
    await expect(page.locator("#dialog-heading")).toBeFocused();
    await page.screenshot({ path: info.outputPath(`read-${width}.png`) });
    const stats = await page.evaluate(() => (window as unknown as { motionStats: object }).motionStats);
    await writeFile(info.outputPath("motion-timing.json"), JSON.stringify({
      measuredAt: new Date().toISOString(), width, browser: "Chromium, unthrottled with video and screenshot capture",
      ...stats,
    }, null, 2));
    await info.attach("motion-timing", { body: JSON.stringify(stats, null, 2), contentType: "application/json" });
    expect(errors).toEqual([]);
    await context.close();
  });
}

test.beforeEach(async ({ context }) => installTurnstileMock(context));

test("repeated submit and skip clicks produce one result and preserve the next draft", async ({ page }) => {
  await fixtures(page);
  let submissions = 0;
  await page.route("**/api/bottles", async r => {
    submissions++;
    await r.fulfill({ json: { status: "approved" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Cast a bottle" }).click();
  const draft = page.getByLabel("Your message");
  await draft.fill("One little thought, sent once.");
  const submit = page.getByRole("button", { name: "Seal & send" });
  await expect(submit).toBeEnabled();
  await submit.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  const skip = page.getByRole("button", { name: /Skip the moment/ });
  await skip.waitFor();
  await skip.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.locator(".app")).toHaveAttribute("data-scene", "sent");
  expect(submissions).toBe(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cast a bottle" }).click();
  await draft.fill("The next thought is still mine.");
  await page.waitForTimeout(3800);
  await expect(draft).toHaveValue("The next thought is still mine.");
});

test("skip, Escape, reduced motion, resize and hidden tabs cannot resurrect an old ritual", async ({ page }) => {
  await fixtures(page);
  await page.goto("/");
  await openBottle(page);
  await page.getByRole("button", { name: /Skip the moment/ }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-scene", "read");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cast a bottle" }).click();
  await page.getByLabel("Your message").fill("This draft must stay here.");
  await page.waitForTimeout(3800);
  await expect(page.getByLabel("Your message")).toHaveValue("This draft must stay here.");
  await page.keyboard.press("Escape");
  await openBottle(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".app")).toHaveAttribute("data-scene", "home");
  await openBottle(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".app")).toHaveAttribute("data-scene", "read");
  await expect(page.locator(".ritual")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openBottle(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator(".app")).toHaveAttribute("data-scene", "read");
  await page.keyboard.press("Escape");
  await openBottle(page);
  // Explicit visibility event simulation tests the lifecycle handler; not a real OS tab benchmark.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const transform = await page.locator(".ritual-object").getAttribute("style");
  await page.waitForTimeout(600);
  expect(await page.locator(".ritual-object").getAttribute("style")).toBe(transform);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".app")).toHaveAttribute("data-scene", "read");
});

test("held drafts, empty sea, expired opens and report retry retain their behavior", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/bottles", r => r.fulfill({ json: { status: "pending" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Cast a bottle" }).click();
  await page.getByLabel("Your message").fill("A draft awaiting review.");
  await page.getByRole("button", { name: "Seal & send" }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-scene", "held");
  await expect(page.locator(".ritual")).toHaveCount(0);
  await page.getByRole("button", { name: "Return to your words" }).click();
  await expect(page.getByLabel("Your message")).toHaveValue("A draft awaiting review.");
  await page.keyboard.press("Escape");
  await page.route("**/api/open", r => r.fulfill({ status: 410, json: { error: "expired", message: "This bottle drifted away. Try again." } }));
  await page.getByRole("button", { name: "Find a bottle" }).click();
  await page.getByRole("button", { name: "Open the bottle" }).click();
  await expect(page.getByRole("alert")).toContainText("drifted away");
  await expect(page.locator(".ritual")).toHaveCount(0);
  await page.route("**/api/draw", r => r.fulfill({ json: { empty: true } }));
  await page.getByRole("button", { name: "Find another bottle" }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-scene", "empty");
  await page.keyboard.press("Escape");
  await fixtures(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Find a bottle" }).click();
  await page.getByRole("button", { name: "Open the bottle" }).click();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await page.route("**/api/report", r => r.fulfill({ status: 403, json: { error: "verification_failed", message: "Please verify again." } }));
  await page.getByRole("button", { name: "Report this bottle" }).click();
  await expect(page.getByRole("alert")).toContainText("verify again");
  await expect(page.locator("blockquote")).toHaveText(note);
  await page.route("**/api/report", r => r.fulfill({ json: { ok: true } }));
  await page.getByRole("button", { name: "Report this bottle" }).click();
  await expect(page.getByText("Thank you. Your report has been received.")).toBeVisible();
});

test("short landscape and long text remain scrollable; atmosphere off leaves no animation", async ({ page }, info) => {
  await fixtures(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: "Turn atmosphere off" }).click();
  await page.getByRole("button", { name: "Cast a bottle" }).click();
  await page.getByLabel("Your message").fill("海🌊".repeat(250));
  await expect(page.getByText("500 / 500")).toBeVisible();
  await page.getByRole("button", { name: "Seal & send" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Seal & send" })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("landscape-writing.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === "running").length)).toBe(0);
  await page.keyboard.press("Escape");
  await page.route("**/api/open", r => r.fulfill({ json: { id: "long-local", body: "海🌊".repeat(250) } }));
  await page.getByRole("button", { name: "Find a bottle" }).click();
  await page.getByRole("button", { name: "Open the bottle" }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-scene", "read");
  await expect(page.locator("#dialog-heading")).toBeFocused();
  expect(await page.locator("blockquote").evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
  await page.locator("blockquote").focus();
  await page.keyboard.press("End");
  await expect.poll(() => page.locator("blockquote").evaluate(e => e.scrollTop)).toBeGreaterThan(0);
});
