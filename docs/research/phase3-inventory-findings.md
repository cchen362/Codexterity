# Phase 3 — Hook & token inventory, rebuilt from the running app

**Run 2026-08-01** on the Windows development machine, against the same build Gate 0
tested: Codex Desktop `26.727.6591.0` (Electron / Chromium `150.0.7871.182`), MSIX package
`OpenAI.Codex_26.727.6591.0_x64__2p2nqsd0c76g0`.

This document answers Plan 0001's Phase 3 item 1 — *"rebuild the hook and token inventory
from the running app"* — and, as a consequence, item 4 (the multi-accent violation) and the
landmark half of item 2. It **supersedes [`customizable-ui-inventory.md`](../specs/customizable-ui-inventory.md)
§Tier 2**, which was built by static analysis and is wrong about this build.

Instrument: [`injector/core/probe.js`](../../injector/core/probe.js), run with `CDX_PROBE=1`,
which suppresses theme injection so nothing it observes is our own.

---

## Verdict in one line

**Our styling layer was the right one; our token list was not.** Codex defines **97** custom
properties on `.electron-dark`, and Captain's Cabin overrides **24** of them. The 73 we miss
include every token that paints the sidebar, the editor surfaces, the menus and all four
accent colours. Nothing about the mechanism or the strategy needs to change — the theme needs
to claim the rest of the layer it already sits in.

---

## 0. Two measurement bugs found first, because they changed the answer

Gate 0 recorded one invalid measurement. This pass found two more, both in the new
instrument, and both caught **before** any conclusion was drawn from them. They are written
down because each produced a plausible, confident, wrong number.

### 0.1 The CSSOM destroys `var()` inside shorthands

Reading stylesheet text via `sheet.cssRules` and `rule.cssText` loses shorthand `var()`
references. Chrome expands a shorthand into longhands, and a var-bearing shorthand becomes a
*pending-substitution value* which serialises as **empty**:

```css
/* authored */            .composer { background: var(--color-surface); }
/* via cssText */         .composer { background-color: ; background-image: ; … }
```

Since "which tokens does the app *read*" is the entire question, a CSSOM walk silently
under-reports every shorthand read — `background`, `border`, `font`. The probe therefore
acquires stylesheet text **raw-first**: inline `<style>` text, else `fetch(href)`, and only
falls back to `cssRules` with the result flagged lossy. Measured on a controlled fixture
before the probe was ever pointed at Codex.

### 0.2 A CSS escape outside quotes swallowed 80% of the stylesheet

The first parser read `747,657` characters of Codex CSS and reported `1,096` rules and `557`
custom properties. The real figures are **`6,483` rules** and **`1,448` custom properties**.

Root cause: the scanner honoured backslash escapes inside quoted strings but not outside
them. Tailwind v4 emits selectors containing escaped punctuation, including `\'` — 20
occurrences in the shipped bundle. At the first one the scanner entered a phantom string and
swallowed every brace until the next apostrophe. Measured against the captured corpus: the
old scan ends at brace depth **1** having seen 659 top-level blocks; the corrected scan ends
at depth **0** with 1,044. Among the rules lost was a single 38 KB `.app-theme` rule carrying
**733** custom properties — most of the app's theming surface.

**What this invalidates:** an intermediate reading of *"41 of our 52 tokens are inert"*. The
true figure is **11**. No conclusion was published from the bad number, but it was one step
from being the headline of this document.

**What changed structurally:** the parser was moved out of the in-page template string into
real module-scope JavaScript, serialised into the page with `Function.prototype.toString()`.
The same source now runs in the renderer, is covered by `node --check`, and can be run
against a captured corpus in Node. `CDX_PROBE_DUMP_CSS=1` writes that corpus, so parser work
costs a file read rather than an app relaunch.

---

## 1. Codex's token architecture — four stages, measured

Every colour in the app resolves through this chain. Read it right-to-left; each stage is
defined by `var()` on the stage above it.

