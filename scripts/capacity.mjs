/* global WebSocket, performance */
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const source = `import app from './worker/index.ts';
export default {async fetch(request, env, ctx) {
 let queries=0,rows=0;
 const counted=(result)=>{queries++; rows+=result.meta?.rows_read||0;return result};
 const wrap=(stmt)=>({
  underlying:stmt,
  bind:(...v)=>wrap(stmt.bind(...v)),
  all:async()=>counted(await stmt.all()),
  run:async()=>counted(await stmt.run()),
  first:async(column)=>{const r=counted(await stmt.all());return column?r.results[0]?.[column]:r.results[0]||null}
 });
 const db={prepare:sql=>wrap(env.DB.prepare(sql)),batch:async stmts=>(await env.DB.batch(stmts.map(s=>s.underlying))).map(counted)};
 const r=await app.fetch(request,{...env,DB:db},ctx);const out=new Response(r.body,r);out.headers.set('X-Queries',queries);out.headers.set('X-Rows',rows);return out;
}}`;
const bundle = await build({
  stdin: {
    contents: source,
    resolveDir: process.cwd(),
    sourcefile: "capacity-worker.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "drift-capacity",
    modules: true,
    script: bundle.outputFiles[0].text,
    inspectorPort: 0,
    compatibilityDate: "2026-10-01",
    d1Databases: ["DB"],
    bindings: {
      APP_ENV: "production",
      ALLOWED_ORIGIN: "https://drift.test",
      SESSION_SECRET: "capacity-test-only-secret",
      IP_SECRET: "capacity-test-only-ip-secret",
    },
  }),
);
const results = [];
let ws;
try {
  const db = await mf.getD1Database("DB");
  await db.exec(
    (await readFile("migrations/0001_initial.sql", "utf8")).replace(/\n/g, " "),
  );
  const endpoint = await mf.getInspectorURL();
  endpoint.protocol = "http:";
  const targets = await (await fetch(new URL("/json", endpoint))).json();
  const target =
    targets.find((t) => t.title.includes("drift-capacity")) || targets[0];
  if (!target?.webSocketDebuggerUrl) throw Error("Worker profiler unavailable");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const r = JSON.parse(e.data);
    if (r.id) {
      const p = pending.get(r.id);
      if (r.error) p.reject(Error(r.error.message));
      else p.resolve(r.result);
      pending.delete(r.id);
    }
  });
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await cdp("Profiler.enable");
  await cdp("Profiler.setSamplingInterval", { interval: 100 });
  for (const size of [0, 100, 1000, 5000]) {
    await db.exec(
      "DELETE FROM sessions; DELETE FROM bottles; DELETE FROM rate_limits;",
    );
    for (let start = 0; start < size; start += 100)
      await db.batch(
        Array.from({ length: Math.min(100, size - start) }, (_, offset) => {
          const i = start + offset;
          return db
            .prepare(
              "INSERT INTO bottles(id,body,status,created_at,exposure_count) VALUES(?,?,'approved',1,?)",
            )
            .bind(i.toString(16).padStart(32, "0"), `Synthetic ${i}`, i % 20);
        }),
      );
    const boot = await mf.dispatchFetch("https://drift.test/api/bootstrap");
    const cookie = boot.headers.get("set-cookie").split(";")[0],
      csrf = (await boot.json()).csrf;
    const call = (path, body) =>
      mf.dispatchFetch(`https://drift.test/api/${path}`, {
        method: "POST",
        headers: {
          Origin: "https://drift.test",
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": csrf,
          "CF-Connecting-IP": "synthetic",
        },
        body: JSON.stringify(body),
      });
    await call("session", {});
    await call("draw", { requestKey: randomUUID() });
    await cdp("Profiler.start");
    const observations = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const response = await call("draw", { requestKey: randomUUID() });
      if (response.status !== 200)
        throw Error(`Capacity request failed: ${response.status}`);
      await response.json();
      observations.push({
        wallMs: performance.now() - start,
        queries: Number(response.headers.get("X-Queries")),
        rowsRead: Number(response.headers.get("X-Rows")),
      });
    }
    const { profile } = await cdp("Profiler.stop");
    const names = new Map(
      profile.nodes.map((n) => [n.id, n.callFrame.functionName]),
    );
    let active = 0;
    profile.samples.forEach((id, i) => {
      if (!["(idle)", "(program)"].includes(names.get(id)))
        active += profile.timeDeltas[i] || 0;
    });
    results.push({
      eligibleBottles: size,
      requests: 10,
      activeV8SampledMsPerDraw: active / 1000 / 10,
      averageWallMs: observations.reduce((a, v) => a + v.wallMs, 0) / 10,
      queriesPerDraw: observations[0].queries,
      rowsReadPerDraw: observations[0].rowsRead,
    });
  }
} finally {
  ws?.close();
  await mf.dispose();
}
const report = {
  date: new Date().toISOString(),
  environment:
    "Local workerd/Miniflare, synthetic isolated D1; no production data",
  method:
    "V8 CPU profiler at 100us; 1 warmup + 10 draws per size; D1 result metadata counted. Active samples exclude idle/program. This is sampled JS cost, not billed hosted Worker CPU.",
  results,
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/capacity.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
