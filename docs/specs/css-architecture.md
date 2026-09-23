# CSS Architecture — Captain's Cabin

**Living spec.** How the theme's CSS is layered, authored, validated, and kept update-resilient.

> **Moved to Codex's OWL-era names, 2026-09-23 (Plan 0004 M4).** Codex `26.917` ("OWL") moved the mode
> hook from `.electron-dark` / `.electron-light` to `[data-theme]` on a `[data-codex-window-type]`
> document and renamed 60 of the 77 colour tokens this theme overrides
> ([D-0004-1](../DECISIONS.md)). Every declaration the emitter writes is now `!important`
> ([D-0004-2](../DECISIONS.md)), because `insertCSS` on OWL installs a **user-origin** stylesheet.
> This spec describes the current, OWL-era architecture; pre-OWL names are kept where they matter for
> history, marked "(pre-OWL: …)". See
> [`docs/research/owl-token-inventory.md`](../research/owl-token-inventory.md) and
> [Plan 0004](../plans/0004-codex-owl-token-remap.md) for the full record.

## The layers

```
theme.css
├─ Layer 1  Token overrides   → [data-theme="dark"] { --app-color-*: … !important }  (+ "light")
├─ Layer 2  Named-hook rules  → scrollbars, ::selection, the update-pill rule (D-0004-4)
├─ Layer 3  Shape + type      → --radius-*, font-family (one declared landmark)
└─ Layer 4  Syntax palette    → --cc-syntax-* vars, mirrored in syntax.json
```

(pre-OWL: `.electron-dark { --color-*: … }` / `.electron-light`, and Layer 2 additionally carried
`.app-header-tint` and `.popupContent` — see Layer 2 below for what changed.)

> **Layer 3 changed in Phase 2.** It was "Texture / atmosphere — embedded `--cc-texture-*` vars + CSS gradients." Surface textures were cut ([D-0001-6](../DECISIONS.md)) and no gradient wash sits behind content, so that layer no longer exists; the slot now carries shape and typography. There are **no `--cc-texture-*` variables**. If you find a reference to one, it is stale.

### Layer 1 — Token overrides (the workhorse)
Redefine the semantic custom properties (see [ui inventory](customizable-ui-inventory.md) Tier 1) scoped to the mode hook. Codex's Tailwind utilities (`bg-token-*`, `text-token-*`, `border-token-*`) read these variables, so one override cascades app-wide and into unshipped UI.

**The mode hook (OWL, current).** `MODE_SCOPE` in
[`codex-surface.mjs`](../../tools/palette/codex-surface.mjs) — Codex's `<html>` no longer carries
`.electron-dark` / `.electron-light`; it carries `data-theme="dark"|"light"` beside
`data-codex-window-type="electron"` (D-0004-1). Dark mode's selector, exactly as emitted:

```
:is([data-codex-window-type][data-theme="dark"], [data-codex-window-type] [data-theme="dark"])
```

Gating on `[data-codex-window-type]` (not `[data-theme]` alone) is deliberate — `data-theme` alone is
a common attribute on ordinary web pages, and the injector themes every `BrowserWindow` without a URL
filter, so a bare `[data-theme]` rule could restyle an unrelated page in a popup. The second `:is()`
alternative also matches a nested `[data-theme]` subtree, which Codex's own stylesheet allows even
though none has been observed in the running app. `ANY_MODE_SCOPE` is the mode-agnostic form for rules
that don't vary by mode (shape, typography, Layer 2).

**Token names (OWL, current).** 60 of the 77 colour tokens this theme overrides moved from
`--color-X` to `--app-color-X`; 16 kept their name; `--color-text-quaternary` is gone.
`tokenProperty()` in `codex-surface.mjs` is the single place that decides the prefix for a given role
— see [`docs/research/owl-token-inventory.md`](../research/owl-token-inventory.md) §3 for the full
map. `codex-surface.mjs` owns every selector and property name the emitter writes; nothing downstream
spells `.electron-*`, `--color-`, or `--app-color-` as a literal (D-0004-1).

Real, shipped values (excerpt — [`theme.css`](../../themes/captains-cabin/theme.css) is authoritative;
selector and property names below are current/OWL — pre-OWL this block was
`.electron-dark { --color-background-surface: …; --color-background-button-primary: …; }`, with the
same hex values):

