import { LIMITS, TTL, moderate, normalize, weight } from "./rules";
import { TurnstileError, turnstileConfig, verifyTurnstile } from "./turnstile";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: "local" | "preview" | "production";
  ALLOWED_ORIGIN: string;
  SESSION_SECRET: string;
  IP_SECRET: string;
  WRITES_PAUSED?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
}
type Session = { id: string; csrf: string; expires: number };
class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
const now = () => Math.floor(Date.now() / 1000);
const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
async function hash(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
function equal(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extra,
    },
  });
}
function cookieName(env: Env) {
  return env.APP_ENV === "local" ? "drift_local" : "__Host-drift";
}
async function parseSession(
  request: Request,
  env: Env,
): Promise<Session | null> {
  const raw = request.headers
    .get("Cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName(env) + "="))
    ?.split("=")[1];
  if (!raw || !/^[a-f0-9]{48}\.\d{10}\.[a-f0-9]{64}$/.test(raw)) return null;
  const [id, expires, signature] = raw.split(".");
  if (
    Number(expires) <= now() ||
    Number(expires) > now() + TTL.session ||
    !equal(signature, await sign(env.SESSION_SECRET, `${id}.${expires}`))
  )
    return null;
  return {
    id: await hash(id),
    csrf: await sign(env.SESSION_SECRET, `csrf:${id}.${expires}`),
    expires: Number(expires),
  };
}
function guard(request: Request, env: Env) {
  if (request.headers.get("Origin") !== env.ALLOWED_ORIGIN)
    throw new HttpError(403, "origin", "This request must come from Drift.");
  if (request.headers.get("Sec-Fetch-Site") === "cross-site")
    throw new HttpError(403, "origin", "This request must come from Drift.");
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "content_type", "Send JSON content.");
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "body", "A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new HttpError(413, "body", "This message is too large.");
    }
    chunks.push(part.value);
  }
  try {
    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    const body: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(all),
    );
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "body", "This request could not be read.");
  }
}
function requestKey(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/.test(value))
    throw new HttpError(400, "request_key", "A valid request key is required.");
  return value;
}
async function ipHash(request: Request, env: Env) {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    (env.APP_ENV === "local" ? "local" : null);
  if (!ip)
    throw new HttpError(
      503,
      "network",
      "The tide is unsettled. Please try again.",
    );
  const dailyKey = await sign(
    env.IP_SECRET,
    `day:${Math.floor(now() / 86400)}`,
  );
  return sign(dailyKey, ip);
}
async function limit(
  request: Request,
  env: Env,
  session: Session,
  kind: keyof typeof LIMITS,
) {
  const rule = LIMITS[kind],
    bucket = Math.floor(now() / rule.seconds),
    expires = (bucket + 1) * rule.seconds;
  const keys = [`s:${session.id}`, `i:${await ipHash(request, env)}`];
  const result = await env.DB.batch(
    keys.map((key) =>
      env.DB.prepare(
        "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count",
      ).bind(`${kind}:${bucket}:${key}`, expires, rule.count),
    ),
  );
  if (result.some((r) => !r.results.length))
    throw new HttpError(
      429,
      "rate_limit",
      "Let the sea rest a little. Please try again later.",
    );
}
async function bootstrap(request: Request, env: Env) {
  if (request.headers.get("Sec-Fetch-Site") === "cross-site")
    throw new HttpError(403, "origin", "This request must come from Drift.");
  const existing = await parseSession(request, env);
  if (existing) return json({ csrf: existing.csrf });
  const id = randomToken(),
    expires = now() + TTL.session,
    payload = `${id}.${expires}`;
  const value = `${payload}.${await sign(env.SESSION_SECRET, payload)}`;
  return json(
    { csrf: await sign(env.SESSION_SECRET, `csrf:${payload}`) },
    200,
    {
      "Set-Cookie": `${cookieName(env)}=${value}; HttpOnly; ${env.APP_ENV !== "local" ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=${TTL.session}`,
    },
  );
}
async function submit(
  request: Request,
  env: Env,
  session: Session,
  body: Record<string, unknown>,
) {
  const key = requestKey(body.requestKey);
  if (typeof body.body !== "string")
    throw new HttpError(400, "message", "Write a message first.");
  const content = normalize(body.body),
    fingerprint = await hash(content);
  if (!content || Array.from(content).length > 500)
    throw new HttpError(
      422,
      "length",
      "Your bottle needs between 1 and 500 characters.",
    );
  const previous = await env.DB.prepare(
    "SELECT s.body_hash,b.id,b.status FROM submissions s JOIN bottles b ON b.id=s.bottle_id WHERE session_id=? AND request_key=?",
  )
    .bind(session.id, key)
    .first<{ body_hash: string; id: string; status: string }>();
  if (previous) {
    if (previous.body_hash !== fingerprint)
      throw new HttpError(
        409,
        "conflict",
        "This request key already belongs to another message.",
      );
    return json({ id: previous.id, status: previous.status });
  }
  await limit(request, env, session, "submit");
  await verifyTurnstile(env, body.turnstileToken, "submit_bottle", `${session.id}:${key}:${fingerprint}`);
  let status = "pending",
    reason: string | null = "rule_error";
  try {
    ({ status, reason } = moderate(content));
  } catch {
    /* Fail closed: pending is never in the draw pool. */
  }
  // Deterministic ID plus atomic batch makes simultaneous retries create exactly one bottle.
  const id = (
    await sign(env.SESSION_SECRET, `bottle:${session.id}:${key}`)
  ).slice(0, 32);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO bottles(id,body,status,created_at,moderation_reason)
      SELECT ?,?,CASE WHEN EXISTS(SELECT 1 FROM submissions WHERE session_id=? AND body_hash=? AND created_at>?) THEN 'hidden' ELSE ? END,?,?`,
    ).bind(
      id,
      content,
      session.id,
      fingerprint,
      now() - TTL.dedup,
      status,
      now(),
      reason,
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO submissions(session_id,request_key,bottle_id,body_hash,created_at) VALUES(?,?,?,?,?)",
    ).bind(session.id, key, id, fingerprint, now()),
  ]);
  const stored = await env.DB.prepare(
    "SELECT s.body_hash,b.status FROM submissions s JOIN bottles b ON b.id=s.bottle_id WHERE session_id=? AND request_key=?",
  )
    .bind(session.id, key)
    .first<{ body_hash: string; status: string }>();
  if (!stored || stored.body_hash !== fingerprint)
    throw new HttpError(
      409,
      "conflict",
      "This request key already belongs to another message.",
    );
  return json({ id, status: stored.status }, 201);
}
async function draw(
  request: Request,
  env: Env,
  session: Session,
  body: Record<string, unknown>,
) {
  const key = requestKey(body.requestKey),
    token = await sign(env.SESSION_SECRET, `draw:${session.id}:${key}`),
    tokenHash = await hash(token);
  await limit(request, env, session, "draw");
  const prior = await env.DB.prepare(
    "SELECT expires_at FROM draws WHERE token_hash=? AND session_id=?",
  )
    .bind(tokenHash, session.id)
    .first<{ expires_at: number }>();
  if (prior) {
    if (prior.expires_at <= now())
      throw new HttpError(
        410,
        "expired",
        "This bottle has drifted on. Find another.",
      );
    return json({ token, expiresAt: prior.expires_at });
  }
  let cursor = "",
    selected: { id: string; exposure_count: number } | null = null,
    total = 0;
  // Keyset pages traverse ALL eligible candidates; no limited random subset.
  while (true) {
    const rows = await env.DB.prepare(
      `SELECT id,exposure_count FROM bottles b WHERE status='approved' AND id>?
      AND NOT EXISTS(SELECT 1 FROM submissions s WHERE s.bottle_id=b.id AND s.session_id=? AND s.created_at>?)
      AND NOT EXISTS(SELECT 1 FROM opens o WHERE o.bottle_id=b.id AND o.session_id=? AND o.opened_at>?)
      ORDER BY id LIMIT 500`,
    )
      .bind(
        cursor,
        session.id,
        now() - TTL.dedup,
        session.id,
        now() - TTL.dedup,
      )
      .all<{ id: string; exposure_count: number }>();
    const random = crypto.getRandomValues(new Uint32Array(rows.results.length));
    for (const [index, row] of rows.results.entries()) {
      const w = weight(row.exposure_count);
      total += w;
      const u = random[index] / 4294967296;
      if (u * total < w) selected = row;
    }
    if (rows.results.length < 500) break;
    cursor = rows.results[rows.results.length - 1].id;
  }
  if (!selected) return json({ empty: true });
  const expires = now() + TTL.draw;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO draws(token_hash,session_id,request_key,bottle_id,expires_at) VALUES(?,?,?,?,?)",
  )
    .bind(tokenHash, session.id, key, selected.id, expires)
    .run();
  return json({ token, expiresAt: expires });
}
async function open(
  request: Request,
  env: Env,
  session: Session,
  body: Record<string, unknown>,
) {
  if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))
    throw new HttpError(400, "token", "This bottle could not be opened.");
  await limit(request, env, session, "draw");
  const tokenHash = await hash(body.token),
    time = now();
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE draws SET consumed_at=COALESCE(consumed_at,?) WHERE token_hash=? AND session_id=? AND expires_at>?
      AND EXISTS(SELECT 1 FROM bottles WHERE id=draws.bottle_id AND status='approved')`,
    ).bind(time, tokenHash, session.id, time),
    env.DB.prepare(
      `SELECT b.id,b.body FROM draws d JOIN bottles b ON b.id=d.bottle_id WHERE d.token_hash=? AND d.session_id=? AND d.expires_at>? AND d.consumed_at IS NOT NULL AND b.status='approved'`,
    ).bind(tokenHash, session.id, time),
  ]);
  if (!result[1].results.length)
    throw new HttpError(
      410,
      "expired",
      "This bottle has drifted on. Find another.",
    );
  return json(result[1].results[0]);
}
async function report(
  request: Request,
  env: Env,
  session: Session,
  body: Record<string, unknown>,
) {
  if (typeof body.id !== "string" || !/^[a-f0-9]{32}$/.test(body.id))
    throw new HttpError(400, "bottle", "This bottle could not be reported.");
  await limit(request, env, session, "report");
  const opened = await env.DB.prepare(
    "SELECT 1 FROM opens WHERE session_id=? AND bottle_id=? AND opened_at>?",
  )
    .bind(session.id, body.id, now() - TTL.dedup)
    .first();
  if (!opened)
    throw new HttpError(
      403,
      "not_opened",
      "Only a bottle you have opened can be reported.",
    );
  // An acknowledged report can be retried after a lost response without
  // consuming a second single-use challenge or recording another report.
  const prior = await env.DB.prepare("SELECT 1 FROM reports WHERE session_id=? AND bottle_id=?")
    .bind(session.id, body.id).first();
  if (prior) return json({ reported: true });
  await verifyTurnstile(env, body.turnstileToken, "report_bottle", `${session.id}:${body.id}`);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO reports(session_id,bottle_id,created_at) VALUES(?,?,?)",
  )
    .bind(session.id, body.id, now())
    .run();
  return json({ reported: true });
}
export async function cleanup(env: Env) {
  const time = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM draws WHERE expires_at<=?").bind(time),
    env.DB.prepare("DELETE FROM opens WHERE opened_at<=?").bind(
      time - TTL.dedup,
    ),
    env.DB.prepare("DELETE FROM reports WHERE created_at<=?").bind(
      time - TTL.dedup,
    ),
    env.DB.prepare("DELETE FROM submissions WHERE created_at<=?").bind(
      time - TTL.dedup,
    ),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(time),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(time),
  ]);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== "/api" && !path.startsWith("/api/"))
      return env.ASSETS.fetch(request);
    try {
      if (!env.ALLOWED_ORIGIN || !env.SESSION_SECRET || !env.IP_SECRET)
        throw new HttpError(
          503,
          "config",
          "The sea is resting. Please return soon.",
        );
      if (path === "/api/bootstrap" && request.method === "GET")
        return await bootstrap(request, env);
      if (path === "/api/turnstile" && request.method === "GET") {
        const { siteKey } = turnstileConfig(env);
        return json({ siteKey });
      }
      if (request.method !== "POST")
        throw new HttpError(405, "method", "Use POST for this request.");
      guard(request, env);
      const session = await parseSession(request, env);
      if (!session)
        throw new HttpError(
          401,
          "session",
          "Your visit has expired. Please try again.",
        );
      if (!equal(request.headers.get("X-CSRF-Token") || "", session.csrf))
        throw new HttpError(403, "csrf", "Refresh your visit and try again.");
      const body = await readBody(request);
      if (env.WRITES_PAUSED === "true")
        throw new HttpError(
          503,
          "maintenance",
          "The sea is resting. Please return soon.",
        );
      if (path === "/api/session") {
        const existing = await env.DB.prepare(
          "SELECT 1 FROM sessions WHERE id=? AND expires_at>?",
        )
          .bind(session.id, now())
          .first();
        if (!existing) {
          await limit(request, env, session, "session");
          await env.DB.prepare(
            "INSERT OR IGNORE INTO sessions(id,csrf,expires_at) VALUES(?,?,?)",
          )
            .bind(session.id, await hash(session.csrf), session.expires)
            .run();
        }
        return json({ ready: true });
      }
      if (
        !(await env.DB.prepare(
          "SELECT 1 FROM sessions WHERE id=? AND expires_at>?",
        )
          .bind(session.id, now())
          .first())
      )
        throw new HttpError(
          401,
          "session",
          "Your visit has expired. Please try again.",
        );
      if (path === "/api/bottles")
        return await submit(request, env, session, body);
      if (path === "/api/draw") return await draw(request, env, session, body);
      if (path === "/api/open") return await open(request, env, session, body);
      if (path === "/api/report")
        return await report(request, env, session, body);
      throw new HttpError(
        404,
        "not_found",
        "This part of the sea does not exist.",
      );
    } catch (error) {
      if (error instanceof HttpError || error instanceof TurnstileError)
        return json(
          { error: error.code, message: error.message },
          error.status,
          error.status === 429 ? { "Retry-After": "60" } : {},
        );
      // Never log request contents, credentials, IPs, or database errors containing bindings.
      return json(
        {
          error: "unavailable",
          message:
            "The tide is unsettled. Your words are still here. Please try again.",
        },
        503,
      );
    }
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await cleanup(env);
  },
} satisfies ExportedHandler<Env>;
