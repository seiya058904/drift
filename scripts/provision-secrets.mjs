import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const file =
  process.env.DRIFT_SECRET_FILE ||
  (process.env.LOCALAPPDATA &&
    join(process.env.LOCALAPPDATA, "Drift/runtime-secrets.json"));
if (!file)
  throw Error(
    "Set DRIFT_SECRET_FILE to the restricted, out-of-repository runtime secrets file.",
  );
const secrets = JSON.parse(await readFile(file, "utf8"));
for (const kind of ["production", "preview"]) {
  if (
    !secrets[kind] ||
    !["SESSION_SECRET", "IP_SECRET"].every((key) =>
      /^[a-f0-9]{64}$/.test(secrets[kind][key] || ""),
    )
  )
    throw Error(`Invalid ${kind} secrets`);
}
if (
  secrets.production.SESSION_SECRET === secrets.preview.SESSION_SECRET ||
  secrets.production.IP_SECRET === secrets.preview.IP_SECRET
)
  throw Error("Environment secrets must be independent");
for (const kind of ["production", "preview"]) {
  const args =
    kind === "production"
      ? ["secret", "bulk", "--env", ""]
      : ["preview", "base-config", "secret", "bulk"];
  const output = execFileSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    {
      input: JSON.stringify(secrets[kind]),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  // Wrangler prints names and counts, never secret values. Still only report status here.
  if (!/success|uploaded|created/i.test(output))
    throw Error(`Verify ${kind} secret provisioning`);
  console.log(`${kind}: two independent runtime secrets provisioned.`);
}
