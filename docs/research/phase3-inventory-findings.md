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
- **67 custom properties are inline on `<html>`** (2,957 bytes), written by Codex a moment
  after boot — and **47 of them are ones this theme also defines**, so the theme *does*
  need `!important`. See §1.1; an earlier draft of this document claimed the opposite.
- **There are no adopted stylesheets.** `document.adoptedStyleSheets` is empty; everything is
  reachable from `document.styleSheets`.

### 1.1 The theme needs `!important` — measured, after this document first said it did not

This section corrects a claim made above in an earlier draft. It is left visible rather than
quietly edited away, because the wrong version was arrived at by exactly the kind of
reasoning this project keeps having to unlearn: the inline token *names* were read, judged
"not load-bearing for colour" by eye, and never checked against the theme's own list. 47 of
the 67 overlap.

**What was measured.** Injecting the expanded theme without `!important` and re-reading the
tokens after the app settled (`CDX_VERIFY_AT=15000`):

| Token | At `dom-ready` | At +15 s | |
|---|---|---|---|
| `--color-background-surface` | `#0E141F` (ours) | `#111111` | **reverted to stock** |
| `--radius-lg` | `7px` (ours) | `calc(.625rem * 1.25)` | **reverted to stock** |
| `--color-background-button-primary` | `#C0A454` (ours) | `rgb(9,9,9)` | **reverted to stock** |
| `--color-text-primary` | `#F4EAD4` (ours) | `#F4EAD4` (ours) | held — Codex never writes this one |

Our `<style id="codexterity-theme">` was still **present** in the document at +15 s and still
last in `<head>`. It was not removed; it was **outranked**. An inline declaration beats every
non-important author rule at any specificity, and the one token that held is precisely the
one Codex does not write inline.

**Why this is a cascade fact, not a defeat.** It is the author-origin cost that D-0001-1's
amendment already names, coming due. A **user-origin** stylesheet — what
`webContents.insertCSS()` would have produced — beats inline styles *without* `!important`.
`insertCSS` is broken on this fork, so the theme is author-origin, and `!important` is the
only cascade mechanism that reaches an inline declaration at all.

**Why it is safe.** Every important declaration is a custom-property *definition*. Marking a
definition important fixes which value the variable holds; it forces nothing on the
properties that read it, so Codex's own layout, state and interaction rules keep winning
normally. Recorded as **D-0001-12**.

**The lesson for the next probe.** The first settled reading also showed several
`--color-token-*` as `(unset)` — which was *not* a finding, but an artefact of sampling at
`dom-ready`, before Codex's later stylesheets load. A negative result needs its control flow
checked before it is believed, in both directions: one sample was falsely reassuring and the
next was falsely alarming, and both were taken with the same instrument.

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

### 2.1 CORRECTION, 2026-08-02 — the sidebar is not painted by a token at all

**The sidebar entry in the table above is wrong, and the impact ranking that produced it is
the reason it went unnoticed for a day.** `--color-background-surface-under` does have 182
downstream `var()` reads, but **none of them paints `.app-shell-left-panel` on Windows.**

Measured in the running app, in confirmed light mode (`rootClass=electron-light`), by walking
the sidebar's ancestor chain **to `<html>` without a cap**:

```
<aside.app-shell-left-panel>  rgba(0,0,0,0)  alpha 0
<div.relative.isolate>        rgba(0,0,0,0)  alpha 0
<div.relative.flex>           rgba(0,0,0,0)  alpha 0
<div#root>                    rgba(0,0,0,0)  alpha 0
<body>                        rgba(0,0,0,0)  alpha 0
<html.electron-light>         rgba(0,0,0,0)  alpha 0
```

**Nothing in the document paints the sidebar.** Codex's own rule that would is

```css
[data-codex-window-type=electron]:not([data-codex-window-chrome=application-menu])
  .app-shell-left-panel { background: var(--color-token-editor-background) }
```

and `<html>` here carries `data-codex-window-chrome="application-menu"` — the `:not()`
excludes this window exactly. On Windows the main window owns the application menu
(File/Edit/View/Help), so Codex **deliberately** declines to paint that panel and lets the OS
window material (Windows 11 Mica/acrylic) show through. What the user sees there is their
**desktop wallpaper**. Sampled from the screen before the fix: `#E6F9F6` at the top,
`#B7C5C6` lower, `#EAF7F3` at the bottom — *the panel is not one colour*, which is conclusive.
A token yields a uniform fill; only an image varies down its length.

