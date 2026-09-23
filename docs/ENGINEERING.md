# Codexterity — Engineering Guidelines

**This is the single authoritative engineering guide for this repository.** It is read by every coding agent: Claude Code loads it via `CLAUDE.md`, Codex via `AGENTS.md`. Edit this file, never a per-tool wrapper — the wrappers exist only so each tool finds its way here.

## What This Is

Codexterity is a **non-destructive theming engine for OpenAI's Codex Desktop app** (Windows + macOS). It reskins the app at runtime by injecting CSS through the app's own official Electron APIs — never by modifying, patching, or re-signing Codex's files. The engine hosts installable theme packages; the first is **Captain's Cabin** (a premium deep-navy/brass/candlelight aesthetic — see the Design rules below; the original dark-wood brief was superseded in Phase 2). CLI command: `cdx`.

Living specs: `docs/specs/` (customizable-ui-inventory, css-architecture, asset-manifest). Evidence base: `docs/research/phase1-research-findings.md`. **No plan is open.** The most recent, [`docs/plans/0004-codex-owl-token-remap.md`](plans/0004-codex-owl-token-remap.md), **closed 2026-09-23 with all four milestones done**. Codex `26.917` had moved onto its "OWL" runtime and renamed the hooks the theme hangs on, so the theme rendered stock. Plan 0004 re-pointed the engine at the new names. **Both themes are owner-verified on OWL Codex** through the installed shortcut, in both modes, including ChatGPT Chat/Work, a terminal and a diff. It shipped as tag **`v0.2.0`** ([notes](releases/v0.2.0.md)), the build for OWL Codex; `v0.1.0` stays the unmaintained build for pre-OWL Codex (D-0004-3). Its measured map of the new token layer is [`docs/research/owl-token-inventory.md`](research/owl-token-inventory.md). The plan before it, `docs/plans/0003-image-led-theme-authoring.md` (the theme-authoring pipeline), closed 2026-08-05; `docs/plans/0001-captains-cabin-architecture.md` is the architecture authority and the Phase 1–4 record.

## Source-of-Truth Order

When documents disagree, use this order:

1. Live code, launcher scripts, and the running app's actual behaviour.
2. This file for engineering constraints and repository conventions.
3. `docs/DECISIONS.md` for settled cross-tool decisions.
4. The living specs in `docs/specs/` for the UI/CSS/asset boundaries.
5. Completed implementation plans for decision history and feature-specific detail.
6. Open implementation plans for intended future behavior only.

Do not describe planned work as shipped. Always read a plan's status header before treating it as fact. **Roadmap Phases 1–6 are COMPLETE.** The theme is owner-verified in the running app; **Phase 4 (packaging) closed 2026-08-03 with M1–M4**, and Phases 5 and 6 are satisfied by M4 — the Windows installer is built and verified end to end from the built artifact, and the macOS installer is **built and documented unverified**, which is its finished state (D-0001-16 as amended). **Phase 7 (cross-platform QA, update resilience, docs, release) is also COMPLETE** — [Plan 0002](plans/0002-phase-7-qa-docs-release.md) closed 2026-08-05 at tag **`v0.1.0`**, the repository's first release ([notes](releases/v0.1.0.md)). **Every roadmap phase is now closed.** The next body of work — multi-theme authoring and switching — was explored in [`docs/research/multi-theme-authoring-and-switching-exploration.md`](research/multi-theme-authoring-and-switching-exploration.md) was carried out as [Plan 0003](plans/0003-image-led-theme-authoring.md), which **CLOSED 2026-08-05 with all six milestones done**. **Plan 0004 (the OWL re-target) closed 2026-09-23** (see the top of this file). Plan 0003 is a **hero-image-to-palette pipeline**, not "a second theme": hand it a hero image and a direction in words, see several complete palettes rendered, pick one, and a recipe emits a validated package. Its hard constraint still governs anything built on it — a recommender proposes **recipe inputs**, never final hex, so every value goes through the OKLCH engine and `audit.mjs`. Its last milestone, M6, settled how Codexterity pays for embedded assets (**D-0003-9**): the `.ccskin` format is **unchanged**, asset bytes are **opt-in** (nothing inside Codex ever read them, and the manifest byte-count check still runs on every load because it only ever compared lengths), a payload is **embedded once** even when two mode rules need it, and the per-navigation re-send Plan 0002 flagged **does not happen** — measured in the running app, Codex's in-app route changes fire no navigation event at all, so the stylesheet is applied 4 times at startup and never again.

