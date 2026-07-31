# Asset Generation — GPT Image Prompts & Recipe (Captain's Cabin)

**Purpose.** Copy-paste-ready prompts and settings for generating the Captain's Cabin image assets with OpenAI's GPT Image, plus the post-processing recipe that turns raw generations into shippable, palette-coherent theme assets. Run these anytime — they don't depend on a live session.

**Companion docs:** [`asset-manifest.md`](asset-manifest.md) (what each asset is for), [`css-architecture.md`](css-architecture.md) (how assets are consumed), [`customizable-ui-inventory.md`](customizable-ui-inventory.md).

---

## 0. The guiding principle — generate as few images as possible

Most of the "warm candlelight, brass, soft shadow" feeling is done **better in pure CSS** (radial-gradients, box-shadows, filters) than as raster images — no load cost, no licensing, no tiling seams, and it re-tints instantly when the palette changes. **Only generate an image for grain that CSS genuinely cannot fake:** real wood, leather, and parchment surface texture. Everything else stays procedural.

| Asset | How we make it | Why |
|---|---|---|
| Dark oak surface grain | **GPT Image** → texture recipe | Real wood grain reads false in CSS |
| Aged leather panel grain | **GPT Image** | Same |
| Weathered parchment (light mode) | **GPT Image** | Same |
| Antique chart-paper hero (empty states) | **GPT Image** (optional) | A single large focal background; nice-to-have |
| Candlelight vignette / glow | **CSS** radial-gradient | No image needed |
| Brass edges / accents / trim | **CSS** linear-gradient + border | No image needed |
| Elevation / soft shadow | **CSS** box-shadow | No image needed |
| Compass-rose / ship's crest (optional, off by default) | **Hand-authored SVG** (not GPT Image) | Crisp at any size, tiny, re-colours via `currentColor` |

So: **3 required texture generations + 1 optional hero.** That's the whole image workload.

---

## 1. GPT Image best-practice cheat-sheet (2026)

Distilled from OpenAI's official prompting guide and current practice (sources at bottom). Applied to *our* texture use-case:

- **Model:** use **gpt-image-2** (`quality: high`) — the strongest current model for detailed, realistic output. gpt-image-1/1.5 also work at fixed sizes.
- **Prompt order:** *scene/medium → subject/material → key surface details → lighting → colour → constraints.* Skimmable beats clever.
- **Use photography language**, not "8K/ultra-detailed." Camera and light terms (`macro`, `35mm film`, `top-down`, `soft even light`) steer realism far more reliably.
- **Ask for real imperfection:** pores, fine scratches, grain irregularity, gentle wear. This is what separates a premium texture from a plastic one — and it's exactly the brief's intent.
- **Kill the focal point.** For a background texture you want *even, low-contrast, no hotspot, no visible light source, fills frame edge-to-edge.* Say so explicitly, and add negative constraints (`no objects, no hands, no text, no border, no vignette, no strong shadow`).
- **Tiling is a post step, not a prompt.** The model does **not** produce truly seamless tiles reliably. Ask for a flat, even, top-down surface, then make it seamless in an editor (§3). Alternatively, generate large and use it as a single non-repeating `cover` background (works because our textures sit at very low opacity).
- **Transparency is a post step too.** gpt-image-2 outputs opaque by default. Our textures *want* to be opaque, so this is a non-issue; the only transparent asset (the crest) is SVG anyway.
- **Colour is descriptive, not hex.** Image models ignore hex codes — use rich colour *words* in the prompt, then colour-grade the output to the locked palette hex in post (§3). This is why the prompts below and the CSS palette are decoupled.
- **Size:** generate **2048×2048** for the tileable textures (square, divisible by 16, plenty of detail to downscale from) and **2560×1440** for the optional hero. Downscale on export — never ship the raw 2K file.

---

## 2. Copy-paste prompts

> **Coherence rule:** generate all three textures **in one sitting**, with the *same* lighting clause ("warm, low, even candlelight, no hotspot") and the *same* low-contrast/muted grading language, so they read as one world. The parchment is the light-mode sibling of the oak/leather dark-mode pair — same room, different surface.

### 2.1 — Dark oak (primary dark-mode surface) → `oak.webp`
```
A high-resolution macro photograph of a flat panel of dark aged oak wood, shot perfectly straight-on from directly above (top-down, orthographic, surface parallel to the camera). Fine, mostly-straight wood grain with occasional small knots, natural open-pore texture, and a hand-rubbed matte finish showing a few faint hairline scratches and centuries of gentle wear. Lit by warm, low, even candlelight that falls uniformly across the entire surface with no bright hotspot and no visible light source. Deep espresso-brown tones with faint warm amber undertones, muted and very low contrast. The wood fills the whole frame edge to edge, flat and even, every pixel covered. Understated, quiet, intended as a subtle background texture. Subtle 35mm film grain and natural imperfections. No objects, no hands, no cast shadows, no text, no border, no vignette, no strong highlight.
```

