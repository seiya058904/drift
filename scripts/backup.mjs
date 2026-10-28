import {
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  privateDecrypt,
  randomBytes,
  createHash,
} from "node:crypto";
import { mkdtemp, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { cloudflare } from "./cloudflare.mjs";
export const wrangler = (...args) =>
  execFileSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 8,
    },
  );
export function encryptBackup(plain, publicKey) {
  const key = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      version: 1,
      key: publicEncrypt({ key: publicKey, oaepHash: "sha256" }, key).toString(
        "base64",
      ),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    }),
  );
}
export function decryptBackup(envelope, privateKey) {
  const payload = JSON.parse(envelope.toString()),
    key = privateDecrypt(
      { key: privateKey, oaepHash: "sha256" },
      Buffer.from(payload.key, "base64"),
    );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]);
}
export async function backup(config, environment, sha) {
  const name =
    environment === "production" ? "drift-production" : "drift-preview";
  const bookmark = JSON.parse(
    wrangler("d1", "time-travel", "info", name, "--json"),
  ).bookmark;
  if (!bookmark) throw Error("Time Travel bookmark unavailable");
  const temp = await mkdtemp(join(tmpdir(), "drift-backup-")),
    file = join(temp, "snapshot.sql");
  try {
    // Create private output before Wrangler writes. Never print SQL or include it in a repo artifact.
    await writeFile(file, "", { mode: 0o600 });
    wrangler("d1", "export", name, "--remote", "--output", file);
    const plain = await readFile(file);
    if (!plain.length) throw Error("Backup export was empty");
    const envelope = encryptBackup(
      plain,
      await readFile("docs/backup-public.pem"),
    );
    if (envelope.length > 24 * 1024 * 1024)
      throw Error(
        "Encrypted backup exceeds safe free KV object size; release blocked",
      );
    const key = `${environment}/${Date.now()}-${sha}.json`;
    await cloudflare(
      `storage/kv/namespaces/${config.backupNamespace}/values/${encodeURIComponent(key)}?expiration_ttl=604800`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: envelope,
      },
    );
    const verified = await cloudflare(
      `storage/kv/namespaces/${config.backupNamespace}/values/${encodeURIComponent(key)}`,
      { raw: true },
    );
    const digest = createHash("sha256").update(envelope).digest("hex");
    if (createHash("sha256").update(verified).digest("hex") !== digest)
      throw Error("Backup readback mismatch");
    const manifest = {
      environment,
      sha,
      bookmark,
      key,
      sha256: digest,
      bytes: envelope.length,
      expiresAfterDays: 7,
    };
    await cloudflare(
      `storage/kv/namespaces/${config.backupNamespace}/values/${encodeURIComponent(key + ".manifest")}?expiration_ttl=604800`,
      { method: "PUT", body: JSON.stringify(manifest) },
    );
    console.log(
      JSON.stringify({ backup: key, bookmark, bytes: envelope.length }),
    );
    return manifest;
  } finally {
    await unlink(file).catch(() => {});
    await rmdir(temp).catch(() => {});
  }
}
