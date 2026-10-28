import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertChecks,
  assertEnvironment,
  assertHead,
  releaseStages,
} from "../scripts/gates.mjs";

test("failed backup, failed migration and changed HEAD stop upload", async () => {
  for (const failure of ["preserve", "migrate", "head"]) {
    let uploads = 0,
      headChecks = 0;
    await assert.rejects(
      releaseStages({
        confirmHead: async () => {
          if (++headChecks === 2 && failure === "head") throw Error("stale");
        },
        preserve: async () => {
          if (failure === "preserve") throw Error("backup failed");
        },
        migrate: async () => {
          if (failure === "migrate") throw Error("migration failed");
        },
        deploy: async () => {
          uploads++;
          return "uploaded";
        },
      }),
    );
    assert.equal(uploads, 0);
  }
});
test("release gates reject failed/incomplete/wrong-SHA/spoofed checks and stale heads", () => {
  const check = {
    id: 1,
    name: "verify",
    head_sha: "abc",
    status: "completed",
    conclusion: "success",
    app: { slug: "github-actions" },
  };
  assert.equal(assertChecks([check], "abc", ["verify"]), true);
  assert.equal(assertChecks([], "abc", ["verify"]), false);
  assert.equal(assertChecks([check], "def", ["verify"]), false);
  assert.equal(
    assertChecks([{ ...check, status: "queued" }], "abc", ["verify"]),
    false,
  );
  assert.equal(
    assertChecks([{ ...check, app: { slug: "untrusted" } }], "abc", ["verify"]),
    false,
  );
  assert.throws(() =>
    assertChecks([{ ...check, conclusion: "failure" }], "abc", ["verify"]),
  );
  assert.throws(() => assertHead("new", "old"));
});
test("environment gates reject shared database, wrong binding, wildcard and production preview origins", () => {
  const config = {
    productionDatabase: "production",
    previewDatabase: "preview",
    productionOrigin: "https://drift.test",
  };
  assertEnvironment(config, "preview", "preview", "https://preview.drift.test");
  for (const [db, origin] of [
    ["production", "https://preview.drift.test"],
    ["preview", "https://*.workers.dev"],
    ["preview", "https://drift.test"],
    ["preview", "http://preview.test"],
  ])
    assert.throws(() => assertEnvironment(config, "preview", db, origin));
});
