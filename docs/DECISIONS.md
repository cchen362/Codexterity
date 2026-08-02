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
| **D-0001-13** | **The theme PAINTS the sidebar; no token override can.** Measured 2026-08-02 in the running app in confirmed light mode: every ancestor of `.app-shell-left-panel` up to `<html>` is `rgba(0,0,0,0)`. Codex's own sidebar rule is gated `:not([data-codex-window-chrome=application-menu])`, and the Windows main window carries exactly that attribute — so Codex deliberately leaves the panel transparent and lets Windows 11 Mica show through. The owner's "pale mint-green sidebar" was **the desktop wallpaper** (sampled `#E6F9F6` / `#B7C5C6` / `#EAF7F3` down its length — not one colour, so not a token). Fixed with a real `background` declaration on the authored `.app-shell-left-panel` landmark. This is a **contrast** fix: D-0001-6 computes every figure against flat colour, and sidebar text sat over an arbitrary user wallpaper, making its contrast not merely unproven but unprovable. **Do not "restore" the translucent look** — it voids the contrast proof. | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker on the landmark block) · [findings §2.1](research/phase3-inventory-findings.md) |
| **D-0001-14** | **Active sidebar row carries a brass left-edge mark, hooked on TWO independent selectors.** `[data-app-action-sidebar-thread-active="true"]` (Codex's own authored app-action contract name) **and** `[aria-current="page"]` (the web standard), both measured on a real conversation screen (28 rows, exactly one active). Both are matched deliberately: they fail independently, so renaming either leaves the indicator working, and if both go the row keeps Codex's own highlight — a single hook would be one rename from silent removal, which is how the four pre-Gate-0 landmarks died. This is the *only* part of the Phase 2 sidebar mockup theming can deliver; that mockup drew a brass primary button, brass-bordered cards and a brass-railed list, **none of which Codex has**. It is a palette study, not a target — **do not re-attempt to reproduce it.** Verified matched, computed AND painted (32 px at x=8–9). | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker on the block) |
| **D-0001-15** | **The empty-state card hairlines and the composer send control get NO landmark — deliberately.** Both were carried as approved-but-unbuilt (Plan 0001 item 11) on the assumption they needed one. Measured 2026-08-02: neither does. (a) On Electron the cards' `border` is **zeroed** and replaced by `electron:ring-[0.5px] electron:ring-token-border-heavy` — a **box-shadow, not a border**, computed width `0 0 0 0`. It resolves to **`--color-border-heavy`**, a stage-1 token this theme already defines. Any rule written against `border-color` would have applied cleanly and painted nothing, which is exactly how the four pre-Gate-0 landmarks died. (b) The send control and the voice control are **one element** whose `aria-label` flips; it is painted by `bg-token-foreground` → **`--color-text-foreground`**, also already defined — and that token is the app's main text colour, so it *cannot* be retargeted at the button alone. Both verified **painted** in the running app in dark: ring `#5F6675` on card `#0E141F` (3.20:1, AA non-text), disc `#F4EAD4` with glyph `#222731` (12.52:1). **Do not add a selector for either.** The verification lives in the settled check instead. | [`injector/core/inject.js`](../injector/core/inject.js) (markers on the `cardHairline` and `composerAction` checks) · [findings §8](research/phase3-inventory-findings.md) |
| **D-0001-18** | **Tokens Codex sets on `<body>` must be re-declared on `<body>`; `!important` on `<html>` cannot win.** Custom properties **inherit**, so a value set on a *closer ancestor* governs every descendant regardless of specificity — this is not a specificity contest and no `!important` on the root can take it. Measured in the probe corpus: `:is([data-codex-window-type=browser],[…=chrome-extension],[…=electron]) body { --vscode-editor-font-family: ui-monospace, … }`. Consequence, measured in the running app: **the diff and terminal panels rendered in Consolas**, so D-0001-7's code face was missing from the surface most made of code while every colour around it was correctly themed. Fixed with a `.electron-dark body, .electron-light body` block. **Same shape as D-0001-12 one level down** — that decision handled Codex writing tokens inline on `<html>` and nobody checked `<body>`. A corpus sweep finds Codex sets **17** custom properties on body, of which exactly **2** collide with this theme; the other, `--color-background-elevated-primary`, is benign (it re-points our token to our own `-opaque` token, which the emitter always gives the same value, and its rule is gated on `.electron-opaque`, which this window does not carry). Verified by reproducing the conflict in a browser: before = `ui-monospace`, after = `Monaspace Neon`, and a control proving `!important` on `<html>` still loses. **Before adding any token, check whether Codex also sets it on body.** **VERIFIED IN THE RUNNING APP 2026-08-02** — `--vscode-editor-font-family` reads `'Monaspace Neon'` on **both** `<html>` and `<body>`, so the block wins and the decision stands. **But its stated CONSEQUENCE is CORRECTED: capturing this token does NOT fix the diff/terminal panels.** Measured on one screen: the **diff renders `Monaspace Neon`** (and is the only mono face present), while the **475x1280 terminal-class side panel still computes `ui-monospace`** — it sees `'Monaspace Neon'` in the variable, carries no inline style, and does not read the variable at all. The panel is a **separate, still-open defect**; the ruling above governs the token only. See [findings §8.6.2](research/phase3-inventory-findings.md). | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker on the body block) · [findings §8.6.1](research/phase3-inventory-findings.md), [§8.6.2](research/phase3-inventory-findings.md) |
| **D-0001-19** | **The terminal is xterm.js and needs a LANDMARK — no token can ever reach it.** Measured 2026-08-02, three identical samples: the panel is `class="xterm-rows"`, `fontOrigin` is the element itself, `inline=none`, and **both** `--vscode-editor-font-family` **and** `--default-mono-font-family` already resolve to `'Monaspace Neon'` *at that element* — which painted `ui-monospace` (Consolas) anyway. xterm.js takes `fontFamily` from a **JavaScript options object** and writes a literal stack into a stylesheet it generates at runtime, so it reads neither variable. **D-0001-18 captured the token at every level and structurally could not reach this surface**: a captured token is not a consumed token. The rule targets `.xterm`, `.xterm-rows` **and `.xterm-char-measure-element`** — the last is **load-bearing and must not be dropped**: xterm's DOM renderer sizes its cell grid by measuring that element, so styling the rows alone would make it measure Consolas while painting Monaspace, desynchronising the grid (misplaced cursor, offset selection). Metric-compatibility is not available — Monaspace and Consolas differ. Hooks are xterm's own public class names, not Codex build hashes; if xterm is replaced the rule stops matching and the terminal returns to its stock face. **Only possible because Codex runs xterm's DOM renderer** (`xterm-dom-renderer-owner-1`) — under the canvas/WebGL renderer glyphs are rasterized from the JS font and no CSS could touch it. **Verified in the running app:** `rows="Monaspace Neon" measureElement="Monaspace Neon" => COHERENT`, region `font="Monaspace Neon"` at **12.83:1**, and the owner confirmed metrics by printing 400 chars — 6 flush rows + 4 remainder, i.e. wrap column exactly 66, with cursor and selection landing on the glyphs. | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker on the xterm block) · [`injector/core/inject.js`](../injector/core/inject.js) (marker on the xterm coherence check) · [findings §8.6.2](research/phase3-inventory-findings.md) |
| **D-0001-17** | **Row hover/press are anchored to the SIDEBAR, and LIFT in both modes.** They were a fraction of the ramp measured from the *ground* until 2026-08-02. Because the sidebar sits below the ground in both modes, that made dark's hover move away from it (ΔL 0.0574) and light's move toward it (**0.0122** — invisible; the owner reported it in the running app and it measured 4.7× weaker than dark). Same formula, opposite outcome, decided purely by ramp direction. Now `surf(SIDEBAR_DL + ROW_HOVER_DL)` with a **positive** direction in both modes: a hovered row *lifts*, which is what dark always did. Light lands at ΔL **0.0600** against dark's 0.0574 — symmetric by construction. **Chosen over an equally-sized DARKEN because lifting stays inside the existing ramp**, so it costs **zero** other palette changes and *raises* contrast (meta on hover 4.96 → **6.17**, body 11.80 → **14.67**) instead of spending it; darkening pushed the row past the ramp and, per `deriveChrome`'s guard, would have forced 9 ink tokens to re-solve. Owner chose lift from a render, 2026-08-02. **Do not re-derive row states from the ground.** | [`tools/palette/palette-engine.mjs`](../tools/palette/palette-engine.mjs) (marker on the row hover/press block) · [findings §8.5.2](research/phase3-inventory-findings.md) |
| **D-0001-7** | **Captain's Cabin ground, palette and typography are locked.** Ground = deep navy `#0E141F`; light mode = parchment with navy ink; accent = antique brass. **Type (typography half re-closed 2026-08-01; CODE FACE re-closed again 2026-08-02): Fraunces = DISPLAY only, Literata = UI/body, Monaspace NEON = code** — all three SIL OFL 1.1, all three embedded as data URIs. **Monaspace Xenon was the code face until 2026-08-02 and is superseded** — see the code-face note below. Values are *derived* in OKLCH by `tools/palette/`, never hand-picked. | [`themes/captains-cabin/theme.css`](../themes/captains-cabin/theme.css) · [`tools/palette/palette-engine.mjs`](../tools/palette/palette-engine.mjs) |

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

