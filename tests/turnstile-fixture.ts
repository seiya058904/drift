// Test transport only. This file is never imported by the production Worker.
export function createSiteverifyFixture() {
  const used = new Map<string, { key: string; result: object }>();
  return (form: URLSearchParams) => {
    const token = form.get("response") || "", key = form.get("idempotency_key") || "";
    const previous = used.get(token);
    if (previous) return previous.key === key ? previous.result : { success: false, "error-codes": ["timeout-or-duplicate"] };
    let parsed: { action?: string; hostname?: string; expired?: boolean };
    try { parsed = JSON.parse(token); } catch { return { success: false }; }
    const result = parsed.expired ? { success: false } : {
      success: true, action: parsed.action, hostname: parsed.hostname,
    };
    used.set(token, { key, result });
    return result;
  };
}
export function fixtureToken(action: string, hostname = "drift.test") {
  return JSON.stringify({ nonce: crypto.randomUUID(), action, hostname });
}
