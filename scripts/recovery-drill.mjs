import { readFile, writeFile } from "node:fs/promises";
import { query } from "./cloudflare.mjs";
import { wrangler, encryptBackup, decryptBackup } from "./backup.mjs";
import { join } from "node:path";
const database = "1547d085-e3db-4240-ac02-9609f1460373";
const config = JSON.parse(await readFile("deployment.json", "utf8"));
if ([config.productionDatabase, config.previewDatabase].includes(database))
  throw Error("Drill must never target an application database");
await query(
  database,
  "CREATE TABLE IF NOT EXISTS recovery_probe(id TEXT PRIMARY KEY, value TEXT NOT NULL)",
);
await query(
  database,
  "INSERT OR REPLACE INTO recovery_probe VALUES('synthetic','before')",
);
const bookmark = JSON.parse(
  wrangler("d1", "time-travel", "info", "drift-recovery-drill", "--json"),
).bookmark;
await query(
  database,
  "UPDATE recovery_probe SET value='after' WHERE id='synthetic'",
);
const prior = await query(database, "SELECT * FROM recovery_probe");
const encrypted = encryptBackup(
  Buffer.from(JSON.stringify(prior)),
  await readFile("docs/backup-public.pem"),
);
const plain = decryptBackup(
  encrypted,
  await readFile(join(process.env.LOCALAPPDATA, "Drift/backup-private.pem")),
);
if (!plain.equals(Buffer.from(JSON.stringify(prior))))
  throw Error("Backup decrypt mismatch");
console.log(
  wrangler(
    "d1",
    "time-travel",
    "restore",
    "drift-recovery-drill",
    "--bookmark",
    bookmark,
  ),
);
const restored = await query(
  database,
  "SELECT value FROM recovery_probe WHERE id=?",
  ["synthetic"],
);
if (restored[0].results[0]?.value !== "before")
  throw Error("Restore drill failed");
const evidence = {
  date: new Date().toISOString(),
  database,
  name: "drift-recovery-drill",
  syntheticOnly: true,
  bookmark,
  beforeRestore: "after",
  afterRestore: "before",
  encryptedSnapshotRoundtrip: true,
  productionTouched: false,
};
await writeFile(
  "docs/evidence/recovery-drill.json",
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence));
