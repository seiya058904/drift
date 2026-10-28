# Operations

## Environments

`deployment.json` records actual resource IDs. Production and preview D1 IDs must differ. Local/CI uses Miniflare or Wrangler local D1 only. The application has no remote seed/reset command. Synthetic fixtures are confined to tests and preview.

Production: `drift-production`. Shared trusted PR previews: `drift-preview`. `drift-operations` holds only the atomic release lock, with no user content. The private `drift-backups` KV namespace holds encrypted database exports with a 604800-second TTL. No paid plan is enabled by these scripts.

The operations database is bootstrapped once with `CREATE TABLE release_lock (name TEXT PRIMARY KEY, owner TEXT NOT NULL, acquired_at INTEGER NOT NULL)`. This table is independent of application migrations, allowing even the first application migration to run under a lock. A crashed build leaves its lock in place; confirm the matching build has stopped before deleting that exact lock row. Never auto-expire a deployment lock.

## Only release path

GitHub Actions only verifies. The `verify` job is required on protected `main`; admins are also subject to PR and up-to-date checks. Cloudflare's official GitHub integration builds with `npm run build`, then runs `npm run release` for main and `npm run release:preview` for trusted in-repository branches. Never run app deployment from Actions.

Release checks the exact `WORKERS_CI_COMMIT_SHA` against local HEAD and GitHub Actions app check runs. A pending check waits up to 12 minutes; failed, missing, timed-out or wrong-SHA checks block deployment. Production requires current main HEAD. A D1 lock serializes migration/deployment; HEAD is checked again immediately before upload. Use a user-scoped read token for GitHub build gates if shared unauthenticated rate limits are exhausted; failure to query checks blocks deployment.

Cloudflare's build token needs Workers Scripts edit, D1 edit (production, preview and operational DBs) and KV edit for the private backup namespace. Runtime Workers receive only their own D1 binding and independent SESSION_SECRET/IP_SECRET. Build secrets are not runtime vars. Never expose them via VITE_ variables.

The Preview block explicitly binds preview D1. Each build sets one exact preview origin from the normalized branch name (`https://<branch>-drift.seiya-api.workers.dev`), never `*.workers.dev`. Confirm the returned actual URL equals the configured origin. Preview base secrets must be independent of production secrets. Fork PRs must not receive build credentials; review and copy to a trusted branch before previewing. For incompatible schema work, provision an isolated preview database and update both binding and migration target; if quota is unavailable, block that preview.

After creating the Worker resource, run `node scripts/provision-secrets.mjs` once with the operator's restricted secret file. It uploads independent production and Preview base secrets through Wrangler stdin, without logging values. This is infrastructure configuration; app publication still belongs exclusively to official Git builds.

## Migrations and backups

Ordered SQL files are immutable after main. `check-migrations.mjs` compares them with main, creates an empty database, and tests an upgrade with retained data. Ordinary releases refuse destructive SQL. Use expand, backfill and contract phases; contraction is an explicit separate operation.

Before every production migration, `backup.mjs` obtains a Time Travel bookmark, exports SQL to a restricted temporary file outside the repository, encrypts it using random AES-256-GCM plus RSA-OAEP SHA-256, uploads it to private KV, reads it back and verifies SHA-256, then removes only that known temporary file. A failure stops migration. KV objects and manifests expire after 7 days. The public encryption key is safe to commit; its private counterpart is held outside the repository under the operator's restricted local storage. Keep an offline protected copy before replacing this machine. Losing that key loses the ability to decrypt these exports.

Platform Time Travel has its own retention window determined by the Cloudflare plan; do not confuse it with the 7-day encrypted export retention. Application request logging is disabled; provider infrastructure/security logs follow provider policy. Backup copies may temporarily contain expired sessions until their retention expires.

## Review

Run with Cloudflare authorization: `npm run moderate -- production list`, then `npm run moderate -- production hide <exact-id>` or `approve <exact-id>`. In a proxy environment use `node --use-env-proxy scripts/moderate.mjs ...`. The list prints message bodies only to the operator terminal; never run it in CI, paste it into issues, or capture it in public build logs. Read exposure/report counts are operational only and never returned by content APIs.

Rules are deterministic and deliberately small. They catch common links, contact details, repetition, control characters and a short prohibited phrase list in English/Chinese. They do not understand every language or context and are not a complete harmful-content classifier. Rule exceptions leave content pending. Review reports regularly. Session-based reports are not proof of independent people; short-lived sessions and IP limits reduce abuse but cannot defeat distributed attackers.

## Recovery

Code regression: choose a known compatible Worker version and roll back code, leaving schema in place. Data repair: prefer a reviewed forward migration.

Database restore is a destructive incident action, never part of automatic release. Pause writes, verify maintenance behavior, record the affected time range and expected data loss, and approve one exact bookmark. The operator then sets `DRIFT_WRITES_PAUSED_CONFIRMED=yes` and `DRIFT_INCIDENT_APPROVAL=restore:<database-id>:<bookmark>` and runs `node scripts/restore.mjs production <bookmark> <database-id>`. The script backs up current state before restoring and removes expired session records afterwards. Validate integrity, foreign keys, schema, representative message counts and two independent anonymous sessions before resuming writes. Rehearse on an isolated synthetic database first.

## Capacity

Sampling uses weighted reservoir selection over all eligible rows in pages of 500, not an arbitrary candidate subset. Its work is O(N) rows per draw and O(500) memory. Cost grows with the pool. Free-tier subrequest/CPU/read limits can therefore become the bottleneck. Measure the actual pool, watch provider metrics, and report limits; never silently reduce fairness or upgrade a paid plan. A large future pool may need a maintained sampling index designed and verified separately.

`node scripts/capacity.mjs` runs only against synthetic in-memory local D1, using V8 sampling and D1 result metadata. The initial measurements show 2,006 rows read at 1,000 candidates and 10,006 at 5,000. Local measured CPU includes instrumentation and runtime overhead; consult hosted metrics before judging free-tier headroom. No claim of capacity at arbitrary pool sizes is made.

## Sources

- [Cloudflare GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Preview configuration and resource isolation](https://developers.cloudflare.com/workers/previews/resources/)
- [D1 Time Travel and destructive restore behavior](https://developers.cloudflare.com/d1/reference/time-travel/)