## Settled Decisions — how they are marked

Some behaviour in this codebase looks arbitrary and is not. Those choices are **owner decisions**, marked in two places:

- **In the code they govern**, as a comment citing the decision by id: `D-<plan>-<n>` (e.g. `D-0001-1` for the first decision in Plan 0001). The marker sits in the same file as the behaviour, so it cannot drift out of sync with it. **Keep the whole citation on one line** — the grep below is line-based.
- **In `docs/DECISIONS.md`**, for decisions with no single code home.

**Before proposing a change to existing behaviour, grep for a decision marker near the code you would touch:**

```bash
grep -rnE "D-[0-9]+-[0-9]+" <the file or directory>
```

One pattern, one notation. **Never invent a second notation.** If you find a marker, the decision **stands** until the owner reopens it. Surface it and ask; do not silently reverse it. Absence of a marker is **not** evidence that a design is open — check the plan docs and `docs/DECISIONS.md` too.

---

## Non-Negotiable Engineering Rules

**No bandaiding. Ever.**
If something is broken, find the root cause and fix it. Do not patch symptoms, suppress errors, add try/catch to hide failures, or work around a bug without understanding it. Leave the codebase cleaner than you found it.

**No `// TODO` or `// FIXME` left in committed code.**
If it's not implemented, don't commit it. If it needs doing, do it now or track it in the plan doc.

**Check before you assume.**
Before adding a new utility, helper, or dependency — grep for an existing one and check the existing stack.

**Fail loudly in development, gracefully in production.**
Never swallow errors silently. For the injector specifically: if a theme cannot be applied cleanly (missing DOM landmark, failed validation), **degrade to the stock look and report it — never leave the app half-styled or broken.** The user must always be able to fall back to an unthemed, fully-functional Codex.

**The non-destructive boundary is absolute (D-0001-3).**
Never modify, patch, overwrite, or re-sign any Codex application file on any OS. Never read or write `~/.codex/auth.json`, `~/.codex/.credentials.json`, API keys, or auth tokens. The injector's reach is styling only. This is a structural guarantee, not a convention — code must make the violation impossible, not merely avoided.

---

## Current Architecture

The shape is decided (Plan 0001) even though code is not yet written. Record it here as it becomes real; a reader should not have to reverse-engineer a convention the code alone would not teach.

**The model: a per-OS Launcher starts Codex with a shared Injector attached.**

- **Launcher** (`launcher/windows`, `launcher/macos`) — the *only* platform-specific code. Resolves the installed Codex executable in a version-independent way (Windows: `Get-AppxPackage`, never a hardcoded MSIX path; macOS: the `.app` in `/Applications`) and starts it with injection enabled.
- **Injector** (`injector/`) — shared Node core. Primary mechanism: `NODE_OPTIONS=--require <preload>` running the official `webContents.insertCSS()` in Codex's main process, opening **no** debug port (D-0001-1). Fallback: loopback CDP injection, built but not default, for resilience if OpenAI hardens the Electron fuses. Re-applies on new windows/navigations; verifies declared DOM landmarks and degrades gracefully.
- **Themes** (`themes/<name>/`) — *data packages*, not code. A theme is a manifest + validated CSS + syntax palette + embedded assets, distributed as a `.ccskin` (D-0001-4). The injector is theme-agnostic; adding a theme adds a folder, never touches the injector.
- **Recipes** (`tools/palette/recipes/<id>.mjs`) — build-time only, and **not** part of a shipped package. A recipe is the authored input a theme folder is *generated from*: identity, palette input, accent role, typography roles and font assets, shape, hero configuration, syntax policy, landmarks. The generic emitter turns a recipe into the three tracked files under `themes/<id>/`. Same principle as the injector one layer up — **adding a theme writes a recipe, never edits the emitter** (D-0003-1).

