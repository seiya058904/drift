import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { query } from "./cloudflare.mjs";
import { releaseOperationLock } from "./operations-lock.mjs";

export async function completeRestore(config, args, env = process.env, execute = query) {
  const [environment, confirmation, owner] = args;
  if (!["preview", "production"].includes(environment) ||
      !/^restore:[a-f0-9-]{36}$/.test(owner || ""))
    throw Error("Usage: node scripts/complete-restore.mjs preview|production DATABASE_ID RESTORE_LOCK_OWNER");
  const database = environment === "production" ? config.productionDatabase : config.previewDatabase;
  if (confirmation !== database || env.DRIFT_RESTORE_VERIFIED !== `complete-restore:${database}:${owner}`)
    throw Error("Confirm the exact database and recovery owner after integrity, schema and two-session checks, and the write-pause decision.");
  await releaseOperationLock(config.operationsDatabase, environment, owner, execute);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(await readFile("deployment.json", "utf8"));
  await completeRestore(config, process.argv.slice(2));
  console.log("Verified recovery lock released. Automatic releases may proceed.");
}
