# Operations

For local checks, generated files and AI handoff, see [maintenance](maintenance.md). Resource IDs and historical receipts must be verified against live account state before claiming a current deployment.

## Environments

`deployment.json` records actual resource IDs. Production and preview D1 IDs must differ. Local/CI uses Miniflare or Wrangler local D1 only. The application has no remote seed/reset command. Synthetic fixtures are confined to tests and preview.

Production: `drift-production`. Shared trusted PR previews: `drift-preview`. `drift-operations` holds only the atomic release lock, with no user content. The private `drift-backups` KV namespace holds encrypted database exports with a 604800-second TTL. No paid plan is enabled by these scripts.

The operations database is bootstrapped once with `CREATE TABLE release_lock (name TEXT PRIMARY KEY, owner TEXT NOT NULL, acquired_at INTEGER NOT NULL)`. This table is independent of application migrations, allowing even the first application migration to run under a lock. A crashed build leaves its lock in place; confirm the matching build has stopped before deleting that exact lock row. Never auto-expire a deployment lock.

## Only release path

GitHub Actions only verifies. The `verify` job is required on protected `main`; admins are also subject to PR and up-to-date checks. Cloudflare's official GitHub integration builds with `npm run build`, then runs `npm run release` for main and `npm run release:preview` for trusted in-repository branches. Never run app deployment from Actions.

Release checks the exact `WORKERS_CI_COMMIT_SHA` against local HEAD and GitHub Actions app check runs. A pending check waits up to 12 minutes; failed, missing, timed-out or wrong-SHA checks block deployment. Production requires current main HEAD. A D1 lock serializes migration/deployment; HEAD is checked again immediately before upload. Use a user-scoped read token for GitHub build gates if shared unauthenticated rate limits are exhausted; failure to query checks blocks deployment.

Workers Builds may check out a detached commit without `origin/main`. The release fetches that reference explicitly before migration checks; a missing baseline now fails closed instead of being treated as an initial empty schema. Publication verifies Cloudflare's enabled URL fields, not an Origin string echoed in deploy output. Enable the parent's preview URL route before the first preview build. The Builds production automation switch and Worker Previews switch are both enabled; a push-triggered preview and production release have been verified.

Cloudflare's build token needs Workers Scripts edit, D1 edit (production, preview and operational DBs) and KV edit for the private backup namespace. Runtime Workers receive only their own D1 binding and independent SESSION_SECRET/IP_SECRET. Build secrets are not runtime vars. Never expose them via VITE_ variables.

The Preview block explicitly binds preview D1. Each build sets one exact preview origin from the normalized branch name (`https://<branch>-drift.seiya-api.workers.dev`), never `*.workers.dev`. Confirm the returned actual URL equals the configured origin. Preview base secrets must be independent of production secrets. Fork PRs must not receive build credentials; review and copy to a trusted branch before previewing. For incompatible schema work, provision an isolated preview database and update both binding and migration target; if quota is unavailable, block that preview.

After creating the Worker resource, run `node scripts/provision-secrets.mjs` once with the operator's restricted secret file. It uploads independent production and Preview base secrets through Wrangler stdin, without logging values. This is infrastructure configuration; app publication still belongs exclusively to official Git builds.

## Turnstile

Managed widgets protect `submit_bottle` -> `POST /api/bottles` and `report_bottle` -> `POST /api/report`. Home, find and read do not load Turnstile. The script is loaded directly from Cloudflare only when a protected form opens; CSP permits that exact provider for script/frame/connect sources. Privacy copy describes the third-party browser/network processing; Siteverify receives no message text or explicit raw-IP parameter.

Production uses public site key `0x4AAAAAAFp0juRdrGtrEok6` for `drift.seiya-api.workers.dev`. Preview uses independent key `0x4AAAAAAFp0jxPCcQQyzbtn`, currently registered for `codex-turnstile-drift.seiya-api.workers.dev`, `localhost` and `127.0.0.1`. Before testing a future preview branch, add its exact hostname to the preview widget within the free hostname quota. Never enable all `workers.dev` hosts. `ALLOWED_ORIGIN` supplies the single expected hostname for each backend; a preview/local token cannot satisfy production's host check.

Both `TURNSTILE_SECRET` values live in Cloudflare Secrets: production Worker `drift` and its Preview base configuration. Only public site keys belong in `wrangler.jsonc`. Release checks require the secret binding and separate real site keys before acquiring the deployment lock. Rotate or provision through authenticated Cloudflare tooling without printing values. Preserve independent SESSION_SECRET/IP_SECRET bindings when updating preview base configuration. A new secret binding is not proof of matching key/value; verify through the real protected endpoint.

