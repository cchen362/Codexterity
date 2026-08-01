# Codexterity — Settled Decisions

Owner decisions that any coding agent (Claude Code, Codex, or otherwise) must respect and must not re-litigate.

**Why this file exists.** Agent memory stores are per-tool and per-machine. When one agent settles something and records it only in its own memory, the next agent cannot see it and will re-propose work already done or declined. This file is in git, so every agent reads the same truth.

**How this file relates to code markers.** Decisions attached to specific behaviour are marked `D-<plan>-<n>` in the code they govern (see "Settled Decisions" in `docs/ENGINEERING.md`). Those get **one line here plus a pointer**. Decisions with **no single code home** keep their full reasoning here.

**How to use it.** Read before proposing changes to the injection mechanism, the styling strategy, or anything marked CLOSED. Append when a session settles something durable. **Never delete an entry** — supersede it, and mark the old one SUPERSEDED with the reason.

---

## Decisions anchored in code

One line each. Once the governed code exists, its `D-` marker is authoritative and the reasoning lives at the anchor. **No product code exists yet (end of Phase 1)** — these are accepted decisions whose markers will be stamped into the code as each is built. Full reasoning currently lives in Plan 0001.

| ID | Ruling | Reasoning lives in |
|---|---|---|
| **D-0001-1** | **Injection mechanism.** Build our own injector (no dependency on existing projects). Primary = `NODE_OPTIONS=--require <preload>` running an official Electron main-process API — **no debug port ever opened**. **AMENDED 2026-08-01: the API is `webContents.executeJavaScript` appending one `<style>` element, not `insertCSS()`** — see the amendment below. Fallback (built, not default) = loopback CDP injection, **not needed**. | [`injector/core/inject.js`](../injector/core/inject.js) · [Plan 0001 §1](plans/0001-captains-cabin-architecture.md) · [gate0-findings §2](research/gate0-findings.md) |
| **D-0001-2** | **Styling strategy.** Token-first: override semantic `--color-*` / `--radius-*` / `--shadow-*` on `.electron-dark` / `.electron-light`. Structural selectors only as declared, verified landmarks with graceful degradation. | `themes/*/theme.css` (marker at build) · [Plan 0001 §4](plans/0001-captains-cabin-architecture.md) |
| **D-0001-3** | **Non-destructive by construction.** Never modify, patch, or re-sign Codex's files on any OS. The injector structurally cannot read/write `auth.json`, `.credentials.json`, or API keys. Worst case = stock look; never brick. | `injector/` + `launcher/` (marker at build) · [Plan 0001 §1](plans/0001-captains-cabin-architecture.md) |
| **D-0001-4** | **Theme package format.** `.ccskin` = zip of `manifest.json` (target app + version range + landmarks) + safe-CSS-validated `theme.css` + `syntax.json` + embedded assets. Size-capped; no remote references. | `injector/theme-loader/` (marker at build) · [Plan 0001 §5](plans/0001-captains-cabin-architecture.md) |
| **D-0001-6** | **Surfaces are flat token colour.** No tiling texture, no gradient wash, no image behind content. Contrast figures are computed against flat colour; luminance variation behind text makes the worst pixel governing rather than the average. Depth comes from the surface ramp and borders. | [`themes/captains-cabin/theme.css`](../themes/captains-cabin/theme.css) (marker in file header) |
| **D-0001-9** | **Hero artwork: `hero-empty-state.webp`, shipped ungraded except for a highlight rolloff.** The generated lamp core clipped at luminance 0.935 — effectively blown white in a deliberately low-key image — and is rolled off to 0.530. Nothing else is altered. A brass re-tint toward `#C0A454` was built, rendered and **rejected on sight**; see D-0001-8. | [`themes/captains-cabin/assets/`](../themes/captains-cabin/assets/) · [`asset-manifest.md`](specs/asset-manifest.md) |
| **D-0001-10** | **Layer 2 "character pass" is approved and shipped.** Chrome-only decoration: brass selection, thin brass scrollbars, a brass hairline on `.app-header-tint`, depth + lit edge on `.popupContent`, and the scroll fade resolved to our ground. Scoped to chrome so D-0001-6 and the contrast proof are untouched. | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker in the Layer 2 block) |
| **D-0001-11** | **Accent policy for Codex's five stock hues.** The two DECORATIVE accents (`--color-accent-blue` = link/mention, `--color-accent-purple` = discovery) collapse into brass, per the design floor's one-accent rule. The three SEMANTIC status hues (`--color-accent-green` / `-red` / `-orange`) stay DISTINCT and are re-derived into this theme's palette instead — an error that looks identical to a success is a readability failure, and readability outranks aesthetics. Decided by the owner 2026-08-01 from the measured accent trace. **Do not "finish the job" by collapsing the status hues too.** | [`tools/palette/palette-engine.mjs`](../tools/palette/palette-engine.mjs) (marker on `deriveChrome`) · [findings §3](research/phase3-inventory-findings.md) |
| **D-0001-12** | **Every token declaration in `theme.css` is `!important`, and must be.** Codex writes 67 custom properties as an inline style on `<html>` shortly after boot; 47 collide with this theme's. Inline beats any non-important author rule, so without this the theme applies at `dom-ready` and is silently reverted — measured. This is the author-origin cost of D-0001-1's amendment (a user-origin sheet would win without it, but `insertCSS` is broken here). Safe in scope: these are property *definitions*, so nothing is forced on the properties that read them. | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker in the generated header) · [findings §1.1](research/phase3-inventory-findings.md) |
| **D-0001-7** | **Captain's Cabin ground, palette and typography are locked.** Ground = deep navy `#0E141F`; light mode = parchment with navy ink; accent = antique brass. Type = Fraunces (display/UI) + Monaspace Xenon (mono), both SIL OFL 1.1 and redistributable. Values are *derived* in OKLCH by `tools/palette/`, never hand-picked. | [`themes/captains-cabin/theme.css`](../themes/captains-cabin/theme.css) · [`tools/palette/palette-engine.mjs`](../tools/palette/palette-engine.mjs) |

