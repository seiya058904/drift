import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { cleanup, type Env } from "../worker/index";
let mf: Miniflare, db: D1Database;
const origin = "https://drift.test";
type Client = { cookie: string; csrf: string; ip: string };
before(async () => {
  const bundle = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-10-01",
      d1Databases: ["DB"],
      bindings: {
        APP_ENV: "production",
        ALLOWED_ORIGIN: origin,
        SESSION_SECRET: "test-session-key-at-least-32-characters",
        IP_SECRET: "test-ip-key-at-least-32-characters",
      },
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const sql = await readFile("migrations/0001_initial.sql", "utf8");
  await db.exec(sql.replace(/\n/g, " "));
});
after(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.exec(
    "DELETE FROM sessions; DELETE FROM bottles; DELETE FROM rate_limits;",
  );
});
async function client(ip: string = crypto.randomUUID()): Promise<Client> {
  const r = await mf.dispatchFetch(`${origin}/api/bootstrap`);
  const cookie = r.headers.get("set-cookie")!;
  assert.match(
    cookie,
    /^__Host-drift=.*HttpOnly; Secure; SameSite=Strict; Path=\//,
  );
  assert.ok(!cookie.includes("Domain="));
  const c = {
    cookie: cookie.split(";")[0],
    csrf: ((await r.json()) as { csrf: string }).csrf,
    ip,
  };
  assert.equal((await post(c, "session", {})).status, 200);
  return c;
}
function post(
  c: Client,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return mf.dispatchFetch(`${origin}/api/${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: c.cookie,
      "X-CSRF-Token": c.csrf,
      "CF-Connecting-IP": c.ip,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
async function content<T>(
  response: Awaited<ReturnType<typeof post>>,
): Promise<T> {
  assert.ok(
    response.status < 300,
    `${response.status}: ${await response.clone().text()}`,
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json() as Promise<T>;
}
async function send(
  c: Client,
  body = "A little kindness travels further than you think.",
  key = crypto.randomUUID(),
) {
  return content<{ id: string; status: string }>(
    await post(c, "bottles", { body, requestKey: key }),
  );
}
async function draw(c: Client) {
  return content<{ token?: string; empty?: boolean }>(
    await post(c, "draw", { requestKey: crypto.randomUUID() }),
  );
}
test("complete flow, no body in draw, author exclusion, plain text, read dedup, no exposure leak", async () => {
  const author = await client(),
    reader = await client();
  const text = "<script>alert(1)</script>\n愿你拥有平静的一天。";
  const bottle = await send(author, text);
  assert.equal(bottle.status, "approved");
  assert.deepEqual(await draw(author), { empty: true });
  const ticket = await draw(reader);
  assert.ok(ticket.token);
  assert.equal("body" in ticket, false);
  const opened = await content(
    await post(reader, "open", { token: ticket.token }),
  );
  assert.deepEqual(opened, { id: bottle.id, body: text });
  assert.deepEqual(await draw(reader), { empty: true });
  const exposure = await db
    .prepare("SELECT exposure_count FROM bottles WHERE id=?")
    .bind(bottle.id)
    .first<{ exposure_count: number }>();
  assert.equal(exposure?.exposure_count, 1);
});
test("concurrent idempotent submit creates one bottle; mismatched payload conflicts", async () => {
  const author = await client(),
    key = crypto.randomUUID();
  const request = { body: "One letter, one sea.", requestKey: key };
  const responses = await Promise.all([
    post(author, "bottles", request),
    post(author, "bottles", request),
    post(author, "bottles", request),
  ]);
  for (const r of responses) assert.ok(r.status < 300);
  assert.equal(
    (
      await db
        .prepare("SELECT count(*) as n FROM bottles")
        .first<{ n: number }>()
    )?.n,
    1,
  );
  assert.equal(
    (await post(author, "bottles", { ...request, body: "Changed body" }))
      .status,
    409,
  );
});
test("simultaneous duplicate texts under different keys only approve one", async () => {
  const author = await client();
  const results = await Promise.all([
    send(author, "One wave, one thought."),
    send(author, "One wave, one thought."),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ["approved", "hidden"]);
});
test("concurrent open and repeated open consume one exposure, credentials are bound to session", async () => {
  const author = await client(),
    reader = await client(),
    stranger = await client();
  await send(author);
  const ticket = await draw(reader);
  assert.equal(
    (await post(stranger, "open", { token: ticket.token })).status,
    410,
  );
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      post(reader, "open", { token: ticket.token }),
    ),
  );
  responses.forEach((r) => assert.equal(r.status, 200));
  assert.equal(
    (
      await db
        .prepare("SELECT exposure_count FROM bottles")
        .first<{ exposure_count: number }>()
    )?.exposure_count,
    1,
  );
});
test("expires, moderation state recheck and 24h eligibility", async () => {
  const author = await client(),
    reader = await client();
  const b = await send(author);
  const d = await draw(reader);
  await db.prepare("UPDATE draws SET expires_at=0").run();
  assert.equal((await post(reader, "open", { token: d.token })).status, 410);
  const d2 = await draw(reader);
  await db
    .prepare("UPDATE bottles SET status='flagged' WHERE id=?")
    .bind(b.id)
    .run();
  assert.equal((await post(reader, "open", { token: d2.token })).status, 410);
  assert.deepEqual(await draw(reader), { empty: true });
  await db.exec(
    "UPDATE bottles SET status='approved'; UPDATE submissions SET created_at=0;",
  );
  assert.ok((await draw(author)).token);
});
test("only approved contents enter pool; duplicate content held; blank and >500 rejected", async () => {
  const author = await client(),
    reader = await client();
  assert.equal((await send(author, "https://spam.com")).status, "hidden");
  assert.deepEqual(await draw(reader), { empty: true });
  await send(author, "This is my thought.");
  assert.equal((await send(author, "This is my thought.")).status, "hidden");
  for (const body of ["   ", "🌊".repeat(501)])
    assert.equal(
      (await post(author, "bottles", { body, requestKey: crypto.randomUUID() }))
        .status,
      422,
    );
});
test("reports require opened bottle, deduplicate, three sessions pause the bottle", async () => {
  const author = await client(),
    a = await client(),
    b = await client(),
    c = await client();
  const bottle = await send(author);
  assert.equal((await post(a, "report", { id: bottle.id })).status, 403);
  for (const reader of [a, b, c]) {
    const d = await draw(reader);
    await content(await post(reader, "open", { token: d.token }));
    await content(await post(reader, "report", { id: bottle.id }));
    await content(await post(reader, "report", { id: bottle.id }));
  }
  assert.deepEqual(
    await db.prepare("SELECT status,report_count FROM bottles").first(),
    { status: "flagged", report_count: 3 },
  );
  assert.deepEqual(await draw(await client()), { empty: true });
});
test("limits apply to both session and shared IP, and combine draw/open", async () => {
  const a = await client("same-address"),
    b = await client("same-address");
  for (let i = 0; i < 5; i++) await send(a, `A different thought ${i}.`);
  assert.equal(
    (
      await post(b, "bottles", {
        body: "A sixth thought.",
        requestKey: crypto.randomUUID(),
      })
    ).status,
    429,
  );
  for (let i = 0; i < 20; i++) await draw(a);
  assert.equal((await post(b, "open", { token: "f".repeat(64) })).status, 429);
});
test("strict Origin, content type, CSRF, missing cookie and JSON API fallback", async () => {
  const a = await client(),
    body = { body: "Hello sea.", requestKey: crypto.randomUUID() };
  const invalidHeaders: Record<string, string>[] = [
    { Origin: "https://evil.workers.dev" },
    { Origin: "" },
    { "X-CSRF-Token": "" },
    { "X-CSRF-Token": "forged" },
    { "Sec-Fetch-Site": "cross-site" },
  ];
  for (const headers of invalidHeaders)
    assert.equal((await post(a, "bottles", body, headers)).status, 403);
  assert.equal(
    (await post(a, "bottles", body, { "Content-Type": "text/plain" })).status,
    415,
  );
  assert.equal((await post(a, "bottles", body, { Cookie: "" })).status, 401);
  const missing = await post(a, "nonexistent", {});
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type")!, /json/);
  assert.equal((await mf.dispatchFetch(`${origin}/api/bottles`)).status, 405);
  assert.equal(
    (
      await post(a, "bottles", {
        body: "x".repeat(9000),
        requestKey: crypto.randomUUID(),
      })
    ).status,
    413,
  );
});
test("scheduled cleanup removes expired private links while preserving messages", async () => {
  const author = await client(),
    reader = await client();
  await send(author);
  const ticket = await draw(reader);
  const opened = await content<{ id: string }>(
    await post(reader, "open", { token: ticket.token }),
  );
  await post(reader, "report", { id: opened.id });
  await db.exec(
    "UPDATE sessions SET expires_at=0; UPDATE draws SET expires_at=0; UPDATE rate_limits SET expires_at=0;",
  );
  await cleanup({ DB: db } as Env);
  for (const table of [
    "sessions",
    "submissions",
    "draws",
    "opens",
    "reports",
    "rate_limits",
  ])
    assert.equal(
      (
        await db
          .prepare(`SELECT count(*) n FROM ${table}`)
          .first<{ n: number }>()
      )?.n,
      0,
    );
  assert.deepEqual(
    await db.prepare("SELECT exposure_count,report_count FROM bottles").first(),
    { exposure_count: 1, report_count: 1 },
  );
});
test("weighted draw traverses a pool larger than one page", async () => {
  const reader = await client();
  await db.batch(
    Array.from({ length: 501 }, (_, i) =>
      db
        .prepare(
          "INSERT INTO bottles(id,body,status,created_at,exposure_count) VALUES(?,?,'approved',1,?)",
        )
        .bind(
          i.toString(16).padStart(32, "0"),
          `Synthetic note ${i}`,
          i === 500 ? 0 : 1000000000,
        ),
    ),
  );
  const ticket = await draw(reader);
  const opened = await content<{ body: string }>(
    await post(reader, "open", { token: ticket.token }),
  );
  assert.equal(opened.body, "Synthetic note 500");
});
