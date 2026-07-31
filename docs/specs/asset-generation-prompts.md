# Asset Generation — Captain's Cabin

> **Rewritten in Phase 2 (2026-07-31). This supersedes the original prompt set.**
> That version contained four GPT Image prompts — dark oak, aged leather, weathered parchment, and a warm chart-paper hero — plus a tiling and colour-grading recipe. **The three texture prompts and the entire tiling recipe are gone**, because the tiling textures were cut ([D-0001-6, D-0001-8](../DECISIONS.md)). The hero prompt survives, rewritten for the navy ground.

---

## Status: one image to generate

**This is the theme's only raster asset, and it is the single biggest visual differentiator in the whole plan.** Everything else — surfaces, chrome, accents, depth — is CSS. Promoted from "optional" to a real Phase 3 deliverable on 2026-07-31, because leaving it out was the main reason the theme read as a recolour rather than a skin.

The theme must still be **complete and correct without it**. If removing the image breaks the empty state, the empty state is wrong.

---

## The compositional constraints (read before generating)

The hero is permitted **only** behind the empty / new-session screen, under a scrim that resolves to solid `--color-background-surface` before any body text starts. Text never sits on artwork; it sits on the scrim's solid end. That is the entire reason this image is allowed when the textures were not.

That puts hard requirements on the composition:

| Requirement | Why |
|---|---|
| **16:9 landscape**, generated at 2560×1440 | Fills a wide main content area; exported ≤1600px |
| **Interest in the top third only** | The heading, four cards and composer occupy the lower ~60% and the scrim goes solid there |
| **Cool, navy-dominant** | It has to belong to `#0E141F`. A warm image fights the chrome |
| **One narrow warm note (brass)** | Ties to the accent `#C0A454`. More than one and it stops being an accent |
| **No centred focal subject** | It sits *behind* UI; a strong centre competes with the composer |
| **Low contrast, deep falloff at the edges** | Vignetting into the ground colour is what lets it blend rather than sit in a box |

**Settings:** gpt-image-2, `quality: high`, size 2560×1440.

---

## Prompt A — the chart table (safest, most on-brief)

Directly answers "captain's chart room." Lowest risk of drifting off-brief; also the less dramatic of the two.

```
A dimly lit navigator's chart table photographed from directly above at night. A large nautical chart lies flat, its coastline linework faint and low-contrast, edges dissolving into shadow. Cool deep-blue darkness fills most of the frame; a single brass oil lamp sits just outside the top of the frame, casting one soft pool of warm light across the upper portion that falls away quickly into deep blue-black shadow toward the bottom and all edges. Brass dividers and a parallel rule rest near the top of the chart, catching a thin warm highlight. Muted, desaturated, very calm — deep indigo and navy shadow, aged ivory paper reading cool rather than golden, one narrow band of warm brass. The lower half of the frame is almost entirely deep shadow and empty space. Nothing sharp, busy, or centred; intended to sit quietly behind interface text. Cinematic low-key colour grade, soft focus toward the edges, fine film grain. No modern objects, no bright colours, no text labels, no watermark, no people, no ships.
```

## Prompt B — the stern gallery (closer to the reference you liked)

Your cathedral reference worked through **deep perspective and light shafts from above**, not through texture. This is that structure in a ship: architectural depth, light falling from high windows, dark foreground. Higher ceiling, higher risk of becoming wallpaper.

```
The interior of a darkened 18th-century ship's stern cabin at night, viewed from deep inside the room looking toward tall mullioned stern windows. Cold moonlight falls through the window panes in soft shafts, catching drifting dust and dissolving into deep blue-black shadow across the foreground. Silhouetted joinery, a chart table and the curve of the hull frame the space, almost entirely in darkness. A single small brass lantern glows low and warm at the far left, the only warm note in the image. Overwhelmingly cool — deep navy, indigo, blue-grey moonlight, black shadow — with one narrow band of brass. The lower half of the frame is near-black and empty. Immense negative space, calm and still, nothing sharp or centred, intended as a quiet backdrop behind interface text. Cinematic low-key lighting, soft focus, fine film grain. No people, no ships at sea, no bright colours, no text, no watermark.
```

**Generate both in one sitting** so they share a grade, then pick from the pair rendered in the actual mockup rather than on their own — an image that looks better in isolation frequently loses once UI sits on it.

---

## Delivery

Save whichever you pick as **`themes/captains-cabin/assets/hero-empty-state.webp`** (or `.png` — I will convert). The mockup builder detects the file automatically and swaps it in for the placeholder, so no code change is needed to see it in place.

## Acceptance checklist

- [ ] Ground reads **cool** — it belongs to `#0E141F`, not to a warm room.
- [ ] Brass is the *only* warm note, and it is narrow.
- [ ] Lower two-thirds is quiet — nothing competing with the cards and composer.
- [ ] Under the scrim, every text/surface pair still passes **WCAG AA** — verified with the audit, not assumed.
- [ ] The empty state still looks deliberate with the image **absent**.
- [ ] Exported ≤1600px wide, under 400 KB.

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
