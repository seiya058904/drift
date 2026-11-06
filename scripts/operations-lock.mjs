import { query } from "./cloudflare.mjs";

// Older release builds use the same table. Never expire locks automatically:
// an interrupted operation must be inspected before another one can proceed.
export async function acquireOperationLock(database, environment, owner, execute = query) {
  const result = await execute(
    database,
    "INSERT OR IGNORE INTO release_lock(name,owner,acquired_at) VALUES(?,?,?) RETURNING owner",
    [environment, owner, Math.floor(Date.now() / 1000)],
  );
  if (result[0]?.results?.[0]?.owner !== owner)
    throw Error("Another release or recovery holds the lock; inspect that operation before retrying.");
}

export async function releaseOperationLock(database, environment, owner, execute = query) {
  const result = await execute(
    database,
    "DELETE FROM release_lock WHERE name=? AND owner=? RETURNING owner",
    [environment, owner],
  );
  if (result[0]?.results?.[0]?.owner !== owner)
    throw Error("The operation lock was not released: its owner no longer matches.");
}
