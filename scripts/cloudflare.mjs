import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
export const ACCOUNT = "e51d33bf9d0ca73ea5b638e60d62d9f5";
export async function cloudflare(path, options = {}) {
  const { raw = false, ...fetchOptions } = options;
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token && process.platform === "win32") {
    const config = await readFile(
      join(
        homedir(),
        "AppData/Roaming/xdg.config/.wrangler/config/default.toml",
      ),
      "utf8",
    );
    token = /oauth_token\s*=\s*"([^"]+)"/.exec(config)?.[1];
  }
  if (!token) throw new Error("Cloudflare authorization is missing.");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/${path}`,
    {
      ...fetchOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    },
  );
  if (raw) {
    if (!response.ok)
      throw Error(`Cloudflare download failed (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(
      `Cloudflare ${response.status}: ${result.errors?.map((e) => e.code + " " + e.message).join(", ") || "request failed"}`,
    );
  return result.result;
}
export async function query(database, sql, params = []) {
  return cloudflare(`d1/database/${database}/query`, {
    method: "POST",
    body: JSON.stringify({ sql, params }),
  });
}
