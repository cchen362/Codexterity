# Plan 0003 — Image-led theme authoring: the hero-to-palette pipeline

**Status:** **OPEN. Opened 2026-08-05, no milestone started.** This is the first plan of the post-Phase-7
era; [Plan 0002](0002-phase-7-qa-docs-release.md) closed the roadmap at tag `v0.1.0` and is the
release baseline this plan builds on. Nothing here is implemented. Numbers to beat, measured at the
tag: `npm test` **196/196**, `node tools/palette/audit.mjs` **272/272**,
`themes/captains-cabin/theme.css` SHA-256 `731CC9…4286E`, `syntax.json` `36DAD6…211FEB`.

**Depends on:** [Plan 0001](0001-captains-cabin-architecture.md) (architecture authority),
[Plan 0002](0002-phase-7-qa-docs-release.md) (the release baseline and the five review findings under
"After Phase 7"), [`docs/DECISIONS.md`](../DECISIONS.md) (33 settled decisions), and
[`docs/research/multi-theme-authoring-and-switching-exploration.md`](../research/multi-theme-authoring-and-switching-exploration.md)
(the exploration this plan acts on — read its 2026-08-05 status note first).

---

## What this plan is actually for

**Not "build a second theme". Build the pipeline that makes a theme out of a picture.**

The owner's framing, 2026-08-05, and it governs every milestone below:

> *"I envision the architecture as a pipeline of providing hero image and it will design and recommend
> palette matching the hero (aesthetic, vibes or theme) so adding a new theme doesn't feel like
> starting a new project all over."*

So the deliverable is an **authoring path**: hand it an image, and it proposes a palette that suits
that image, derives both modes through the existing OKLCH engine, solves the scrim against the real
pixels, and emits a validated theme package. **Deep Navy Portrait is the pipeline's first output and
its proof — not its purpose.** A milestone that produces the theme without the pipeline has failed
even if the theme looks good.

**The hard constraint that shapes the whole design: a recommender proposes RECIPE INPUTS, never final
colours.** `docs/ENGINEERING.md` states that palette values are *derived, not hand-picked* — ramps
stepped in OKLCH, every contrast-critical token *solved* for its WCAG AA target by binary search, and
`audit.mjs` proving it. An image sampler that emits hex would route around all of that and put
unaudited colour into a shipped theme. The recommender's output is therefore a small set of authored
inputs (ground hue/chroma, accent hue, per-mode intent), which `palette-engine.mjs` then solves
exactly as it does today. **If a proposed colour cannot pass the audit, the audit wins.**

---

## Owner rulings, 2026-08-05

Settled when this plan was scoped. Inputs, not questions.

1. **The second theme is Deep Navy Portrait**, using the owner-supplied `BW_Jisoo.png` as the
   empty-state hero in **both** dark and light mode.
2. **Typography does not change.** Fraunces / Literata / Monaspace Neon are retained as-is — hand-picked
   over several rounds and judged legible. The recipe must still *support* a theme bringing its own
   fonts; this theme simply does not.
3. **Dark mode keeps the shipped navy palette exactly. Light mode is re-derived cooler.** The owner's
   words: *"I do think the light mode has too much yellow for the hero."* The shipped light mode is
   warm parchment (`#F0E7D5`) and the hero is cold monochrome; that pairing is the one real design
   risk in this theme. Dark is proven and does not move.
4. **This theme is PRIVATE / LOCAL ONLY.** It is built, installed and used on the owner's machines and
   the package is never shared. Distribution rights for the photograph are therefore **not a gate on
   any milestone here** — but the moment sharing is contemplated, they become a decision (not
   engineering, and not solvable by attribution). Captain's Cabin stays the only shareable package.
5. **Scope stops at the theme.** No installer changes, no picker, no live repainting — see
   "Out of scope" below.

---

## Verified facts, measured 2026-08-05 — do not re-derive these

**The scrim instrument EXISTS, and Plan 0002's review finding #1 is wrong about that.** Finding #1
says *"the tool that produced it is not in the repo"*. It is: **[`tools/palette/solve-hero-scrim.py`](../../tools/palette/solve-hero-scrim.py)**,
37 lines, committed in Phase 3 (`216dcb8`). It was **run on this machine on 2026-08-05** and
reproduces the shipped figure exactly.