_Nothing open._ D-0001-7's typography half was reopened and re-closed on 2026-08-01; the
history is kept below because the reasoning is worth not repeating.

### D-0001-7 (code face) — REOPENED and RE-CLOSED 2026-08-02: Xenon → Neon

**RESOLUTION (CLOSED). The code face is Monaspace NEON.** The owner judged it in the
running app — *"the Neon reads so MUCH better"* — and it is verified rendering, not
falling back: `code=1 font="Monaspace Neon"` on a real `<code>` element, in both modes.

**Why Xenon failed, and it was not a bug.** Xenon rendered correctly the whole time; the
settled check confirmed the face was loadable and applied. The problem was the face itself:
**Xenon is the slab-serif member of the Monaspace family**, so with Fraunces (display) and
Literata (UI/body) the app was serif at *every* level. Code normally signals "literal text,
not prose" partly through texture, and a slab-serif mono inside serif body copy erases that
signal. The owner's report — *"the text/font inside the code block reads a little weird"* —
was that, not a rendering fault.

**Why no comparison render this time**, unlike the Literata decision. The Monaspace family
shares **identical metrics across all five faces**, so Xenon → Neon is a font-file swap with
zero layout consequence — same advance width, same line breaks, same column alignment. The
owner declined a mockup on those grounds and judged it directly in the app, which is the
better instrument anyway. *This is not a precedent for skipping renders on faces with
different metrics.*