Note also that the chain the sidebar rule *would* have used is
`--color-token-editor-background` → `--vscode-editor-background` →
**`--color-background-editor-opaque`** — not `--color-background-surface-under`. And Codex's
light-mode value for it is *translucent despite the name*
(`color-mix(in oklab, var(--gray-100) 40%, transparent)`).

Fixed under **D-0001-13** with a real declaration on the authored `.app-shell-left-panel`
landmark. **Two lessons, both already on this project's list and both re-learned the hard way:**

1. **A chain that resolves in the stylesheet is not a chain that applies to an element.** The
   four-stage trace above was followed correctly and was still irrelevant, because the rule
   carrying it is gated on an ancestor attribute. *Check that the rule MATCHES* — the probe
   now reports `paintTraces`, which walks to the root and names the first ancestor that
   actually paints, and `windowGuards`, which reads the attributes those gates test.
2. **Impact ranking measures reads, not paints.** A token can be read 182 times and paint
   nothing on the screen in front of you.

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

**RESOLVED the same day.** The owner chose the policy recorded as **D-0001-11**: the two
*decorative* hues (link blue, discovery purple) collapse into brass; the three *semantic*
status hues stay distinct but are re-derived into this theme's own world. Verified in the
running app by reading what the icons actually compute, not merely what the root resolves:

```
painted .text-token-charts-blue    color=rgb(172,143,63)   childFill=rgb(172,143,63)   → brass #AC8F3F
painted .text-token-charts-purple  color=rgb(172,143,63)   childFill=rgb(172,143,63)   → brass #AC8F3F
painted .text-token-charts-green   color=rgb(102,158,122)  childFill=rgb(102,158,122)  → verdigris
painted .text-token-charts-orange  color=rgb(212,124,70)   childFill=rgb(212,124,70)   → burnt ochre
```

A resolved token is not a painted pixel, so the check reads the elements. That check is now
permanent in `reportRootEnvironment` and runs on every launch.

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
  the Captain's Cabin shortcut gets an unthemed app and no error. **Fixed:** the launcher now
  detects a running instance and refuses with an explanation, matching on the package path.
  It reports and stops rather than terminating anything.
- **Codex's window exposes no UI-automation tree.** A `Snapshot` of the focused ChatGPT
  window returns "No interactive elements", so the app cannot be driven from outside to reach
  a particular screen. Anything that must be observed on a specific screen has to be
  *instrumented to record itself* on whatever screen the user is on — which is how the code
  surface check works.
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

---

## 8. The empty-state controls and the menu surface — measured 2026-08-02

Plan 0001 item 11 carried two pieces of approved design as **NOT BUILT, no measured hook**:
the empty-state card hairlines and the composer send control. Both are now measured, and
**neither needed code.** Each was already reached by a stage-1 token this theme defines. The
work this session was finding that out without shipping a third dead selector.

### 8.1 The card "hairline" is not a border — it is a ring, and on Electron the border is gone

The four cards on the home empty state carry **both**:

```
border  border-token-input-border                                          /* the non-Electron path */
electron:border-0  electron:ring-[0.5px]  electron:ring-token-border-heavy  /* what applies here */
```

On this platform Codex **zeroes the border and substitutes a ring**, which Tailwind implements
as a `box-shadow`. Measured computed border width on all four cards: **`0 0 0 0`**.

**Any selector written against `border-color` would have applied cleanly, passed review and
painted nothing** — the same silent no-op that killed the four pre-Gate-0 landmarks. Item 11's
"two guessed selectors were deliberately not shipped" was the right call, for a reason nobody
had yet measured.

The ring resolves through a chain that ends inside this theme's own vocabulary:

```
ring-token-border-heavy -> --tw-ring-color -> --color-token-border-heavy
                        -> --color-border-heavy      (STAGE 1 — this theme already defines it)
```

**Verified painted in the running app, dark mode:**

```
empty-state card hairline: 4 card(s); ring-color=#5F6675  border-width=0px  bg=rgb(14, 20, 31)
```

