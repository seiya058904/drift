import { test } from "node:test";
import assert from "node:assert/strict";
import { turnstileConfig, verifyTurnstile } from "../worker/turnstile";
const env = {
  APP_ENV: "production", ALLOWED_ORIGIN: "https://drift.test",
  TURNSTILE_SITE_KEY: "fixture-site-key", TURNSTILE_SECRET: "fixture-secret",
};

test("Turnstile fails closed for missing config and remote dummy keys", () => {
  for (const overrides of [
    { TURNSTILE_SECRET: "" }, { TURNSTILE_SITE_KEY: "" },
    { TURNSTILE_SITE_KEY: "1x00000000000000000000AA" },
    { TURNSTILE_SECRET: "1x0000000000000000000000000000000AA" },
    { ALLOWED_ORIGIN: "https://localhost" }, { ALLOWED_ORIGIN: "http://drift.test" },
  ]) assert.throws(() => turnstileConfig({ ...env, ...overrides }));
  assert.equal(turnstileConfig(env).hostname, "drift.test");
});

test("Siteverify requires true success, the operation action and exact hostname", async (t) => {
  for (const result of [null, {}, { success: "true" },
    { success: true, action: "report_bottle", hostname: "drift.test" },
    { success: true, action: "submit_bottle", hostname: "other.drift.test" },
    { success: true, action: "submit_bottle", hostname: "localhost" },
  ]) {
    const mocked = t.mock.method(globalThis, "fetch", async () => Response.json(result));
    await assert.rejects(verifyTurnstile(env, "token", "submit_bottle", "session:request:body"), { code: "verification_failed" });
    mocked.mock.restore();
  }
  const mocked = t.mock.method(globalThis, "fetch", async () => Response.json({ success: true, action: "submit_bottle", hostname: "drift.test" }));
  for (const token of [undefined, "", " ", "x".repeat(2049), 123])
    await assert.rejects(verifyTurnstile(env, token, "submit_bottle", "operation"), { code: "verification_required" });
  assert.equal(mocked.mock.callCount(), 0);
  await verifyTurnstile(env, "valid-token", "submit_bottle", "session:request:body");
});

test("Siteverify retries are bounded, private and tied to token and operation", async (t) => {
  const requests: URLSearchParams[] = [];
  const mocked = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const form = new URLSearchParams(init?.body as URLSearchParams);
    requests.push(form);
    assert.equal(form.get("secret"), env.TURNSTILE_SECRET);
    assert.equal(form.has("remoteip"), false);
    assert.deepEqual([...form.keys()].sort(), ["idempotency_key", "response", "secret"]);
    if (requests.length === 1) throw Error("connection reset");
    return Response.json({ success: true, action: "submit_bottle", hostname: "drift.test" });
  });
  await verifyTurnstile(env, "token", "submit_bottle", "session:request:body");
  const key = requests[0].get("idempotency_key");
  assert.match(key!, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(requests[1].get("idempotency_key"), key);
  await verifyTurnstile(env, "token", "submit_bottle", "session:request:body");
  assert.equal(requests[2].get("idempotency_key"), key);
  await verifyTurnstile(env, "token", "submit_bottle", "session:other-request:body");
  assert.notEqual(requests[3].get("idempotency_key"), key);
  await verifyTurnstile(env, "fresh-token", "submit_bottle", "session:request:body");
  assert.notEqual(requests[4].get("idempotency_key"), key);
  mocked.mock.restore();
  for (const response of [new Response("error", { status: 503 }), new Response("invalid JSON")]) {
    const fail = t.mock.method(globalThis, "fetch", async () => response.clone());
    await assert.rejects(verifyTurnstile(env, "token", "submit_bottle", "operation"), { code: "verification_unavailable" });
    assert.equal(fail.mock.callCount(), 2);
    fail.mock.restore();
  }
});
