# Customizable UI Inventory — Codex Desktop

**Living spec.** What Captain's Cabin can restyle, how, and how durable each hook is.
Evidence source: extraction + analysis of `app.asar` (`webview/assets/app-*.css`, `app-initial-*.js`) on 2026-07-31.

Durability legend:
- 🟢 **Token** — override a CSS custom property on the root theme class. Most update-resistant; cascades to future UI automatically.
- 🟡 **Named hook** — hand-written, semantic class name. Stable, but could be renamed in a refactor.
- 🔴 **Structural** — depends on DOM shape / utility-class combos. Fragile; avoid unless necessary.
- ⛔ **Not customizable** — OS-drawn or non-DOM.

---

## Tier 1 — Token overrides (🟢 primary strategy)

Redefine these on `.electron-dark` (and `.electron-light`) to recolour the whole app. ~1,278 custom properties exist; these are the load-bearing semantic ones for a theme.

### Surfaces & backgrounds
`--color-background-surface`, `--color-background-elevated-primary`, `--color-background-elevated-secondary`, `--color-token-bg-tertiary`, `--color-token-bg-secondary`, `--color-token-bg-fog`, `--color-token-main-surface-primary`

### Text
`--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`, `--color-text-quaternary`, `--color-text-foreground`, `--color-text-foreground-secondary`, `--color-text-on-accent`, `--color-text-error`, `--color-text-warning`, `--color-text-success`, `--color-token-foreground`

### Borders
`--color-border`, `--color-border-light`, `--color-border-heavy`, `--color-border-focus`, `--color-border-warning`, `--color-border-error`, `--color-token-border-default`, `--color-token-border-light`, `--color-token-border-heavy`

### Buttons / accent (⭐ where "antique brass" lives)
`--color-background-button-primary`, `--color-background-button-primary-hover`, `--color-background-button-primary-active`, `--color-background-button-secondary`, `--color-background-button-tertiary`, `--color-background-button-primary-inactive`

### Icons
`--color-icon-primary`, `--color-icon-secondary`, `--color-icon-tertiary`

### Status
`--color-background-status-success`, `--color-background-danger-active`

### Code / diff surfaces
`--color-token-diff-surface`, `--color-editor-added`, `--color-editor-deleted`

### Shape & depth (use sparingly — the theme's character comes from colour, not rounding)
`--radius-sm … --radius-4xl`, `--radius-full`, `--shadow`, `--shadow-hairline`, `--elevation-prominent`

> **Design note (updated Phase 2):** readability comes first. The shipped values for every token above live in [`themes/captains-cabin/theme.css`](../../themes/captains-cabin/theme.css) — parchment ink on a deep navy ground, with parchment surfaces carrying navy ink in light mode. They are derived in OKLCH and *solved* against WCAG AA targets, not picked by eye; `node tools/palette/audit.mjs` proves it (152/152). Surfaces are flat colour, so those figures hold unconditionally ([D-0001-6](../DECISIONS.md)).

---

## Tier 2 — Named hooks (🟡)

Semantic, hand-written classes safe to target directly:

| Class | Purpose | Captain's Cabin use |
|---|---|---|
| `app-header-tint` | Header/toolbar tint layer | Flat elevated surface + brass hairline |
| `app-shell-main-content-top-fade` | Top scroll fade | Fade to the ground token |
| `hide-scrollbar` / scrollbar styles | Scrollbars | Thin brass scrollbar |
| `popupContent` | Popovers/menus | Flat elevated-secondary panel + heavy border |
| `draggable` / `no-drag` | Title-bar drag regions | Layout anchors (do not restyle behaviourally) |

Custom Tailwind surface variants also exist (`electron:h-toolbar`, `browser:hidden`, `extension:h-toolbar-sm`) — useful for scoping title-bar rules to the desktop surface only.

---

## Tier 3 — Structural / fragile (🔴 avoid)

Deep child chains, positional selectors, and raw utility-combo targeting (`flex items-center gap-1`). Bundle **filenames are hash-suffixed** (`app-BSNLQ2Yt.css`) and change every build — never target or depend on a shipped filename. If a Tier-3 selector is unavoidable, treat it as declared "landmark," verify its presence at inject time, and degrade gracefully if absent.

---

## Tier 4 — Not customizable (⛔)

| Element | Why | Consolation |
|---|---|---|
| Windows caption buttons (min/max/close) | OS-drawn | Colour settable via `titleBarOverlay` |
| macOS traffic lights | OS-drawn | Positioned via `trafficLightPosition`; not CSS |
| Native app/context menus | OS-rendered | — |
| Avatar overlay / canvas / video content | Non-DOM raster | — |

---

## Syntax highlighting (separate surface)

The code editor uses OpenAI's **"Pierre"** Shiki-style themes (`pierre-dark`, `pierre-light`, colour-blind variants), lazy-loaded as JS chunks and selected independently of the app theme. Captain's Cabin needs its **own matching syntax palette** authored to sit on parchment/oak — this is a distinct deliverable from the chrome tokens and is tracked in the asset manifest.

---

## Fonts

**LOCKED in Phase 2 (2026-07-31).** Chosen by the owner from a rendered mockup with both candidates set in live UI, not from a list of names.

| Role | Stock | Captain's Cabin | Licence |
|---|---|---|---|
| UI / display | `OpenAI Sans` (bundled woff2) | **Fraunces** (variable) — Undercase Type | SIL OFL 1.1 ✅ redistributable |
| Monospace (editor) | `ui-monospace, SF Mono, Menlo, Consolas` | **Monaspace Xenon** — GitHub Next | SIL OFL 1.1 ✅ redistributable |

**Why this pairing.** Fraunces carries display *and* UI: its `opsz` axis is set to 144 for headings and dropped to 14 for interface text, so one family stays crisp at 13px without a second face. Monaspace Xenon is a slab-serif monospace, which pairs with a serif UI far better than a grotesque mono would. The accepted risk, stated when it was chosen: a serif UI at 13px is a real commitment and can tire on dense screens — revisit if that proves true in Phase 3 real-app testing, not before.

**Licensing.** Both are SIL OFL 1.1: free to bundle inside the `.ccskin`, commercially and otherwise, provided the copyright notice and licence ship with the font and the fonts are never sold on their own. A font that could not be legally redistributed was disqualified before it reached the mockup. **Monaspace carries a Reserved Font Name** — ship it unmodified (beyond the Latin subset) or rename it. Files and licence texts: `themes/captains-cabin/assets/fonts/`.

**How they are applied.** `font-family` on `.electron-dark` / `.electron-light` reaches most of the app by inheritance. Code needs one declared landmark, `:is(pre, code, kbd, samp)`, because Codex sets an explicit monospace family that inheritance cannot override — see [`css-architecture.md`](css-architecture.md) §Layer 3. Bundled because we cannot rely on the user having either face installed.

**Not chosen:** Alegreya + Alegreya Sans + Commit Mono, offered as the quieter, denser-safe alternative. Recorded in [D-0001-8](../DECISIONS.md); do not re-propose without a new reason.
