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

### Shape & depth (use sparingly — brass/leather feel comes from colour, not rounding)
`--radius-sm … --radius-4xl`, `--radius-full`, `--shadow`, `--shadow-hairline`, `--elevation-prominent`

> **Design note:** the brief demands readability first. Text/border tokens must preserve or *improve* contrast ratios versus stock. Warm parchment-on-oak is the goal, not low-contrast mud. Validate every text/background pair against WCAG AA before shipping.

---

## Tier 2 — Named hooks (🟡)

Semantic, hand-written classes safe to target directly:

| Class | Purpose | Captain's Cabin use |
|---|---|---|
| `app-header-tint` | Header/toolbar tint layer | Brass/oak title-bar treatment |
| `app-shell-main-content-top-fade` | Top scroll fade | Candlelight vignette fade |
| `hide-scrollbar` / scrollbar styles | Scrollbars | Thin brass scrollbar |
| `popupContent` | Popovers/menus | Leather-panel popovers |
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

| Role | Stock | Captain's Cabin direction |
|---|---|---|
| UI / display | `OpenAI Sans` (bundled woff2) | A characterful pairing — **not** Inter/Roboto/Arial/system-ui (design floor). Proposal in Phase 2. |
| Monospace (editor) | `ui-monospace, SF Mono, Menlo, Consolas` | A warm, legible mono for long sessions; candidate list in Phase 2. |

Fonts are overridable via `font-family` on the relevant tokens/roots. Any bundled font must ship with the theme (license-checked) since we can't rely on the user having it.