`#5F6675` is this theme's `--color-border-heavy`; `#0E141F` is its `--color-background-surface`.
Contrast hairline-on-card is **3.20:1** in dark and **3.20:1** in light (both computed; the
light figure is not yet confirmed *painted*). AA non-text is 3:1, so both clear.

### 8.2 The send control and the voice control are ONE element

There is no separate send button. The filled circular control at the composer's right is a
single element whose `aria-label` flips between `"Start new voice chat"` and `"Send"` when the
composer holds text. Classes, size and position never change. It is painted by
`bg-token-foreground`:

```
bg-token-foreground -> --color-token-foreground -> --vscode-foreground
                    -> --color-text-foreground   (STAGE 1 — this theme already defines it)
```

That token is also the app's **main text colour**, so the button cannot be retargeted alone
without recolouring every glyph in the app. It therefore inherits the theme rather than being
themed separately — and what has to be checked is not the fill but the **contrast between the
disc and the glyph on it**, because a foreground-coloured glyph on a foreground-coloured disc
would read as a missing icon rather than as a theming bug.

**Verified painted in the running app, dark mode:**

```
composer filled control: aria="Send"  disc=rgb(244, 234, 212)  glyphFill=rgb(34, 39, 49)
```

`#F4EAD4` disc, `#222731` glyph — **12.52:1**. Both ends are this theme's own ramp, so the
inversion is correct by construction in both modes.

**Recorded as D-0001-15: no landmark is written for either, deliberately.**

### 8.3 A THIRD reads-vs-paints trap — the menu surface

Section 2.1 recorded that impact ranking measures `var()` **reads**, not **paints**. It happened
again, and the table in section 2 is again the thing that would have misled:

| Section 2 says | What actually paints the open menu |
|---|---|
| `--color-background-elevated-primary-opaque` — *"menus, popovers, dialogs"*, 333 reads | `bg-token-dropdown-background/90` -> `--color-token-dropdown-background` -> `--vscode-dropdown-background` -> **`--color-background-control-opaque`** |

Measured on the open permissions popover:

```
<div role=menu> 427x223  bg=oklab(0.268617 … / 0.9)  backdrop-filter: blur(8px)  radius=15px
classes: bg-token-dropdown-background/90  text-token-foreground  ring-token-border
```

This theme **does** define `--color-background-control-opaque`, so the menu is themed — but by
a different token than the one the impact table would have sent you to. **Read section 2's table
as a list of candidates, never as an attribution.**

### 8.4 OPEN — menu panels are translucent over a blur, and D-0001-6 has not been applied to them

The panel is `/90` (90% opaque) **over `backdrop-filter: blur(8px)`**. Text on it therefore does
**not** sit on flat colour, which is the assumption behind every contrast figure this theme
claims (D-0001-6). The blur means what shows through is low-frequency, so the perturbation is
small — but "small" is not a number, and no number has been produced.

**This is stated as open, not fixed.** The alpha is Codex's own `/90` utility on the element, so
changing it needs a landmark, and writing one to solve an unquantified problem is the instinct
this project dropped in item 10. What is needed first is a measurement of menu text over a
worst-case backdrop.

#### 8.4.1 The number exists now — computed 2026-08-02, and it narrows the question

The panel is 90% opaque, so the backdrop can move the effective surface **at most 10% toward
black or white**. That makes an *unconditional* bound available without enumerating anything:
composite the panel over pure `#000` and pure `#FFF`, and a pair that clears AA against both is
closed **permanently**, for every backdrop that exists or could ever exist. `blur(8px)` only pulls
the backdrop toward its local mean, so compositing over an *unblurred* extreme over-states the
perturbation — every figure below is conservative.

Panel = `--color-background-control-opaque` (§8.3): `#222731` dark, `#DFD7C5` light.

| Ink | Mode | flat | worst possible | verdict |
|---|---|---|---|---|
| `--color-text-foreground` (item label) | dark | 12.52 | **9.13** | passes over **every** backdrop |
| `--color-text-secondary` | dark | 7.03 | **5.12** | passes over **every** backdrop |
| `--color-text-tertiary` | dark | 4.61 | 3.36 | fails once the backdrop is lighter than `#353535` |
| `--color-text-accent` | dark | 4.82 | 3.51 | fails once the backdrop is lighter than `#585858` |
| `--color-text-error` / `-success` | dark | 4.80 | 3.50 | fails once the backdrop is lighter than `#535353` |
| `--color-text-foreground` (item label) | light | 11.00 | **8.88** | passes over **every** backdrop |
| `--color-text-secondary` | light | 7.05 | **5.69** | passes over **every** backdrop |
| `--color-text-tertiary` | light | 4.63 | 3.74 | fails once the backdrop is darker than `#BCBCBC` |
| `--color-text-accent` | light | 4.82 | 3.89 | fails once the backdrop is darker than `#949494` |
| `--color-text-error` / `-success` | light | 4.80 | 3.88 | fails once the backdrop is darker than `~#909090` |