```css
:is([data-codex-window-type][data-theme="dark"], [data-codex-window-type] [data-theme="dark"]) {
  --app-color-background-surface:        #0E141F !important;  /* deep navy ground */
  --color-text-primary:                  #F4EAD4 !important;  /* parchment ink, 15.0:1 (unchanged name) */
  --color-border:                        #1E2430 !important;  /* unchanged name */
  --app-color-background-button-primary: #C0A454 !important;  /* antique brass, the one accent */
}
```

**Every declaration is `!important` (D-0004-2).** On OWL, `webContents.insertCSS()` installs a
**user-origin** sheet, where only an `!important` declaration beats an author declaration of any
specificity; the style-tag fallback is author-origin, where `!important` also wins against Codex's
own zero-specificity `:where()` token blocks. Uniform `!important` is what makes one stylesheet win by
either route, so every rule the emitter writes carries it (outside `@font-face`, which cannot).

**Do not hand-edit those values.** They are derived in OKLCH and solved against WCAG AA targets by `tools/palette/palette-engine.mjs`. Change the recipe, then run `node tools/palette/emit-theme.mjs`.

### Layer 2 — Named hooks (the "character pass") — shipped, scope narrowed

**Approved and shipped 2026-08-01 (D-0001-10)**, after the owner toggled it against the flat build in [`docs/mockups/0002-captains-cabin-character-pass.html`](../mockups/0002-captains-cabin-character-pass.html).

**It lives in [`tools/palette/emit-theme.mjs`](../../tools/palette/emit-theme.mjs), not in `theme.css`.** That is deliberate, not an oversight: `theme.css` is generated wholesale by that emitter (see "Authoring & build" below), so a hand-edit to `theme.css` would be silently reverted by the next regeneration. Writing the Layer 2 block into the emitter is the only way for it to survive a rebuild.

What actually ships is narrower than the mockup demonstrates:

- `::selection` (brass selection colour, both modes) and `scrollbar-color` (thin brass scrollbars) — need no DOM landmark, since both are standard properties that inherit from the mode hook (pre-OWL: the `.electron-dark` / `.electron-light` theme class).
- Three Tier-2 named hooks from the UI inventory, each a real, declared landmark: `.app-header-tint` (a brass hairline on the title bar), `.popupContent` (depth plus a lit top edge on floating panels), `.app-shell-main-content-top-fade` (the scroll fade resolved to our ground rather than stock).

**Deferred until Gate 0:** the mockup also demonstrates an active-item rail, a code-header marker, lit button/card edges, and a brass title-bar crest. None of those has a durable hook — the mockup's rules target class names it invented for demonstration, not names ever observed in the app. Inventing Tier-3 selectors against an app nobody has yet launched would be a guess, so they wait for Gate 0 (the injector launch test, [Plan 0001 §1](../plans/0001-captains-cabin-architecture.md)) to identify a real landmark.

**None of the four Tier-2 landmarks has ever been observed in a running Codex.** They come from the UI inventory's static analysis, not from Gate 0, which has not run. Each degrades gracefully if the selector doesn't match in the real app: an unmatched rule paints nothing, so the theme loses a flourish rather than half-styling.

Scope is chrome-only by design — title bar, scrollbars, popovers, selection, the content-area fade — so [D-0001-6](../DECISIONS.md) (flat surfaces behind text) and the contrast proof are untouched. Scope title-bar rules to the desktop surface with the `electron:` variant where useful.

**Gone on OWL, measured 2026-09-23, no replacement hook needed.** `.app-header-tint`, `.popupContent`
and `.app-shell-main-content-top-fade` no longer exist in Codex's markup — menus are now built on
Radix (`[data-radix-menu-content]`) — but Codex's own tint variables are still read at those surfaces,
so Layer 1's token remap carries the same look without a structural rule
([`owl-token-inventory.md`](../research/owl-token-inventory.md) §5, [D-0004-1](../DECISIONS.md)). Parity
held without writing a Radix hook.

**One structural rule added since (Plan 0004 M3), a declared landmark:**