```
current (shipped calc) worst  8.68:1 at  43%   image still visible over 58% of panel  OK
milder A               worst  6.72:1 at  43%   image still visible over 73% of panel  OK
milder B               worst  5.99:1 at  43%   image still visible over 83% of panel  OK
milder C (most image)  worst  5.73:1 at  43%   image still visible over 90% of panel  OK
```

- **The shipped stops are the row labelled "milder B"** — `40%/5%, 55%/25%, 70%/62%, 86%/92%` in
  `theme.css` matches milder B's `(.40,.05) (.55,.25) (.70,.62) (.86,.92)` exactly, and its
  **5.99:1** is the figure the emitter's comment cites. **The row labelled "current (shipped calc)"
  is a STALE LABEL naming an earlier attempt, not what ships.** Do not read 8.68:1 as the current
  state, and fix that label when the script is ported.
- **5.99:1 is therefore a live calibration target, not a number in a comment.** Any Node
  reimplementation must reproduce it against the same image before it is trusted on a new one. That
  is a far stronger gate than synthetic test images, and it is available today.

**Finding #1's conclusion survives for different reasons than it gives.** The instrument is not
usable as-is for this plan because:

- **It is Python + Pillow.** This machine has Python 3.13 and Pillow 11.3.0, so it runs — but
  `docs/ENGINEERING.md` and D-0001-20 bind the repo to Node with zero dependencies, and no other
  tool in the repo needs Python. A pipeline the owner runs routinely cannot sit outside that law.
- **It is hardcoded to one theme.** `GROUND = (14, 20, 31)` and `INK = (244, 234, 212)` are Captain's
  Cabin's dark values, written as literals.
- **It is dark-mode only, structurally.** It takes `max(px, key=lum)` — the *brightest* pixel — and
  skips every band above 42%. Review finding #2 is correct and this is where it bites: light mode
  puts dark ink over the image, so the **darkest** pixel governs. The method inverts, not just the
  numbers.
- **It reads WebP, via Pillow.** The repo's own decoder,
  [`tools/png-decode.mjs`](../../tools/png-decode.mjs), accepts **only** 8-bit, colour-type-6 (RGBA),
  non-interlaced PNG and throws by name on anything else — no 16-bit, no palette, no greyscale, no
  interlace, no WebP.

**`BW_Jisoo.png` is not in the repository.** Nothing under `themes/`, `docs/` or the tree root matches
it; the only Jisoo bytes present are the copy embedded inside
`docs/mockups/0005-jisoo-palette-directions.html`. **The owner must supply the file before M1 can
finish** — and its exact PNG shape (bit depth, colour type, interlace) is unknown, so whether
`png-decode.mjs` reads it at all is an open measurement, not an assumption.

**The oak ground already exists and ships in nothing.** `audit.mjs` loops a `GROUNDS` registry of navy
and oak: 68 checks × 2 modes × 2 grounds = 272. **136 of today's 272 checks prove a ground no theme
uses.** Review finding #3 is the consequence: a theme that reuses an existing ground adds **no**
checks, so "272/272" is not a per-theme proof and the recipe work must decide how an audit binds to a
recipe.

**The remaining review findings from Plan 0002 stand unchanged** and are not re-derived here: #2
(light mode's worst case inverts), #4 (a generic emitter must keep the per-theme landmark `probe`,
D-0001-21, or a renamed rule ships a manifest that lies), #5 (an embedded hero ships twice — as a
declared asset and as base64 in `theme.css`, roughly a third larger — and that stylesheet is passed
into Codex's main process as a string and re-applied on every window and navigation, so it is a
runtime cost, not only a package cost).

---

## Milestones

Ordered so that nothing is judged by eye before the instrument that can measure it exists, and so the
byte-equivalence gate on Captain's Cabin is in place before any theme is added.

