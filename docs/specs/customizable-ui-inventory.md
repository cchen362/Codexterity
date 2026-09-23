# Customizable UI Inventory — Codex Desktop

**Living spec.** What Captain's Cabin can restyle, how, and how durable each hook is.
Evidence source: extraction + analysis of `app.asar` (`webview/assets/app-*.css`, `app-initial-*.js`) on 2026-07-31.

> **Moved to Codex's OWL-era names, 2026-09-23 (Plan 0004 M4).** Codex `26.917` ("OWL") renamed the
> mode hook and 60 of the 77 colour tokens this theme overrides ([D-0004-1](../DECISIONS.md)). This
> spec now describes the current, OWL-era surface; pre-OWL names are kept where noted, marked
> "(pre-OWL: …)". See [`docs/research/owl-token-inventory.md`](../research/owl-token-inventory.md) for
> the full measured map and [Plan 0004](../plans/0004-codex-owl-token-remap.md) for the milestone
> record.

Durability legend:
- 🟢 **Token** — override a CSS custom property on the root mode hook (pre-OWL: a root theme class). Most update-resistant; cascades to future UI automatically.
- 🟡 **Named hook** — hand-written, semantic class name. Stable, but could be renamed in a refactor.
- 🔴 **Structural** — depends on DOM shape / utility-class combos. Fragile; avoid unless necessary.
- ⛔ **Not customizable** — OS-drawn or non-DOM.

---

## Tier 1 — Token overrides (🟢 primary strategy)

**Mode hook (OWL, current).** Redefine tokens scoped to `[data-theme="dark"|"light"]` on a
`[data-codex-window-type]` document (pre-OWL: `.electron-dark` / `.electron-light` on `<html>`). The
exact selectors are `MODE_SCOPE` / `ANY_MODE_SCOPE` in
[`tools/palette/codex-surface.mjs`](../../tools/palette/codex-surface.mjs) — see
[D-0004-1](../DECISIONS.md). ~1,278 custom properties existed pre-OWL; OWL's stylesheets define 779
distinct `--color-*` properties. The tokens below are the load-bearing semantic ones for a theme.

**Token names (OWL, current).** Of the 77 colour tokens this theme overrides, 60 were renamed
`--color-X` → `--app-color-X`, 16 kept their pre-OWL name, and `--color-text-quaternary` is gone with
no replacement. `tokenProperty()` in `codex-surface.mjs` is the single place that decides the prefix
for a given role; the full old-role → new-token map is
[`docs/research/owl-token-inventory.md`](../research/owl-token-inventory.md) §3 — read it rather than
this list for which prefix a given name actually takes today. The lists below name each token's
pre-OWL identity, since that is what the palette-role vocabulary in this repo (and in
`codex-surface.mjs`) is still built from; assume `--app-color-` unless §3 says otherwise.

### Surfaces & backgrounds
`--color-background-surface`, `--color-background-elevated-primary`, `--color-background-elevated-secondary`, `--color-token-bg-tertiary`, `--color-token-bg-secondary`, `--color-token-bg-fog`, `--color-token-main-surface-primary`