| Stage | Defined on | Layer | Example | Count |
|---|---|---|---|---|
| **0 — primitives** | `:root` / `:host` | `@layer theme` | `--gray-0: #fff`, `--blue-300: #339cff` | ~40 ramps |
| **1 — semantic** | **`.electron-dark` / `.electron-light`** | `@layer utilities` | `--color-text-foreground: var(--gray-0)` | **97** |
| **2 — VS Code bridge** | `.app-theme`, `:is([data-codex-window-type=…])` | `@layer utilities` / unlayered | `--vscode-foreground: var(--color-text-foreground)` | **733** |
| **3 — component tokens** | `:root` / `:host` | `@layer theme` | `--color-token-foreground: var(--vscode-foreground)` | ~250 |
| **4 — utilities** | Tailwind classes | `@layer utilities` | `.text-token-foreground { color: var(--color-token-foreground) }` | — |

Worked example, the sidebar background:

```
--gray-50  →  --color-background-surface-under  →  --vscode-sideBar-background
           →  --color-token-side-bar-background  →  --color-token-bg-primary
           →  .bg-token-bg-primary  →  the painted pixel
```

**Why stage 2 exists:** Codex Desktop shares its styling system with the Codex VS Code
extension. The `--vscode-*` layer is the theme-contribution surface a VS Code colour theme
would fill; in the desktop app it is filled from stage 1 instead. It is a *pass-through*, not
a source — which is why overriding stage 1 is sufficient and overriding 733 `--vscode-*`
names would be pointless.

### What this confirms and what it corrects

- **D-0001-2 is confirmed, twice over.** The root element carries `electron-dark`, and
  `.electron-dark` is *exactly* where Codex defines its own semantic layer. Token-first
  styling on the theme class is not merely viable, it is the app's own mechanism.
- **Our overrides win the cascade for the right reason.** Codex's stage-1 definitions sit in
  `@layer utilities`; ours are **unlayered**, and unlayered author styles beat layered ones
  regardless of order or specificity. No `!important` is needed anywhere.
- **Only 67 custom properties are inline on `<html>`** (2,957 bytes) — all sizing and a few
  `--color-*` duplicates, none load-bearing for colour. **Nothing needs `!important`.** This
  was the one fact that could have forced an ugly strategy, and it did not.
- **There are no adopted stylesheets.** `document.adoptedStyleSheets` is empty; everything is
  reachable from `document.styleSheets`.

---

## 2. The gap — what Captain's Cabin misses

Of the **97** stage-1 tokens, the theme overrides **24**. Of the theme's 52 declarations, 41
are read by Codex and 11 are inert (8 of those 11 are our own `--cc-syntax-*`, which are
consumed by our syntax palette, not by Codex, and are correctly inert here).

**The 20 highest-impact missing tokens**, ranked by total downstream `var()` reads —
i.e. how much of the app each one ultimately paints:

| Impact | Token | Stock value | What it governs |
|---|---|---|---|
| 481 | `--color-text-accent` | `rgb(100,164,224)` | every link, mention, focus accent |
| 366 | `--color-background-editor-opaque` | `rgb(33,33,33)` | editor / diff surfaces |
| 333 | `--color-background-elevated-primary-opaque` | `rgb(47,47,47)` | menus, popovers, dialogs |
| 226 | `--color-accent-blue` | `#0169cc` | **card icon 1**, info states, ANSI blue |
| 203 | `--color-text-foreground-tertiary` | `rgba(252,252,252,.498)` | all secondary/description text |
| 182 | `--color-background-surface-under` | `#0e0e0e` | **the sidebar** |
| 106 | `--color-background-accent-active` | `#001f3c` | selection, find-match, progress bar |
| 72 | `--color-background-button-secondary-hover` | `rgba(252,252,252,.078)` | every list hover row |
| 71 | `--color-background-accent` | `#001a33` | accent surfaces |
| 64 | `--color-accent-green` | `#40c977` | **card icon 2**, success, ANSI green |
| 54 | `--color-accent-red` | `#ff6764` | **card icon 3**, error, ANSI red |
| 50 | `--color-accent-purple` | `#b06dff` | **card icon 4**, discovery, ANSI magenta |
| 39 | `--color-accent-orange` | `#fb6a22` | warnings, modified decorations |
| 35 | `--color-background-status-warning` | `#4a2206` | warning surfaces |
| 31 | `--color-text-button-primary` | `rgb(9,9,9)` | primary button label |
| 29 | `--color-accent-yellow` | `#ffd240` | caution, ANSI yellow |
| 27 | `--color-background-status-error` | `#4d100e` | error surfaces |
| 26 | `--color-background-accent-hover` | `#001c37` | accent hover |
| 22 | `--color-decoration-modified` | `#ff8549` | git modified |
| 15 | `--color-background-application-menu` | `#191919` | **the menu bar** |