**Two things this settles.**

1. **The four at-risk tiers are at risk for a structural reason, not a palette one.**
   `tools/palette/audit.mjs` *binary-searches* every contrast-critical token to land exactly on
   its 4.5:1 target, so those tokens ship with **0.11–0.36 of headroom by construction**. Solving
   to target and translucency are mathematically incompatible: any translucent surface consumes
   more headroom than a solved token has. Widening them is **not** the fix — that re-derives an
   owner-approved palette to solve a problem that may not occur, which is the instinct plan item
   10 was correctly dropped for.
2. **Every break-even is a MID-GREY, and the app's surfaces are nowhere near mid-grey** —
   `#0B111C…#222731` in dark, `#DFD7C5…#FFF6E4` in light. So an ordinary menu over ordinary app
   content is safe in both modes. The perturbation only bites where a panel overlaps a region of
   **opposite polarity to the mode**: a dark diff or code block under a *light*-mode menu, a light
   heading or the composer's filled disc under a *dark*-mode one.

**What remains, and it is now one measurement, not a design question: which ink tiers actually
paint on a menu panel.** If menus carry only label and secondary text, §8.4 closes with **no code
at all** — the same shape of answer as D-0001-15. If they carry a brass "always allow", a
destructive item in error ink, or tertiary hint text, the question becomes real and only then does
a landmark deserve consideration.

The settled check now answers exactly that: it censuses the ink tiers painted on any open panel,
samples what is behind it on a 3×3 grid, and reports each tier's ratio against flat, `#000` and
`#FFF`. Compositing is **measured, not modelled** — Chromium reports oklab-authored colours as
`oklab()`, so the check paints to a 1×1 canvas and reads the pixel back, delegating both the
colour conversion and the alpha compositing to the engine that paints the real panel. It also
recovers the panel's alpha from two paints rather than trusting the stylesheet; on a synthetic
panel it reads `measuredAlpha=0.902`, not `0.900`, because Chromium quantises 90% to `230/255` —
which is why the measured figures above differ from a hand calculation in the second decimal.

### 8.5 Instrument changes that made the above possible

- **The control census could not see the cards.** It matched `button, a[href], [role=button],
  [role=tab], .sidebar-item` and would have returned a confident, complete-looking list with no
  cards in it had they been unlabelled `div`s. Replaced by a **geometric + visual** query over
  the main-content region — *which elements paint a border or a background* — which cannot miss
  a card whatever its tag. It is what found the zero-width border.
- **Ring colour and full box-shadow are now read**, not just border width. A border-only summary
  reports "1 bordered element" on a screen showing four visibly outlined cards.
- **An overlay census**, by ARIA role *and* by floating geometry (out of flow + background +
  shadow), because either alone has a known blind spot.
- **`CDX_VERIFY_AT` now accepts several comma-separated offsets**, like `CDX_PROBE_AT`. Half of
  what the settled check reports exists on only one screen, and Codex exposes no UI-automation
  tree, so one offset measures one screen and silently reports every other surface as absent.
  Several offsets turn three owner interactions into one.
- **Every new negative branch names its own cause.** `"no cards on this screen"` was itself a
  trap: **a non-empty composer hides the cards, and Codex PERSISTS the draft across a restart**,
  so even a fresh launch is not necessarily a clean empty state. The check now reports the home
  screen's presence, the button count and the draft, and says which of them explains the miss.

### 8.4.2 MEASURED in the running app, 2026-08-02 (light) — and §8.3's attribution was too narrow

30 samples across two windows, 23 scheduled offsets, **zero `root environment probe FAILED`**.
Two `[role=menu]` panels were caught open. The result closes §8.4 for them, and corrects §8.3:

```
<div role=menu> 220x338  bg=rgb(231,222,204)  measuredAlpha=1.000  opaqueForm=#E7DECC  backdropFilter=none
<div role=menu> 300x539  bg=rgb(231,222,204)  measuredAlpha=1.000  opaqueForm=#E7DECC  backdropFilter=none
  behind it: rgb(235,226,208) x3  |  rgb(249,240,221) x6
  ink tiers painted on it (2):
    #34425C x16 "Toggle Sidebar" -> flat 7.56  WORST 7.56  PASSES AA OVER ANY BACKDROP
    #323A48 x14 "Ctrl+B"         -> flat 8.57  WORST 8.57  PASSES AA OVER ANY BACKDROP
```

**Three things, in order of how easily each would have been got wrong.**

1. **These menus are OPAQUE and carry NO blur.** `measuredAlpha=1.000`, `backdropFilter=none`.
   The premise of §8.4 — that menu text does not sit on flat colour — **does not hold for them at
   all**, so D-0001-6's assumption is intact here and there is nothing to fix. The alpha is
   *measured* (recovered from two canvas paints), not read off a stylesheet, which is the only
   reason this is a finding rather than a repetition of §8.3's quotation.
2. **They paint from `#E7DECC` = `--color-background-application-menu`, NOT from
   `--color-background-control-opaque` (`#DFD7C5`).** §8.3 corrected the impact table by measuring
   the *permissions popover* and generalised from it to "the menu surface". That generalisation is
   too wide: **there are at least two distinct floating-panel families**, and the one §8.3 measured
   is not the one behind `[role=menu]`. Both tokens are defined by this theme, so both are themed —
   but §8.3 must not be cited as the attribution for menus. *This is the reads-vs-paints trap in
   its subtler form: not a wrong chain, a right chain generalised past its evidence.*
3. **Only two ink tiers appear, and both are the ones with headroom.** No tertiary, no accent, no
   error or success ink was painted on either panel. Per §8.4.1 that is the outcome in which the
   question closes with **no code**: the four solved-to-target tiers are the only ones translucency
   could threaten, and menus do not use them.

**Ruling: no landmark is written for menu panels.** Same shape of answer as D-0001-15, reached the
same way — by measuring the thing instead of styling it.

**What this does NOT close.** The `/90` + `blur(8px)` panel of §8.3 was never open during a sample,
so the translucent family remains unmeasured. §8.4.1's bound is the standing answer for it: safe
unless it carries tertiary/accent/error/success ink, and its break-evens are all mid-grey.

### 8.4.3 Light mode — the computed figures are now painted figures

Everything §8 previously stated as "computed only" for light, measured in the running app
(`rootClass=electron-light`):

| Surface | Measured | Ratio |
|---|---|---|
| Composer filled control | disc `#182336`, glyph `#DFD7C5`, both `aria` states caught | **11.00:1** |
| Active sidebar row mark (D-0001-14) | `::before` `2x16px` `bg=#896D15` on `#EBE2D0` | **3.83:1** (AA non-text) |
| Title-bar tint (D-0001-10) | `#E7DECC` | painting |
| Code surface | `Monaspace Neon`, ink `#182336` on `#E7DECC` | **11.80:1** |
| Hero | `container present, NO background-image` | correct — light has no hero by owner decision |
| Fonts | `Literata=YES Fraunces=YES Monaspace Neon=YES` | all three load |
| Accent collapse (D-0001-11) | `--color-token-charts-purple: #6F5708` | brass, as ruled |

**One lead worth not losing.** The mono block's first opaque ancestor is **`#E7DECC`**
(`--color-token-bg-secondary`), *not* `#F6EDDB`, which is what this theme sets for both
`--color-background-editor-opaque` and `--color-token-diff-surface`. The contrast is fine either
way (11.80:1), so this is **not a defect** — but it means the editor/diff tokens the theme defines
may not be what paints the code surface the user actually sees. Unresolved; do not assume either
way, and do not "fix" it before measuring which element the editor tokens reach.

### 8.5.1 RUN 2 — CONCLUSION RETRACTED. The cards exist; they do not appear UNDER THE THEME

