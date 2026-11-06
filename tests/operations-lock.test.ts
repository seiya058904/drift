import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { acquireOperationLock, releaseOperationLock } from "../scripts/operations-lock.mjs";
import { restoreDatabase } from "../scripts/restore.mjs";
import { completeRestore } from "../scripts/complete-restore.mjs";

const config = { operationsDatabase: "operations", productionDatabase: "production", previewDatabase: "preview" };
const bookmark = "a".repeat(60);
const approval = { DRIFT_INCIDENT_APPROVAL: `restore:production:${bookmark}`, DRIFT_WRITES_PAUSED_CONFIRMED: "yes" };
const args = ["production", bookmark, "production"];

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE release_lock (name TEXT PRIMARY KEY, owner TEXT NOT NULL, acquired_at INTEGER NOT NULL)");
  const calls: string[] = [];
  const execute = async (database: string, sql: string, params: (string | number)[] = []) => {
    if (database === "operations") return [{ results: db.prepare(sql).all(...params) }];
    assert.equal(database, "production");
    calls.push("cleanup");
    return [{ results: [] }];
  };
  const dependencies = {
    env: approval, execute,
    preserve: async () => { calls.push("backup"); },
    restore: async () => { calls.push("restore"); return "synthetic recovery complete"; },
    log: () => {},
  };
  const owner = () => (db.prepare("SELECT owner FROM release_lock WHERE name='production'").get() as { owner: string } | undefined)?.owner;
  return { db, calls, execute, dependencies, owner };
}

test("one environment permits one owner; independent environments do not block each other", async () => {
  const f = fixture();
  try {
    const attempts = await Promise.allSettled([
      acquireOperationLock("operations", "production", "release-owner", f.execute),
      acquireOperationLock("operations", "production", "recovery-owner", f.execute),
    ]);
    assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
    await acquireOperationLock("operations", "preview", "preview-owner", f.execute);
    await assert.rejects(releaseOperationLock("operations", "production", "wrong-owner", f.execute), /owner/);
    assert.equal(f.owner(), "release-owner");
    await releaseOperationLock("operations", "production", "release-owner", f.execute);
    await acquireOperationLock("operations", "production", "new-owner", f.execute);
    await assert.rejects(releaseOperationLock("operations", "production", "release-owner", f.execute));
    assert.equal(f.owner(), "new-owner");
  } finally { f.db.close(); }
});

test("a release lock prevents backup and recovery without changing that lock", async () => {
  const f = fixture();
  try {
    await acquireOperationLock("operations", "production", "release-owner", f.execute);
    await assert.rejects(restoreDatabase(config, args, f.dependencies), /holds the lock/);
    assert.deepEqual(f.calls, []);
    assert.equal(f.owner(), "release-owner");
  } finally { f.db.close(); }
});

test("backup failure releases its own lock before any recovery starts", async () => {
  const f = fixture();
  try {
    await assert.rejects(restoreDatabase(config, args, {
      ...f.dependencies,
      preserve: async () => { throw Error("backup failed"); },
    }), /backup failed/);
    assert.equal(f.owner(), undefined);
    assert.deepEqual(f.calls, []);
  } finally { f.db.close(); }
});

test("recovery retains its lock on successful completion and uncertain or cleanup failures", async () => {
  for (const failure of ["none", "restore", "cleanup"]) {
    const f = fixture();
    try {
      const operation = restoreDatabase(config, args, {
        ...f.dependencies,
        restore: async () => {
          f.calls.push("restore");
          if (failure === "restore") throw Error("provider acknowledgement lost");
        },
        execute: async (database: string, sql: string, params: (string | number)[] = []) => {
          if (database === "production" && failure === "cleanup") throw Error("cleanup failed");
          return f.execute(database, sql, params);
        },
      });
      if (failure === "none") assert.equal(await operation, f.owner());
      else await assert.rejects(operation);
      assert.match(f.owner()!, /^restore:/);
      await assert.rejects(acquireOperationLock("operations", "production", "release-owner", f.execute));
      assert.deepEqual(f.calls.slice(0, 2), ["backup", "restore"]);
    } finally { f.db.close(); }
  }
});

test("completion requires exact database, owner and operator verification", async () => {
  const f = fixture();
  try {
    const owner = await restoreDatabase(config, args, f.dependencies);
    const env = { DRIFT_RESTORE_VERIFIED: `complete-restore:production:${owner}` };
    for (const [completeArgs, completeEnv] of [
      [["production", "preview", owner], env],
      [["preview", "production", owner], env],
      [["production", "production", owner], {}],
      [["production", "production", "release-owner"], env],
    ] as [string[], Record<string, string>][]) {
      await assert.rejects(completeRestore(config, completeArgs, completeEnv, f.execute));
      assert.equal(f.owner(), owner);
    }
    await completeRestore(config, ["production", "production", owner], env, f.execute);
    assert.equal(f.owner(), undefined);
    await acquireOperationLock("operations", "production", "new-release", f.execute);
    await assert.rejects(completeRestore(config, ["production", "production", owner], env, f.execute));
    assert.equal(f.owner(), "new-release");
  } finally { f.db.close(); }
});

test("existing incident approval and write pause gates precede all cloud operations", async () => {
  const f = fixture();
  try {
    for (const env of [{}, { DRIFT_INCIDENT_APPROVAL: approval.DRIFT_INCIDENT_APPROVAL }]) {
      await assert.rejects(restoreDatabase(config, args, { ...f.dependencies, env }));
      assert.equal(f.owner(), undefined);
      assert.deepEqual(f.calls, []);
    }
  } finally { f.db.close(); }
});