**The load-bearing styling principle (D-0001-2):** override Codex's own semantic CSS custom properties (`--app-color-*` / `--color-*`, `--radius-*`, `--shadow-*`) scoped to its mode hook: `[data-theme]` on a `[data-codex-window-type]` document since Codex's OWL update (D-0004-1; `.electron-dark` / `.electron-light` before it). `tools/palette/codex-surface.mjs` owns every one of those names. Codex is Tailwind v4 with a token layer, so one variable override cascades app-wide — including into UI OpenAI has not shipped yet. Prefer token overrides over structural selectors, which are fragile; treat any structural selector as a declared, verified landmark.

**Why this survives Codex updates:** the engine never depends on Codex's files staying put (Windows seals them anyway) and binds to OpenAI's own token indirection rather than to markup. A UI refactor that keeps token names needs zero changes. One that renames them, or moves the mode hook, needs a **vocabulary re-map**: no palette change and no rebuild of the engine. The OWL update below is the measured case.

> **This is no longer only a design claim — it was MEASURED against a real update on 2026-08-05.** Codex went **26.727.6591.0 → 26.730.7989.0**, which carried a **major Electron/Chromium jump, 150.0.7871.182 → 151.0.7922.71** (V8 15.0 → 15.1). The owner updated from the Store and relaunched through the installed shortcut. **Everything held, with no change to Codexterity of any kind:** the injector still attached (so the `NODE_OPTIONS` fuse is still un-hardened — the one failure mode that would have forced the CDP fallback), the theme package loaded, and **every landmark that could match on the screen sampled did** (`sidebar-panel`, `sidebar-active-row`, `heading-display`, `home-hero` all PRESENT; `terminal` and `code-surfaces` absent only because no terminal or code block was open — an unrun measurement, not a negative result). Tokens were verified **painted, not merely defined**: light ground `#F0E7D5`, ink `#182336`, brass `#896D15`, title-bar tint `#E7DECC`, the two decorative accents genuinely collapsed to brass while green/orange stayed distinct (D-0001-11), the active-row brass mark painted at 2×16 px, and `Literata=YES Fraunces=YES Monaspace Neon=YES` by `document.fonts.check()`. The owner also confirmed it visually. **This retires the "unproven against a real update" caveat**; [Plan 0002](plans/0002-phase-7-qa-docs-release.md) M4 could only simulate the failure by breaking selectors deliberately. **`manifest.json`'s `verifiedAgainst` deliberately still reads `26.727.6591.0`** — it is descriptive metadata that nothing enforces (D-0001-31), and the owner chose to record this result here rather than move the emitter's three byte-digests for a field no code reads.

