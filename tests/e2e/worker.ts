// Explicit test entry point selected only by playwright.config.ts.
// Production and preview always bundle worker/index.ts and real Siteverify.
import app from "../../worker/index";
import { createSiteverifyFixture } from "../turnstile-fixture";
const siteverify = createSiteverifyFixture();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (request.url !== "https://challenges.cloudflare.com/turnstile/v0/siteverify")
    return originalFetch(input, init);
  const form = new URLSearchParams(await request.text());
  if (form.get("secret") !== "e2e-fixture-secret") return Response.json({ success: false });
  return Response.json(siteverify(form));
};
export default app;
