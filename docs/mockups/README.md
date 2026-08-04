# Mockups

Rendered design records. **These are design *inputs*, never sources of truth.** For any shipped value read [`themes/captains-cabin/theme.css`](../../themes/captains-cabin/theme.css); it is the file the injector actually loads.

Each mockup is a self-contained HTML file — fonts embedded as data URIs, no external requests — so it renders identically years from now. Open it directly in a browser.

| File | Date | What it decided |
|---|---|---|
| [`0001-captains-cabin-palette-approval.html`](0001-captains-cabin-palette-approval.html) | 2026-07-31 | The Phase 2 approval sheet. Ground, palette, typography and the asset set. |
| [`0002-captains-cabin-character-pass.html`](0002-captains-cabin-character-pass.html) | 2026-07-31 (built), **2026-08-01 (decided)** | Layer 2 chrome detailing. **Approved and shipped** — see below for what shipped vs what stayed a mockup-only demonstration. |
| [`0005-jisoo-palette-directions.html`](0005-jisoo-palette-directions.html) | 2026-08-04 | Design exploration for the next portrait-led theme: four dark/light palette directions using the shipped typography roles and character treatment. **Decided 2026-08-05:** the owner chose **Deep Navy Portrait** — but *not* as this sheet renders it. Dark mode keeps the shipped navy exactly; **light mode is to be re-derived cooler**, because the shipped parchment reads too warm under a cold monochrome portrait. The other three directions are rejected. See [Plan 0003](../plans/0003-image-led-theme-authoring.md); nothing is implemented yet. |

## About `0002-captains-cabin-character-pass.html`

**Rebuild this one; do not edit it.** `node tools/mockup/build-mockup.mjs` regenerates it, parsing values straight out of `themes/captains-cabin/theme.css` — so the mockup cannot drift from the shipped theme, and the build fails outright if the theme stops parsing.

It answers a concern raised after Phase 2 committed: with textures cut, the theme read as a palette-and-font change. The response was that the *character* layer had never been built. This mockup toggles **Flat — as committed** against a **Character pass** applying Layer 2 named hooks: title-bar brass hairline and crest, an active-task brass rail, thin brass scrollbars, popover depth, a brass marker on code headers, lit button and card edges, brass selection, and the model pill in brass.

Everything it adds decorates **chrome**. Nothing is placed behind body text, so [D-0001-6](../DECISIONS.md) and the contrast proof are untouched.

**It picked up the hero image automatically** once `hero-empty-state.webp` was dropped into `themes/captains-cabin/assets/` and the mockup rebuilt — no code change. That resolved the item blocking judgement.

**Decided 2026-08-01 (D-0001-10).** The owner reviewed the toggle and approved the character pass — but **only part of what this mockup demonstrates actually shipped**, so read the mockup as a superset, not as a preview of the final CSS:

- **Shipped**, into `tools/palette/emit-theme.mjs` (not `theme.css` — see [`css-architecture.md`](../specs/css-architecture.md)): brass selection, thin brass scrollbars, the title-bar hairline on `.app-header-tint`, depth plus a lit top edge on `.popupContent`, and the scroll fade on `.app-shell-main-content-top-fade` resolved to the theme's own ground.
- **Historical / demonstration-only, deferred pending Gate 0:** the active-task rail, the code-header brass marker, lit button/card edges, and the title-bar crest. These target class names the mockup invented to demonstrate the *idea*, not names ever confirmed in the real app. None of the four landmarks that *did* ship, and none of these deferred ones either, has ever been observed in a running Codex — Gate 0 (the injector launch test) has not run. Treat this mockup's non-shipped flourishes as a wishlist for whatever Gate 0 turns up, not as pending work with a known destination.

## About `0001-captains-cabin-palette-approval.html`

The visual the owner approved Phase 2 from. Interactive: toggle **ground** (deep navy / dark oak), **mode** (dark / light) and **type pairing** (Fraunces+Monaspace Xenon / Alegreya+Commit Mono). It contains a mock of Codex's own UI, a swatch board, a live contrast table, a code-palette board, and a three-way texture comparison.

**Read it as a snapshot of the decision, not as current truth.** Specifically:

- It still offers **dark oak** as a ground. Navy was chosen (D-0001-7); oak is retained in the tool only as a starting point for a future warm theme.
- It still offers **pairing B**. Pairing A was chosen (D-0001-7).
- Its texture section argues for cutting the tiling textures. That argument was accepted (D-0001-6) — so the "grain" panel shows something the theme no longer contains.
- An earlier version of this sheet also offered an aubergine ground, rejected on sight (D-0001-8). It is not in this build.

The palette itself is reproducible from source: `tools/palette/palette-engine.mjs` derives it, `audit.mjs` proves it, `emit-theme.mjs` emits the shipped files. The sheet's own build script is not retained — it depended on the two evaluation-only fonts from pairing B, which are deliberately not vendored.
