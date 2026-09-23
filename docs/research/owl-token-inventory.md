# Codex's OWL-era token layer — measured inventory (Plan 0004 M1)

**Status:** measured 2026-09-23 against **Codex `26.917.6896.0`** (app version `26.917.51856`, Chromium
`153.0.8010.53`), on Windows. Supersedes [`phase3-inventory-findings.md`](phase3-inventory-findings.md)
**for the running version only** — that document stays the record of the pre-OWL build and of why the
engine is shaped the way it is. Produced by [Plan 0004](../plans/0004-codex-owl-token-remap.md) M1.

## Verdict in one line

**Codex did not redesign its colour system — it moved its primitive layer under an `--app-` prefix and
switched its mode hook to `[data-theme]`.** Of the 77 colour tokens the shipped theme overrides, **60
are the same role under `--app-` + the old name, 16 still exist unchanged, and 1 is gone.** Chat and
Work read the same primitives as the Codex screens, so re-pointing the engine themes all of them — with
22 additional primitives to fill and a short list of hooks to replace (§6).

---

## 0. The instrument, and four defects it had to lose before its numbers meant anything

Measured without an owner launch, in a **separate throwaway Codex instance**
(`ChatGPT.exe --user-data-dir=<temp>`), driven by
[`tools/inventory/run-inventory.mjs`](../../tools/inventory/run-inventory.mjs) and its in-process
[`driver-preload.js`](../../tools/inventory/driver-preload.js), which step the app through five screens
in both modes and call the existing live probe
([`injector/core/probe.js`](../../injector/core/probe.js)) on each. Output — probe reports, the CSS
corpus, screenshots — is written **outside the repository** by construction (the runner refuses an
in-repo `--out`), because every screenshot shows the owner's project and thread names.

Four defects surfaced while making the run trustworthy; each would have produced a wrong answer rather
than an error, which is why they are recorded:

1. **The leftover-process sweep killed itself.** It stopped every process whose command line contained
   the throwaway profile path — and the sweeping `powershell.exe`'s own command line contains that
   path. It exited `-1` with no stderr, which the first version reported as a "non-fatal warning".
   Proven by searching for `*zzz*`: five "matches", all the searcher and its parents. Fixed by also
   requiring `Name -eq 'ChatGPT.exe'` and `ProcessId -ne $PID`; a sweep failure is now fatal.