67 missing tokens have non-zero impact in total; the tail is terminal ANSI colours, the
referral-banner palette and git decoration hues.

**This list is the answer to "why is the app only partly themed".** Gate 0 observed a stock
sidebar, composer and menu bar. Those three are painted by
`--color-background-surface-under`, `--color-background-elevated-primary-opaque` and
`--color-background-application-menu` — none of which the theme names.

---

## 3. The multi-accent violation, resolved to its source

Gate 0 saw four stock accent colours on the empty-state cards. The colour census — every
non-greyscale colour painted anywhere in the live tree — finds exactly **five**:

| Painted | Reads | Chain |
|---|---|---|
| `rgb(100,164,224)` | `--color-token-text-link-foreground` | ← `--vscode-textLink-foreground` ← `--color-text-accent` ← `--blue-100` |
| `rgb(64,201,119)` | `--color-token-charts-green` | ← `--vscode-charts-green` ← `--color-accent-green` ← `--green-300` |
| `rgb(1,105,204)` | `--color-token-charts-blue` | ← `--vscode-charts-blue` ← `--color-accent-blue` ← `--blue-300` |
| `rgb(176,109,255)` | `--color-token-charts-purple` | ← `--vscode-charts-purple` ← `--color-accent-purple` ← `--purple-300` |
| `rgb(251,106,34)` | `--color-token-charts-orange` | ← `--vscode-charts-orange` ← `--color-accent-orange` ← `--orange-300` |

They are painted through Tailwind utility classes on the icons themselves —
`svg.icon-xs.shrink-0.text-token-charts-green` — so there is nothing structural to select
and nothing to fight. **All five collapse by overriding five stage-1 tokens**:
`--color-text-accent`, `--color-accent-blue`, `--color-accent-green`, `--color-accent-purple`,
`--color-accent-orange`.

That is a five-line fix once the palette values are decided — and deciding them is a design
question, not an engineering one (see §6).

---

## 4. Landmarks — the real ones, and why three of the four old ones can never come back

All four landmarks declared before Gate 0 matched nothing, and re-checking here confirms it:
`.app-header-tint`, `.popupContent`, `.app-shell-main-content-top-fade` — 0 matches each.

**Codex uses CSS Modules with build-hashed class names.** The live DOM is full of classes
like `_ApplicationMenuTopBar_zbk1f_3`, `_MainContentViewport_zbk1f_143`, `_track_1t17l_41`,
`_root_1d623_1`, `_footer_1xj1z_2`, `_Navigation_1m7sz_2`. The hash is a build artefact: it
changes whenever the module's content or path changes. **A CSS-module class is not a
landmark and must never be used as one** — it would work in testing and break on the next
Codex release, which is precisely the failure mode D-0001-2 was written to avoid.

### 4.1 What can be used instead — the app's own tint hooks

Far better than any selector: Codex reads a set of custom properties that it **never
defines**, leaving them open for a host to fill. These are sanctioned, named theming holes.

| Hook | Read by | Reads |
|---|---|---|
| `--codex-titlebar-tint` | `--header-tint` → `background-color` on the title bar | 3× |
| `--composer-top-tray-background` | `background` on the composer tray | 5× |
| `--composer-top-tray-border` | `border` / `border-color` on the composer tray | 5× |
| `--app-shell-tab-background` | `background-color` and a gradient stop on shell tabs | 4× |
| `--browser-sidebar-annotation-selection-color` | annotation selection border/background | 3× |