- **`.bg-chart-blue.text-white` → the solved brass-button pairing (D-0004-4).** The app-update pill's
  white label sits on `--color-chart-blue`, which resolves through the accent primitive this theme
  collapses to brass (D-0001-11); white-on-brass failed AA in dark mode where stock white-on-blue
  passed. No token route exists (`text-white` reads the constant `--color-white`), so the fix is one
  declared rule keyed to the exact pairing, landmarked as the optional `white-on-accent-fill`.

Diff code colours are the one surface this layer does **not** reach: they stay OpenAI's Pierre palette
by owner ruling ([D-0004-5](../DECISIONS.md), see [ui inventory](customizable-ui-inventory.md) §Syntax
highlighting).

### Layer 3 — Shape & typography
Tighter `--radius-*` values than stock (joinery, not pillows), plus the font families. Fonts reach most of the app by inheritance from the mode hook (pre-OWL: the `.electron-dark` / `.electron-light` theme class); code needs one declared landmark, `:is(pre, code, kbd, samp)`, because Codex sets an explicit monospace family that inheritance cannot override. Semantic HTML elements were chosen deliberately over utility-class combinations — they are the most durable structural hook available, and if the selector ever stops matching, code simply renders in the stock monospace stack. All nine font tokens (`FONT_FAMILY_TOKENS` in `codex-surface.mjs`) kept their pre-OWL names through the rename — they broke only because their defining block was scoped under the old mode classes, not because Codex renamed them.

**No surface decoration lives here.** Surfaces are flat token colour (D-0001-6); there is no `background-image`, no gradient wash, and no `--cc-texture-*` variable anywhere in the theme.

### Layer 4 — Syntax palette
Authored to match the chrome, every role solved to clear AA against the code surface of its own mode. Emitted twice, deliberately: as `--cc-syntax-*` custom properties inside `theme.css`, and as [`syntax.json`](../../themes/captains-cabin/syntax.json) beside it. Both come from one generator, so they cannot disagree. Which one the editor actually consumes — a Pierre hook or a CSS override — is a **Phase 3** question; shipping both keeps either route open without a rewrite.

## Authoring & build

- `theme.css` is **generated**, not hand-written. `tools/palette/emit-theme.mjs` derives every value and emits both `theme.css` and `syntax.json`; the emitter refuses to write if any pair fails AA. Hand-editing the output means the next regeneration silently reverts you.
- A **hot-reload dev loop** (injector file-watcher re-applies on save) lands with the injector in Phase 3, for fast iteration against the running app.
- The packaging build inlines the two woff2 fonts as data URIs and emits the validated `theme.css` into the `.ccskin`. Fonts are the only assets to inline — there are no images.

## Durability rules (hard)

1. **Never** target hash-suffixed bundle filenames (`app-BSNLQ2Yt.css`) — they change every build.
2. **Prefer tokens** over structural selectors; a structural selector is a last resort and must be a declared **landmark**.
3. **Declare landmarks** in the manifest; verify presence at inject time; **degrade gracefully** (fall back to stock) if a landmark is missing — never break the app.
4. **Contrast is law:** every text/surface pair passes WCAG AA. Readability outranks aesthetics per the brief.
5. **No remote references:** no `@import` of URLs, no `url()` to non-embedded resources. The theme is self-contained and never phones home.

## Why this survives updates

Token overrides bind to OpenAI's *own* indirection layer, not to markup. A UI refactor that keeps the token names keeps Captain's Cabin working with zero changes; one that renames tokens or the mode hook needs a vocabulary re-map, not a rebuild. Structural selectors — the fragile part — are minimized, declared, and non-fatal when they break.

**This was tested for real, not just argued.** Codex's OWL update (`26.917`, 2026-09-23) is the first
update this theme did not survive unchanged: it moved the mode hook and renamed 60 of 77 colour
tokens ([D-0004-1](../DECISIONS.md)). The architecture held exactly as designed — the injector,
launcher, package format and installer needed zero changes — and the vocabulary layer's fragility was
contained to one file: because `codex-surface.mjs` owns every selector and property name the emitter
writes, the re-map (Plan 0004 M2) was a change to that file and the recipes' landmark probes, not a
rebuild or a values refresh. See `docs/ENGINEERING.md`'s "Why this survives Codex updates" paragraph (Current Architecture) for the honest,
non-euphemistic account of what changed and what didn't.
