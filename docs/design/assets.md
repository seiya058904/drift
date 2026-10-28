# Asset provenance

- `concept.png`: built-in image_gen, ui-mockup, 2026-10-28. Prompt: four readable Drift panels (desktop home, composer, reading, mobile); poetic hand-painted slate-blue ocean, mist, warm golden light, ivory serif type; explicit English UI text; two primary actions; no accounts, replies or feeds; native HTML controls; mobile and 44px targets.
- `ocean-source.png`: built-in image_gen edit of the concept. Prompt: recreate the top-left background as a standalone landscape, horizon at 58%, quiet dark sky, tiny left lighthouse, lower-left rocks, right distant island; preserve painterly gouache/watercolor; no text, UI or bottle.
- `bottle-source.png`: built-in image_gen edit of the concept, transparent background requested. Prompt: extract one luminous glass message bottle, rolled ivory note and cork, angled right, warm reflections, tiny transparent droplets; no scene, UI or lettering; preserve painterly style.
- `public/art/ocean.webp`, `bottle.webp`: optimized copies of those assets via `node scripts/assets.mjs`. Sources remain in this repository. No third-party stock photography.
- `public/art/paper.svg`, `favicon.svg`: original code-native texture and typographic mark.
- Cormorant Garamond and Inter: Fontsource packages, SIL Open Font License; see packaged LICENSE files. Fonts are delivered from this site's origin.
- Audio: original procedurally synthesized filtered noise with a slow amplitude swell. Created on explicit user activation; no external media request.

The exact concept generation brief is also saved in [concept-prompt.txt](concept-prompt.txt); asset-edit prompts are recorded in the task conversation and summarized above. All project-consumed assets live in the workspace; none depend on the generation tool's external save directory.