> **RETRACTED 2026-08-02, same day, by an owner screenshot of STOCK Codex showing all four
> cards on the same screen.** The section below concluded that Codex had removed them. That
> was wrong, and the error is instructive: two themed runs agreed with each other, in both
> modes, and agreement between two runs of the *same* configuration is not a control. There
> was no unthemed comparison, and the probe exists precisely to provide one.
>
> **The live question is now the opposite and more serious one: does Captain's Cabin SUPPRESS
> the four empty-state cards?** A theme that removes UI violates the standing rule that the
> app must never be left half-styled. Note our CSS *cannot* remove DOM nodes — it is custom
> properties plus three landmark rules, none touching `display`, `visibility` or `content` —
> so a mechanism is not yet identified and must not be guessed at.
>
> One measured clue, not yet an explanation: a themed light sample found a `<div>` at
> **224x110** carrying `--tw-ring-color=#D9D0BE` (our `--color-border`) but a box-shadow of
> `rgba(0,0,0,0) 0px 0px 0px 0px` — ring colour set, ring **width zero and transparent**.
> That is the shape of a card whose hairline resolves but never paints.
>
> **Resolve with the control experiment, not with more themed runs:** `CDX_PROBE=1` suppresses
> injection. Sample the home screen with and without the theme and compare.

### 8.5.1 (retracted text, kept for the record) — what run 2 measured

46 samples, both modes, full 300s schedule, zero probe failures. With the census rebuilt to find
elements by what they paint (§8.6), the answer to the "missing cards" anomaly is **not** a query
bug and **not** a light-mode difference:

**Codex no longer renders four empty-state cards, in either mode.** Owner screenshots of both modes
show a single suggestion line above the composer where the four cards used to be, and the census
agrees: on the home screen, in *both* modes, `homeScreen=yes ringedOrBorderedCandidates=0`.

What the census *does* find, and what it means:

| Measured | Reading |
|---|---|
| `4 card(s) <div> 383x65 … boxShadow=rgb(114,129,157) 0 0 0 0.5px  bg=oklab(0.880676 … / 0.5)` (light) | the **replacement suggestion rows** — ringed with `#72819D` = light `--color-border-heavy` |
| `4 card(s) <div> 383x65 … boxShadow=rgb(95,102,117) 0 0 0 0.5px  bg=oklab(0.272192 … / 0.5)` (dark) | same, ringed with `#5F6675` = dark `--color-border-heavy` |
| `1 card(s) <div> 240x201  bg=#DFD7C5` / `bg=#222731` | a panel painting from `--color-background-control-opaque`, both modes |

**Consequence for D-0001-15.** Its *reasoning* stands entirely — the hairline is a ring, not a
border; it resolves to `--color-border-heavy`; this theme defines it; no landmark is needed, and a
`border-color` rule would still paint nothing. What is now stale is only the **subject**: the
element it was measured on is gone. The token conclusion transferred to the replacement rows
without any change, which is the token-first strategy (D-0001-2) doing exactly what it was chosen
for — *the UI was replaced and the theme followed it with no edit.* **Do not "fix" D-0001-15 by
adding a selector for the new rows.**

**A new translucent surface, and it is far more translucent than the menu.** Those rows are
`oklab(… / 0.5)` — **50% opaque**, where §8.4's menu panel was 90%. §8.4.1's bound scales directly
with `1 − alpha`, so the perturbation there is **five times larger** and the unconditional bound is
correspondingly weaker. Their ink was not sampled this run. **This, not the menu, is now the
strongest open case of the D-0001-6 flat-surface assumption not holding.**

### 8.5.2 The light-mode sidebar hover is perceptually invisible — measured, root cause found

Reported by the owner from the running app: hovering "New chat" in light mode produces a hover fill
that is barely visible. Measured in OKLCH L, which is what the ramp is stepped in (contrast ratio is
the wrong instrument for two near-identical surfaces — it compresses badly near 1.0):

| Pair | Step | ΔL | |
|---|---|---|---|
| dark sidebar → hover | `#0B111C` → `#181E2A` | **0.0574** | legible |
| light sidebar → hover | `#EBE2D0` → `#E7DECC` | **0.0122** | ~invisible |
| light ground → hover | `#F0E7D5` → `#E7DECC` | 0.0273 | legible |