> **THE FIRST UPDATE IT DID NOT SURVIVE UNCHANGED — Codex's "OWL" update, measured 2026-09-23 ([Plan 0004](plans/0004-codex-owl-token-remap.md)).** Somewhere between `26.730.8199.0` (last verified themed, 2026-08-05) and `26.917.6896.0`, Codex moved onto a new runtime OpenAI calls OWL (a Chromium 153 shell with the Electron API compiled in) and reorganised its colour system. **The honest result: the architecture held, the vocabulary layer did not.**
>
> - **What held, with zero changes:** the launcher, the injector, the `.ccskin` format, the loader and the installer. The `NODE_OPTIONS` fuse is still on, so the injector attached and inserted the stylesheet without a single error. The CDP fallback was not needed. The landmark report, not a version check, is what surfaced the problem (D-0001-31 working as designed).
> - **What broke:** the names. The mode hook moved from `.electron-dark` / `.electron-light` to `[data-theme]`. 60 of the 77 overridden colour tokens were renamed `--color-X` → `--app-color-X`, and one disappeared. So the theme loaded, matched nothing, and **rendered stock**. A second, subtler break: `insertCSS` now installs a *user*-origin sheet, where only `!important` beats Codex's own CSS. So every declaration is now `!important` (D-0004-2).
> - **What the fix cost:** a vocabulary re-map, not a redesign. Every name lives in one file, [`codex-surface.mjs`](../tools/palette/codex-surface.mjs), so that file, the emitter's selector interpolation and two landmark probes per recipe carried it (D-0004-1). **No palette value changed.** For surfaces OWL introduced, including ChatGPT Chat/Work, which now live inside Codex, a handful of per-mode component tokens (the Chat/Work toggle, the composer's utility bar, the Chat user-message bubble) now take already-solved roles. **One** new structural rule was needed: the update pill (D-0004-4).
> - **Proven how:** isolated-instance runs across 11 screens × both modes, then the owner's launches through the **real installed shortcut** on `26.917.6896.0`, with both themes, in both modes, including a terminal and a diff in real light mode. Then a `cdx restore` round trip to plain, working Codex. `injector.log` from the real shortcut launch is a full log, with five landmarks PRESENT and the hero painting.
> - **The lesson for the next update:** the "survives updates" claim is about the *architecture*. Token indirection limits a rename's blast radius to one file; it does not make the theme immune to one. Diagnose the next "theme stopped showing" the same way: read `injector.log` first. If it says `injected OK` and the landmarks are present while the app looks stock, suspect renamed names, not a blocked injector.
> - **Deliberately not themed on OWL:** the code colours inside Codex's diff view stay OpenAI's Pierre palette (D-0004-5). Pre-OWL Codex is not supported; `v0.1.0` is the build for it (D-0004-3).

---

## Design & Aesthetic Rules

**`themes/<name>/theme.css` is the single source of truth for that theme's token values.** It is the stylesheet the injector actually loads, so its values are what ship. Read that file for every token value; no other file carries a copy. Mockups and palette explorations under `docs/` are design *inputs* — never copy a value out of one into a shipped theme without verifying it in the running app.

**Consume tokens via `var(--token)`, never a baked literal.** Overrides redefine OpenAI's `--color-*`/`--radius-*`/`--shadow-*` variables; never hardcode a colour where a variable belongs.

**Readability outranks aesthetics — always.** Every text/surface pairing a theme produces must pass **WCAG AA** contrast. A gorgeous low-contrast theme that tires the eyes over a long coding session is a failed theme. This is the project's first design law.

> **AA has two thresholds, and using the right one is not a loophole (D-0003-7).** 4.5:1 governs normal-size text; **3:1 governs large text** (24px regular, or 18.66px bold). Deep Navy Portrait's hero scrim is solved against 3:1 — **3.01:1 dark / 3.06:1 light** — because the only text over its photograph is the empty state's heading. Codex's suggestion cards and composer paint **opaque** surfaces, so their labels sit on flat theme colour the palette audit already covers and never touch the image. **Do not "fix" those figures up to 4.5:1 without first checking what text is actually over the image** — and note the trip-wire in the ruling: if Codex ever puts normal-size text there, makes those surfaces translucent, or shrinks the heading past the large-text floor, 4.5:1 takes over and both scrims must be re-solved. Note also that **nothing in the build enforces scrim contrast** — the emitter's refusal audits palette tokens, not scrims — so this is upheld by the record, not by a gate.

**The Captain's Cabin palette and typography are LOCKED (Phase 2, 2026-07-31).** The exact values for both dark and light mode live in [`themes/captains-cabin/theme.css`](../themes/captains-cabin/theme.css); the code palette is in `syntax.json` beside it; the fonts and their roles are recorded in [`docs/specs/customizable-ui-inventory.md`](specs/customizable-ui-inventory.md) §Fonts. Read those files for values — never a mockup, and never this file.

**Palette values are derived, not hand-picked.** Ramps are stepped in OKLCH and every contrast-critical token is *solved* for its WCAG AA target by binary search. The derivation is [`tools/palette/palette-engine.mjs`](../tools/palette/palette-engine.mjs); the check is `audit.mjs`; the emitter is `emit-theme.mjs`. To change a colour, change the recipe and regenerate — do not hand-edit `theme.css`:

```bash
node tools/palette/audit.mjs        # 292 checks; must be 292/292
node tools/palette/emit-theme.mjs   # rewrites theme.css + syntax.json + manifest.json
```

**Since Plan 0003 M3b there is a step BEFORE the recipe: DIRECTIONS (D-0003-2 as amended).** The authoring flow the owner asked for is *hand over a hero image and a direction in words → see several complete palettes rendered → pick one → build that theme*. **The creative direction comes from the owner, not from the image**; the image constrains and informs.

A **direction** is a first-class record in [`tools/palette/directions.mjs`](../tools/palette/directions.mjs) — a name, a one-sentence intent in plain language, and its recipe inputs (ground hue/chroma per mode, accent hue). `buildDirections()` derives every direction through `palette-engine.mjs` and audits both modes *inside itself*, so a caller cannot obtain an unaudited direction; a failing one comes back **marked** failing, never dropped and never nudged. The 40° accent separation floor applies to every direction, authored or measured.

**An authored input is legitimate and always was.** The "derived, not hand-picked" law rules out hand-picking the hundreds of *final token colours* — navy `#0E141F` is itself an authored input a human chose. "Dior atelier" becoming a ground and an accent hue is the same move; everything downstream is still solved and proven.

[`recommend-palette.mjs`](../tools/palette/recommend-palette.mjs) is now **one contributor**, not the decider: `directionFromImage()` returns a direction when a picture genuinely names a hue and `null` when it does not, with no special case anywhere. It reads a picture as two regions — the **dark mass names the ground**, **what glows names the accent** — because a whole-image average is a broken instrument (measured: Captain's Cabin's own hero averages to chroma 0.0036, near-neutral, since its lamplight and sea cancel).

```bash
node tools/palette/directions.mjs --image <hero.png> --inherit-from navy   # the figures
node tools/mockup/build-palette-directions.mjs                            # the chooser
```

**A HERO'S SCRIM IS SOLVED, NOT GUESSED, AND THE SHAPE IS PART OF THE ANSWER (D-0003-5).**
[`hero-scrim.mjs`](../tools/palette/hero-scrim.mjs)'s `solveScrimStops()` takes an image, a ground,
an ink and a mode and returns the stops that clear a contrast target. Two things about it are
load-bearing and were measured rather than reasoned about. It solves against the worst band
**anywhere** in the image, which is what makes the proof independent of how `background-size: cover`
crops the panel — otherwise a scrim is proven for exactly one window shape. And its `textFrom`
defaults to **0**, covering the whole panel, deliberately unlike `solveScrim()`'s 0.42: a scrim that
ramps out to transparent at the top is safe only for an image that is dark up there on its own, and
on a high-key image that clear band is a hole where text sits unveiled **while the reported figure
stays healthy**. That exact failure shipped once during M4 at a reported 5.53:1, with the heading
washed out, and was caught only by rendering the empty state inside real app chrome.

**Do not retro-fit the flat shape onto Captain's Cabin.** Its hero is one lamp in a low-key frame,
so a single plateau solved against that lamp over-veils everything else — measured, 9.68:1 against a
4.5:1 target, i.e. the picture erased to buy contrast nobody asked for. Its ramp is correct. A
solver is better for the images whose shape it assumes, not better in general.

**HOW A PALETTE-OPTIONS SHEET MUST BE PRESENTED (D-0003-4, owner ruling 2026-08-05).** Any sheet that asks the owner to choose between palettes follows `docs/mockups/0005-jisoo-palette-directions.html`'s shape, which is the one they have twice confirmed they can decide from (that sheet is **untracked** — D-0003-10 — so it is not in a clone; the four clauses below are the binding record of its shape, not the file):

- **The hero image appears IN each option**, rendered where it actually lives — behind the empty state — not beside it as a reference thumbnail. `0007` showed it alongside because the portrait's scrim was unsolved; that was a dodge, and the fix is to **solve a provisional scrim per option** with [`tools/palette/hero-scrim.mjs`](../tools/palette/hero-scrim.mjs), which exists precisely for this. If a scrim genuinely cannot reach AA for an option, say so in words on that option — never silently show text over an unproven image, and never quietly drop the hero.
- **One dark/light toggle**, not two panels side by side. The owner compares options against each other, so the mode is a state of the whole sheet.
- **Typography does not vary by default.** Fraunces / Literata / Monaspace Neon on every option unless a direction deliberately brings its own faces, so the comparison is about colour. The recipe format still supports per-theme fonts; a directions sheet just does not exercise it without being asked.
- **No engineering figures**, per the split immediately below.

