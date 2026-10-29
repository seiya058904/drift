# Drift design specification

Reference: [concept.png](concept.png), generated with the built-in image generation tool. A four-state reference covers the desktop home, parchment composer, parchment reading view and mobile home. The implementation preserves its composition, content hierarchy and visual direction.

The canvas is slate blue (#182d3e), with a full-bleed hand-painted ocean, quiet sky behind the title, sunset at the left horizon, and one floating transparent bottle in the lower right. No tint overlay is applied to the painting. The dialog backdrop darkens the scene to make a single sheet of paper the focus.

Ivory foreground #fff4e1; paper #f6eedf; paper ink #213540; secondary ink #586066; warm gold #b18a46. Cormorant Garamond 400 and italic carry headings and prose. Inter 400/500 carries small interface text. Typefaces are self-hosted. Buttons use a 4px radius, 50px minimum height; icon controls and text links have at least 44px height. The paper sheet is at most 580px wide. Spacing steps: 8, 12, 16, 24, 32, 44, 52px.

Home copy: `drift`; `Some words / are meant to drift.`; `A thought, a secret, a little hope. / Send it out. See what finds you.`; `Cast a bottle`; `Find a bottle`; `No names. No replies. Just a moment shared.`; `About & privacy`.

At 390px the title wraps naturally into three lines, controls stack, the bottle sits below them, and the footer uses two lines. Dialogs use 24px outer gutters and scroll within the dynamic viewport. Close preserves an unsent draft in memory only. There are no extra sections, account controls or history.

Functional additions to the reference are the 500-character counter, kindness/privacy guidance, error and pending states, explicit open confirmation, report confirmation, empty sea, success state, sound/atmosphere controls and privacy details. The paper edge is a restrained CSS border with procedural grain rather than a raster torn-paper frame. The homepage, found view and rituals now share the same generated glass, cork and paper layers; see [asset provenance](assets.md).

Visual verification compares title scale and line breaks, centered two-button layout, artwork/horizon positioning, lower-right bottle, utility placement, paper/ink contrast, modal spacing and mobile stacking. Browser evidence is under ../evidence. All UI text is HTML, never embedded in artwork.

## Cinematic refinement — 2026-10-29

The existing ocean, English copy and Cormorant/Inter pairing remain authoritative. This is a refinement, not a rebrand. On phones the bottle sits centrally below the actions; desktop retains the lower-right composition. No pointer-following effects, scroll hijacking, particle fields or per-letter entrances are used.

- Home: title, introduction and actions settle within 720ms; controls remain available throughout. The painting itself never deforms. The bottle's vertical buoyancy (7s) and roll (9s) use separate wrappers, while contact shadow and water rings share the buoyancy rhythm. Environment motion pauses behind a dialog.
- Sheets: 380ms arrival, 240ms close, 140ms content departure; native dialog focus protection remains. The outgoing sheet is inert, then the incoming content mounts without scaling text. A generation guard cancels superseded navigation. Report disclosure expands in its own grid row. Selection, caret, scrollbar and focus colors use the paper palette. The backdrop uses darkening without full-screen blur: local Chromium profiling found the inherited backdrop filter reduced desktop animation cadence, even with no long main-thread tasks.
- Send: 3.6s after approval. The animated sheet begins at the measured writing-area rectangle, folds on two hinges, enters the shared bottle, receives a cork and follows an arc into a water-ring response before drifting away. Fold shading and panel occlusion replace flat compression. The intermediate paper is decorative and never duplicates visitor text into an image.
- Open: 3.4s after the API returns the message. The bottle starts at its measured found-view rectangle; cork and note separate before the paper unfolds. The real reading sheet is mounted inert and invisible for measurement, then crossfades under the unfolded sheet. At completion only the native, selectable text remains and its heading receives focus.
- Lifecycle: skip invokes completion once; Escape leaves the ritual; unmount reverts its GSAP context. Hidden tabs pause owned CSS, Web Animations and GSAP movement. Reduced motion or atmosphere-off bypasses rituals and sheet transitions. Viewport resize finishes the ritual safely rather than using stale geometry. Failed lazy loading retains Continue; failure of optional animation never hides an API result.

No API, schema, moderation, Turnstile or release contract changes. GSAP remains lazy, with optional preloading only on write/found. No new dependencies. Routine screenshots, synthetic local recordings and timing results belong in ignored `artifacts/`; historical `docs/evidence/` is not replaced. Simulated viewport/visibility tests are not physical-phone or OS background-tab measurements.
