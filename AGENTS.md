# Working in Drift

Live anonymous message-in-a-bottle site. Start with [README](README.md), [maintenance](docs/maintenance.md) (checks & closeout), and [operations](docs/operations.md) before cloud/moderation/migration/recovery work ([Delivery](docs/delivery.md) is dated evidence, not live state). Use `codex/` for new work branches. Inspect `git status` before editing and keep unrelated user changes isolated.

## Contracts
- English UI; plain-text Unicode bottles; no accounts, replies, history, social graph, or read receipts. Read thresholds from `worker/rules.ts`.
- Ritual success follows real API success; retain reduced motion, keyboard support, sound opt-in, and background pause.
- `/api/*` never returns SPA HTML; preserve Origin, CSRF, secure cookies, `no-store`, idempotency, anonymous dedup, and atomic exposure/report counts. Only approved bottles enter the pool; never expose operational counts.
- Turnstile gates submissions/reports with real Siteverify + exact action/hostname checks. **Never deploy test transports, dummy keys, or fail-open flags**; mocks stay under `tests/`, production entry stays `worker/index.ts`.
- Keep production and preview DBs, secrets, and Origins separate; never edit applied migrations or weaken release gates.

## Checks, Authorization & Cleanup
- Node 24; `npm run verify` runs docs links, types, lint, unit/D1 tests, migration checks, and local-Worker E2E (no cloud creds; never point tests at production).
- `npm run check:migrations` needs `origin/main`: fetch only if authorized, otherwise report check as blocked (never treat as empty schema).
- **Release path & authorization**: official Cloudflare Git builds only (GitHub Actions verifies only) — never deploy manually or bypass protected `main`. Ordinary live inspection is read-only; pushes, merges, publishing, remote/secret config changes, and live smoke writes/imports require explicit user authorization (repo docs alone grant none) plus exact IDs.
- **Protected content & evidence**: the 15 editorial opening bottles published 2026-10-29 (Singapore) are real user-authorized content — never classify as test residue or hide them. Never overwrite `docs/evidence/` during routine runs; preserve `.wrangler/state`, migrations, design originals, and `docs/backup-public.pem` (intentional public key; private key stays outside repo). Never print credentials, raw IPs, tokens, or visitor messages in public evidence.