### 2.2 — Aged leather (dark-mode panels / sidebars) → `leather.webp`
```
A high-resolution macro photograph of a flat piece of aged full-grain leather, shot perfectly straight-on from directly above (top-down, surface parallel to the camera). Natural pebbled grain with fine pores, soft creases, and a gently worn patina like an old journal cover or a captain's chair. Lit by warm, low, even candlelight falling uniformly across the whole surface, no hotspot, no visible light source. Deep oxblood-and-cognac brown tones with faint amber warmth, muted and very low contrast. The leather fills the entire frame edge to edge, flat and even, every pixel covered. Quiet, premium, intended as a subtle background texture. Subtle film grain and natural imperfections. No objects, no stitching lines, no hands, no cast shadows, no text, no border, no vignette, no strong highlight.
```

### 2.3 — Weathered parchment (light-mode surface) → `parchment.webp`
```
A high-resolution macro photograph of a flat sheet of weathered antique parchment, shot perfectly straight-on from directly above (top-down, surface parallel to the camera). Fine fibrous paper texture with faint mottling, soft age-toning, and a few extremely subtle foxing spots, like the blank margin of an 18th-century sea chart. Lit by warm, soft, even candlelight falling uniformly across the whole surface, no hotspot, no visible light source. Warm ivory and aged-cream tones with faint tea-stained edges, muted and low contrast, still clearly light enough to read dark text against. The parchment fills the entire frame edge to edge, flat and even, every pixel covered. Calm, understated, intended as a subtle light background texture. Subtle grain and natural imperfections. No writing, no ink, no drawings, no objects, no hands, no cast shadows, no border, no vignette, no strong highlight.
```

### 2.4 — Antique chart paper (OPTIONAL hero for empty/new-session states) → `chart-hero.webp`
```
A softly-lit antique nautical chart lying flat on a dark oak table, photographed from directly above. Aged cream chart paper with very faint, low-contrast engraved coastline linework, a barely-visible compass rose in one corner, and gentle tea-stained age-toning. Warm candlelight glow concentrated softly toward the center and falling off to deep shadow at the edges (subtle vignette). Muted antique palette — aged ivory paper, faded sepia ink, deep brown wood. Extremely calm and understated, lots of negative space, nothing sharp or busy, intended as a quiet background behind UI text. Cinematic warm colour grade, soft focus at the edges, fine film grain. No modern objects, no bright colours, no text labels, no watermark, no people.
```
*Use sparingly. This one is allowed a gentle vignette/focal glow because it sits behind an empty state, not behind dense text.*

---

## 3. Post-processing recipe (raw generation → shippable asset)

Do this once per texture. Any image editor (or a small script) works.

1. **Grade to palette.** Colour-grade the generation to match the **locked Captain's Cabin hex** (Phase 2 task 1). The prompt gets you *close*; this locks it *exact*. All three textures get the same grade pass so they share one world.
2. **Make seamless** (only if the asset will *tile*): apply an offset (wrap the image by 50% in x and y) and heal the visible seams, or run it through a seamless-texture tool. Verify by tiling 3×3 and confirming no repeating "hero" feature the eye locks onto. *If instead using it as a single large `cover` background, skip this — but then set opacity low enough that non-repetition doesn't matter.*
3. **Flatten contrast.** These are *felt, not seen.* Crush contrast so no region draws the eye; the texture should read as barely-there grain, not a picture of wood.
4. **Downscale & export WebP.** Target ~512×512 (tiling) at quality ~80, aiming <300 KB each. The hero can be larger (~1600px wide) but keep it under the manifest cap.
5. **Contrast-test behind real text.** Place actual UI text over the graded texture and confirm **WCAG AA**. Readability is the first law — a texture that fails AA is rejected no matter how beautiful.
6. **Embed as a CSS variable.** Encode as a Blob/data URL exposed as `--cc-texture-oak` / `--cc-texture-leather` / `--cc-texture-parchment` (see [`asset-manifest.md`](asset-manifest.md)) so the theme stays a self-contained package with no external file references.

---

## 4. The non-image assets (for completeness)

- **Candlelight vignette / warm glow:** CSS `radial-gradient` warm-amber → transparent, plus a subtle inner `box-shadow`. No file.
- **Brass accents:** CSS `linear-gradient` (deep bronze → bright brass → bronze) on borders, active states, and the title-bar trim. No file.
- **Compass-rose / crest (optional, off by default):** hand-authored monochrome **SVG** using `currentColor` so it re-tints with the accent. Tiny, crisp at any DPI. A GPT Image generation could serve as a *drawing reference* for the SVG, but the shipped asset is vector, not raster.
- **Fonts:** not generated. Chosen + **license-cleared for redistribution** in Phase 2 (a font we can't legally bundle is disqualified regardless of looks). Display face + warm monospace, both design-floor-compliant (no Inter/Roboto/Arial/system-ui).

---

## 5. Coherence checklist (before any asset is called done)

- [ ] All textures generated with the **same lighting + grading language**, then given the **same colour-grade pass** to the locked palette.
- [ ] Parchment (light mode) feels like the same room as oak/leather (dark mode).
- [ ] Every texture crushed to low contrast — grain, not imagery.
- [ ] Every text/surface pair over every texture passes **WCAG AA**.
- [ ] Each shipped WebP under size cap; embedded as a `--cc-texture-*` CSS var.
- [ ] No asset introduces a focal point, hotspot, or repeating "hero" feature.

---

### Sources
- [OpenAI Cookbook — GPT Image Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [OpenAI Cookbook — gpt-image-1.5 Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide)
- [fal.ai — GPT Image 2 Prompting Guide & Examples](https://fal.ai/learn/tools/prompting-gpt-image-2)
