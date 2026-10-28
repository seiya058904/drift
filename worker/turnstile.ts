type TurnstileEnv = {
  ALLOWED_ORIGIN: string;
  APP_ENV: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
};
export class TurnstileError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function turnstileConfig(env: TurnstileEnv) {
  const origin = new URL(env.ALLOWED_ORIGIN);
  if (
    !env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET ||
    (env.APP_ENV !== "local" && (
      origin.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
      /^[123]x000/.test(env.TURNSTILE_SITE_KEY) ||
      /^[123]x000/.test(env.TURNSTILE_SECRET)
    ))
  ) throw new TurnstileError(503, "verification_unavailable", "Verification is unavailable. Please try again shortly.");
  return { siteKey: env.TURNSTILE_SITE_KEY, hostname: origin.hostname };
}

export async function verifyTurnstile(
  env: TurnstileEnv,
  token: unknown,
  action: "submit_bottle" | "report_bottle",
  operation: string,
) {
  const { hostname } = turnstileConfig(env);
  if (typeof token !== "string" || !token.trim() || token.length > 2048)
    throw new TurnstileError(403, "verification_required", "Please complete the verification and try again.");
  // Bind Siteverify retries to this session, operation, payload and token.
  // Reusing a token for a new operation gets a different UUID and must fail.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(`${action}:${operation}:${token}`)));
  digest[6] = (digest[6] & 15) | 64;
  digest[8] = (digest[8] & 63) | 128;
  const hex = Array.from(digest.slice(0, 16), (v) => v.toString(16).padStart(2, "0")).join("");
  const idempotencyKey = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let result: { success?: unknown; action?: unknown; hostname?: unknown } | null;
    try {
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(4000),
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET!, response: token, idempotency_key: idempotencyKey,
        }),
      });
      if (!response.ok) throw Error("Siteverify unavailable");
      result = await response.json();
    } catch {
      if (attempt === 0) continue;
      throw new TurnstileError(503, "verification_unavailable", "Verification could not finish. Please try again.");
    }
    if (result?.success !== true || result.action !== action || result.hostname !== hostname)
      throw new TurnstileError(403, "verification_failed", "Verification expired or could not be confirmed. Please try again.");
    return;
  }
}
