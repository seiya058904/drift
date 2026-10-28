import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cloudflare, query } from "./cloudflare.mjs";
import { backup, wrangler } from "./backup.mjs";
import {
  assertChecks,
  assertEnvironment,
  assertHead,
  assertPublishedOrigin,
  releaseStages,
} from "./gates.mjs";
import { checkMigrations } from "./check-migrations.mjs";
const config = JSON.parse(await readFile("deployment.json", "utf8"));
const environment = process.argv[2];
const sha = process.env.WORKERS_CI_COMMIT_SHA;
const branch = process.env.WORKERS_CI_BRANCH;
if (!sha || !/^[a-f0-9]{40}$/.test(sha) || !branch)
  throw Error(
    "Only Cloudflare Git builds can release. Missing exact commit or branch.",
  );
assertHead(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sha,
);
if (environment === "production" && branch !== "main")
  throw Error("Only main may release production");
if (environment === "preview" && branch === "main")
  throw Error("Main is not a PR preview");
const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "drift-release",
  ...(process.env.GH_READ_TOKEN
    ? { Authorization: `Bearer ${process.env.GH_READ_TOKEN}` }
    : {}),
};
async function github(path) {
  const r = await fetch(
    `https://api.github.com/repos/${config.repository}/${path}`,
    { headers: githubHeaders },
  );
  if (!r.ok) throw Error(`GitHub gate unavailable (${r.status})`);
  return r.json();
}
async function checkHead() {
  assertHead(
    (await github(`git/ref/heads/${encodeURIComponent(branch)}`)).object.sha,
    sha,
  );
}
// Exact SHA is checked, not the branch badge or the latest unrelated workflow run.
const deadline = Date.now() + 12 * 60 * 1000;
while (true) {
  await checkHead();
  if (
    assertChecks(
      (await github(`commits/${sha}/check-runs?per_page=100`)).check_runs,
      sha,
      config.requiredChecks,
    )
  )
    break;
  if (Date.now() > deadline) throw Error("Required GitHub checks timed out");
  console.log("Waiting for required GitHub checks for this commit.");
  await new Promise((resolve) => setTimeout(resolve, 30000));
}
// Existing in-repository branch only; fork PR builds must first be reviewed and copied to a trusted branch.
// Workers Builds can check out only the commit, without an origin/main ref.
execFileSync("git", ["fetch", "--no-tags", "--depth=1", "origin", "main:refs/remotes/origin/main"], { stdio: "pipe" });
await checkMigrations();
const wranglerConfig = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const previewName = branch
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .slice(0, 40);
const origin =
  environment === "production"
    ? config.productionOrigin
    : `https://${previewName}-drift.seiya-api.workers.dev`;
const targetConfig =
  environment === "production" ? wranglerConfig : wranglerConfig.previews;
assertEnvironment(
  config,
  environment,
  targetConfig.d1_databases[0].database_id,
  origin,
);
if (environment === "preview")
  wranglerConfig.previews.vars.ALLOWED_ORIGIN = origin;
if (!/^0x4[A-Za-z0-9_-]+$/.test(targetConfig.vars?.TURNSTILE_SITE_KEY || "") ||
    wranglerConfig.vars.TURNSTILE_SITE_KEY === wranglerConfig.previews.vars.TURNSTILE_SITE_KEY)
  throw Error("Production and preview require separate real Turnstile site keys");
const secretNames = environment === "production"
  ? (await cloudflare("workers/scripts/drift/secrets")).map((binding) => binding.name)
  : Object.entries((await cloudflare("workers/workers/drift")).previews_base_config?.env || {})
    .filter(([, binding]) => binding.type === "secret_text").map(([name]) => name);
if (!secretNames.includes("TURNSTILE_SECRET"))
  throw Error(`Turnstile secret is missing from ${environment}; refuse publication`);
// A separate operational D1 holds an atomic lock. It contains no user messages.
// Locks never expire automatically: a killed build cannot later overtake another release.
const owner = `${sha}:${randomUUID()}`;
const acquired = await query(
  config.operationsDatabase,
  "INSERT OR IGNORE INTO release_lock(name,owner,acquired_at) VALUES(?,?,?) RETURNING owner",
  [environment, owner, Math.floor(Date.now() / 1000)],
);
if (!acquired[0].results.length)
  throw Error(
    "Another release holds the lock; inspect its build before retrying.",
  );
const generated = "cloudflare.generated.json";
try {
  const result = await releaseStages({
    confirmHead: checkHead,
    preserve: async () => {
      if (environment === "production") await backup(config, environment, sha);
    },
    migrate: async () => {
      // Explicit migration target; preview binding is never inferred from a URL.
      const migrationConfig = {
        ...wranglerConfig,
        d1_databases: targetConfig.d1_databases,
        env: undefined,
      };
      await writeFile(generated, JSON.stringify(migrationConfig));
      wrangler(
        "d1",
        "migrations",
        "apply",
        "DB",
        "--remote",
        "--config",
        generated,
      );
    },
    deploy: async () => {
      await writeFile(generated, JSON.stringify(wranglerConfig));
      return environment === "production"
        ? wrangler("deploy", "--config", generated, "--env", "")
        : wrangler(
            "preview",
            "--config",
            generated,
            "--name",
            previewName,
            "--message",
            sha,
            "--json",
          );
    },
  });
  console.log(result);
  // Bindings echoed in deploy output are not proof that a URL is enabled.
  const published = await cloudflare(
    environment === "preview"
      ? `workers/workers/${wranglerConfig.name}/previews/${previewName}`
      : `workers/workers/${wranglerConfig.name}`,
  );
  assertPublishedOrigin(
    environment === "preview"
      ? published.urls
      : published.subdomain?.enabled
        ? [published.subdomain.url]
        : [],
    origin,
  );
  console.log(
    JSON.stringify({ environment, sha, origin, migration: "0001_initial.sql" }),
  );
} finally {
  await unlink(generated).catch(() => {});
  await query(
    config.operationsDatabase,
    "DELETE FROM release_lock WHERE name=? AND owner=?",
    [environment, owner],
  );
}
