# Multi-theme authoring, packaging, and switching — exploration

**Date:** 2026-08-04
**Status:** Research input for independent review. No implementation is scheduled or authorised by this document.
**Scope:** What a second Codexterity theme actually costs after Phase 4, what remains Captain's-Cabin-specific, how multiple themes should be packaged and selected, and the current shortlisted second-theme direction.

## Verdict

Codexterity's runtime is already theme-agnostic. A second theme does **not** require another repository, another injector, another launcher, or another Codex shortcut. The loader, packer, persisted active-theme state, and argument-free launcher already accept an arbitrary validated theme directory or `.ccskin` package.

The remaining multi-theme work is concentrated in two places:

1. **Authoring:** `tools/palette/emit-theme.mjs` is a Captain's Cabin emitter, not yet a generic theme emitter.
2. **Distribution:** both platform packages currently bundle and initially apply only `captains-cabin`.

This is a bounded foundation change, not an engine rewrite. The right proof is one shared recipe-driven authoring path plus a real second theme. Duplicating the Captain's Cabin emitter would be quicker once and more expensive forever.

The owner has shortlisted a second-theme direction for independent review:

> **Deep Navy Portrait** — reuse the current Captain's Cabin dark and light palettes, character treatment, and typography; replace the empty-state artwork with `BW_Jisoo.png`; show that same portrait in both dark and light modes.

The name above is descriptive only. Theme name, package id, distribution rights, and implementation approval remain open.

## Evidence boundary

This memo distinguishes three kinds of statement:

- **Shipped:** confirmed in current source or the completed Phase 4 record.
- **Measured limitation:** a concrete hardcoding or missing capability found in current source.
- **Recommendation:** a proposed next shape for independent review, not an approved plan.

The active roadmap still ends with **Phase 7 — cross-platform QA, docs, release**. The macOS package is built and honestly labelled unverified; per D-0001-16, collaborator participation is optional and never blocks the project.

## 1. What is already multi-theme-capable

### Runtime loading and validation — shipped

`injector/theme-loader/` accepts either a theme directory or a `.ccskin`, validates the strict manifest, safe-CSS rules, assets, package size, and landmarks, and gives the injector one validated result. Theme-specific landmarks come from each package's manifest rather than from an engine constant.

Consequences:

- Adding a theme adds a package; it does not add an injection path.
- Development directories and shipped archives travel the same validation path.
- The injector does not need to know a theme's name, palette, fonts, or hero.

### Packaging a theme — shipped

`tools/pack-ccskin.js` already accepts an arbitrary theme directory as its first argument. Its no-argument default is `themes/captains-cabin`, but `packTheme(themeDir)` itself is generic and writes `dist/<manifest.id>.ccskin`.

### Listing, applying, and launching — shipped

`injector/cli.js` already provides:

- `cdx list` — enumerate valid themes under `dist/*.ccskin` and `themes/*/`, marking the active source;
- `cdx apply <theme>` — validate and persist a theme id or explicit path;
- `cdx verify [<theme>]` — report package details without launching;
- `cdx restore` — clear the active selection;
- bare `cdx` / `cdx launch` — launch the single active theme through the fixed Codexterity shortcut.

The persisted state contains the active theme's id and validated source path. The existing Codexterity shortcut is deliberately theme-neutral, so no second shortcut is needed when a second theme ships.

### Future live repainting — prepared, not built

The injector holds the loaded theme in a mutable module-level slot. This preserves a future route to repaint an already attached Codex window. What does **not** exist is a change signal, watcher, IPC channel, or user interface that tells the injector to load another package and reapply it.

Today, `cdx apply` changes the next launch. It does not repaint a currently open Codex window.

## 2. What is still Captain's-Cabin-specific

### 2.1 The emitter — measured limitation

`tools/palette/emit-theme.mjs` currently fixes all of the following in one file:

