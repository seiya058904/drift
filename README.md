<p align="center">
  <a href="https://drift.seiya-api.workers.dev">
    <img src="docs/readme-cover.svg" width="1200" alt="Drift: an illustrated glass bottle carrying a note across a quiet sea" />
  </a>
</p>

<a name="drift"></a>

<h1 align="center">🌊 Drift</h1>

<p align="center"><em>Some words are meant to drift.</em></p>

<p align="center">
  A quiet, anonymous sea for a thought, a secret, a little hope.<br />
  Cast a message in a bottle. Discover words left by a stranger.
</p>

<p align="center">
  <sub>No accounts · No replies · No followers · No history · No read receipts</sub>
</p>

<p align="center">
  <a href="https://drift.seiya-api.workers.dev"><strong>Visit the sea →</strong></a>
  &nbsp;·&nbsp;
  <a href="#a-small-moment-of-connection">The experience</a>
  &nbsp;·&nbsp;
  <a href="#a-glimpse-of-the-shore">A glimpse</a>
  &nbsp;·&nbsp;
  <a href="#run-locally">Run locally</a>
  &nbsp;·&nbsp;
  <a href="#architecture">Architecture</a>
</p>

<a name="a-small-moment-of-connection"></a>

## ✉️ A small moment of connection

| ✍️ Cast a thought | 🐚 Find a bottle |
| :--- | :--- |
| Write in English, Chinese or any Unicode text, up to **500 characters**. Your words render as plain text. | Open a message left by a stranger. Each opened bottle leaves your draw pool for the rest of your **24-hour anonymous session**. |

You can keep finding other bottles during your visit. Your own submissions stay out of your draw pool.

- **A little ritual.** Fold, seal and cast your bottle; watch another drift ashore and unfold. Rituals begin only after API success and can be skipped.
- **At your own pace.** Ocean sound is opt-in and synthesized locally. Turn atmosphere off, use the keyboard, or rely on your device's reduced-motion preference. Background tabs pause sound and movement.
- **Care for the shared sea.** Report harmful content. Three distinct sessions' reports pause a bottle for local operator review.
- **Protection where it matters.** Managed Cloudflare Turnstile protects sending and reporting. It loads only in those forms; browsing and finding bottles remain challenge-free. Verification errors retain your draft.

<a name="a-glimpse-of-the-shore"></a>

## 🖼️ A glimpse of the shore

<p align="center"><em>A wide horizon. A small note. A moment to yourself.</em></p>

![Drift on desktop](docs/evidence/production-home-1440.png)

<p align="center"><sub>The shoreline on desktop · Recorded at a 1440px viewport</sub></p>

<p align="center">
  <img src="docs/evidence/production-home-390.png" width="280" alt="Live Drift on a 390-pixel mobile viewport" />
  &nbsp;
  <img src="docs/evidence/write-390.png" width="280" alt="The paper composer on mobile" />
</p>

<p align="center"><sub>The shoreline and the paper composer · Recorded at a 390px viewport</sub></p>

The watercolor sea and transparent glass bottle were created for Drift. All interface text is native HTML. [Design and asset provenance](docs/design/assets.md).

<a name="run-locally"></a>

## 🛠️ Run locally

Requires Node 24 and npm. No Cloudflare API credentials are needed for local tests. The local browser suite uses an isolated Siteverify fixture; manual local sending/reporting requires the preview Turnstile secret in ignored `.dev.vars.local` (see [operations](docs/operations.md)).

For AI agents and maintainers: start with [AGENTS.md](AGENTS.md), then use the [maintenance guide](docs/maintenance.md) for scoped checks, artifact handling and release verification.

### 1. Start the API

```sh
npm ci
npm run db:local
npm run build
npm run dev:api
```

### 2. Start the interface

Keep the API server running. In a **second terminal**, from the same repository root:

```sh
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies relative `/api/*` requests to the local Worker. To use the built static app directly, run Wrangler with `--var ALLOWED_ORIGIN:http://127.0.0.1:8787`. Local cookies intentionally use a non-production name over loopback HTTP.

### 3. Run the checks

In a third terminal, from the same repository root:

```sh
npx playwright install chromium
npm run verify
```

`verify` is the same gate used by GitHub Actions: documentation paths, typecheck, lint, unit/D1 tests, migration checks and E2E. E2E builds the app and starts an isolated local Worker. Migration checks require `origin/main`; see the maintenance guide if the reference is missing. New screenshots and traces go to ignored `artifacts/e2e/`; reviewed evidence in `docs/evidence/` stays unchanged during routine runs.

Tests use independent local databases. Browser flows cover 360, 390, 768 and 1440px, keyboard/focus, Unicode length, plain-text injection protection, independent anonymous contexts, expired draws, cross-tab session renewal, reduced motion, accessibility and verification failure/retry behavior.

Production mobile simulation recorded **2.55s LCP**, just above the 2.5s target. Physical-device and field performance remain unverified.

<details>
<summary><strong>Performance measurements and test conditions</strong></summary>

Local mobile simulation measured 1.19s to interactive, 2.30s LCP and 0.0075 CLS ([baseline](docs/evidence/performance.json)). After adding a smaller portrait ocean asset, production mobile simulation measured **1.72s interactive, 2.55s LCP and 0.0078 CLS**; LCP narrowly misses the 2.5s target. All three runs, including a 7.26s LCP outlier, are retained in the [production results](docs/evidence/production-performance.json). These cold-cache, throttled Chromium measurements include this workstation's network proxy; they are not physical-device or field measurements.

</details>

<a name="architecture"></a>

## ⚙️ Under the surface

React + TypeScript + Vite, CSS design tokens, lazy GSAP rituals and native Web Audio. A single Cloudflare Worker serves Static Assets and JSON APIs. The API namespace never falls through to SPA HTML.

<details>
<summary><strong>Architecture: API routes, storage and privacy</strong></summary>

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

</details>

<a name="release-moderation-and-recovery"></a>

## 🛟 Release, moderation and recovery

Published through official Cloudflare Git builds and verified with two independent anonymous browser sessions. This public repository is the only source repository.

[Operations guide](docs/operations.md) covers actual environments, Cloudflare Git integration, immutable migrations, encrypted seven-day backups, operator review, release locks, incident recovery and scale limits. [Delivery evidence](docs/delivery.md) records actual checks and outstanding validation.

GitHub Actions verifies only. Official Cloudflare Git builds deploy only after the exact commit passes required checks. Preview and production have separate D1 bindings, secrets and Origins. Stale commits, failed checks, failed backups and failed migrations block deployment. Production never receives seeds or test suites.

<details>
<summary><strong>Operator workflow and recovery</strong></summary>

```sh
npm run moderate -- production list
npm run moderate -- production hide <exact-bottle-id>
npm run moderate -- production approve <exact-bottle-id>
```

These operator commands require Cloudflare credentials. Never capture message review output in public CI logs. Rule-based moderation is limited and requires human review of reports. Anonymous sessions are not verified identities.

Database restore is explicitly destructive and requires incident approval, paused writes, a fresh backup and an acknowledged data-loss window. It is never triggered automatically. The isolated Time Travel rehearsal succeeded; [evidence](docs/evidence/recovery-drill.json).

</details>

---

<p align="center">
  <em>Leave a little kindness. Let the sea do the rest.</em><br />
  <a href="https://drift.seiya-api.workers.dev"><strong>Return to the sea →</strong></a>
  &nbsp;·&nbsp;
  <a href="#drift">Back to top ↑</a>
</p>
