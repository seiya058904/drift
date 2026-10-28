# Drift design specification

Reference: [concept.png](concept.png), generated with the built-in image generation tool. A four-state reference covers the desktop home, parchment composer, parchment reading view and mobile home. The implementation preserves its composition, content hierarchy and visual direction.

The canvas is slate blue (#182d3e), with a full-bleed hand-painted ocean, quiet sky behind the title, sunset at the left horizon, and one floating transparent bottle in the lower right. No tint overlay is applied to the painting. The dialog backdrop darkens the scene to make a single sheet of paper the focus.

Ivory foreground #fff4e1; paper #f6eedf; paper ink #213540; secondary ink #586066; warm gold #b18a46. Cormorant Garamond 400 and italic carry headings and prose. Inter 400/500 carries small interface text. Typefaces are self-hosted. Buttons use a 4px radius, 50px minimum height; icon controls and text links have at least 44px height. The paper sheet is at most 580px wide. Spacing steps: 8, 12, 16, 24, 32, 44, 52px.

Home copy: `drift`; `Some words / are meant to drift.`; `A thought, a secret, a little hope. / Send it out. See what finds you.`; `Cast a bottle`; `Find a bottle`; `No names. No replies. Just a moment shared.`; `About & privacy`.

At 390px the title wraps naturally into three lines, controls stack, the bottle sits below them, and the footer uses two lines. Dialogs use 24px outer gutters and scroll within the dynamic viewport. Close preserves an unsent draft in memory only. There are no extra sections, account controls or history.

Functional additions to the reference are the 500-character counter, kindness/privacy guidance, error and pending states, explicit open confirmation, report confirmation, empty sea, success state, sound/atmosphere controls and privacy details. The paper edge is a restrained CSS border with procedural grain rather than a raster torn-paper frame. Ritual bottles use independent glass, cork and paper elements so folding, sealing and unfolding can be choreographed. The homepage uses the generated glass asset.

Visual verification compares title scale and line breaks, centered two-button layout, artwork/horizon positioning, lower-right bottle, utility placement, paper/ink contrast, modal spacing and mobile stacking. Browser evidence is under ../evidence. All UI text is HTML, never embedded in artwork.