**The dark hover step is 4.7× the light one, from the same formula.** `palette-engine.mjs` derives
hover as `surf(step(0.55))` — a fraction of the ramp measured **from the ground**. In dark the
sidebar sits *below* the ground and hover moves *above* it, so the two **diverge**; in light both
the sidebar and hover move *down* from the ground, so they **converge** and most of the step is
spent before hover applies. Uniform derivation, opposite result, decided purely by which side of the
ground `--color-background-surface-under` falls on.

**This reopens Plan 0001 item 10**, which dropped re-deriving the interaction steps on the grounds
that "the ramp is not broken". That call was made from a *chain trace*, and the chain is genuinely
healthy — hover resolves to a token this theme defines, with this theme's value. It resolves to a
value that is invisible where it lands. **A resolved token is not a visible pixel** — the same
lesson as §2.1 and §8.3, in its third form.

**RESOLVED the same day as D-0001-17 — and the first fix was the wrong one.**

Deepening the light hover ran into `deriveChrome`'s guard, which refuses any surface beyond the one
the ink was solved against. That guard is correct and says *"raise the core ramp and re-solve the ink
rather than relaxing this check"*, so it was followed rather than relaxed — and following it cost
**nine** ink tokens, including `--color-text-primary` `#182336 → #0F192B`. That is a locked,
owner-approved palette moving to fix one hover.

**The better fix was noticed only because the guard forced the cost into the open.** In dark, a
hovered row has always gone *lighter* than the sidebar — the sidebar is the darkest thing on screen,
so it could only lift. Making light **darken** preserved the asymmetry in a new form. Making light
**lift** as well uses one rule in both modes, stays inside the ramp that already exists, and — because
light ink is solved against the *darkest* surface — can only *raise* contrast:

| | old | darken route | **lift route (shipped)** |
|---|---|---|---|
| light hover ΔL from sidebar | 0.0122 | 0.0580 | **0.0600** (dark: 0.0574) |
| light press ΔL from sidebar | 0.0221 | 0.0700 | **0.0709** (dark: 0.0700) |
| meta text on hovered row | 4.96 | 4.77 | **6.17** |
| body text on hovered row | 11.80 | 10.20 | **14.67** |
| other palette tokens changed | — | **9** | **0** |

Shipped values: light hover `#E7DECC → #FFF6E3`, light press `#E3DBC9 → #FFFAEF`. The only other
movement anywhere is dark's press, `#1C222E → #1B212D` — one quantisation step, invisible. Owner
chose lift from a render.

**The lesson is about the guard, not the hover.** A blanket structural invariant that looks
over-strict — "no surface beyond `worst`" — is what surfaced the real cost of the obvious fix and
sent the design somewhere better. It would have been easy, and wrong, to relax it. Two audit checks
were added at the same time (`Meta text on pressed row`, `Supporting text on hovered row`): the
pressed row is now a genuinely distinct surface from hover, so the hover check no longer covers it.
Audit is **272/272**.

### 8.6 Still not seen under the theme

Recorded so no one reads section 8 as "Phase 3 is finished":