### D-0001-1 — amendment, 2026-08-01: the working primary API

Recorded after Gate 0 ran the injector against the real app. **The decision itself does not
change**; only the specific API it names, and the amendment strengthens rather than weakens
the guarantee it was chosen for.

**`webContents.insertCSS()` is broken on this Electron fork.** It throws
`TypeError: o.webFrame[t] is not a function` inside Electron's own sandboxed-renderer
`webFrame` proxy, on every window, identically with and without `cssOrigin`. Not a
configuration problem, and not fixable without modifying Codex's files, which D-0001-3
forbids absolutely.

**The shipped primary is `webContents.executeJavaScript` appending a single `<style>` element**
with a stable id. It travels a *different* main→renderer channel, it is equally official, and
it opens **no debug port** — so the whole reason mechanism A beat mechanism B survives intact.
**The CDP fallback was not needed and must not be made default without owner approval.**

Two costs, both real, both commented at the code:

- **Author origin, not user origin.** Our overrides are custom-property definitions competing
  with Codex's own. In practice this is comfortable: Codex defines its semantic layer inside
  `@layer utilities`, and an unlayered author rule beats a layered one regardless of order or
  specificity. Verified in the running app — **no `!important` is required anywhere**
  ([phase3-inventory-findings §1](research/phase3-inventory-findings.md)). A stock author rule
  marked `!important` would still win, and none currently is.
- **It is a DOM node**, so the app could in principle re-render it away, where an inserted
  stylesheet could not. The stable id makes re-application idempotent, and the injector
  re-applies on `dom-ready`, `did-navigate` and `did-navigate-in-page`.

Anchor: [`injector/core/inject.js`](../injector/core/inject.js) (`applyThemeViaStyleTag`).

## Superseded or hollowed-out — do not re-stamp

| Decision | Status |
|---|---|
| _None yet._ | |

## Open — reopened by the owner, not yet settled

### D-0001-7 (typography half) — REOPENED 2026-08-01

**The ground/palette half of D-0001-7 stands and is not in question.** Only the type
half is reopened, by the owner, after seeing Fraunces render in the real app at Gate 0:
*"the fonts are not crisp enough and it can be challenging or tough to read in long
sessions."*

**Why this is a legitimate reopening rather than a preference.** It collides with the
project's own first design law in `docs/ENGINEERING.md`: *"Readability outranks
aesthetics — always. A gorgeous low-contrast theme that tires the eyes over a long
coding session is a failed theme."* An owner reporting eye strain in the running app is
that law firing.