- output directory: `themes/captains-cabin/`;
- palette source: navy ground and antique-brass role;
- theme name, id, description, version, author, and licence;
- Fraunces, Literata, and Monaspace Neon font files and roles;
- Captain's Cabin prose and comments;
- the dark-only `hero-empty-state.webp` asset;
- the hero selector, crop, scrim, and contrast proof;
- syntax output and generated manifest;
- manifest landmarks and asset accounting.

The palette engine beneath it is more reusable: it derives dark/light surface ramps, text roles, statuses, accents, syntax colours, and audits from palette inputs. The emitter is the layer that currently binds those reusable calculations to one theme identity.

### 2.2 Windows distribution — measured limitation

`tools/build-windows-package.js` freshly packs `themes/captains-cabin`, copies that one archive into the installed payload, and excludes `themes/` and authoring tools. `packaging/windows/Install.ps1` then runs `cdx apply captains-cabin` during installation.

The installed CLI could resolve multiple archives if the payload contained them. The builder simply does not put more than one there yet.

### 2.3 macOS distribution — measured limitation

`packaging/macos/build-macos-package.js` defaults to one `dist/captains-cabin.ccskin` input, copies one archive into the wrapper payload, and `install.sh` initially applies `captains-cabin`.

As on Windows, the runtime can resolve another archive; the distribution shape currently supplies only one.

### 2.4 Visual discovery metadata — measured limitation

The format-1 manifest is intentionally strict. It contains identity, description, compatibility, files, landmarks, and assets, but no structured preview metadata. Unknown top-level keys are rejected.

A visual picker therefore needs a deliberate answer for:

- dark/light preview images or a split preview;
- palette swatches;
- hero thumbnail;
- attribution or rights notes;
- whether preview metadata belongs inside a new manifest format or in a separately validated installed catalog.

Do not smuggle these through an undeclared filename convention without reviewing the compatibility and drift costs.

## 3. Recommended reusable authoring shape

This section is a recommendation for independent review.

A theme recipe should contain only authored choices and asset references:

- package identity: id, name, description, version, author, licence;
- compatibility range and verified Codex build;
- dark and light palette inputs;
- accent role and semantic-status policy;
- typography roles and font assets/licences;
- shape values and permitted character treatment;
- optional hero configuration per mode;
- hero asset, focal point/crop, and independently solved scrim per enabled mode;
- syntax policy;
- manifest landmarks;
- optional preview/catalog metadata, if the package format is deliberately extended.

Shared builders should then produce:

- `theme.css`;
- `syntax.json`;
- `manifest.json`;
- contrast and asset-accounting results;
- a reproducible `.ccskin` through the existing packer.

The Captain's Cabin output must remain byte- or meaning-equivalent through the refactor. Generalisation is not permission to redesign the shipped theme.

### Fonts in the shortlisted theme

Deep Navy Portrait intentionally retains the existing Fraunces/Literata/Monaspace Neon roles. It therefore does **not** incur new type selection, subsetting, or licence research. A genuinely different future theme may incur that work; the recipe must support it without forcing every theme to carry Captain's Cabin's fonts.

## 4. Shortlisted theme: Deep Navy Portrait

### Retained without change

- Captain's Cabin dark palette;
- Captain's Cabin light palette;
- antique-brass accent and distinct semantic statuses;
- Fraunces display, Literata UI/body, Monaspace Neon code;
- shape/radius system;
- approved character pass;
- normal task and conversation surfaces remain flat;
- existing semantic landmarks unless real-app verification proves otherwise.

### Changed

- theme identity and description;
- empty-state hero asset: owner-supplied `BW_Jisoo.png`;
- hero enabled in **both** `.electron-dark` and `.electron-light`;
- mode-specific scrim and possibly mode-specific crop/focus values;
- package asset accounting and any image attribution/rights documentation.

### The same image does not mean the same scrim