**Those two commands are deliberately split by audience, and the split is a decision.** The CLI carries the OKLCH values, the hue projections and the audit counts, for whoever is building. The sheet — `docs/mockups/0007-palette-directions.html` — carries **none** of that: it is large rendered mocks, names and intents, because the owner decides on sight and reported that the figures *"doesn't help or serve any purpose for me visually"*. Do not "improve" the sheet by adding numbers back to it. The sheet is **generated and deliberately not tracked** (D-0003-3) — it embeds heroes that include a private photograph — so rebuild it rather than looking for it in a clone.

**Since Plan 0003 M2 the emitter is recipe-driven, and "change the recipe" is literal (D-0003-1).** Three files, three jobs: [`emit-theme.mjs`](../tools/palette/emit-theme.mjs) is the **generic emitter** and owns every CSS rule and all the mechanism reasoning; [`codex-surface.mjs`](../tools/palette/codex-surface.mjs) owns **Codex's own names** (root theme classes, token names, ANSI slots, heading classes); [`recipes/<id>.mjs`](../tools/palette/recipes/) owns one theme's **authored choices** and nothing else — identity, palette input, accent role, typography roles and font assets, shape, hero configuration, syntax policy, and the manifest landmarks. **Adding a theme is writing a recipe. If it needs an edit to the emitter, the emitter is missing a parameter — add the parameter; do not move a rule into a recipe**, because the second recipe then carries a copy and copies drift silently. Emitting reads only its recipe's declared assets, so `assets/fonts/`'s six unused faces can never reach a package.

**Two properties of the emitter that are load-bearing, not incidental.** (1) It **refuses to write anything** if either mode fails WCAG AA — the audit runs inside the emitter, before a byte reaches disk, so a theme is *structurally unable* to ship while failing AA. (2) It **refuses to write anything** if a recipe's landmark `probe` is not present in the stylesheet it just generated (D-0001-21). Both gates run before the single write site, so a failed build leaves no half-emitted theme behind. **Note what `292/292` does and does not prove:** `audit.mjs` sweeps a registry of *grounds* (navy and oak), and 146 of those 292 checks cover a ground no theme ships — it is an **engine**-level proof. A given theme's proof is the emitter's own refusal, which audits exactly that recipe's two palettes and reports the count when it runs.

**Surfaces are flat token colour (D-0001-6).** No tiling texture, no gradient wash, no image behind content. This is a *contrast* rule before it is an aesthetic one: every figure the theme claims is computed against a flat colour, and luminance variation behind text makes the governing value the worst pixel rather than the average. Reintroducing a surface texture means redoing the contrast proof. Depth comes from the six-step surface ramp and borders; shadows appear only where a floating element must separate from what is behind it.

**No AI Slop (the floor, binding on every theme).** No Inter/Roboto/Arial/Open Sans/Lato/system-ui as a primary/display font. No purple/indigo gradients as a default reach. One accent colour, used sparingly (badges, active states, key numbers) — never as a background fill. No emoji as an icon system — one consistent icon set. No lorem ipsum or filler copy. Motion is purposeful (feedback, orientation), never decorative, and respects reduced-motion. Exact hex only — no "close enough" drift.

**Captain's Cabin specifics (as built, revised in Phase 2):** premium, elegant, subtle — a captain's chart room at night, *not* a cartoon pirate theme. **The ground is deep navy `#0E141F`**; light mode is weathered parchment carrying navy ink. Materials: ink, sea, brass, parchment, lamplight. Accent: antique brass, one colour, used sparingly — badges, active states, focus, key numbers — never as a background fill. No moving ships, no waves, no parrots, no gimmicks.

