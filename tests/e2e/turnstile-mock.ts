import type { Browser, BrowserContext, BrowserContextOptions } from "@playwright/test";

export async function installTurnstileMock(context: BrowserContext, { autoSolve = true } = {}) {
  await context.route("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `(() => {
      const widgets = new Map();
      window.__turnstileWidgets = widgets;
      window.turnstile = {
        render(container, options) {
          const id = crypto.randomUUID();
          widgets.set(id, options);
          container.dataset.testWidget = id;
          const token = JSON.stringify({ nonce: crypto.randomUUID(), action: options.action, hostname: location.hostname });
          if (${autoSolve}) setTimeout(() => { if(widgets.has(id)) options.callback(token); }, 20);
          return id;
        },
        remove(id) { widgets.delete(id); }
      };
    })();`,
  }));
}
export async function testContext(browser: Browser, options: BrowserContextOptions = {}) {
  const context = await browser.newContext(options);
  await installTurnstileMock(context);
  return context;
}
