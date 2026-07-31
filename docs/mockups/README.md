# Mockups

Rendered design records. **These are design *inputs*, never sources of truth.** For any shipped value read [`themes/captains-cabin/theme.css`](../../themes/captains-cabin/theme.css); it is the file the injector actually loads.

Each mockup is a self-contained HTML file — fonts embedded as data URIs, no external requests — so it renders identically years from now. Open it directly in a browser.

| File | Date | What it decided |
|---|---|---|
| [`0001-captains-cabin-palette-approval.html`](0001-captains-cabin-palette-approval.html) | 2026-07-31 | The Phase 2 approval sheet. Ground, palette, typography and the asset set. |

## About `0001-captains-cabin-palette-approval.html`

The visual the owner approved Phase 2 from. Interactive: toggle **ground** (deep navy / dark oak), **mode** (dark / light) and **type pairing** (Fraunces+Monaspace Xenon / Alegreya+Commit Mono). It contains a mock of Codex's own UI, a swatch board, a live contrast table, a code-palette board, and a three-way texture comparison.

**Read it as a snapshot of the decision, not as current truth.** Specifically:

- It still offers **dark oak** as a ground. Navy was chosen (D-0001-7); oak is retained in the tool only as a starting point for a future warm theme.
- It still offers **pairing B**. Pairing A was chosen (D-0001-7).
- Its texture section argues for cutting the tiling textures. That argument was accepted (D-0001-6) — so the "grain" panel shows something the theme no longer contains.
- An earlier version of this sheet also offered an aubergine ground, rejected on sight (D-0001-8). It is not in this build.

The palette itself is reproducible from source: `tools/palette/palette-engine.mjs` derives it, `audit.mjs` proves it, `emit-theme.mjs` emits the shipped files. The sheet's own build script is not retained — it depended on the two evaluation-only fonts from pairing B, which are deliberately not vendored.