- **M1 — the image instrument, in Node, calibrated against a known answer.** Port
  `solve-hero-scrim.py` into the repo's own world: Node, zero dependencies, one module under
  `tools/palette/`. Three capabilities, and the third is new:
  (a) decode the hero — extend `png-decode.mjs` to whatever shape `BW_Jisoo.png` actually is, or state
  plainly which shape it refuses and why;
  (b) solve a scrim per mode, taking ground and ink as **arguments**, with the **brightest** pixel
  governing dark mode and the **darkest** governing light;
  (c) report a per-band tonal summary of the image, which is the input M3's recommender consumes.

  **Gate:** re-solving Captain's Cabin's shipped hero with Captain's Cabin's ground and ink reproduces
  **5.99:1** and identifies milder B; the stale "current (shipped calc)" label is corrected; the suite
  grows and stays green. **Not claimed:** nothing about `BW_Jisoo.png` until the owner supplies it.

- **M2 — the recipe-driven emitter, proved by byte-equivalence.** Split
  `tools/palette/emit-theme.mjs` into a generic emitter plus a Captain's Cabin *recipe* carrying only
  authored choices (identity, palette inputs, accent role, typography roles and font assets, shape
  values, hero configuration, syntax policy, manifest landmarks). The per-theme landmark `probe` stays
  per-recipe (D-0001-21, review finding #4).

  **Gate:** re-emitting Captain's Cabin through the new path produces `theme.css` and `syntax.json`
  **byte-identical** to `731CC9…4286E` and `36DAD6…211FEB`, and `audit.mjs` stays 272/272. This gate
  is the whole point of the milestone: generalisation is not permission to redesign the shipped theme.

- **M3 — the recommender: an image in, recipe inputs out.** The pipeline step the owner asked for.
  Given a hero, propose the palette inputs that suit it — ground hue and chroma per mode, accent
  hue — and run them through `palette-engine.mjs` unchanged so every value is still solved for WCAG AA.
  **It proposes; it never hand-picks and never bypasses the audit.** Deliverable includes a rendered
  comparison sheet (`docs/mockups/0006-…`) showing the proposals against the real hero in both modes,
  because the owner decides from rendered visuals, not from prose or hex lists.

  **Gate:** every proposal it emits passes `audit.mjs` before the owner is shown anything; a proposal
  that cannot pass is reported as failing, never quietly nudged into passing.

- **M4 — Deep Navy Portrait, the first theme built by the pipeline.** Dark mode: the shipped navy
  palette, unchanged. Light mode: re-derived cooler for the monochrome hero, per the owner's ruling.
  Hero in **both** modes with **independently solved** scrims — the same image does not mean the same
  scrim. Verify in the running app at the window shapes the exploration lists (wide, tall/narrow,
  short with vertical cropping), in both modes, with heading, suggestion content and composer present.

  **Gate:** contrast solved and audited for both modes; a stated **byte budget** for the embedded hero
  agreed before the image ships (review finding #5); Captain's Cabin still emits byte-identically; the
  theme confirmed in the real running app, not from a build.

- **M5 — install it privately and record what was settled.** Apply it locally through the existing
  `cdx apply`, confirm the theme-neutral shortcut carries it with no packaging change (the runtime is
  already theme-agnostic — that claim gets tested here for the first time), and stamp the decisions
  this plan settles in code plus `docs/DECISIONS.md`.

  **Gate:** the package is **not** added to either installer and **not** shared; both platform
  builders still ship Captain's Cabin alone.

---

## Out of scope — deliberately, with the reason

- **No installer or distribution changes.** Both package builders keep shipping Captain's Cabin alone
  and keep applying it at install. Multi-theme payloads are a separate plan, and reopening the macOS
  builder means touching the one component nobody can verify (D-0001-16 as amended).
- **No visual picker.** The exploration recommends it *after* a second package exists; it is a UI
  project on top of an engine refactor and does not belong in the same plan.
- **No live repainting.** Last in the reviewed sequence, and it needs the picker to prove useful first.
- **No sharing of Deep Navy Portrait**, in any form, to anyone — owner ruling 4.
- **No change to Captain's Cabin's shipped appearance.** M2's byte-equivalence gate exists to make an
  accidental one impossible.
- **No typography work.** Owner ruling 2.
