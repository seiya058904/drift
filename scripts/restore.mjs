import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { backup, wrangler } from "./backup.mjs";
import { query } from "./cloudflare.mjs";
import { acquireOperationLock, releaseOperationLock } from "./operations-lock.mjs";

export async function restoreDatabase(config, args, dependencies = {}) {
  const {
    env = process.env,
    preserve = backup,
    restore = wrangler,
    execute = query,
    log = console.log,
  } = dependencies;
  const [environment, bookmark, confirmation] = args;
  if (!["preview", "production"].includes(environment) ||
      !/^[a-f0-9-]{50,100}$/.test(bookmark || ""))
    throw Error("Usage: node scripts/restore.mjs preview|production BOOKMARK DATABASE_ID");
  const database = environment === "production" ? config.productionDatabase : config.previewDatabase;
  if (confirmation !== database)
    throw Error("Confirm the exact target database ID. This overwrites database state.");
  if (env.DRIFT_INCIDENT_APPROVAL !== `restore:${database}:${bookmark}`)
    throw Error("An explicit incident approval is required, including the restore point and acknowledged data-loss window.");
  if (environment === "production" && env.DRIFT_WRITES_PAUSED_CONFIRMED !== "yes")
    throw Error("Pause writes and verify the maintenance response before restoring production.");

  const owner = `restore:${randomUUID()}`;
  await acquireOperationLock(config.operationsDatabase, environment, owner, execute);
  let restoreStarted = false;
  try {
    log(`Recovery lock owner: ${owner}. Retain it until recovery verification is complete.`);
    await preserve(config, environment, "before-restore");
    // A CLI failure may occur after the provider changed data. Retain the lock
    // from this point on, through the operator's post-restore verification.
    restoreStarted = true;
    log(await restore(
      "d1", "time-travel", "restore",
      environment === "production" ? "drift-production" : "drift-preview",
      "--bookmark", bookmark,
    ));
    const time = Math.floor(Date.now() / 1000);
    for (const sql of [
      "DELETE FROM sessions WHERE expires_at<=?",
      "DELETE FROM draws WHERE expires_at<=?",
      "DELETE FROM rate_limits WHERE expires_at<=?",
    ])
      await execute(database, sql, [time]);
    log("Restore complete. Keep the recovery lock through integrity and two-session checks; see docs/operations.md before releasing it.");
    return owner;
  } finally {
    if (!restoreStarted)
      await releaseOperationLock(config.operationsDatabase, environment, owner, execute);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(await readFile("deployment.json", "utf8"));
  await restoreDatabase(config, process.argv.slice(2));
}