Manual local forms use the preview widget. Store its matching secret as `TURNSTILE_SECRET` in ignored `.dev.vars.local`, after verifying `git check-ignore .dev.vars.local`; never use the production secret locally. Without this file, protected local operations fail closed. `npm run verify` needs no real secret: API tests intercept outbound Siteverify and browser tests explicitly launch `tests/e2e/worker.ts`, with mock script/token fixtures. Neither transport is in the production bundle. Mock test passes do not establish that a live Cloudflare challenge works.

Tokens last five minutes and are single-use. A fresh mutation must pass Siteverify; completed submit/report retries return the existing result. Verification retries use a bounded timeout and a stable UUID derived from session, action, operation, payload and token; replaying the token for a different operation fails. A failed attempt/expired widget clears its token and offers a fresh challenge while preserving the draft. Missing config, wrong hostname/action, rejected tokens and upstream failures never create a bottle or report.

For live acceptance, use a real browser and real tokens on the registered preview host: submit once, retry the same operation, reject token reuse with a new operation, and verify reporting independently. Do not bypass a challenge if the browser is blocked; complete it interactively or record that real validation is pending. Any authorized production smoke bottle must be tracked by exact ID and hidden afterwards. Confirm homepage/read stay challenge-free and inspect mobile layout; do not report automated browser simulations as physical-device tests.

The form shows the provider's six-digit error code when a challenge fails, without storing tokens or adding tracking. `110200` means the hostname is not authorized; `200500` means the iframe could not load; `300xxx`/`600xxx` are challenge failures and do not establish a site-key or backend fault. Compare the actual visitor's code before blaming their browser or network. Expiration and interaction timeouts require an explicit retry, preventing automatic timeout loops. A 45-second progress timeout provides a retry when the provider stalls; it pauses while the visitor is completing an interactive check. Preserve the draft and fail closed throughout. Do not weaken verification or change operating-system/proxy settings to make acceptance pass.

References: [server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [widget configuration](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/), [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/), [CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/), [free plan](https://developers.cloudflare.com/turnstile/plans/). The installed Cloudflare Turnstile Spin skill supplies the setup workflow; this section records Drift's concrete integration and maintenance contract.

## Migrations and backups

Ordered SQL files are immutable after main. `check-migrations.mjs` compares them with main, creates an empty database, and tests an upgrade with retained data. Ordinary releases refuse destructive SQL. Use expand, backfill and contract phases; contraction is an explicit separate operation.

Before every production migration, `backup.mjs` obtains a Time Travel bookmark, exports SQL to a restricted temporary file outside the repository, encrypts it using random AES-256-GCM plus RSA-OAEP SHA-256, uploads it to private KV, reads it back and verifies SHA-256, then removes only that known temporary file. A failure stops migration. KV objects and manifests expire after 7 days. The public encryption key is safe to commit; its private counterpart is held outside the repository under the operator's restricted local storage. Keep an offline protected copy before replacing this machine. Losing that key loses the ability to decrypt these exports.

These encrypted exports are release-triggered; there is no daily backup timer. During periods without releases, verify backup recency rather than assuming seven-day retention guarantees a recent export. A scheduled backup would require separate configuration and verification.

Platform Time Travel has its own retention window determined by the Cloudflare plan; do not confuse it with the 7-day encrypted export retention. Application request logging is disabled; provider infrastructure/security logs follow provider policy. Backup copies may temporarily contain expired sessions until their retention expires.

## Review

Run with Cloudflare authorization: `npm run moderate -- production list`, then `npm run moderate -- production hide <exact-id>` or `approve <exact-id>`. In a proxy environment use `node --use-env-proxy scripts/moderate.mjs ...`. The list prints message bodies only to the operator terminal; never run it in CI, paste it into issues, or capture it in public build logs. Read exposure/report counts are operational only and never returned by content APIs.

Rules are deterministic and deliberately small. They catch common links, contact details, repetition, control characters and a short prohibited phrase list in English/Chinese. They do not understand every language or context and are not a complete harmful-content classifier. Rule exceptions leave content pending. Review reports regularly. Session-based reports are not proof of independent people; short-lived sessions and IP limits reduce abuse but cannot defeat distributed attackers.

On 2026-10-29 (Asia/Singapore), the owner explicitly authorized 15 editorial opening bottles: eight Chinese and seven English, signed as Drift opening messages. They passed the current moderation rules and were imported once, with batch marker `editorial_opening_2026_10_29`; normal visitor limits were unchanged. They are intended public content, not test fixtures. The exact-ID receipt is held in the operator's external Drift storage. Future imports or removal need task authorization; do not run bulk seeds or auto-hide this batch during maintenance.

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