`--codex-titlebar-tint` is a **direct, supported replacement for `.app-header-tint`**: the
title bar's own rule is `--header-tint: var(--codex-titlebar-tint, transparent);
background-color: var(--header-tint)`. Setting one custom property on the root tints the
title bar, with no structural selector at all.

### 4.2 Plain global classes present in the live DOM

Where a real selector is unavoidable, these are non-hashed and semantically named:

`app-shell-left-panel` (the sidebar `<aside>`), `sidebar-item` (35), `sidebar-icon-button`
(14), `sidebar-hover-icon-button-tint` (60), `icon-xs` (52) / `icon-2xs`, `no-drag` (94),
`heading-xl`, `vertical-scroll-fade-mask`, `text-fade-truncate`, `ProseMirror` (the composer
input), `draggable`.

They are still Codex's markup and can change — but they are authored names, not build
hashes, so they change when the UI changes rather than on every build.

### 4.3 `pre, code, kbd, samp` — still unresolved, and still not disproven

Zero matches, as at Gate 0 — and the empty state genuinely contains no code, so this remains
**untested**, not refuted. `.cm-editor` and `[class*="markdown"]` are also absent on this
screen. What the stylesheet *does* tell us: the tokens exist and are read —
`--color-token-text-code-block-background`, `--vscode-textCodeBlock-background`,
`--color-token-editor-background`, and a `._markdownContent_…` CSS module defining 6
properties. **Code surfaces are themeable through stage-1 tokens
(`--color-background-editor-opaque`) without needing an element selector at all**, which
makes the open question much less load-bearing than it was. It should still be probed on a
screen containing a code block before anything structural is written for it.

---

## 5. Incidental operational findings

- **Codex is single-instance.** Launching it while an instance is running prints
  `Opening in existing browser session`, hands off, and exits — the new process never
  initialises, so **the injector does not attach**. A user who has Codex open and then clicks
  the Captain's Cabin shortcut gets an unthemed app and no error. The launcher must detect a
  running instance and say so. Not fixed in this pass; recorded as Phase 3 work.
- **The executable is `ChatGPT.exe`**, and its processes are named `ChatGPT` — not `Codex`.
  Match on the package path (`*OpenAI.Codex_*`) when identifying processes; a name match on
  `codex` finds nothing, and a name match on `ChatGPT` would also hit the unrelated
  *ChatGPT Classic* app.
- **The stylesheets are not readable from disk.** The MSIX install directory contains no
  loose `assets/*.css`; the bundle is packed. The running app is the only source, which is
  why the probe can dump its corpus.

---

## 6. What is decided by engineering, and what needs the owner

**Settled by measurement — no decision required:**

1. Keep the mechanism (D-0001-1), keep token-first styling on `.electron-dark` /
   `.electron-light` (D-0001-2). Both are confirmed correct against the running app.
2. Expand `theme.css` from 24 to the full set of stage-1 tokens that have downstream paint
   impact. This is a generation change in `tools/palette/emit-theme.mjs`, not a hand edit.
3. Re-target the Layer 2 character pass from dead structural selectors onto the app's own
   tint hooks (`--codex-titlebar-tint` and the composer tray pair). Simpler and more durable
   than what was originally written.
4. Never use a CSS-module class as a landmark.

**Needs an owner decision** — the status hues. The design floor permits **one** accent, and
brass is it. But five of the missing tokens are *semantic status colours*: error red, success
green, warning orange, plus link blue and discovery purple. Collapsing all of them to brass
would make an error indistinguishable from a success indicator. The options are set out for
judgement rather than settled here, because "readability outranks aesthetics" cuts both ways
on this one.

---

## 7. Reproducing this

```bash
# stop any running instance first -- Codex is single-instance and the launcher
# will otherwise hand off to it and exit without injecting
powershell -NoProfile -Command "Get-Process | Where-Object { \$_.Path -like '*OpenAI.Codex_*' } | Stop-Process -Force"

# probe mode: theme injection suppressed, report written as JSON
$env:CDX_PROBE='1'
$env:CDX_PROBE_OUT='<a directory you own>'
$env:CDX_PROBE_AT='14000'            # ms after dom-ready; comma-separate for several samples
$env:CDX_PROBE_DUMP_CSS='1'          # also dump the CSS corpus for offline parser work
$env:CDX_DEBUG_LOG_PATH='<...>/injector.log'
powershell -NoProfile -ExecutionPolicy Bypass -File launcher\windows\launch.ps1
```

The report is `probe-wc<id>-t<ms>.json`. `wc1` is the main window; `wc3` is the avatar
overlay and is not interesting for theming.
