import { readFile } from "node:fs/promises";
import { query } from "./cloudflare.mjs";
const config = JSON.parse(await readFile("deployment.json", "utf8"));
const [environment, action, id] = process.argv.slice(2);
if (
  !["preview", "production"].includes(environment) ||
  !["list", "approve", "hide"].includes(action)
)
  throw Error(
    "Usage: npm run moderate -- preview|production list|approve|hide [32-hex bottle ID]",
  );
const database =
  environment === "production"
    ? config.productionDatabase
    : config.previewDatabase;
if (action === "list") {
  const rows = await query(
    database,
    "SELECT id,body,status,moderation_reason,report_count FROM bottles WHERE status IN ('pending','flagged') ORDER BY created_at LIMIT 50",
  );
  // Explicit operator-only review; never used in build logs or public artifacts.
  console.log(JSON.stringify(rows[0].results, null, 2));
} else {
  if (!/^[a-f0-9]{32}$/.test(id || ""))
    throw Error("An exact bottle ID is required");
  const result = await query(
    database,
    "UPDATE bottles SET status=?,moderation_reason=? WHERE id=? RETURNING id,status",
    [action === "approve" ? "approved" : "hidden", "operator_review", id],
  );
  console.log(JSON.stringify(result[0].results));
}
