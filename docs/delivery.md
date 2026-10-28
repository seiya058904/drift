# Delivery evidence

**Live:** https://drift.seiya-api.workers.dev — public production verification passed on October 28, 2026 (Asia/Singapore). Source: [seiya058904/drift](https://github.com/seiya058904/drift). The GitHub About Website points to the verified production URL.

## Verified production release

| Item | Evidence |
| --- | --- |
| Application source | `bf90da3722684099602cafac8a4a24aeab9a3eac`, protected squash merge of [PR #1](https://github.com/seiya058904/drift/pull/1) |
| Required main CI | [40717488365](https://github.com/seiya058904/drift/actions/runs/40717488365), passed typecheck, lint, 19 unit/D1/security/release tests, migrations, build and 7 browser flows |
| Official Git build | `995f067a-ec3a-417a-b90b-f9c10392c4ba`, automatically triggered by the main push, succeeded |
| Worker deployment | `bf4a5b1e-fe7d-41cc-aca8-667c6e9507da` |
| Worker version | `0d8d3e9c-5c9c-4283-8064-a391cc65827d`, 100% traffic |
| Production D1 | `bbf016b2-a18b-46a7-ab10-79ac011bb2f1`, `0001_initial.sql` |
| Cleanup schedule | `17 * * * *` |
| Pre-migration backup | Encrypted export uploaded and read back from private KV, 645 bytes; bookmark and seven-day retention manifest remain in private storage |
| Public smoke | [Receipt](evidence/production-smoke.json); two independent browser contexts passed |
| Acceptance bottle | `b53867ba206ee6238cec06342f8f12c1`, hidden after verification; exposure_count=1, report_count=1 |

This records the first verified application deployment. Follow-up release-safety and documentation commits use the same protected PR, exact-SHA CI and official Git build path; their current status is visible in GitHub and Cloudflare.

## Preview and release safeguards

- Production and preview D1 IDs are distinct; preview uses `fb11421f-9bf0-4b68-a09d-58411a5ee032`. Independent production and preview SESSION_SECRET/IP_SECRET bindings are provisioned.
- [PR #1 preview](https://feat-drift-drift.seiya-api.workers.dev) used one exact Origin. Automatic build `9b256458-c181-44cf-b913-b107606213b5` passed for `fb77dd72fbe3dd08d3466f28e8d0703bfdd3b74e`. Cloudflare posted the actual preview URL on the PR.
- [Preview smoke receipt](evidence/preview-smoke.json) covers two sessions and real D1. All three synthetic preview bottles are hidden. One preliminary message's numeric timestamp was caught by the contact rule; another test expectation was corrected to accept the API's JSON 405 for GET on a POST-only endpoint.
- The production database received only one acceptance bottle, through the public UI. No seed, reset or test dataset was run against production.
- Main requires an up-to-date PR and GitHub Actions `verify`, with administrator enforcement. Actions verifies only; Cloudflare Git builds deploy.
- Stale-build rejection was observed in real build `f446cbd5-f180-4315-acbe-3d7402aa45ff`, which stopped before publication after its branch HEAD moved.
- A disabled preview route revealed that an echoed Origin was insufficient deployment proof. The release now checks authoritative enabled URL fields; the regression rejects empty URLs and echoed bindings.
- The first production clone lacked `origin/main`. CI had independently verified migrations, and the initial production schema was empty. The follow-up release fetches the baseline explicitly and refuses a missing baseline; its regression verifies failure without a Git reference. Local typecheck, lint, six release/migration gate tests and the one-file upgrade check passed.
- Production uses a separate operations database for atomic release locks. Failed backups, migrations, checks or changed HEAD prevent publication. No paid plan or domain purchase was enabled.

## Browser and security validation

The public flow was home -> write -> successful send -> independent visitor finds and opens -> report -> no second draw of the same bottle. Author exclusion, plain-text HTML display, secure host-only Cookie attributes, JSON/no-store API errors, exact-Origin rejection, missing CSRF rejection, incorrect content type, 500-character Unicode limits and keyboard dismissal passed. Viewports: 360, 390, 768 and 1440 pixels. Production smoke captured no JavaScript or console errors.

The automated seven-flow suite additionally covers 200% zoom, WCAG AA automated checks, retained drafts after failed submission, API-gated and skippable rituals, optional animation download failure, live reduced-motion changes, audio/atmosphere controls, a real shared-cookie renewal across tabs and recovery from expired draws. Both automated PR review findings were fixed and resolved after CI passed.

Browser plugin was unavailable; the existing project Playwright installation was used. These are Chromium browser simulations on Windows and hosted Chromium on Ubuntu, not physical phone tests. The real production desktop and mobile screenshots were visually inspected for composition, wrapping, readable paper text and clipping. The smaller mobile ocean preserves the painted scene while avoiding offscreen landscape transfer.

## Performance and capacity

| Measurement | Interactive | LCP | CLS |
| --- | ---: | ---: | ---: |
| Earlier local baseline | 1.19 s | 2.30 s | 0.0075 |
| Optimized public preview | 1.93 s | 2.70 s | 0.0075 |
| Production | 1.72 s | 2.55 s | 0.0078 |
| Target | <3 s | <=2.5 s | <0.1 |

Three cold-cache runs per measurement: 390x844 @1x, 4x CPU slowdown, 1.6 Mbps down / 750 Kbps up / 150 ms simulated latency. Public measurements include the workstation's local network proxy. Production LCP misses its target by 52 ms; one run had a 7.26-second LCP and remains in the raw evidence. No field-performance guarantee is claimed. [Production raw results](evidence/production-performance.json), [preview results](evidence/preview-performance.json), [local baseline](evidence/performance.json).

Portrait ocean transfer fell from 316,632 to 104,772 bytes; observed total initial transfer fell from about 531 KB to 319 KB. Desktop art is unchanged.

[Local capacity profiling](evidence/capacity.json) measured 5/6/8/16 D1 statements and 6/205/2006/10006 rows read at 0/100/1000/5000 eligible bottles. Sampled V8 time includes the local wrapper and is not hosted CPU billing. Sampling is O(N); hosted CPU/read capacity at a large real pool remains unverified, and no paid upgrade was made.

## Recovery and remaining limits

The [isolated remote Time Travel rehearsal](evidence/recovery-drill.json) restored synthetic data successfully. Production was never restored. Encrypted backups, private key handling, seven-day retention, destructive restore approvals, moderation commands and privacy limitations are documented in [operations](operations.md).

Remaining: physical phone/soft-keyboard testing, field performance across devices/networks, larger-pool hosted CPU/read profiling, and ongoing human review of reported content. Rule-based moderation and anonymous session limits do not establish verified identity or eliminate distributed abuse.
