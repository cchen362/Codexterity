# Asset Generation — Captain's Cabin

> **Rewritten in Phase 2 (2026-07-31). This supersedes the original prompt set.**
> That version contained four GPT Image prompts — dark oak, aged leather, weathered parchment, and a warm chart-paper hero — plus a tiling and colour-grading recipe. **The three texture prompts and the entire tiling recipe are gone**, because the tiling textures were cut ([D-0001-6, D-0001-8](../DECISIONS.md)). The hero prompt survives, rewritten for the navy ground.

---

## Current status: nothing to generate

**Captain's Cabin ships no raster assets.** The theme is complete, contrast-proven, and correct with zero images. See [`asset-manifest.md`](asset-manifest.md).

This file exists for one optional, unbuilt asset. **Do not treat running it as pending work** — it is an open option, not a task.

---

## The one remaining prompt — empty-state hero (OPTIONAL, not built)

**Read this before generating.** The hero is permitted *only* behind the empty / new-session screen, under a scrim that resolves to solid `--color-background-surface` before any body text starts. Text never sits on artwork; it sits on the scrim's solid end. That is the entire reason this one image is allowed when the textures were not.

The prompt below is written for the **deep navy** ground (`#0E141F`). The original was written warm — candlelight, tea-stained paper, deep brown wood — which was native to the oak ground that was not chosen and would fight navy chrome. This is a night-watch reading of the same room: cool ground, a single warm light source, brass as the only warm accent.

```
A dimly lit navigator's chart table photographed from directly above at night. A large nautical chart lies flat, its coastline linework faint and low-contrast, edges softened by shadow. Cool deep-blue darkness fills most of the frame; a single warm brass oil lamp sits just outside the frame, casting one soft pool of warm light that falls off quickly into deep blue-black shadow at every edge. A brass dividers and a parallel rule rest on the chart, catching a thin warm highlight. Muted, desaturated, and very calm — deep indigo and navy shadow, aged ivory paper reading cool rather than golden, one narrow band of warm brass. Enormous negative space; nothing sharp, busy, or centred; intended to sit quietly behind interface text. Cinematic low-key colour grade, soft focus toward the edges, fine film grain. No modern objects, no bright colours, no text labels, no watermark, no people, no ships, no compass rose as a focal point.
```

**Settings:** gpt-image-2, `quality: high`, 2560×1440. Export ≤ 1600px wide.

### If it is ever generated, it must pass

- [ ] Ground reads **cool** — it belongs to `#0E141F`, not to a warm room.
- [ ] Brass is the *only* warm note, and it is narrow.
- [ ] No focal point competing with the UI; nothing in the lower two-thirds where the composer and cards sit.
- [ ] Under the scrim, every text/surface pair still passes **WCAG AA** — verified, not assumed.
- [ ] The empty state still looks deliberate with the image **absent**. If removing it breaks the screen, the screen is wrong.

---

## The compass-rose crest (OPTIONAL, not built)

Hand-authored monochrome **SVG** using `currentColor`, not a generation. Crisp at any DPI, tiny, re-tints with the accent. Off by default. A generated image could serve as a *drawing reference*, but the shipped asset is vector.

---

## What is no longer here, and why

| Removed | Reason |
|---|---|
| Dark oak, aged leather, weathered parchment texture prompts | Tiling textures cut — read as artifact rather than material, and void the flat-surface contrast proof |
| Seamless-tiling recipe (offset, seam-healing, 3×3 verification) | Nothing tiles any more |
| Colour-grade-to-palette pass | Nothing to grade |
| Warm chart-paper hero prompt | Rewritten above for the navy ground |
| 32 MiB package cap discussion | Moot; the package is text plus two fonts |

### Sources (retained — still the right guidance if an image is ever generated)
- [OpenAI Cookbook — GPT Image Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [OpenAI Cookbook — gpt-image-1.5 Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide)
- [fal.ai — GPT Image 2 Prompting Guide & Examples](https://fal.ai/learn/tools/prompting-gpt-image-2)
