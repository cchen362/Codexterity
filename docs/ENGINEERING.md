# Codexterity — Engineering Guidelines

**This is the single authoritative engineering guide for this repository.** It is read by every coding agent: Claude Code loads it via `CLAUDE.md`, Codex via `AGENTS.md`. Edit this file, never a per-tool wrapper — the wrappers exist only so each tool finds its way here.

## What This Is

Codexterity is a **non-destructive theming engine for OpenAI's Codex Desktop app** (Windows + macOS). It reskins the app at runtime by injecting CSS through the app's own official Electron APIs — never by modifying, patching, or re-signing Codex's files. The engine hosts installable theme packages; the first is **Captain's Cabin** (a premium deep-navy/brass/candlelight aesthetic — see the Design rules below; the original dark-wood brief was superseded in Phase 2). CLI command: `cdx`.

Living specs: `docs/specs/` (customizable-ui-inventory, css-architecture, asset-manifest). Evidence base: `docs/research/phase1-research-findings.md`. Active plan: `docs/plans/0003-image-led-theme-authoring.md`; `docs/plans/0001-captains-cabin-architecture.md` is the architecture authority and the Phase 1–4 record.

## Source-of-Truth Order

When documents disagree, use this order:

1. Live code, launcher scripts, and the running app's actual behaviour.
2. This file for engineering constraints and repository conventions.
3. `docs/DECISIONS.md` for settled cross-tool decisions.
4. The living specs in `docs/specs/` for the UI/CSS/asset boundaries.
5. Completed implementation plans for decision history and feature-specific detail.
6. Open implementation plans for intended future behavior only.

Do not describe planned work as shipped. Always read a plan's status header before treating it as fact. **Roadmap Phases 1–6 are COMPLETE.** The theme is owner-verified in the running app; **Phase 4 (packaging) closed 2026-08-03 with M1–M4**, and Phases 5 and 6 are satisfied by M4 — the Windows installer is built and verified end to end from the built artifact, and the macOS installer is **built and documented unverified**, which is its finished state (D-0001-16 as amended). **Phase 7 (cross-platform QA, update resilience, docs, release) is also COMPLETE** — [Plan 0002](plans/0002-phase-7-qa-docs-release.md) closed 2026-08-05 at tag **`v0.1.0`**, the repository's first release ([notes](releases/v0.1.0.md)). **Every roadmap phase is now closed.** The next body of work — multi-theme authoring and switching — was explored in [`docs/research/multi-theme-authoring-and-switching-exploration.md`](research/multi-theme-authoring-and-switching-exploration.md) and is now **approved and underway** as [Plan 0003](plans/0003-image-led-theme-authoring.md), the **open** plan. Read its status header before treating any of it as fact: it is a **hero-image-to-palette pipeline**, not "a second theme", and only **M1 (the image instrument) is DONE** — M2–M5 are not started. Its hard constraint governs anything built under it: a recommender proposes **recipe inputs**, never final hex, so every value still goes through the OKLCH engine and `audit.mjs`.

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

**The load-bearing styling principle (D-0001-2):** override Codex's own semantic CSS custom properties (`--color-*`, `--radius-*`, `--shadow-*`) scoped to its root theme classes (`.electron-dark` / `.electron-light`). Codex is Tailwind v4 with a token layer, so one variable override cascades app-wide — including into UI OpenAI has not shipped yet. Prefer token overrides over structural selectors, which are fragile; treat any structural selector as a declared, verified landmark.

**Why this survives Codex updates:** the engine never depends on Codex's files staying put (Windows seals them anyway) and binds to OpenAI's own token indirection rather than to markup. A UI refactor that keeps token names needs zero changes; one that renames them needs a recolour, not a rebuild.

---

## Design & Aesthetic Rules

**`themes/<name>/theme.css` is the single source of truth for that theme's token values.** It is the stylesheet the injector actually loads, so its values are what ship. Read that file for every token value; no other file carries a copy. Mockups and palette explorations under `docs/` are design *inputs* — never copy a value out of one into a shipped theme without verifying it in the running app.

**Consume tokens via `var(--token)`, never a baked literal.** Overrides redefine OpenAI's `--color-*`/`--radius-*`/`--shadow-*` variables; never hardcode a colour where a variable belongs.

**Readability outranks aesthetics — always.** Every text/surface pairing a theme produces must pass **WCAG AA** contrast. A gorgeous low-contrast theme that tires the eyes over a long coding session is a failed theme. This is the project's first design law.

**The Captain's Cabin palette and typography are LOCKED (Phase 2, 2026-07-31).** The exact values for both `.electron-dark` and `.electron-light` live in [`themes/captains-cabin/theme.css`](../themes/captains-cabin/theme.css); the code palette is in `syntax.json` beside it; the fonts and their roles are recorded in [`docs/specs/customizable-ui-inventory.md`](specs/customizable-ui-inventory.md) §Fonts. Read those files for values — never a mockup, and never this file.

**Palette values are derived, not hand-picked.** Ramps are stepped in OKLCH and every contrast-critical token is *solved* for its WCAG AA target by binary search. The derivation is [`tools/palette/palette-engine.mjs`](../tools/palette/palette-engine.mjs); the check is `audit.mjs`; the emitter is `emit-theme.mjs`. To change a colour, change the recipe and regenerate — do not hand-edit `theme.css`:

```bash
node tools/palette/audit.mjs        # 272 checks; must be 272/272
node tools/palette/emit-theme.mjs   # rewrites theme.css + syntax.json
```

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

**The repo has a test harness as of Phase 4 M1**, grown once per Phase 4 milestone. It now covers the theme loader (manifest, safe-CSS, zip reader), the `.ccskin` writer, the packer, the `cdx` CLI, and both package builders (`tests/packaging/windows.test.js`, `tests/packaging/macos.test.js`) — plus, since Plan 0002 M4, the injector's **landmark degradation reporting** (`tests/injector/landmarks.test.js`, covering a theme whose selectors have all stopped matching) — plus, since Plan 0003 M1, the **hero scrim solver** (`tests/palette/hero-scrim.test.js`) and the PNG decoder's colour-type-2 path. Eleven files, **230 tests**, last run green on this machine 2026-08-05. The rest of the injector core, the launchers and the palette *derivation* tooling have no unit coverage and are proven by the running app and by `audit.mjs` instead.

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