> **This paragraph was rewritten in Phase 2 and the change is deliberate.** The original brief listed dark oak and leather and described textures as "felt, not seen." The owner reviewed a rendered mockup of both an oak and a navy ground and chose navy; separately, the tiling textures were cut for the contrast reason above. There is therefore **no wood and no leather in this theme**, and no raster texture of any kind. If you are working from an older description, this paragraph supersedes it.

---

## File Conventions

Directory roles are visible from the tree (see Plan 0001 §folder-structure). The conventions the layout alone would not teach:

- Keep one primary exported module per file.
- Before creating a helper, search the whole repo for a domain equivalent.
- **Layer rule:** the `injector/` core is platform-agnostic and contains *all* styling/injection logic; `launcher/<os>/` is the *only* place OS-specific code lives and does nothing but resolve-and-launch. Injection logic never leaks into a launcher, and platform branches never leak into the injector core. Themes are data — no executable logic in a `.ccskin`.

## Verification Expectations

**The repo has a test harness as of Phase 4 M1**, grown once per Phase 4 milestone. It now covers the theme loader (manifest, safe-CSS, zip reader), the `.ccskin` writer, the packer, the `cdx` CLI, and both package builders (`tests/packaging/windows.test.js`, `tests/packaging/macos.test.js`) — plus, since Plan 0002 M4, the injector's **landmark degradation reporting** (`tests/injector/landmarks.test.js`, covering a theme whose selectors have all stopped matching) — plus, since Plan 0003 M1, the **hero scrim solver** (`tests/palette/hero-scrim.test.js`) and the PNG decoder's colour-type-2 path — plus, since Plan 0003 M2, the **recipe-driven emitter** (`tests/palette/emit-theme.test.js`) — plus, since Plan 0003 M3, the **hero-image palette recommender** (`tests/palette/recommend-palette.test.js`, carrying M3's own calibration gate) — plus, since M3b, the **directions generator and the light-ground input** (`tests/palette/directions.test.js`) — plus, since Plan 0003 M4, the **scrim SOLVER** (`solveScrimStops`, in the existing `tests/palette/hero-scrim.test.js`), whose crop-immunity and whole-panel-coverage tests are regression guards for two real defects and are verified to fail when the solver is simplified — plus, since Plan 0003 M6, **opt-in asset loading** (D-0003-9): `tests/theme-loader/loader.test.js` proves a lazy load still catches a manifest that lies about an asset's byte count on **both** source kinds, that a corrupt asset CRC is deferred under lazy and still caught under eager, and that reading `theme.assets` after a lazy load **throws** rather than returning an empty Map; `tests/theme-loader/zip.test.js` proves `readZip`'s `inflate` predicate reports sizes for every entry while materialising only the selected ones, and that a skipped entry is still refused for a symlink, an unsafe path or a duplicate name. Since Plan 0004 M1, `tests/injector/probe.test.js` covers the live probe's pure parser, its colour-definition summary and colour-token index, and proves the generated in-page script compiles. Since Plan 0004 M2, `tests/palette/emit-theme.test.js` also proves the OWL re-target: no pre-OWL selector in the emitted sheet, every `var()` it writes resolves to a declared property, and every declaration outside `@font-face` is `!important` (D-0004-2). `tests/inventory/driver-preload.test.js` compiles the themed run's in-page check. Since Plan 0004 M3, it also compiles every scenario's finder and the surface captures, and unit-tests the menu-item finder, the poller and the viewport guard. `tests/palette/emit-theme.test.js` proves the Chat user-message tokens and the D-0004-4 rule are emitted. Sixteen files, **374 tests**, last run green on this machine 2026-09-23. The rest of the injector core, the launchers and the palette *derivation* itself (`palette-engine.mjs`) have no unit coverage and are proven by the running app and by `audit.mjs` instead.

**The emitter suite carries the byte-equivalence gate, and that gate is the reason Captain's Cabin cannot drift — do not weaken it.** `tests/palette/emit-theme.test.js` emits the shipped theme into a temp directory and asserts `theme.css`, `syntax.json` **and** `manifest.json` come back **byte-identical** to the three tracked files. It was the gate Plan 0003 M2 was measured against (SHA-256 `731CC9…4286E`, `36DAD6…211FEB`, `0E44FF…AD5DB5`) and it is now permanent rather than a one-off `Get-FileHash`. The same file proves the two refusals actually fire: a landmark whose `probe` is missing throws **and leaves the output directory empty**, and `assertPalettesPassAA()` — the *same* exported function the emitter calls — throws on a synthetic palette where every token resolves to one hex. **If a legitimate change to the shipped theme ever moves those bytes, update the recorded digests in the same commit that changes the theme, and never the other way round.**

**The scrim suite has a calibration gate, and it is the strongest test in the repo — do not weaken it.** `tests/palette/hero-scrim.test.js` re-solves the **real shipped hero** and asserts it reproduces the reference implementation's figures exactly (**5.99:1** for the shipped stops, plus the three rejected candidates). It runs against `tests/fixtures/hero-empty-state.png`, a **pixel-identical PNG copy** of `themes/captains-cabin/assets/hero-empty-state.webp` — the shipped asset is **lossy WebP**, which zero-dependency Node cannot decode, so the fixture is what makes the gate reproducible from a clone. **That ~1 MB fixture is tracked on purpose; do not delete it and do not gitignore it.** Any change to the solver must still print 5.99:1 before it is trusted on a new image. `node:test` and `node:assert/strict`, no dependencies:

```bash
npm test
```

Note the script is `node --test "tests/**/*.test.js"`, an explicit glob, not `node --test tests/`. That is not a style choice: on Node v22.14.0 (this machine) a bare directory argument is resolved as a *module to run* and fails with `Cannot find module '...\tests'` before the runner starts. The glob and the bare `node --test` both work; the glob is used because it states the harness's scope instead of inferring it from the working directory.

**What a green run does and does not establish.** It establishes the loader's own contract (manifest validation, the safe-CSS allowlist, zip parsing, the size cap) and, since M2, the packer's (round-trip fidelity, byte-reproducibility, and that only manifest-declared files reach a package); the M3/M4 tests cover the CLI's argument and state handling and the two package builders' output structure. It establishes nothing about how the theme looks, and nothing about whether an installed package starts — see D-0001-29, where the suite was 180/180 green while the installed product could not launch at all. **M1 and M2 are the only Phase 4 milestones a unit test can honestly close** — both are build-time machinery with no user-visible surface. From M3 on, `apply`/`restore` must be proven in the running app.

**Building the package.** `node tools/pack-ccskin.js` writes `dist/<id>.ccskin`. It is reproducible build output — `dist/` and `*.ccskin` are gitignored deliberately, so **never commit the binary and never "fix" the gitignore**. Regenerating `theme.css` first (`node tools/palette/emit-theme.mjs`) is what changes a package's bytes; the packer only ever copies the emitter's output verbatim.

The binding verification rule for this project, per the owner's standing practice (*"tests passing ≠ done"*):

- **Every theme/injector change is verified by launching Codex through the launcher and looking at the real, running app** — not by a green unit test, not by a subagent's self-report. Confirm the theme applies, the app stays fully functional, and nothing is half-styled.
- **Contrast is checked, not eyeballed:** validate WCAG AA on the text/surface pairs a change touches.
- **Cross-platform claims require the target OS.** A theme "works on macOS" only after it is verified on macOS (a collaborator's machine) — Windows-only verification does not establish it.
- Documentation changes: run `git diff --check` and verify every link and status claim against live files.

Never call work complete from a build alone when the visible result in the running app is the actual deliverable.

## Recording Decisions

When a session settles something durable another agent could re-litigate — an injection-mechanism change, a "do not re-propose" ruling, a deliberate non-fix — record it **in the same commit**:

- If it governs specific code, put a `D-<plan>-<n>` marker in that code and one pointer row in `docs/DECISIONS.md`.
- If it has no code home, write it out in full in `docs/DECISIONS.md`.

Agent-private memory is not shared between tools. Anything recorded only there is invisible to the next agent and will drift.
