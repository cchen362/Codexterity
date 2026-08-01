# Asset Manifest — Captain's Cabin

**Living spec.** Every asset the theme needs.

> **Rewritten in Phase 2 (2026-07-31); updated in Phase 3 (2026-08-01).**
> The Phase 2 rewrite superseded an original manifest that specified five tiling textures (oak, leather, parchment, brass, canvas) plus a vignette overlay — **all cut**, see [D-0001-6 and D-0001-8](../DECISIONS.md). Phase 3 then shipped the one raster asset Phase 2 left optional: the empty-state hero. If you are working from a description that says the theme ships no raster assets at all, that statement is now out of date — see below.

---

## The short version

**Captain's Cabin ships one raster asset: the empty-state hero.** Everything else is CSS plus two fonts.

| Category | Status |
|---|---|
| Tiling surface textures | **Cut.** None. Surfaces are flat token colour. |
| Lighting / atmosphere overlays | **Cut as tiled/wash assets.** What remains as CSS is expressed through the surface ramp and borders. |
| Fonts | **Two, bundled**, both SIL OFL 1.1. |
| Empty-state hero image | **Shipped (D-0001-9).** `themes/captains-cabin/assets/hero-empty-state.webp`, 1600×900, 121 KB, WEBP. Empty-state only, under a scrim. |
| Compass-rose crest | **Optional, not built.** Hand-authored SVG if ever added, never raster. |

## Why the textures were cut

Recorded here because it is the kind of decision a future agent would otherwise re-propose in good faith.

1. **It read as an error, not as a material.** Tiled photographic grain is *high-frequency* luminance variation. On a flat UI surface the eye files that under "compression artifact" or "discolouration," not under "oak." The owner's reaction to a rendered comparison was exactly that, at every strength tested.
2. **Dark grounds are the worst case.** The ground sits at roughly 9% lightness. There is no headroom below it, so grain can only *lighten* patches — which is precisely what a stain or a banding artifact looks like.
3. **It broke the contrast proof.** Every figure this theme claims is computed against a flat colour. Put luminance variation behind body text and the value that governs legibility becomes the worst pixel rather than the average, so WCAG AA stops being provable. Readability is this project's first design law and it outranks the texture.

Depth now comes from the **six-step surface ramp** in `theme.css` and from borders. That is enough: the ramp was always doing most of the work.

---

## Fonts (the only shipped assets)

Location: `themes/captains-cabin/assets/fonts/`. The packaging build inlines these as data URIs so the theme never references a remote resource.

| Role | Family | File | Licence | Redistributable |
|---|---|---|---|---|
| Display + UI | **Fraunces** (variable) | `fraunces-latin-variable.woff2` (118 KB) | SIL OFL 1.1 — `Fraunces-OFL.txt` | ✅ Yes |
| Monospace | **Monaspace Xenon** | `monaspace-xenon-latin-400.woff2` (47 KB) | SIL OFL 1.1 — `Monaspace-OFL.txt` | ✅ Yes |

Both are Latin subsets from Fontsource. The OFL permits bundling and redistribution with any software provided the copyright notice and licence travel with the font and the fonts are never sold on their own. **Monaspace carries a Reserved Font Name** ("Monaspace", including the "Xenon" subfamily) — so a *modified* version may not keep that name. We ship it unmodified apart from the Latin subset; if the font is ever altered, rename it.

Roles and rationale are recorded in [`customizable-ui-inventory.md`](customizable-ui-inventory.md) §Fonts.

---

## Shipped: the empty-state hero

**`themes/captains-cabin/assets/hero-empty-state.webp`** — 1600×900, 121 KB, WEBP. Shipped 2026-08-01 (D-0001-9), Phase 3.

A single atmospheric image behind the new-session screen — the one place imagery earns its keep, because no dense text sits over it. It sits under a scrim that resolves to solid `--color-background-surface` before any body text begins, so contrast stays provable. **The theme must remain complete and correct without it**; that property was verified before the image existed and the image does not change it — an absent file degrades to the pre-Phase-3 flat empty state, not to breakage.

It is a chart-table composition (Prompt A of [`asset-generation-prompts.md`](asset-generation-prompts.md)): a navigator's chart table shot from above at night, lit by a brass oil lamp sitting just outside the top of frame, brass dividers and a parallel rule catching the light upper-left-of-centre, the chart falling away into navy shadow toward the bottom and edges. The owner chose it from a rendered comparison in the mockup, not from the files in isolation — see [`asset-generation-prompts.md`](asset-generation-prompts.md) for the full acceptance-checklist accounting, including one deliberate deviation from the original brief (warm coverage is ~15% of frame, not "narrow").

The only alteration made to the generated file is a highlight rolloff: the lamp core, which clipped at luminance 0.935 (effectively blown white in a deliberately low-key image), was compressed to 0.530. Hue and warmth were left untouched. Full reasoning in [D-0001-9](../DECISIONS.md).

**Nothing has confirmed how this renders in a running Codex — Gate 0 has not happened.** Every claim above traces to the standalone mockup, not to the app.

### Compass-rose crest

Not built. Recorded so the option stays open, and it may not become a dependency: the theme must remain complete and correct without it. A tiny monochrome title-bar mark, **off by default**. Hand-authored SVG using `currentColor` so it re-tints with the accent — never a raster generation. The brief forbids gimmicks; a corner mark at most.

---

## Verification

- Every text/surface pair passes **WCAG AA**, checked by `node tools/palette/audit.mjs` (152/152).
- Because surfaces are flat, those figures hold unconditionally — there is no compositing step that can invalidate them. **Any change that puts variation behind text voids this and requires a new proof.**
