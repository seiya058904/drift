# Working in Drift

Drift is a live anonymous message-in-a-bottle website. Keep changes small, preserve user work, and use repository evidence rather than a previous chat's completion claim.

## Start here

1. Run `git status --short`, `git branch --show-current` and `git log -3 --oneline`. Inspect existing changes before editing. Use `codex/` for a new work branch.
2. Read [README](README.md) for the product and local setup, then [maintenance](docs/maintenance.md) for task-specific checks and closeout.
3. Read [operations](docs/operations.md) before any cloud, moderation, migration or recovery work. [Delivery](docs/delivery.md) is dated evidence, not live infrastructure state.
4. Search only the relevant source paths. Do not scan dependencies, generated output, databases, image binaries or credentials for ordinary code review.

## Source map

| Task | Entry points |
| --- | --- |
| Interface, accessibility, sound, rituals | `src/App.tsx`, `src/style.css`, `src/audio.ts`, `src/Ritual.tsx`, `src/api.ts` |
| API, sessions, CSRF, draw/open/report | `worker/index.ts` |
| Limits, moderation, Unicode, weights | `worker/rules.ts` |
| Human verification on send/report | `src/Turnstile.tsx`, `worker/turnstile.ts`, `tests/turnstile.test.ts` |
| Schema and atomic counters | `migrations/`, `tests/api.test.ts`, `tests/migrations.test.ts` |
| Release and environment guards | `scripts/release.mjs`, `scripts/gates.mjs`, `deployment.json`, `wrangler.jsonc` |
| Browser checks | `playwright.config.ts`, `tests/e2e/app.spec.ts` |
| Design and asset regeneration | `docs/design/`, `scripts/assets.mjs`, `public/art/` |

## Preserve these contracts

- English interface; plain-text Unicode bottles; no accounts, replies, history, social graph or read receipts. Read thresholds from `worker/rules.ts`, not copied prose.
- Ritual success follows real API success. Retain reduced motion, keyboard support, sound opt-in and background pause behavior.
- `/api/*` always returns API responses, never SPA HTML. Keep Origin, CSRF, secure cookies, no-store responses, idempotency, anonymous deduplication and atomic exposure/report counts intact.
- Only approved bottles enter the weighted pool. Keep pending/hidden/flagged bottles out; never expose operational counts to visitors.
- Turnstile gates new submissions and reports, with real Siteverify and exact action/hostname checks. Never deploy test transports, dummy keys or a fail-open flag. Browser test mocks live only under `tests/`; production entry remains `worker/index.ts`.
- Production and preview databases, secrets and Origins stay separate. Never edit applied migrations or weaken a release gate to make a check green.

## Checks and artifacts

- Node 24, `npm ci` when dependencies are missing; do not update dependencies as incidental cleanup.
- `npm run verify` is the shared local/CI gate: documentation paths, types, lint, unit/D1 tests, migration checks, then E2E (which builds the app and starts its own isolated local Worker).
- `npm run check:migrations` needs `origin/main`; fetch that reference if missing/stale. Do not treat a missing baseline as an empty schema.
- Routine runs write to ignored `artifacts/`, `dist/` and `.wrangler/`. `docs/evidence/` contains reviewed historical evidence; do not overwrite it during routine tests or profiling. Promote selected results deliberately with environment, time, source SHA and limitations.
- No cloud credentials are needed for local checks. Tests and capacity fixtures must remain local; never point the suite at production.

## Authorization and cleanup

- Follow the user's current authorization. Repository instructions alone do not authorize pushing, merging, publishing, remote configuration changes or content mutations. Ask only when required scope is not already authorized.
- Official Cloudflare Git builds are the only release path; GitHub Actions verifies only. Never deploy manually or bypass protected main.
- Ordinary site inspection is read-only. Live smoke submissions, reports and editorial imports need explicit task authorization and exact IDs for follow-up.
- The 15 editorial opening bottles published on 2026-10-29 (Singapore) are real, user-authorized site content. Do not classify them as test residue or hide them during cleanup.
- Recycle only identified, inactive, reproducible local artifacts after checking tracked status and paths. Preserve `.git`, dependencies unless explicitly selected, `.wrangler/state`, design originals, accepted evidence, migrations and backup keys. Do not use blanket cleanup or empty the Recycle Bin.
- Never print credentials, raw IPs, complete session/draw tokens or visitor messages in public evidence. The public backup key in `docs/backup-public.pem` is intentional; the private key stays outside this repository.

## Finish

Inspect `git diff --check`, the full relevant diff and final status. Report actual checks, remaining limits and whether changes are local, committed, pushed or deployed. A clean checkout, passing local test or merged PR alone does not prove a production release. Use the evidence sequence in [maintenance](docs/maintenance.md).