Captain's Cabin's current hero is dark-only and its scrim was solved against that particular night image. `BW_Jisoo.png` has a large, bright white field and a high-contrast black subject. Dark and light modes therefore need independent worst-pixel contrast measurements across every vertical band where text or composer chrome may sit.

The implementation must not copy the current dark scrim, reuse one alpha curve in both modes, or approve contrast by eye. Image, crop, and scrim are one proof.

### Crop and composition

The portrait's useful composition is asymmetric: negative space on the left and the subject on the right. Verification should include at least:

- typical wide Codex window;
- tall/narrow window;
- short window where `background-size: cover` crops vertically;
- dark and light mode at each shape;
- empty-state heading, suggestion content when present, and composer.

The hero remains empty-state-only. It must never become a full-window wallpaper behind conversations, diffs, terminals, or body text.

### Distribution rights

Private local use and redistribution are separate decisions. Before a public or friend-shared package includes a celebrity photograph, the source and redistribution rights must be established or the package must remain private. This is not a CSS question and cannot be solved by attribution alone.

## 5. Multi-theme distribution choices

### Recommended near-term package shape

Once two themes exist, both Windows and macOS payloads should include every first-party `.ccskin` intended for that release. Installation should establish a deliberate default but keep the same theme-neutral Codexterity launcher.

Open decision: whether the installer should continue defaulting to Captain's Cabin, ask the user to choose, or install with no active theme and open the picker. For a personal project, retaining Captain's Cabin as the default is the least disruptive transition.

### Do not create one launcher per theme

Separate shortcuts would duplicate a concern the active-theme state already solves, clutter Start/Desktop surfaces, and undermine the approved theme-neutral icon. One launcher should always open the currently active theme.

## 6. Theme discovery and switching UX

### Layer 1 — already available

Keep the CLI as the durable underlying contract:

```text
cdx list
cdx apply <theme-id>
cdx verify <theme-id>
cdx restore
```

This is sufficient for development and recovery, but it is not an adequate final browsing experience because themes are visual.

### Layer 2 — recommended after the second theme exists

Add a small standalone **Codexterity Themes** picker, launched separately from the existing Codexterity shortcut.

Each card should show:

- theme name and concise description;
- dark/light split preview;
- hero thumbnail when present;
- compact palette strip;
- compatibility or verification warning when relevant;
- active badge.

Primary actions:

- **Use this theme** — validate and persist it through the same library path as `cdx apply`;
- **Launch Codex** — use the existing argument-free launcher;
- **Stock Codex** — first-class restore option.

The picker should call shared functions, not parse human-formatted `cdx list` output.

### Layer 3 — optional later

Live repainting can follow only after the picker proves useful. If the open Codex process was launched through Codexterity, a future change signal can tell the existing injector to load and reapply another validated package. If Codex was launched normally, the picker should say the selection applies on the next Codexterity launch.

Do not automatically terminate or restart Codex during theme selection.

### Rejected as the primary UX

- **One shortcut per theme:** clutter and duplicated state.
- **Always-running tray process:** unnecessary lifecycle and maintenance cost for occasional switching.
- **Chat-driven switching as the only interface:** clever but poorly discoverable, unavailable before correct launch attachment, and difficult to recover from when the app is not running.

Chat-driven switching may later be a convenience layered on the same validated selection mechanism, never the sole control surface.

## 7. Roadmap sequencing

### Current outstanding work

Plan 0001 identifies Phase 7 as the remaining roadmap work:

- cross-platform QA to the extent currently possible;
- update-resilience testing;
- documentation;
- release.

The macOS package's unverified status is accepted and non-blocking under D-0001-16. Do not turn collaborator participation back into a gate.

### Recommendation

1. Close Phase 7 and establish a clean Captain's Cabin/engine release baseline.
2. Independently review and schedule the shared recipe plus multi-theme distribution foundation.
3. Use Deep Navy Portrait as the proof theme.
4. Add the visual picker after the second package exists.
5. Consider live switching only after the basic picker workflow is validated.

