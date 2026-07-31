# Asset Manifest — Captain's Cabin

**Living spec.** Every image/font asset the theme needs, with intent, format, and constraints.
Governing principle from the brief: **subtle, low-contrast, readability-first.** Textures are *felt*, not *seen*. If an asset draws attention to itself, it's wrong.

Delivery mechanism: images are embedded as **scoped Blob/data URLs exposed via CSS variables** (the convention the mature community tools use, e.g. `--cc-texture-oak`), so the theme stays a self-contained package with no external file references at runtime.

Hard caps (borrowed from mature theme pipelines, for sanity + fast injection): total package ≤ 32 MiB, individual texture ≤ ~400 KB where possible.

---

## Textures (tiled, seamless, low-contrast)

| Asset | Var | Format | Size | Intent |
|---|---|---|---|---|
| Dark oak — primary surface | `--cc-texture-oak` | WebP, seamless tile | ~512×512, <300 KB | App background / main surface. Very low contrast; grain barely perceptible. |
| Aged leather — panels | `--cc-texture-leather` | WebP, seamless tile | ~512×512, <300 KB | Sidebars, popovers, elevated panels. |
| Weathered parchment — light-mode base | `--cc-texture-parchment` | WebP, seamless tile | ~512×512, <300 KB | Light-theme background / message surfaces. |
| Brushed brass — accents | `--cc-texture-brass` | WebP or CSS gradient | small | Active states, key numbers, title-bar trim. Prefer a CSS gradient if it reads as convincingly to avoid an image dependency. |
| Canvas/linen — subtle secondary | `--cc-texture-canvas` | WebP, seamless tile | ~512×512, <200 KB | Optional secondary surface texture. |

## Lighting / atmosphere overlays

| Asset | Var | Format | Intent |
|---|---|---|---|
| Candlelight vignette | `--cc-overlay-vignette` | PNG w/ alpha or radial-gradient CSS | Soft warm darkening at edges; concentrates "light" toward the working area. Prefer pure CSS radial-gradient (no asset) if achievable. |
| Soft top fade | (reuse `app-shell-main-content-top-fade`) | CSS | Warm scroll fade. |

> Prefer **procedural CSS** (gradients, box-shadows, `filter`) over image assets wherever it reads convincingly. Every avoided image is one less thing to load, license, and maintain. Textures are only for grain that CSS can't fake.

## Optional decorative (must be defeatable)

| Asset | Var | Notes |
|---|---|---|
| Compass-rose / ship's-crest title-bar mark | `--cc-crest` | SVG, monochrome brass. **Off by default** or extremely subtle — the brief forbids gimmicks. A tiny corner mark at most. No moving ships, no parrots, no waves. |

## Syntax palette (code editor)

Not an image — a set of colour values authored to match the chrome and sit on parchment/oak with **AA+ contrast** for every token class (keyword, string, comment, function, number, etc.). Delivered as either a Pierre-compatible theme JSON (if we can hook the Pierre loader) or as CSS-variable overrides on the editor's token classes. Mechanism TBD in Phase 3; palette values authored in Phase 2.

## Fonts (see UI inventory §Fonts)

| Role | Deliverable |
|---|---|
| Display/UI | One characterful face (design-floor compliant), shipped as woff2 with its license. |
| Monospace | One warm legible mono, shipped as woff2 with its license. |

Font selection + license verification is a **Phase 2 gate** — a font we can't legally redistribute in the package is disqualified regardless of looks.

---

## Asset production plan (Phase 2)

1. Lock the palette (exact hex, both modes) — **before** any texture is generated, so textures are tinted to the palette, not the reverse.
2. Generate seamless textures at low contrast; verify tiling has no visible seam and no repeating "hero" feature that the eye locks onto.
3. Validate every text/surface pair for WCAG AA.
4. Verify at **375px mobile-equivalent density first**, then desktop (per design floor), even though Codex Desktop is desktop-primary — the density discipline still applies to panels/popovers.
