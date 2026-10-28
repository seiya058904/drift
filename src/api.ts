export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
let csrf = "",
  sessionPromise: Promise<void> | undefined;
async function fetchJson<T>(
  path: string,
  body?: unknown,
  attempt = 0,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    if (attempt < 1) return fetchJson(path, body, attempt + 1);
    throw new ApiError(
      "network",
      "The sea feels far away. Check your connection and try again.",
    );
  }
  if (response.status >= 500 && attempt < 1)
    return fetchJson(path, body, attempt + 1);
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw new ApiError("network", "The sea is resting. Please try again soon.");
  const result = (await response.json()) as T & {
    error: string;
    message: string;
  };
  if (!response.ok) {
    if (response.status === 401) {
      csrf = "";
      sessionPromise = undefined;
    }
    throw new ApiError(result.error, result.message);
  }
  return result as T;
}
export function ensureSession() {
  if (!sessionPromise)
    sessionPromise = (async () => {
      csrf = (await fetchJson<{ csrf: string }>("bootstrap")).csrf;
      await fetchJson("session", {});
    })().catch((error) => {
      sessionPromise = undefined;
      throw error;
    });
  return sessionPromise;
}
export async function api<T>(path: string, body: unknown): Promise<T> {
  await ensureSession();
  return fetchJson<T>(path, body);
}
