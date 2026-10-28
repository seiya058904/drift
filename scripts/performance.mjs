/* global window, PerformanceObserver, performance */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const url = process.argv[2] || "http://127.0.0.1:8787";
const browser = await chromium.launch();
const runs = [];
try {
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage(),
      cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      window.__driftMetrics = { lcp: 0, cls: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.__driftMetrics.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput) window.__driftMetrics.cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Cast a bottle" }).waitFor();
    runs.push(
      await page.evaluate(() => ({
        ...window.__driftMetrics,
        interactive:
          performance.getEntriesByName("drift-interactive")[0]?.startTime,
        transferred: performance
          .getEntriesByType("resource")
          .reduce((sum, e) => sum + e.transferSize, 0),
      })),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
const median = (key) => runs.map((r) => r[key]).sort((a, b) => a - b)[1];
const report = {
  url,
  measuredAt: new Date().toISOString(),
  browser: "Chromium, simulated mobile (not a physical device)",
  viewport: "390x844 @1x",
  network: "1.6 Mbps down, 750 Kbps up, 150 ms latency; cold cache",
  cpuSlowdown: 4,
  runs,
  median: {
    interactive: median("interactive"),
    lcp: median("lcp"),
    cls: median("cls"),
  },
  targets: { interactive: 3000, lcp: 2500, cls: 0.1 },
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/performance.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