2. **The paint census would have invented gaps.** Chromium does **not** always report computed colours
   as `rgb()`: anything from `color-mix()` or an alpha-modified utility computes to `oklab(…)` or
   `color(srgb …)` (the open menu's background: `oklab(0.2686 … / 0.9)`). A string parser therefore
   reports those paints as matching no token. Every colour — paint and token alike — now goes through
   one path: rasterise onto a 1×1 canvas and read the pixel, so equal colours always give equal keys.
3. **Token resolution through `color: var(--x)` lies for non-colours.** When `--x` is not a colour the
   declaration is invalid at computed-value time and falls back to the *inherited* colour, crediting
   the token with painting body text. Tokens are now resolved from their own computed value.
4. **The driver's UI assumptions were wrong twice** — `[aria-label="New chat"]` resolves to an
   unrelated element, and opening a thread does **not** change `location.pathname`. Screen state is now
   verified from the screen (active-thread marker, the home heading's absence, the toggle's
   `aria-pressed`), and a scenario that cannot verify its own setup is recorded FAILED, never probed.

**Also found: the app-mode choice is shared state.** A brand-new profile opened in ChatGPT mode because
an earlier scouting run had left it there; the choice is not in the profile and not in
`~/.codex/.codex-global-state.json` (which does hold `home-composer-mode-v1`, the Chat/Work choice), so
it is account-side. The driver records the starting mode and restores it; the final run confirms it
started in **Codex** and ended in Codex.

---

## 1. The token architecture, as it is now

Four stages again, but renamed. Measured from the parsed corpus (`definedProps` / `varReads`):

| Stage | Example | Defined on | Notes |
|---|---|---|---|
| **1. Primitives** — `--app-color-*` (82) | `--app-color-background-surface` `#111111` / `#ffffff` | `:where(:root:not([data-codex-window-type=extension]), …)` and the runtime `<style data-codex-app-themes>` | **The old stage-1 names, moved under `--app-`.** Dark/light is selected by lightningcss's `--lightningcss-light` / `--lightningcss-dark` switch, or by `[data-theme="dark"|"light"]` blocks. |
| **2. Design-system** — `--color-surface*`, `--color-text`, `--color-text-*`, `--color-codex-*` | `--color-text` (381 reads) → `var(--app-color-text-foreground)` | `:where(:root,[data-theme])` | ChatGPT's design-system names; in the Codex window each is re-pointed at a primitive. Includes all terminal ANSI slots. |
| **3. Legacy token aliases** — `--color-token-*` | `--color-token-main-surface-primary` → `var(--app-color-background-surface)` | `:root` / `:host` | Kept by Codex; still read. |
| **4. Utilities / components** | `bg-surface`, `text-tertiary`, `._MainContentSurface_1wfx1_2` | Tailwind utilities; **build-hashed CSS modules** | Components are now largely CSS modules — hashed class names are **never** a hook. |

**The exception to "everything derives":** `--color-codex-syntax-*` (the code highlighting palette) are
literal hex per mode, not derived from primitives — the theme's `syntax.json` must set them directly.

## 2. Cascade facts that decide how the theme's selectors win

- **1,320 of 1,333 `--color-*` definitions sit inside `@layer theme`** (or `@layer components`). An
  **unlayered** declaration beats every layered one regardless of specificity, and
  `webContents.insertCSS()` produces an unlayered author sheet. So the theme wins the token layer
  without any specificity contest. *(Stated as a CSS rule, not yet observed painting — M2 proves it.)*
- **The 13 unlayered `--color-*` definitions** are all scoped to `[data-codex-window-type=browser]` /
  `chrome-extension` windows or define names the theme does not override. None collides.
- **Codex's mode selectors are zero-specificity** — 517 definitions sit under a selector that is
  entirely `:where(…)`. (The census counts "entirely", not "starts with": Codex's descendant form
  `:where(:root:not(…)) [data-theme="light"]` starts with `:where(` but carries (0,1,0).)
- **No nested mode scopes were observed.** On all nine samples exactly one element carried
  `[data-theme]` — `<html>`. Codex's stylesheet *allows* inner `[data-theme]` subtrees (fact 7 in the
  plan); none exists on the measured screens.
- **Nothing colour-related is set inline on `<html>`** (15 inline tokens, all sizes). D-0001-12's
  inline-token contest does not recur here.
- **Body-scoped tokens:** only the benign `.electron-opaque body` re-point of
  `--app-color-background-elevated-primary` to its `-opaque` twin — the same pattern D-0001-18 already
  describes as harmless, now under the `--app-` name. `--vscode-editor-font-family` is **read but
  defined nowhere** on these screens; D-0001-18's body contest for it did not reproduce, but no terminal
  or diff was open (unrun, not cleared).

## 3. The map — every token the theme overrides, and what carries it now

Generated by `node tools/inventory/map-tokens.mjs <run-dir>` from the `codex-home` reports; "Reads" is
the number of `var()` references in the corpus (a primitive is read mostly *through* stage 2, so a low
count on an `--app-` name does not mean low reach).

