# CSS Architecture — Captain's Cabin

**Living spec.** How the theme's CSS is layered, authored, validated, and kept update-resilient.

## The four layers

```
theme.css
├─ Layer 1  Token overrides      → .electron-dark { --color-*: … }  (+ .electron-light)
├─ Layer 2  Named-hook rules     → .app-header-tint, scrollbars, .popupContent
├─ Layer 3  Texture / atmosphere → embedded --cc-texture-* vars + CSS gradients
└─ Layer 4  Syntax palette        → editor token colours (or Pierre-compatible JSON)
```

### Layer 1 — Token overrides (the workhorse)
Redefine the semantic custom properties (see [ui inventory](customizable-ui-inventory.md) Tier 1) scoped to the theme class. Codex's Tailwind utilities (`bg-token-*`, `text-token-*`, `border-token-*`) read these variables, so one override cascades app-wide and into unshipped UI.

```css
/* illustrative — real values land in Phase 2 */
.electron-dark {
  --color-background-surface: /* dark oak */;
  --color-text-primary:       /* warm parchment */;
  --color-border:             /* aged brass, low alpha */;
  --color-background-button-primary: /* antique brass accent */;
}
```

### Layer 2 — Named hooks
Rules on stable, hand-written classes for things tokens can't express — title-bar tint, scrollbar styling, popover panels. Scope title-bar rules to the desktop surface with the `electron:` variant where useful.

### Layer 3 — Texture & atmosphere
Textures embedded as CSS variables (`--cc-texture-oak` etc.); applied as low-opacity `background-image` layered under content, plus procedural candlelight via radial-gradients and warm `box-shadow`. **Procedural CSS is preferred over image assets** wherever it reads convincingly.

### Layer 4 — Syntax palette
Authored separately to match the chrome, AA+ contrast per token class. Mechanism (Pierre hook vs CSS override) decided in Phase 3.

## Authoring & build

- Author as a real `.css` file with a **hot-reload dev loop** (injector file-watcher re-applies on save) for fast iteration against the running app.
- Build step inlines assets → CSS vars and emits the validated `theme.css` into the `.ccskin` package.

## Durability rules (hard)

1. **Never** target hash-suffixed bundle filenames (`app-BSNLQ2Yt.css`) — they change every build.
2. **Prefer tokens** over structural selectors; a structural selector is a last resort and must be a declared **landmark**.
3. **Declare landmarks** in the manifest; verify presence at inject time; **degrade gracefully** (fall back to stock) if a landmark is missing — never break the app.
4. **Contrast is law:** every text/surface pair passes WCAG AA. Readability outranks aesthetics per the brief.
5. **No remote references:** no `@import` of URLs, no `url()` to non-embedded resources. The theme is self-contained and never phones home.

## Why this survives updates

Token overrides bind to OpenAI's *own* indirection layer, not to markup. A UI refactor that keeps the token names keeps Captain's Cabin working with zero changes; one that renames tokens needs a values refresh (recolour), not a rebuild. Structural selectors — the fragile part — are minimized, declared, and non-fatal when they break.
