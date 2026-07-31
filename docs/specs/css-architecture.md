# CSS Architecture — Captain's Cabin

**Living spec.** How the theme's CSS is layered, authored, validated, and kept update-resilient.

## The layers

```
theme.css
├─ Layer 1  Token overrides   → .electron-dark { --color-*: … }  (+ .electron-light)
├─ Layer 2  Named-hook rules  → .app-header-tint, scrollbars, .popupContent
├─ Layer 3  Shape + type      → --radius-*, font-family (one declared landmark)
└─ Layer 4  Syntax palette    → --cc-syntax-* vars, mirrored in syntax.json
```

> **Layer 3 changed in Phase 2.** It was "Texture / atmosphere — embedded `--cc-texture-*` vars + CSS gradients." Surface textures were cut ([D-0001-6](../DECISIONS.md)) and no gradient wash sits behind content, so that layer no longer exists; the slot now carries shape and typography. There are **no `--cc-texture-*` variables**. If you find a reference to one, it is stale.

### Layer 1 — Token overrides (the workhorse)
Redefine the semantic custom properties (see [ui inventory](customizable-ui-inventory.md) Tier 1) scoped to the theme class. Codex's Tailwind utilities (`bg-token-*`, `text-token-*`, `border-token-*`) read these variables, so one override cascades app-wide and into unshipped UI.

Real, shipped values (excerpt — [`theme.css`](../../themes/captains-cabin/theme.css) is authoritative):

```css
.electron-dark {
  --color-background-surface:        #0E141F;  /* deep navy ground */
  --color-text-primary:              #F4EAD4;  /* parchment ink, 15.0:1 */
  --color-border:                    #1E2430;
  --color-background-button-primary: #C0A454;  /* antique brass, the one accent */
}
```

**Do not hand-edit those values.** They are derived in OKLCH and solved against WCAG AA targets by `tools/palette/palette-engine.mjs`. Change the recipe, then run `node tools/palette/emit-theme.mjs`.

### Layer 2 — Named hooks
Rules on stable, hand-written classes for things tokens can't express — title-bar tint, scrollbar styling, popover panels. Scope title-bar rules to the desktop surface with the `electron:` variant where useful.

### Layer 3 — Shape & typography
Tighter `--radius-*` values than stock (joinery, not pillows), plus the font families. Fonts reach most of the app by inheritance from the theme class; code needs one declared landmark, `:is(pre, code, kbd, samp)`, because Codex sets an explicit monospace family that inheritance cannot override. Semantic HTML elements were chosen deliberately over utility-class combinations — they are the most durable structural hook available, and if the selector ever stops matching, code simply renders in the stock monospace stack.

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

Token overrides bind to OpenAI's *own* indirection layer, not to markup. A UI refactor that keeps the token names keeps Captain's Cabin working with zero changes; one that renames tokens needs a values refresh (recolour), not a rebuild. Structural selectors — the fragile part — are minimized, declared, and non-fatal when they break.