| Theme overrides | Carried now by | Status | Reads | Stock dark | Stock light |
|---|---|---|---|---|---|
| `--color-background-surface` | `--app-color-background-surface` | renamed | 8 | #111111 | #ffffff |
| `--color-token-main-surface-primary` | `--color-token-main-surface-primary` | same name | 10 | #111111 | #ffffff |
| `--color-token-bg-secondary` | `--color-token-bg-secondary` | same name | 4 | color-mix(#0e0e0e 92%) | color-mix(#f6f6f6 92%) |
| `--color-background-elevated-primary` | `--app-color-background-elevated-primary` | renamed | 3 | rgba(47, 47, 47, 0.96) | rgba(255, 255, 255, 0.96) |
| `--color-background-elevated-secondary` | `--app-color-background-elevated-secondary` | renamed | 3 | rgba(252, 252, 252, 0.032) | rgba(255, 255, 255, 0.96) |
| `--color-token-bg-tertiary` | `--color-token-bg-tertiary` | same name | 3 | color-mix(#0e0e0e 85%) | color-mix(#f6f6f6 85%) |
| `--color-token-diff-surface` | `--color-token-diff-surface` | same name | 1 | color-mix(#111111 94%) | color-mix(#ffffff 94%) |
| `--color-text-primary` | `--color-text-primary` | same name | 4 | #fcfcfc | #1a1c1f |
| `--color-text-foreground` | `--app-color-text-foreground` | renamed | 84 | #fcfcfc | #1a1c1f |
| `--color-token-foreground` | `--color-token-foreground` | same name | 17 | #fcfcfc | #1a1c1f |
| `--color-text-secondary` | `--color-text-secondary` | same name | 40 | color-mix(#fcfcfc 65%) | color-mix(#1a1c1f 65%) |
| `--color-text-foreground-secondary` | `--app-color-text-foreground-secondary` | renamed | 2 | rgba(252, 252, 252, 0.71) | rgba(26, 28, 31, 0.695) |
| `--color-text-tertiary` | `--color-text-tertiary` | same name | 65 | rgba(252, 252, 252, 0.498) | rgba(26, 28, 31, 0.495) |
| `--color-text-quaternary` | — | **gone** | 0 | — | — |
| `--color-text-on-accent` | `--app-color-text-on-accent` | renamed | 8 | rgb(255, 255, 255) | rgb(0, 0, 0) |
| `--color-text-success` | `--color-text-success` | same name | 5 | #40c977 | #00a240 |
| `--color-text-warning` | `--color-text-warning` | same name | 15 | #ff8549 | #e25507 |
| `--color-text-error` | `--app-color-text-error` | renamed | 1 | #ff6764 | #e02e2a |
| `--color-border-light` | `--app-color-border-light` | renamed | 12 | rgba(252, 252, 252, 0.042) | rgba(26, 28, 31, 0.049) |
| `--color-border` | `--color-border` | same name | 120 | rgba(252, 252, 252, 0.084) | rgba(26, 28, 31, 0.078) |
| `--color-border-heavy` | `--app-color-border-heavy` | renamed | 20 | rgba(252, 252, 252, 0.156) | rgba(26, 28, 31, 0.117) |
| `--color-border-focus` | `--app-color-border-focus` | renamed | 3 | rgba(100, 164, 224, 0.76) | #3a83f7 |
| `--color-background-button-primary` | `--app-color-background-button-primary` | renamed | 0 | rgb(9, 9, 9) | #1a1c1f |
| `--color-background-button-primary-hover` | `--app-color-background-button-primary-hover` | renamed | 0 | rgba(252, 252, 252, 0.058) | rgba(26, 28, 31, 0.077) |
| `--color-background-button-primary-active` | `--app-color-background-button-primary-active` | renamed | 0 | rgba(252, 252, 252, 0.1) | rgba(26, 28, 31, 0.154) |
| `--color-background-button-secondary` | `--app-color-background-button-secondary` | renamed | 3 | rgba(252, 252, 252, 0.052) | rgba(26, 28, 31, 0.049) |
| `--color-icon-primary` | `--app-color-icon-primary` | renamed | 2 | rgba(252, 252, 252, 0.904) | #1a1c1f |
| `--color-icon-secondary` | `--app-color-icon-secondary` | renamed | 0 | rgba(252, 252, 252, 0.71) | rgba(26, 28, 31, 0.695) |
| `--color-icon-tertiary` | `--app-color-icon-tertiary` | renamed | 0 | rgba(252, 252, 252, 0.51) | rgba(26, 28, 31, 0.495) |
| `--color-background-status-success` | `--app-color-background-status-success` | renamed | 1 | color-mix(#04b84c 16%) | color-mix(#00a240 7%) |
| `--color-background-status-warning` | `--app-color-background-status-warning` | renamed | 0 | #4a2206 | #ffe7d9 |
| `--color-background-status-error` | `--app-color-background-status-error` | renamed | 0 | #4d100e | #ffd9d9 |
| `--color-background-danger-active` | `--app-color-background-danger-active` | renamed | 0 | color-mix(#fa423e 36%) | color-mix(#e02e2a 90%) |
| `--color-editor-added` | `--app-color-editor-added` | renamed | 1 | rgba(0, 162, 64, 0.23) | rgba(0, 162, 64, 0.15) |
| `--color-editor-deleted` | `--app-color-editor-deleted` | renamed | 1 | rgba(224, 46, 42, 0.23) | rgba(186, 38, 35, 0.15) |
| `--color-background-surface-under` | `--app-color-background-surface-under` | renamed | 7 | #0e0e0e | #f6f6f6 |
| `--color-background-panel` | `--color-background-panel` | same name | 1 | #1c1c1c | #ffffff |
| `--color-background-editor-opaque` | `--app-color-background-editor-opaque` | renamed | 1 | rgb(33, 33, 33) | rgb(255, 255, 255) |
| `--color-background-elevated-primary-opaque` | `--app-color-background-elevated-primary-opaque` | renamed | 2 | rgb(47, 47, 47) | rgb(255, 255, 255) |
| `--color-background-elevated-secondary-opaque` | `--app-color-background-elevated-secondary-opaque` | renamed | 0 | #212121 | rgb(255, 255, 255) |
| `--color-background-control` | `--app-color-background-control` | renamed | 1 | rgba(38, 38, 38, 0.96) | rgba(255, 255, 255, 0.96) |
| `--color-background-control-opaque` | `--color-background-control-opaque` | same name | 4 | rgb(38, 38, 38) | rgb(255, 255, 255) |
| `--color-background-application-menu` | `--app-color-background-application-menu` | renamed | 8 | #191919 | #f8f8f9 |
| `--color-foreground-application-menu` | `--app-color-foreground-application-menu` | renamed | 1 | #e0e0e0 | #1a1c1f |
| `--color-border-application-menu-separator` | `--app-color-border-application-menu-separator` | renamed | 1 | #595959 | rgba(26, 28, 31, 0.117) |
| `--color-text-accent` | `--app-color-text-accent` | renamed | 8 | rgb(100, 164, 224) | #2c67c5 |
| `--color-icon-accent` | `--app-color-icon-accent` | renamed | 0 | rgb(100, 164, 224) | #2c67c5 |
| `--color-accent-blue` | `--app-color-accent-blue` | renamed | 11 | #0169cc | #3a83f7 |
| `--color-accent-purple` | `--app-color-accent-purple` | renamed | 5 | #b06dff | #924ff7 |
| `--color-background-accent` | `--app-color-background-accent` | renamed | 0 | #001a33 | #e8f3fe |
| `--color-background-accent-hover` | `--app-color-background-accent-hover` | renamed | 1 | #001c37 | #e8f3fe |
| `--color-background-accent-active` | `--app-color-background-accent-active` | renamed | 2 | #001f3c | #e8f3fe |
| `--color-accent-green` | `--app-color-accent-green` | renamed | 4 | #40c977 | #00a240 |
| `--color-accent-red` | `--app-color-accent-red` | renamed | 4 | #ff6764 | #e02e2a |
| `--color-accent-orange` | `--app-color-accent-orange` | renamed | 3 | #fb6a22 | #e25507 |
| `--color-accent-yellow` | `--app-color-accent-yellow` | renamed | 5 | #ffd240 | #ffc300 |
| `--color-icon-success` | `--app-color-icon-success` | renamed | 1 | #40c977 | #00a240 |
| `--color-icon-warning` | `--app-color-icon-warning` | renamed | 0 | #ff8549 | #e25507 |
| `--color-icon-error` | `--app-color-icon-error` | renamed | 1 | #ff6764 | #e02e2a |
| `--color-border-error` | `--app-color-border-error` | renamed | 1 | color-mix(#fa423e 40%) | color-mix(#e02e2a 15%) |
| `--color-border-warning` | `--app-color-border-warning` | renamed | 1 | color-mix(#ff8549 40%) | color-mix(#e25507 15%) |
| `--color-decoration-added` | `--app-color-decoration-added` | renamed | 1 | #00a240 | #00a240 |
| `--color-decoration-deleted` | `--app-color-decoration-deleted` | renamed | 1 | #e02e2a | #ba2623 |
| `--color-decoration-modified` | `--app-color-decoration-modified` | renamed | 2 | #ff8549 | #923b0f |
| `--color-decoration-unchanged` | `--app-color-decoration-unchanged` | renamed | 0 | #414141 | #afafaf |
| `--color-background-button-secondary-hover` | `--app-color-background-button-secondary-hover` | renamed | 4 | rgba(252, 252, 252, 0.078) | rgba(26, 28, 31, 0.053) |
| `--color-background-button-secondary-active` | `--app-color-background-button-secondary-active` | renamed | 0 | rgba(252, 252, 252, 0.12) | rgba(26, 28, 31, 0.039) |
| `--color-background-button-tertiary` | `--app-color-background-button-tertiary` | renamed | 0 | rgba(252, 252, 252, 0.029) | rgba(26, 28, 31, 0) |
| `--color-background-button-tertiary-hover` | `--app-color-background-button-tertiary-hover` | renamed | 0 | rgba(252, 252, 252, 0.068) | rgba(26, 28, 31, 0.098) |
| `--color-background-button-tertiary-active` | `--app-color-background-button-tertiary-active` | renamed | 0 | rgba(252, 252, 252, 0.1) | rgba(26, 28, 31, 0.196) |
| `--color-text-button-primary` | `--app-color-text-button-primary` | renamed | 3 | rgb(9, 9, 9) | #ffffff |
| `--color-text-button-secondary` | `--app-color-text-button-secondary` | renamed | 0 | #494949 | #1a1c1f |
| `--color-text-button-tertiary` | `--app-color-text-button-tertiary` | renamed | 0 | rgba(252, 252, 252, 0.51) | rgba(26, 28, 31, 0.495) |
| `--color-text-foreground-tertiary` | `--app-color-text-foreground-tertiary` | renamed | 6 | rgba(252, 252, 252, 0.498) | rgba(26, 28, 31, 0.495) |
| `--color-token-border-default` | `--color-token-border-default` | same name | 3 | rgba(252, 252, 252, 0.084) | rgba(26, 28, 31, 0.078) |
| `--color-token-border-light` | `--color-token-border-light` | same name | 8 | rgba(252, 252, 252, 0.042) | rgba(26, 28, 31, 0.049) |
| `--color-token-border-heavy` | `--color-token-border-heavy` | same name | 8 | rgba(252, 252, 252, 0.156) | rgba(26, 28, 31, 0.117) |

**77 tokens: 60 renamed, 16 same name, 1 gone.** Four of the "renamed" rows — `--color-text-accent`,
`--color-icon-accent`, `--color-background-accent`, `--color-background-accent-hover` — still *exist*
under the old name, but only as local re-definitions inside the composer (`._composer_1tgi1_2`
re-points them at `var(--color-text)` / `var(--color-surface-tertiary)`); their app-wide role moved to
`--app-`. `color-mix(...)` stock values are abbreviated to their base colour and percentage.

**Primitives the theme gives no value today (22)** — M2 must assign each an already-solved role or
prove it unreachable:
`--app-color-background-button-primary-inactive`, `-button-secondary-inactive`,
`--app-color-background-card`, `--app-color-background-recovery`, `--app-color-background-tip-badge`,
`--app-color-background-tooltip`, `--app-color-background-tooltip-shortcut`, `--app-color-border`,
`--app-color-border-tooltip`, `--app-color-simple-scrim`, `--app-color-text-primary-solid`,
`--app-color-text-secondary`, `--app-color-text-success`, `--app-color-text-tip-badge`,
`--app-color-text-tooltip` and its six variants (`-danger`, `-info`, `-secondary`, `-success`,
`-tertiary`, `-warning`), `--app-color-text-warning`. Two of these (`--app-color-border`,
`--app-color-text-secondary`) sit *behind* names the theme already sets, but are also read directly.

**Fonts:** all eight font tokens the theme sets still exist under the same names (`--font-sans`,
`--font-sans-default`, `--font-serif`, `--font-openai-sans`, `--default-font-family`, `--font-mono`,
`--font-mono-default`, `--default-mono-font-family`); `--vscode-editor-font-family` is read but not
defined on these screens. **The fonts broke only because their block is scoped under the old
`.electron-*` classes.**

## 4. Chat and Work — the answer to owner ruling 1

**Chat and Work are the same app shell reading the same tokens as the Codex screens.** They are a
two-button toggle on the ChatGPT-mode home composer, not separate windows: same
`.app-shell-left-panel`, same `_MainContentSurface` painting the main area (`#111111` / `#ffffff`, i.e.
`--app-color-background-surface`), same composer surface (`rgba(47,47,47,0.96)`, i.e.
`--app-color-background-elevated-primary`).

**Paint coverage** — every visible element's text, background, border, outline, SVG fill and stroke,
matched against every root colour token (both sides rasterised; see §0.2):

| Screen | Distinct colours | Matched a root token exactly | Not matched |
|---|---|---|---|
| Codex home (dark / light) | 10 / 10 | 9 / 9 | 1 / 1 |
| Codex thread (dark / light) | 13 / 13 | 11 / 10 | 2 / 3 |
| ChatGPT · Chat home (dark / light) | 12 / 11 | 11 / 10 | 1 / 1 |
| ChatGPT · Work home (dark / light) | 12 / 11 | 11 / 10 | 1 / 1 |
| Mode-switch menu open (dark) | 13 | 11 | 2 |

Every "not matched" colour was then traced by hand:

- **`rgba(251,251,251,0.851)` dark / `rgba(26,28,31,0.851)` light — on every screen, ~55 paints:**
  sidebar labels and icons at 85% opacity — the text-foreground primitive (`#fcfcfc` / `#1a1c1f`)
  through an opacity modifier. **Token-derived**; exact matching cannot see an alpha modifier.
- **`rgba(38,38,38,0.902)` — the open menu's background:** `--color-surface-elevated-secondary`
  (`rgb(38,38,38)`) at 90% (`bg-surface-elevated-secondary/90`). **Token-derived.**
- **`rgba(21,32,32,0.094)` — light-mode inline code pills (`.inline-markdown`):**
  `color-mix(in srgb, var(--color-background-primary-ghost-hover) 60%, var(--color-text) 6%)`.
  **Token-derived.**
- **`rgb(130,182,230)` dark / `rgb(40,88,164)` light — web-citation links in a thread, 4 paints:**
  matches no root token (nearest is 35+ RGB steps away) and its rule is not in the home-screen corpus —
  it arrives with the conversation view's lazily-loaded CSS. **The one genuinely untraced colour.** It
  also appears in ChatGPT-mode conversations, which M1 did not open.

**Verdict for ruling 1: covering Chat and Work fully is achievable by the same token re-map as the
Codex screens.** Nothing measured on either screen is hard-coded. What M1 did **not** measure: a
ChatGPT-mode *conversation* (only the two home screens), Images, Settings, the terminal, and a diff —
M2/M3 must cover those in the running app before "fully" can be claimed.

## 5. Structural hooks — what the emitter's hand-written rules can still hold on to

Checked against the **live DOM** of every sample (not the stylesheet text, which cannot see a class
that only we use):

| Hook | Used for | Status on 26.917 |
|---|---|---|
| `.app-shell-left-panel` | sidebar paint (D-0001-13) | **present**; its ancestor chain still paints nothing — Mica still shows through, so D-0001-13 is still needed |
| `.sidebar-item` + `[data-app-action-sidebar-thread-active="true"]` | active-row brass mark (D-0001-14) | **present** (the driver used it to verify a thread opened); `[aria-current="page"]` was **not** seen on any row |
| `.heading-*` (all ten) | display face (D-0001-7) | **present** |
| `.\[container-name\:home-main-content\]` | hero (D-0001-9) | **present** in the stylesheet |
| `.app-header-tint` | title-bar tint + brass hairline (D-0001-10) | **gone** from the DOM on every screen |
| `.popupContent` | menu depth + lit edge (D-0001-10) | **gone** — menus are Radix: `[data-radix-menu-content]` inside `[data-radix-popper-content-wrapper]`, painted `bg-surface-elevated-secondary/90` + `backdrop-blur-sm` |
| `.app-shell-main-content-top-fade` | scroll fade (D-0001-10) | **gone** |
| `.xterm*` | terminal (D-0001-19) | not measurable — no terminal was open (unrun) |

Main-area and composer containers are **build-hashed CSS modules** (`._MainContentSurface_1wfx1_2`,
`._ComposerLayoutBody_7vtc3_2`) — never a hook. They paint from tokens, so they need none.

## 6. What this hands to M2

1. **Mode hook:** `.electron-dark` / `.electron-light` → `[data-theme="dark"]` / `[data-theme="light"]`
   on `<html>` (fact 5 in the plan). One constant in `codex-surface.mjs`; the emitter's 34 literals
   should interpolate it.
2. **Names:** apply §3's map — 60 renames under `--app-`, keep the 16 same-name overrides (they are
   still read), retire `--color-text-quaternary` (keep its solved value only where a new name needs it).
3. **Fill the 22 unmapped primitives** from already-solved roles (tooltips, cards, tip badge, inactive
   buttons, scrim). Any genuinely new text/surface pairing is audited, not eyeballed.
4. **Accent policy (D-0001-11):** the blue family is now `--app-color-accent-blue`,
   `--app-color-text-accent`, `--app-color-icon-accent`, `--app-color-border-focus`, the tip badge,
   **and the light-mode composer send control `--color-background-composer-primary: #3a83f7`** (plan
   fact 15) — all collapse to brass.
5. **Syntax:** `--color-codex-syntax-*` are literal per mode — set them from `syntax.json`.
6. **Replace or retire three Layer 2 hooks** (§5). `[data-radix-menu-content]` is the candidate for the
   menu treatment; the title-bar tint and scroll fade need a fresh look in the running app.
7. **Trace the citation-link blue** from a conversation view's own corpus.
8. **Re-argue `!important`.** Phase 3 §1.1 needed it because Codex wrote 47 tokens inline on `<html>`;
   today it writes none (§2). Unlayered already wins the layered cascade. Whether to keep it is an M2
   decision — keeping it is harmless, but its original reason no longer holds.

## 7. Reproducing this

```bash
node tools/inventory/run-inventory.mjs            # ~2 minutes; prints the run directory
node tools/inventory/map-tokens.mjs <run-dir>     # regenerates §3's table
```

The run leaves your own Codex untouched (separate `--user-data-dir`), signs in by itself, visits
Codex home, a Codex thread, ChatGPT Chat home, ChatGPT Work home and the open mode menu, each in dark
and light (light is set by writing `document.documentElement.dataset.theme` — `nativeTheme` and
`prefers-color-scheme` emulation do not move it), and restores the app mode it found. Its output
directory holds the probe reports, the CSS corpus and screenshots; **keep it out of the repository** —
the screenshots show private project and thread names.