This ordering keeps release QA from being mixed with an authoring refactor and gives the second-theme work a known-good engine baseline.

## 8. Current validation caveat — 2026-08-04

A test run in the current Codex sandbox reported:

- **150 passed**;
- **31 failed**;
- palette audit **272/272 passed**.

The 31 failures are one cascading suite-hook failure, not 31 observed behavioral regressions. `tests/packaging/windows.test.js` imports `tools/make-ico.mjs` once in a suite-level `before()` hook. That module resolves Codex's installed MSIX package so it can extract the approved knot artwork. In this sandbox:

```powershell
Get-AppxPackage -Name OpenAI.Codex
```

returned no package, and the hook failed with:

```text
make-ico: Codex Desktop (package OpenAI.Codex) is not installed for this user
```

Every Windows-packaging test behind that hook was then reported `hookFailed` without executing. The remaining 150 tests ran and passed.

### Impact assessment

- The test run did not apply, restore, or modify the installed theme.
- It made no tracked workspace changes.
- It has no mechanism to alter the already running Captain's Cabin instance.
- It does **not** establish that the 31 packaging tests currently pass.
- It also does **not** identify a runtime or theme regression.

Before Phase 7 release sign-off, rerun the full 181-test suite in an environment that can see the installed `OpenAI.Codex` package. Treat the previous 181/181 result as historical verification until it is reproduced after subsequent changes.

## 9. Questions for independent review

The orchestrator should challenge this memo rather than treat it as an implementation plan. In particular:

1. Is a recipe-driven generalisation of `emit-theme.mjs` the smallest durable boundary, or should emission be decomposed further before adding the second theme?
2. Should first-party package enumeration be driven from a checked-in catalog, recipe discovery, or explicit build arguments?
3. What is the least disruptive installer default once multiple themes ship?
4. Does visual picker metadata justify a package-format change, or should it live in a separately validated catalog?
5. What exact contrast instrument will solve the portrait scrims for both modes?
6. Is `BW_Jisoo.png` legally distributable, or must Deep Navy Portrait remain private/local?
7. Should the visual picker be part of the second-theme milestone or the immediately following usability milestone?

## References

- [`docs/plans/0001-captains-cabin-architecture.md`](../plans/0001-captains-cabin-architecture.md) — Phase 4 completion, Phase 7 remainder, live repainting groundwork, and the measured second-theme cost under “After Phase 4.”
- [`tools/palette/emit-theme.mjs`](../../tools/palette/emit-theme.mjs) — current Captain's-Cabin-specific authoring path and dark-only hero.
- [`tools/palette/palette-engine.mjs`](../../tools/palette/palette-engine.mjs) — reusable palette derivation.
- [`tools/pack-ccskin.js`](../../tools/pack-ccskin.js) — generic validated package writer.
- [`injector/cli.js`](../../injector/cli.js) — list/apply/verify/restore/launch and persisted active-theme state.
- [`injector/theme-loader/manifest.js`](../../injector/theme-loader/manifest.js) — strict format-1 manifest schema.
- [`tools/build-windows-package.js`](../../tools/build-windows-package.js) — single-theme Windows payload build.
- [`packaging/windows/Install.ps1`](../../packaging/windows/Install.ps1) — Captain's Cabin initial selection.
- [`packaging/macos/build-macos-package.js`](../../packaging/macos/build-macos-package.js) — single-theme macOS payload build.
- [`packaging/macos/install.sh`](../../packaging/macos/install.sh) — Captain's Cabin initial selection.
- [`tests/packaging/windows.test.js`](../../tests/packaging/windows.test.js) — suite-level icon-module setup that caused the environment-limited 31-test cascade.
- [`docs/mockups/0005-jisoo-palette-directions.html`](../mockups/0005-jisoo-palette-directions.html) — dark/light palette exploration containing the shortlisted Deep Navy Portrait direction.
