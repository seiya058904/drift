# Delivery evidence

Status: local implementation complete; cloud integration and public verification in progress. No unverified URL is presented as a live site.

Workspace: `D:\xia zai\AI project\Project in Iteration\drift`. The original empty `1` directory is held open by the host process; direct rename failed with a Windows sharing violation. It remains empty and was not deleted. Source was created in the new sibling `drift` directory without overwriting anything.

## Verified locally

- TypeScript, ESLint, production build.
- 17 unit/integration cases: moderation/Unicode, weighted distribution (100,000 seeded samples), a >500-row pool, author/open exclusion, expiration, revalidation, idempotency, simultaneous duplicate text, eight concurrent opens, report threshold/dedup, session+IP rate limits, Origin/CSRF/content-type/cookie checks, scheduled cleanup, backup cryptography and release gates including failed backup/migration suppression.
- 5 Playwright flows: responsive layout at 360/390/768/1440, keyboard Escape/focus return, 200% zoom, long Unicode text, WCAG AA automated checks in composer, two independent anonymous contexts, plain text injection, API errors preserving drafts, reduced motion, sound/atmosphere controls, success-gated rituals, live reduced-motion changes and optional animation download failure. The final fifth case passed on GitHub Actions; local browser suites were stopped to reduce workstation load.
- Chrome extension browser: local page identity and rendered content confirmed, Cast a bottle opens composer, no relevant console errors. Automated repeatable multi-context tests use project Playwright as requested by the plan.
- `view_image` inspection of concept, desktop/mobile home and mobile composer: consistent headline, action hierarchy, palette, painted ocean, lower-right bottle, paper texture/spacing and mobile stacking. Added helper text and flat paper edge are documented design adaptations. Homepage copy matches reference.
- Fixed mobile simulation: 390×844 @1x, 4× CPU slowdown, cold cache, 1.6Mbps down / 750Kbps up / 150ms latency, three runs. Median interactive 1189ms, LCP 2304ms, CLS 0.00748. [Raw results](evidence/performance.json).
- Private KV encrypted backup upload/readback verified; pre-migration production bookmark retained in private backup manifest. No SQL export or private key committed.
- Isolated remote D1 restore rehearsal passed: synthetic value `after` restored to `before`. [Evidence](evidence/recovery-drill.json). Production was not restored.
- Local workerd capacity profiling at 0/100/1000/5000 eligible bottles: 5/6/8/16 D1 statements and 6/205/2006/10006 rows read per draw. Sampled active V8 time was 9.79/15.67/21.17/43.12ms per draw including the local runtime and measurement wrapper. This is not hosted CPU billing or a guarantee of free-tier capacity. [Raw results](evidence/capacity.json).

## Release record

- Verified application source: `1d9f643e1649862f76b03309ea0f304033a2a614` on `feat/drift`, [PR #1](https://github.com/seiya058904/drift/pull/1). Later documentation-only commits may follow this record.
- [Push checks passed](https://github.com/seiya058904/drift/actions/runs/40700016965); [PR checks passed](https://github.com/seiya058904/drift/actions/runs/40700029139). Typecheck, lint, 17 unit/integration tests, migration gates, build and all 5 browser flows passed on Ubuntu 24.04 / Node 24.
- `main` requires PRs, the GitHub Actions `verify` check and an up-to-date branch; admin enforcement is enabled. No application code has bypassed those rules.
- Cloudflare login works and isolated production, preview, operations and recovery-drill databases plus the private backup namespace exist. GitHub App installation is still required for the sole official deployment pipeline. **Not yet online.**
- Production/preview migrations, build/deployment IDs, real preview/production URLs and production smoke bottle IDs remain pending. No production test dataset has been inserted and GitHub About has no unverified Website URL.
- Local dev server and its four Node/workerd processes were stopped at the user's request, releasing about 274MB of observed process working sets. The local preview browser tab was closed; unrelated programs were left alone. Further full checks run in hosted CI where possible.

## Remaining validation

- Official Git integration installation and its production/preview build configuration.
- Exact remote preview origin/binding verification, public two-session smoke, deployment ID and current main parity.
- Real phone/soft keyboard and physical desktop hardware beyond this Windows workstation. Browser emulation is not claimed as physical-device verification.
- Worker CPU/reads at realistic production scale. The initial production database is empty; sampling cost grows with every eligible bottle and must be monitored. No paid tier has been enabled.