**Rejected on the way, and why — do not re-propose:**
- **IBM Plex Sans / Work Sans for code.** Both are PROPORTIONAL. Code needs a fixed advance
  width or indentation, file trees, diffs and commit-hash columns all break. Not aesthetics,
  function. (**IBM Plex Mono** is the faithful form of that request and remains a legitimate
  future candidate; Work Sans has no mono sibling.)
- **Codex's own stock mono.** Measured unthemed as `ui-monospace, SFMono-Regular, SF Mono,
  Menlo, Consolas, Liberation Mono, monospace` — which resolves to **Consolas on Windows and
  SF Mono on macOS**, i.e. a different face on each of the two target platforms, and Consolas
  is Microsoft-licensed so it can never ship inside a `.ccskin`.

### D-0001-7 (typography half) — REOPENED and RE-CLOSED 2026-08-01

**RESOLUTION (CLOSED).** The owner judged the rendered comparison
([`docs/mockups/0003-typography-comparison.html`](mockups/0003-typography-comparison.html))
and chose **Literata at 14px** for UI and body, with **IBM Plex Sans** named as the runner-up
should Literata ever need replacing. **Fraunces stays as the display face** (Codex's ten
authored `.heading-*` classes); **Monaspace Xenon** is unchanged for code. Shipped in
`tools/palette/emit-theme.mjs`; the diagnosis below — that the fix was a split, not a
replacement — held.

**Two things this surfaced, both worth keeping:**

1. **The app had never rendered Fraunces at all.** `theme.css` named it with no `@font-face`,
   and it is not installed on either machine, so the app was showing the CSS fallback,
   Georgia. The eye strain that reopened this decision was therefore Georgia at 13–14px. All
   three faces are now **embedded as data URIs** — this is a correctness requirement, not a
   packaging step, and it is why `theme.css` is ~300 KB.
2. **A `font-family` naming an unavailable face fails silently** — the computed value still
   reports the name you asked for, which is exactly how Gate 0 recorded a false confirmation.
   Verify with `document.fonts.load()` *then* `document.fonts.check()`. Both are now permanent
   in `injector/core/inject.js`.

The original reasoning, kept because it is the argument that produced the right answer:

---

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

~~**Not settled. Do not ship a font change until the owner approves one from a render.**~~
Settled 2026-08-01 by exactly that route — see the resolution at the top of this entry.

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

### D-0001-16 — macOS verification is deferred behind Phase 4 packaging (CLOSED, 2026-08-02)

**Ruling by the owner.** There is no Mac on this project. The one available machine
belongs to a collaborator who is willing to install the finished thing and try it — and
that is the *only* form macOS verification can take. A collaborator will not be asked to
clone the repo, install Node, and run `launcher/macos/launch.sh` by hand.

**Consequences, all deliberate:**

- **`launcher/macos/launch.sh` ships unverified** and stays that way until Phase 4 produces
  a `.ccskin` and an installer. Its header says so; do not soften that wording, and do not
  mark it verified on the strength of a Windows run or a code review.
- **macOS verification is downstream of Phase 4, not parallel to it.** This partly reverses
  Phase 3's "settle the look first — packaging adds nothing visual" sequencing. That framing
  still holds for Windows; it does not hold for the cross-platform gap.
- **The three macOS unknowns stay open and stay loud** rather than being guessed at: the
  bundle's real identity, the `EnableNodeOptionsEnvironmentVariable` fuse on the macOS
  binary (Phase 1 decoded fuses out of the *Windows* `chrome.dll` only), and whether
  D-0001-13 needs `!important` there (Codex's own sidebar rule scores (0,3,0) against our
  (0,2,0) and probably *does* match on a window without application-menu chrome).
  **Do not "pre-fix" any of them.**

**Do not re-propose macOS verification as Phase 3 work, and do not ask the owner to obtain
a Mac.** The next honest step is Phase 4, and the macOS answer arrives with it.

### Phase 2 outcome (reference, 2026-07-31)

Captain's Cabin ships **no raster assets**. The theme is text plus two OFL fonts. This retires the 32 MiB package cap, the seamless-tiling pipeline, and the per-ground texture re-grade as concerns. An atmospheric hero for the empty state remains a documented *optional future* addition — nothing has been generated, and the theme is complete and correct without it.

### Codex Desktop environment facts (reference, verified 2026-07-31)
- Codex Desktop is **Electron** ("owl" fork, Chromium 150). Windows = sealed **MSIX** from the Store (files un-patchable); macOS = signed `.dmg`, Apple-Silicon.
- The app ships with **stock, un-hardened Electron fuses** (`NODE_OPTIONS` honoured, ASAR integrity validation off) — verified by decoding the fuse bytes in `chrome.dll`. This is what makes D-0001-1's primary mechanism available. If a future Codex build flips these fuses, the CDP fallback path applies.
- Full evidence: [`docs/research/phase1-research-findings.md`](research/phase1-research-findings.md).
