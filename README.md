<p align="center">
  <img src="docs/readme-cover.svg" width="1200" alt="Drift: an illustrated glass bottle carrying a note across a quiet sea" />
</p>

# Drift

*Some words are meant to drift.*

A quiet, anonymous sea for a thought, a secret, a little hope. Cast a message in a bottle. Open a message left by a stranger. No accounts, replies, followers, history or read receipts.

**Live:** [drift.seiya-api.workers.dev](https://drift.seiya-api.workers.dev). Published through official Cloudflare Git builds and verified with two independent anonymous browser sessions. This public repository is the only source repository.

![Drift on desktop](docs/evidence/production-home-1440.png)

<p align="center"><img src="docs/evidence/production-home-390.png" width="280" alt="Live Drift on a 390-pixel mobile viewport"/> <img src="docs/evidence/write-390.png" width="280" alt="The paper composer on mobile"/></p>

## A small moment of connection

- Write in English, Chinese or any Unicode text, up to 500 characters. Messages render as plain text.
- Fold, seal and cast your bottle; watch another drift ashore and unfold. Rituals begin only after API success and can be skipped.
- Each opened bottle leaves your draw pool for the rest of your anonymous 24-hour session. You can find other bottles during that visit, and your own submissions stay out of the pool.
- Report harmful content. Three distinct sessions' reports pause a bottle for local operator review.
- Managed Cloudflare Turnstile protects sending and reporting. It loads only in those forms; browsing and finding bottles remain challenge-free. Verification errors retain your draft.
- Ocean sound is opt-in and synthesized locally. Turn atmosphere off, use the keyboard, or rely on your device's reduced-motion preference. Background tabs pause sound and movement.

The watercolor sea and transparent glass bottle were created for Drift. All interface text is native HTML. [Design and asset provenance](docs/design/assets.md).

## Run locally

Requires Node 24 and npm. No Cloudflare API credentials are needed for local tests. The local browser suite uses an isolated Siteverify fixture; manual local sending/reporting requires the preview Turnstile secret in ignored `.dev.vars.local` (see [operations](docs/operations.md)).

For AI agents and maintainers: start with [AGENTS.md](AGENTS.md), then use the [maintenance guide](docs/maintenance.md) for scoped checks, artifact handling and release verification.

```sh
npm ci
npm run db:local
npm run build
npm run dev:api
# In a second terminal:
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies relative `/api/*` requests to the local Worker. To use the built static app directly, run Wrangler with `--var ALLOWED_ORIGIN:http://127.0.0.1:8787`. Local cookies intentionally use a non-production name over loopback HTTP.

```sh
npx playwright install chromium
npm run verify
```

`verify` is the same gate used by GitHub Actions: documentation paths, typecheck, lint, unit/D1 tests, migration checks and E2E. E2E builds the app and starts an isolated local Worker. Migration checks require `origin/main`; see the maintenance guide if the reference is missing. New screenshots and traces go to ignored `artifacts/e2e/`; reviewed evidence in `docs/evidence/` stays unchanged during routine runs.

Tests use independent local databases. Browser flows cover 360, 390, 768 and 1440px, keyboard/focus, Unicode length, plain-text injection protection, independent anonymous contexts, expired draws, cross-tab session renewal, reduced motion, accessibility and verification failure/retry behavior. Local mobile simulation measured 1.19s to interactive, 2.30s LCP and 0.0075 CLS ([baseline](docs/evidence/performance.json)). After adding a smaller portrait ocean asset, production mobile simulation measured **1.72s interactive, 2.55s LCP and 0.0078 CLS**; LCP narrowly misses the 2.5s target. All three runs, including a 7.26s LCP outlier, are retained in the [production results](docs/evidence/production-performance.json). These cold-cache, throttled Chromium measurements include this workstation's network proxy; they are not physical-device or field measurements.

## Architecture

React + TypeScript + Vite, CSS design tokens, lazy GSAP rituals and native Web Audio. A single Cloudflare Worker serves Static Assets and JSON APIs. The API namespace never falls through to SPA HTML.

| Route | Purpose |
| --- | --- |
| `GET /api/bootstrap` | Issue a signed short-lived cookie and bound CSRF token; no database write |
| `GET /api/turnstile` | Return only the public widget site key, without creating a session |
| `POST /api/session` | Initialize anonymous session after exact-Origin and CSRF checks |
| `POST /api/bottles` | Idempotent submission and fail-closed rule moderation |
| `POST /api/draw` | Weighted candidate selection; return only a five-minute credential |
| `POST /api/open` | Recheck approval, consume credential and count exposure atomically |
| `POST /api/report` | Record one report per opened bottle/session |

D1 stores messages, expiring sessions, draw credentials, deduplication records and rate limits. Sampling traverses every eligible candidate with weight `1 / (1 + exposure_count)^1.5`. D1 triggers ensure concurrent and repeated opens count only once. Exposure counts never reach the browser.

All mutations require POST, JSON, exact Origin and a session-bound CSRF token. Remote cookies use `__Host-`, HttpOnly, Secure, SameSite=Strict and Path=/. Content responses use no-store. Raw IP addresses are not stored; a daily rotating keyed hash supports IP limits. Anonymous session links expire after 24 hours and are cleaned hourly. Drift has no audience analytics or persistent visitor profile. Turnstile processes browser/network signals for abuse prevention; protected handlers verify success, action and the exact configured hostname before creating a bottle or report.

## Release, moderation and recovery

[Operations guide](docs/operations.md) covers actual environments, Cloudflare Git integration, immutable migrations, encrypted seven-day backups, operator review, release locks, incident recovery and scale limits. [Delivery evidence](docs/delivery.md) records actual checks and outstanding validation.

GitHub Actions verifies only. Official Cloudflare Git builds deploy only after the exact commit passes required checks. Preview and production have separate D1 bindings, secrets and Origins. Stale commits, failed checks, failed backups and failed migrations block deployment. Production never receives seeds or test suites.

```sh
npm run moderate -- production list
npm run moderate -- production hide <exact-bottle-id>
npm run moderate -- production approve <exact-bottle-id>
```

These operator commands require Cloudflare credentials. Never capture message review output in public CI logs. Rule-based moderation is limited and requires human review of reports. Anonymous sessions are not verified identities.

Database restore is explicitly destructive and requires incident approval, paused writes, a fresh backup and an acknowledged data-loss window. It is never triggered automatically. The isolated Time Travel rehearsal succeeded; [evidence](docs/evidence/recovery-drill.json).
