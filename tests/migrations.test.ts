import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("migration checks refuse a clone with no main baseline", async () => {
  const directory = await mkdtemp(join(tmpdir(), "drift-migration-gate-"));
  const migrations = join(directory, "migrations");
  const sql = join(migrations, "0001_initial.sql");
  await mkdir(migrations);
  await writeFile(sql, "CREATE TABLE probe (id TEXT PRIMARY KEY);");
  try {
    const result = spawnSync(process.execPath, [resolve("scripts/check-migrations.mjs")], {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, GIT_CEILING_DIRECTORIES: directory },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Migration baseline origin\/main is unavailable/);
    assert.doesNotMatch(result.stdout, /Migration gates passed/);
  } finally {
    await unlink(sql);
    await rmdir(migrations);
    await rmdir(directory);
  }
});