- **Diffs and terminals** — the settled check now looks for them by the property that actually
  defines them, **a sizeable block rendering in the theme's mono face**, and reports the ink, the
  surface walked up to its first opaque ancestor, and the contrast between them. Found by
  rendering rather than by tag or class deliberately: the diff view contains no `pre`/`code`
  element to match and Codex's class names are build-hashed. Still an *observation* — nothing is
  styled from it. Previously: seen once by the owner in a screenshot and coherent (navy ground,
  Monaspace Neon, this theme's `--color-editor-added: #092414` / `--color-editor-deleted:
  #301413` replacing Codex's 23%-alpha saturated wash), but never *measured* under the theme.
  Note the diff view uses **no `pre`/`code`/`kbd`/`samp` elements at all** — the settled check
  read `pre=0 code=0` on a screen full of visible code, so that check does not cover diffs.
### 8.6.1 RUN 3, 2026-08-02 — diffs and terminals MEASURED at last, and the code face is not reaching them

The owner opened a diff in the side panel and a terminal in the side panel, in both modes, and
held each across several sample ticks. Measured:

```
light:  475x1280  font=ui-monospace  ink=#182336  surface=#F0E7D5 (from <div>)  contrast=12.83 PASS
dark:   475x1280  font=ui-monospace  ink=#F4EAD4  surface=#0E141F (from <div>)  contrast=15.43 PASS
```

**Contrast passes comfortably in both modes** — the last unmeasured surfaces in Phase 3 are now
measured, and they are legible. Two defects come with that, both of the same family:

1. **The code face does NOT reach the diff/terminal panel.** It computes `ui-monospace` first,
   which is Codex's stock stack resolving to **Consolas on Windows** — not Monaspace Neon. This
   theme sets **four** mono variables (`--font-mono`, `--font-mono-default`,
   `--default-mono-font-family`, `--vscode-editor-font-family`), all naming Monaspace Neon first,
   and the panel reads **none of them**: it carries a literal stack. D-0001-7's code face is
   therefore absent from the one surface most made of code.
2. **The panel paints from `--color-background-surface`** (the plain ground: `#F0E7D5` / `#0E141F`),
   **not** from `--color-token-diff-surface` or `--color-background-editor-opaque` (`#F6EDDB` /
   `#111722`), which this theme defines for exactly this job. Those two tokens are inert here.

Both are the **reads-vs-paints trap again** — the fifth and sixth instances — and neither is
fixable by guessing. What is needed is the rule that actually sets the panel's `font-family` and
`background`, which is a probe question (`CDX_PROBE=1`, `CDX_PROBE_DUMP_CSS=1`), not a theme edit.
**Do not add a landmark for either before that rule is measured** — four pre-Gate-0 landmarks died
exactly that way.

`pre=0 code=0` held throughout, confirming §8.6's standing note that the diff view contains no such
elements; the surface was found by its mono rendering instead, which is why it was found at all.

- **Dialogs — still never observed.** No `[role=dialog]` at any sample across three runs.
- **Dialogs and the terminal surface — the terminal is now measured (§8.6.1); dialogs are not.** Run 1 closed at
  +204s of a 300s schedule. Run 2 ran the full 300s in both modes and still reported
  `pre=0 code=0` on **all 46 samples** with no mono-rendered block ≥200×60 anywhere, and **no
  `[role=dialog]` at any sample** — Codex's settings surface is evidently not an ARIA dialog, and
  no diff or terminal was open. Both remain **unrun measurements, not negative results.** A third
  attempt should confirm the screens are actually open before relying on the timing.
- **The four empty-state cards, in light — a NEW anomaly, unexplained.** The check reported
  `homeScreen=yes buttons=105 (largest: 654x40, 315x30, 315x30) composerDraft=""` — i.e. on the
  home screen, with an empty composer, and **still no cards**, so neither of the two documented
  causes (wrong screen, persisted draft) applies. Both hooks missed: the geometric one (nothing in
  120–320 x 70–180) and the authored-class one (`min-h-26`). In dark the same check measured
  **4 cards** at that size. The `315x30` items are the right width and the wrong height, which
  looks like the same content rendered as compact rows rather than cards.

  **ROOT CAUSE FOUND IN THE INSTRUMENT, 2026-08-02 — the census was tag-scoped.** It matched
  `document.querySelectorAll('button')` only. §8.5 records this exact lesson being learned for the
  *probe's* control census, which was rebuilt as a geometric+visual query specifically because it
  "cannot miss a card whatever its tag" — **the lesson was never carried across to the settled
  check.** Two independent ways it could miss: the cards not being `<button>`, and a maximized
  window pushing them past the hard `width < 320` ceiling. The owner has since confirmed the window
  *was* maximized. Note the miss was still not fully explained by width alone — a card-sized
  `<button>` would have out-ranked the reported `654x40` by area and did not appear.

  Rebuilt to key on **what the element paints** — a ring (box-shadow) or a border at generous card
  geometry — plus the `min-h-26` authored class as the second independent hook, and the full
  `boxShadow` is now reported rather than only `--tw-ring-color`. Regression-tested against a
  synthetic screen with **zero** `<button>` elements and 322px-wide `<div>` cards painting a ring:
  old census `NOT FOUND`, new census `4 card(s) <div> 322x104 boxShadow=rgb(114,129,157) 0 0 0
  0.5px border-width=0px` — `#72819D`, which is light-mode `--color-border-heavy`, the token
  D-0001-15 names. **The light-mode card measurement is therefore still owed**, but the next run
  can produce it. Until then, do not treat D-0001-15's dark figures as covering light.
- **Light mode** for everything in section 8. Every figure above is dark-mode measured; the light
  values are computed only. Appearance mode is set inside Codex, so this needs the owner.