**Diagnosis (to be tested, not assumed).** Fraunces is a *display* serif — high stroke
contrast, softly modulated terminals, optical sizing tuned for large settings. It is
currently doing double duty as both the display face and the UI/body face. At 13–14px
UI text the stroke contrast is what reads as "not crisp"; `opsz 14` mitigates it but
cannot change what the face is.

**The likely resolution is a split, not a replacement:** keep Fraunces for display
(headings, hero, title bar) where it earns its character, and introduce a dedicated
*text* face for UI and body. That is the pairing Fraunces was designed to be half of.

**Do not pick the text face in prose.** The owner judges type from a rendered visual and
has reversed a stated preference on sight before. Build the comparison first — same
screen, same sizes, several candidates — then ask. Any candidate must clear the design
floor (no Inter/Roboto/Arial/Open Sans/Lato/system-ui) and must be OFL or otherwise
redistributable inside a `.ccskin`.

**Not settled. Do not ship a font change until the owner approves one from a render.**

## Decisions with no code home

External facts, project identity, and policy that no single file governs.

**This section is complete by design, not a backlog.**

### D-0001-5 — Project & CLI naming (CLOSED)
- **Repo / product / engine name: `Codexterity`** (codex + dexterity — "craftsmanship applied to Codex"). Chosen 2026-07-31 after checking for brand collisions; `Codexterity` is clear where shorter candidates (Gildex, Amberdex, Illumindex, Emberdex, Adornex, Aurodex, Lumindex, Hearthdex) were all taken.
- **CLI command: `cdx`** (`cdx apply <theme>` / `cdx verify` / `cdx restore`) — short alias so the long product name never has to be typed at the terminal.
- **First theme name: `Captain's Cabin`** — the theme name stays deliberately premium/elegant per the brief and is intentionally *not* tied to the engine name, so future themes (e.g. Observatory, Submarine) sit under Codexterity without a naming clash.
- **Do not re-propose** engine renames without a concrete collision or trademark reason.

### D-0001-8 — Rejected design directions (CLOSED, do not re-propose)

Settled 2026-07-31 by the owner, each from a **rendered visual**, not from a description. Recorded so no agent spends another cycle on them.

- **Aubergine / purple ground (`#1E0D2B`).** Built as a full derived palette, rendered in the approval mockup, and rejected on sight. Do not propose a purple or indigo ground for this theme.
- **Tiling surface textures** (oak grain, leather grain, parchment grain, canvas/linen). Cut. Two reasons, in order of weight: tiled grain is high-frequency variation that reads as compression artifact or discolouration rather than as material, especially on a ~9% lightness ground where it can only lighten; and it invalidates the flat-surface assumption behind every contrast figure the theme claims. See D-0001-6.
- **A full-bleed atmospheric background behind the whole app** (the "glass panels over artwork" look). Considered against a reference the owner supplied, and narrowed to *empty states only* before textures were cut altogether. Imagery is permitted only where no dense text sits over it.
- **A serif-plus-sans pairing** (Alegreya + Alegreya Sans + Commit Mono) was offered as the safer, quieter option and not chosen. Fraunces carries both display and UI.

### Phase 2 outcome (reference, 2026-07-31)

Captain's Cabin ships **no raster assets**. The theme is text plus two OFL fonts. This retires the 32 MiB package cap, the seamless-tiling pipeline, and the per-ground texture re-grade as concerns. An atmospheric hero for the empty state remains a documented *optional future* addition — nothing has been generated, and the theme is complete and correct without it.

### Codex Desktop environment facts (reference, verified 2026-07-31)
- Codex Desktop is **Electron** ("owl" fork, Chromium 150). Windows = sealed **MSIX** from the Store (files un-patchable); macOS = signed `.dmg`, Apple-Silicon.
- The app ships with **stock, un-hardened Electron fuses** (`NODE_OPTIONS` honoured, ASAR integrity validation off) — verified by decoding the fuse bytes in `chrome.dll`. This is what makes D-0001-1's primary mechanism available. If a future Codex build flips these fuses, the CDP fallback path applies.
- Full evidence: [`docs/research/phase1-research-findings.md`](research/phase1-research-findings.md).
