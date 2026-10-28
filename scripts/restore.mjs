import { readFile } from "node:fs/promises";
import { backup, wrangler } from "./backup.mjs";
import { query } from "./cloudflare.mjs";
const config = JSON.parse(await readFile("deployment.json", "utf8"));
const [environment, bookmark, confirmation] = process.argv.slice(2);
if (
  !["preview", "production"].includes(environment) ||
  !/^[a-f0-9-]{50,100}$/.test(bookmark || "")
)
  throw Error(
    "Usage: node scripts/restore.mjs preview|production BOOKMARK DATABASE_ID",
  );
const database =
  environment === "production"
    ? config.productionDatabase
    : config.previewDatabase;
if (confirmation !== database)
  throw Error(
    "Confirm the exact target database ID. This overwrites database state.",
  );
if (process.env.DRIFT_INCIDENT_APPROVAL !== `restore:${database}:${bookmark}`)
  throw Error(
    "An explicit incident approval is required, including the restore point and acknowledged data-loss window.",
  );
if (
  environment === "production" &&
  process.env.DRIFT_WRITES_PAUSED_CONFIRMED !== "yes"
)
  throw Error(
    "Pause writes and verify the maintenance response before restoring production.",
  );
await backup(config, environment, "before-restore");
console.log(
  wrangler(
    "d1",
    "time-travel",
    "restore",
    environment === "production" ? "drift-production" : "drift-preview",
    "--bookmark",
    bookmark,
  ),
);
const time = Math.floor(Date.now() / 1000);
for (const sql of [
  "DELETE FROM sessions WHERE expires_at<=?",
  "DELETE FROM draws WHERE expires_at<=?",
  "DELETE FROM rate_limits WHERE expires_at<=?",
])
  await query(database, sql, [time]);
console.log(
  "Restore complete. Keep writes paused until integrity and two-session checks pass.",
);