### Text
`--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`, `--color-text-quaternary` (gone on OWL — no replacement; its solved value still feeds the terminal's Black/BrightBlack ANSI slots), `--color-text-foreground`, `--color-text-foreground-secondary`, `--color-text-on-accent`, `--color-text-error`, `--color-text-warning`, `--color-text-success`, `--color-token-foreground`

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

### OWL-only primitives and component literals (new since the rename)
Codex introduced 22 `--app-color-*` primitives with no pre-OWL counterpart (tooltips, the tip badge,
inactive buttons, popover recovery UI, plus a handful read both through an existing name and
directly) and sets several component tokens to per-mode literal hex it derives from nothing — the
Chat/Work mode toggle, the composer utility bar, and the Chat conversation user-message bubble. All
of these take already-solved roles rather than new colour; see `tokenGroups()` in `codex-surface.mjs`
for the full pairing and [D-0004-1](../DECISIONS.md) for why. Three of the 22 primitives are
deliberately left unset (`--app-color-background-card`, `--app-color-text-primary-solid`,
`--app-color-simple-scrim`) — each falls through to an already-themed value or, for the scrim, is a
neutral wash this theme's one-accent-never-as-fill rule forbids colouring.

> **Design note (updated Phase 2):** readability comes first. The shipped values for every token above live in [`themes/captains-cabin/theme.css`](../../themes/captains-cabin/theme.css) — parchment ink on a deep navy ground, with parchment surfaces carrying navy ink in light mode. They are derived in OKLCH and *solved* against WCAG AA targets, not picked by eye; `node tools/palette/audit.mjs` proves it (**292/292**, grown from 152/152 as OWL's new pairings were added — see [D-0004-1](../DECISIONS.md)). Surfaces are flat colour, so those figures hold unconditionally ([D-0001-6](../DECISIONS.md)).

---

## Tier 2 — Named hooks (🟡)

Semantic, hand-written classes safe to target directly:

| Class | Purpose | Captain's Cabin use |
|---|---|---|
| `hide-scrollbar` / scrollbar styles | Scrollbars | Thin brass scrollbar |
| `draggable` / `no-drag` | Title-bar drag regions | Layout anchors (do not restyle behaviourally) |

**Gone on OWL, measured 2026-09-23, no replacement needed:** `app-header-tint` (pre-OWL: header/toolbar
tint layer), `popupContent` (pre-OWL: popovers/menus — menus are now built on Radix,
`[data-radix-menu-content]`), and `app-shell-main-content-top-fade` (pre-OWL: top scroll fade) no
longer exist in Codex's markup. None of the three needed a Radix or other replacement hook: Codex's
own tint variables are still read at those surfaces, so re-pointing the underlying tokens (Tier 1)
carries the look without a structural rule. See
[`docs/research/owl-token-inventory.md`](../research/owl-token-inventory.md) §5 and
[D-0004-1](../DECISIONS.md).

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

## ChatGPT Chat and Work surfaces (added Plan 0004 M3, 2026-09-23)

Codex's OWL update folded the ChatGPT Chat and Work areas into the same app shell, reachable from a
sidebar-header mode switch. They read the **same core primitives** as the rest of Codex, so re-pointing
Tier 1's tokens themes them automatically — measured by a paint-coverage census, not assumed. Two
exceptions needed more than the core re-map:

- **The Chat conversation user-message bubble** (a token fix). Codex sets its background/text
  tokens (`--color-background-user-message`, `--color-text-user-message`) to per-mode literal hex it
  derives from no primitive. Light mode painted stock pale blue until those tokens were re-pointed to
  the theme's already-audited `background-button-secondary` / `text-primary` pairing (Plan 0004 M3).
- **The app-update pill** (the one structural rule), a `bg-chart-blue` / `text-white` element. Since `--color-chart-blue`
  resolves to the accent primitive this theme collapses to brass ([D-0001-11](../DECISIONS.md)), the
  pill's white label failed AA against brass in dark mode. [D-0004-4](../DECISIONS.md) re-points both
  the fill and the ink to the solved brass-button pairing via one declared rule
  (`.bg-chart-blue.text-white`), landmarked as the optional `white-on-accent-fill`.

## Syntax highlighting (separate surface)

The code editor uses OpenAI's **"Pierre"** Shiki-style themes (`pierre-dark`, `pierre-light`, colour-blind variants), lazy-loaded as JS chunks and selected independently of the app theme. Captain's Cabin needs its **own matching syntax palette** authored to sit on parchment/oak — this is a distinct deliverable from the chrome tokens and is tracked in the asset manifest.

**Codex's diff view is a deliberate exception.** The diff body (`@pierre/diffs`) renders inside an open
shadow root with per-word inline styles Codex itself chooses from its Pierre palette; the theme reaches
the diff's ground, code face and added/removed line tints through tokens (which inherit into the
shadow tree), but does not recolour the code text itself. That gap is **[D-0004-5](../DECISIONS.md)**,
an owner ruling, not an oversight — re-theming it would need a new mechanism (inline styles inside a
shadow root) and is out of scope for a parity change.

---

## Fonts

**LOCKED in Phase 2 (2026-07-31).** Chosen by the owner from a rendered mockup with both candidates set in live UI, not from a list of names.

| Role | Stock | Captain's Cabin | Licence |
|---|---|---|---|
| Display (headings) | `OpenAI Sans` (bundled woff2) | **Fraunces** (variable) — Undercase Type | SIL OFL 1.1 ✅ redistributable |
| UI / body | `OpenAI Sans` / system stack | **Literata** (variable) — TypeTogether | SIL OFL 1.1 ✅ redistributable |
| Monospace (code, terminal, diff) | `ui-monospace, SF Mono, Menlo, Consolas` | **Monaspace Neon** — GitHub Next | SIL OFL 1.1 ✅ redistributable |

> **This table was corrected 2026-09-23 (Plan 0004 M4); it had not tracked two re-closures.** Phase 2 locked Fraunces for display *and* UI with Monaspace **Xenon** for code. The typography half was re-closed on 2026-08-01 (Fraunces = display only, **Literata** = UI/body) and the code face on 2026-08-02 (Xenon → **Neon**). Both are recorded in full under D-0001-7 in [`docs/DECISIONS.md`](../DECISIONS.md), which is the reasoning of record; the shipped [`manifest.json`](../../themes/captains-cabin/manifest.json) embeds exactly these three faces.

**Why this lineup.** Fraunces stays the display face; Literata was chosen for UI and body by the owner from a rendered comparison ([`docs/mockups/0003-typography-comparison.html`](../mockups/0003-typography-comparison.html)); Neon replaced Xenon because Xenon is the slab-serif member of the Monaspace family, which made the app serif at every level and erased code's "literal text" texture. The full reasoning, including what was rejected, is under D-0001-7 in [`docs/DECISIONS.md`](../DECISIONS.md).

**Licensing.** All three are SIL OFL 1.1: free to bundle inside the `.ccskin`, commercially and otherwise, provided the copyright notice and licence ship with the font and the fonts are never sold on their own. A font that could not be legally redistributed was disqualified before it reached the mockup. **Monaspace carries a Reserved Font Name** — ship it unmodified (beyond the Latin subset) or rename it. Files and licence texts: `themes/captains-cabin/assets/fonts/`.

**How they are applied.** `font-family` set on the mode scope (pre-OWL: `.electron-dark` / `.electron-light`; now the `[data-theme]`-on-`[data-codex-window-type]` hook — see Tier 1 above and [D-0004-1](../DECISIONS.md)) reaches most of the app by inheritance. Code needs one declared landmark, `:is(pre, code, kbd, samp)`, because Codex sets an explicit monospace family that inheritance cannot override — see [`css-architecture.md`](css-architecture.md) §Layer 3. Bundled because we cannot rely on the user having either face installed. The nine font tokens themselves (`FONT_FAMILY_TOKENS` in `codex-surface.mjs`) survived the OWL rename under their pre-OWL names — they broke only because their defining block was scoped under the old mode classes, not because the names moved.

**Not chosen:** Alegreya + Alegreya Sans + Commit Mono, offered as the quieter, denser-safe alternative. Recorded in [D-0001-8](../DECISIONS.md); do not re-propose without a new reason.
