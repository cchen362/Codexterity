# Plan 0003 — Image-led theme authoring: the hero-to-palette pipeline

**Status:** **OPEN. Opened 2026-08-05. M1, M2 and M3 DONE (all 2026-08-05); M4–M6 not started.**
**M6 was added 2026-08-05**, after measuring that Plan 0002's review finding #5 was mis-scoped: every
embedded asset ships twice, not only the hero, and the runtime cost is the half that matters. This is the first
plan of the post-Phase-7 era; [Plan 0002](0002-phase-7-qa-docs-release.md) closed the roadmap at tag
`v0.1.0` and is the release baseline this plan builds on. Numbers at the tag were: `npm test`
**196/196**, `node tools/palette/audit.mjs` **272/272**, `themes/captains-cabin/theme.css` SHA-256
`731CC9…4286E`, `syntax.json` `36DAD6…211FEB`. **After M1, measured on this machine 2026-08-05:**
`npm test` **230/230**, `audit.mjs` still **272/272**, and both theme digests **unchanged** — M1 moved
no token and no theme file. **After M2, measured on this machine 2026-08-05:** `npm test` **240/240**,
`audit.mjs` still **272/272**, and **all three** theme digests unchanged — M2 rewrote the emitter
without moving a byte of what ships. **After M3, measured on this machine 2026-08-05:** `npm test`
**257/257**, `audit.mjs` still **272/272**, and **all three** theme digests still unchanged — which
this milestone earned rather than inherited, because M3 is the first change to
`palette-engine.mjs`, the file that produces every colour.

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

> **RESOLVED during M1, 2026-08-05.** The owner supplied the file and it now lives at
> **`assets/hero-sources/BW_Jisoo.png`**. Measured: **1672×941, 8-bit, colour type 2 (RGB, no alpha),
> non-interlaced, 23 `IDAT` chunks**, plus one ancillary `caBX` chunk the decoder's chunk loop already
> skips. The decoder did **not** read it as shipped (it accepted colour type 6 only) and was extended
> to colour type 2 — see M1's outcome below.
>
> **That directory is deliberately git-ignored.** Owner ruling 4 makes this theme private and local,
> and committing the photograph would put it into git history, where removing it later means
> rewriting history rather than deleting a file. Keeping it out is trivially reversible; putting it in
> is not, so the asymmetry decides it. **Nothing in the repo may depend on that file existing** — the
> tests build their own inputs, and the calibration fixture is derived from an image the repo already
> ships. A fresh clone runs green with `assets/hero-sources/` absent.

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

  **DONE 2026-08-05. Gate met.** [`tools/palette/hero-scrim.mjs`](../../tools/palette/hero-scrim.mjs)
  reproduces all four reference rows exactly — 8.68 / 6.72 / **5.99** / 5.73, each at 43%, image
  visible over 58 / 73 / **83** / 90% of the panel — and names the shipped row `milder B (SHIPPED)`.
  The stale label is corrected in both the Node port and the Python original, which is retained as the
  historical record with a header pointing at its replacement. `npm test` **230/230** (196 → +31
  hero-scrim, +3 PNG decoder), `audit.mjs` 272/272, both theme digests unchanged.

  **What M1 settled that the scoping did not anticipate — four measured facts:**

  1. **The shipped hero cannot be decoded in Node, and this is not fixable here.** It is **lossy
     WebP** (`VP8 ` sub-chunk, read from the container header) — a video-codec intra frame, not a
     container quirk. A zero-dependency decoder for it is a project, not a milestone. `loadHeroImage`
     therefore **refuses WebP by name** and points at
     **`tests/fixtures/hero-empty-state.png`**, a PNG copy of the same image, verified **pixel-identical**
     to the WebP, which is what the calibration actually runs against. That fixture is ~1 MB and is
     tracked deliberately; without it the 5.99:1 gate is not reproducible from a clone.
  2. **`BW_Jisoo.png` is colour type 2 (RGB, no alpha), 1672×941, 8-bit, non-interlaced, 23 `IDAT`
     chunks.** The repo's decoder accepted only colour type 6 (RGBA), so M1 took option (a) and
     **extended `png-decode.mjs` to colour type 2**, expanding to opaque RGBA on output so no caller
     branches. Verified against an independent decoder (Pillow) at five sampled coordinates — the
     same cross-check discipline as D-0001-23. An existing test that proved colour type 2 was
     *refused* is re-aimed at colour type 3 (palette), which genuinely still is.
  3. **The reference script had a latent wrong answer that a general instrument would have hit.**
     Python's `alpha(f)` returned the **last** stop's alpha for any unbracketed fraction, so a
     position **above** the first stop reported fully opaque where it should report fully
     transparent. Unreachable there because all four stop sets begin at fraction 0; reachable the
     moment a theme authors stops beginning higher. `scrimAlphaAt` clamps to the first stop instead,
     and says why at the code. Same shape as D-0001-23: behaviour that was safe only because of its
     inputs.
  4. **The new hero is high-key and the shipped scrim fails on it in both modes — measured, and it is
     M4's problem, not a defect.** `BW_Jisoo.png` has mean relative luminance **0.657** against the
     Captain's Cabin hero's **0.025** (~27× brighter) and mean OKLCH chroma **0.001** — near-perfectly
     neutral, which is exactly the "this image names no hue for you" signal `tonalSummary` exists to
     report to M3. Re-solved with Captain's Cabin's own stops it lands at **1.03:1 dark** and
     **1.02:1 light** against a 4.5:1 requirement. **The scrim must be re-solved from scratch for this
     image**, far more aggressively, and the two modes must be solved independently. Recorded here as
     a measurement; no stop set is proposed until M4.

  **Not claimed, still:** nothing about how Deep Navy Portrait should look. M1 built the instrument
  and pointed it at the image; every design decision remains M3's and M4's.

- **M2 — the recipe-driven emitter, proved by byte-equivalence.** Split
  `tools/palette/emit-theme.mjs` into a generic emitter plus a Captain's Cabin *recipe* carrying only
  authored choices (identity, palette inputs, accent role, typography roles and font assets, shape
  values, hero configuration, syntax policy, manifest landmarks). The per-theme landmark `probe` stays
  per-recipe (D-0001-21, review finding #4).

  **Gate:** re-emitting Captain's Cabin through the new path produces `theme.css` and `syntax.json`
  **byte-identical** to `731CC9…4286E` and `36DAD6…211FEB`, and `audit.mjs` stays 272/272. This gate
  is the whole point of the milestone: generalisation is not permission to redesign the shipped theme.

  **Two corrections to this gate, measured during M1 — read before starting M2:**

  - **The emitter writes THREE tracked files, not two.** `manifest.json` is emitted alongside
    `theme.css` and `syntax.json`, is tracked in git, and is equally capable of silently changing —
    it carries the landmark list and the asset byte counts (D-0001-21). Its digest at this point is
    SHA-256 **`0E44FF6D00FEFE2A4274DDFF05F1F94F8DD16AC200C3EA9736039BABBDAD5DB5`**. The gate covers
    all three, and a refactor that keeps the stylesheet identical while quietly reshaping the
    manifest has still failed.
  - **`audit.mjs` is a BUILD-TIME REFUSAL inside the emitter, not merely a separate script.**
    `emit-theme.mjs` imports `run`/`runSyntax` and **throws before writing a byte** if either mode
    fails AA (its lines 19–22). That is the mechanism that makes "palette values are derived, not
    hand-picked" enforceable rather than aspirational, and a generic emitter must keep it: any theme
    the new path emits must be unable to reach disk while failing AA. Do not demote it to a
    post-hoc check the author is trusted to run.

  **DONE 2026-08-05. Gate met, including both corrections.** Re-emitting Captain's Cabin through the
  new path reproduces **all three** files byte-identically — `theme.css` `731CC9…4286E`,
  `syntax.json` `36DAD6…211FEB`, `manifest.json` `0E44FF…AD5DB5`, with `git diff -- themes/` empty —
  `audit.mjs` stays **272/272**, and `npm test` goes **230 → 240**. The 840-line flat script became
  three files: [`emit-theme.mjs`](../../tools/palette/emit-theme.mjs) (the generic emitter — every CSS
  rule and all the mechanism reasoning), [`codex-surface.mjs`](../../tools/palette/codex-surface.mjs)
  (Codex's own names: root classes, token groups, ANSI slots, heading classes),
  [`recipes/captains-cabin.mjs`](../../tools/palette/recipes/captains-cabin.mjs) (authored choices
  only). The emitter's filename is **pinned by the gate** — the emitted `theme.css` and `syntax.json`
  both contain the literal string `tools/palette/emit-theme.mjs`, so the generic emitter had to keep
  that name and the recipe went somewhere new. Settled as **D-0003-1**.

  **What M2 settled that the scoping did not anticipate — five measured facts:**

  1. **The audit-binding question (review finding #3) has an answer, and it is not "make `audit.mjs`
     recipe-driven".** The two ask different questions and both are needed. `audit.mjs`'s sweep is an
     **engine**-level proof over a registry of grounds — 136 of its 272 checks cover oak, which ships
     in nothing — while the **per-theme** proof is the emitter's own build-time refusal, which audits
     exactly that recipe's two palettes. The refusal now *reports its count*, so a theme's proof has a
     number the way `272/272` does: emitting prints `audit — dark 68/68 pass, light 68/68 pass`.
  2. **D-0001-21's probe got stronger by being split, not weaker.** The landmark list and its probes
     stay in the recipe (as the plan required); the assertion lives in the generic emitter. That turns
     a same-file self-check into a **cross-file contract** — a rule renamed in the emitter now fails
     *every* recipe's build, not just its own.
  3. **The pre-M2 script wrote `theme.css` before asserting the probes**, so a stale probe left a
     half-emitted theme on disk. All three writes now happen at one site after every gate, and the
     suite proves it: a stale probe throws **and leaves the output directory empty**.
  4. **The header underline is not derivable and never was.** `"Captain's Cabin — a theme package for
     Codexterity"` is 49 characters; the rule under it is **48** dashes — hand-typed one short. There
     is no length rule to recover, so it is carried as an authored recipe string with a comment saying
     why, rather than "fixed" into a byte the gate depends on. (The `.heading-*` selector's two-line
     wrap *is* derivable — `' '.repeat(prefix.length)` — and is computed.)
  5. **Two counts in committed comments were wrong and are corrected.** `assets/fonts/` holds **nine**
     faces and three ship, so **six** are unused — the emitter's comment and `docs/DECISIONS.md`'s
     D-0001-21 row both said "five". And the pre-M2 script computed `fontBytes` and `heroBytes`,
     described as feeding "the size accounting in the generated header", which **no header has ever
     had**; both were dead and are removed.

  **Deliberate boundary, stated so M3 and M4 do not have to re-derive it:** `palette-engine.mjs` was
  **not** touched. Its role hues (`ROLE.brass` etc.) and its light-mode ground (`PARCHMENT`) are still
  module constants, because nothing varies them yet and an input no theme uses would be a placeholder.
  **M3 is the change that first parameterises a role hue** (its recommender proposes an accent hue),
  and **M4 is the change that first parameterises `PARCHMENT`** (owner ruling 3 — light re-derived
  cooler). Both are expected; neither is owed by M2.

  **Not claimed:** nothing about how any theme looks. M2 moved code, not colour — which is precisely
  what the three digests prove, and they prove it more strongly than a launch could, because
  "identical bytes" cannot be eyeballed.

- **M3 — the recommender: an image in, recipe inputs out.** The pipeline step the owner asked for.
  Given a hero, propose the palette inputs that suit it — ground hue and chroma per mode, accent
  hue — and run them through `palette-engine.mjs` unchanged so every value is still solved for WCAG AA.
  **It proposes; it never hand-picks and never bypasses the audit.** Deliverable includes a rendered
  comparison sheet (`docs/mockups/0006-…`) showing the proposals against the real hero in both modes,
  because the owner decides from rendered visuals, not from prose or hex lists.

  **Gate:** every proposal it emits passes `audit.mjs` before the owner is shown anything; a proposal
  that cannot pass is reported as failing, never quietly nudged into passing.

  **DONE 2026-08-05. Gate met.** [`tools/palette/recommend-palette.mjs`](../../tools/palette/recommend-palette.mjs)
  proposes a ground hue/chroma and an accent hue and audits every proposal *inside itself* before
  returning it; [`tools/mockup/build-palette-recommendation.mjs`](../../tools/mockup/build-palette-recommendation.mjs)
  renders `docs/mockups/0006-palette-recommendation.html` and **refuses to write it** if any proposal
  fails. `npm test` **240 → 257**, `audit.mjs` **272/272**, all three theme digests **unchanged**.
  Settled as **D-0003-2** (the recommender) and **D-0003-3** (the sheet is a build product).

  **THE CALIBRATION GATE, and it is M3's analogue of M1's 5.99:1.** Pointed at Captain's Cabin's own
  hero, the instrument reproduces values the owner approved months earlier by a completely different
  route:

  | measured from the image | recommender | shipped |
  |---|---|---|
  | ground hue | 241.4° | 262.2° |
  | ground chroma | 0.0238 | 0.0243 |
  | accent hue (pre-projection) | 63.4° | — |
  | accent hue (post-projection) | **90.0°** | **90.4°** |

  The accent line is the strong one: 63.4° is only 13.4° from the warning ink at 50°, inside the 40°
  separation floor, so it is projected to the nearest admissible hue — which is 90°, the shipped brass.

  **What M3 settled that the scoping did not anticipate — five measured facts:**

  1. **The whole-image mean is a BROKEN hue instrument, and the shipped hero is the proof.** That hero
     averages to OKLCH chroma **0.0036**, i.e. near-neutral, because its warm lamplight and cold sea
     cancel in a single mean. A recommender built on `tonalSummary().overall.meanOklch` would have
     reported "no hue" about the one image this theme's navy and brass actually came from. The
     instrument is a **chroma-weighted hue histogram split by lightness** instead: the dark mass names
     the ground, what glows names the accent. Recorded as D-0003-2 clause b so it is not "simplified"
     back.
  2. **The brief asked for "ground hue and chroma PER MODE"; that is two milestones, not one.** Light
     mode's own ground is still the `PARCHMENT` constant, and varying it is M4's by owner ruling 3.
     Emitting a light-ground input nothing consumes would be a placeholder. M3 therefore proposes ONE
     ground — which does reach light mode, through `buildLight`'s ink and border hues — plus the
     accent hue. The engine gained exactly one new input, `accentHue`.
  3. **The role-separation floor was not in the brief and the milestone does not work without it.**
     An accent hue taken raw from an image can land next to a semantic status hue; 63.4° sits 13.4°
     from warning. `palette-engine.mjs` already ships brass and warning 40° apart *deliberately*, so
     that gap became the floor. Without it the calibration gate would have produced an amber accent
     indistinguishable from a warning border — and it is the projection, not the raw reading, that
     lands on the shipped hue.
  4. **The `passes: false` branch is currently unreachable through `recommendPalette`, and the test
     says so rather than faking it.** Proposals hold the inherited ground's *lightness*, and both
     registered grounds are AA-clean at every hue and chroma at that lightness, so no image can drive
     a real AA failure today. The branch is kept because M4 varies `PARCHMENT` and a future ground can
     reach it; the suite exercises the same composition directly on a degenerate ground instead of
     inventing a failure. Same posture as the emitter suite's own note about `assertPalettesPassAA`.
  5. **The review sheet shipped unreadable once, and only looking at it caught that.** Its chrome read
     `var(--color-…)` tokens defined under double-prefixed names (`--color---color-text-primary`),
     which is not a CSS error — every affected property silently fell back to its initial value, so
     body text rendered **pure black on the navy ground, about 1.1:1**. Fonts loaded, images decoded,
     no overflow: every structural check was green on a page nobody could read. Root cause: engine
     palettes are keyed bare (`text-primary`) while `theme.css`-parsed tokens already carry the
     prefix, and one formatter served both. Fixed at the source, plus a build-time refusal
     (`assertChromeTokensResolve`) that now fails the build on a double prefix or a missing chrome
     token. Same silent-success shape as the Fraunces bug in D-0001-7 — a declaration naming
     something undefined looks exactly like success.

  **Not claimed:** nothing about how Deep Navy Portrait should look. The recommender's honest output
  for the portrait is the **inherited navy alone** — both image-driven proposals are omitted, with
  their measured numbers — which agrees with owner ruling 3 but does not decide M4's cooler light
  mode, and no scrim has been solved for that image.

- **M4 — Deep Navy Portrait, the first theme built by the pipeline.** Dark mode: the shipped navy
  palette, unchanged. Light mode: re-derived cooler for the monochrome hero, per the owner's ruling.
  Hero in **both** modes with **independently solved** scrims — the same image does not mean the same
  scrim. Verify in the running app at the window shapes the exploration lists (wide, tall/narrow,
  short with vertical cropping), in both modes, with heading, suggestion content and composer present.

  **Gate:** contrast solved and audited for both modes; Captain's Cabin still emits byte-identically;
  the theme confirmed in the real running app, not from a build. **On the "byte budget" this gate used
  to ask for (review finding #5): it is now M6's, not M4's, and M4's obligation is reduced to a
  RECORDED MEASUREMENT** — state the new theme's emitted `theme.css` size and `.ccskin` size next to
  Captain's Cabin's **475,958** and **681,124**. Do not change the packaging format here. M4 is a
  milestone about how a theme *looks*, verified by eye in the running app; folding a package-format
  change into it means a visual milestone also edits D-0001-4, and a failure could not be attributed
  to one or the other. Note the hero is embedded **once** even when both modes use it — the emitter
  passes a single base64 payload to every mode's rule — so a two-mode hero does not double anything.

- **M5 — install it privately and record what was settled.** Apply it locally through the existing
  `cdx apply`, confirm the theme-neutral shortcut carries it with no packaging change (the runtime is
  already theme-agnostic — that claim gets tested here for the first time), and stamp the decisions
  this plan settles in code plus `docs/DECISIONS.md`.

  **Gate:** the package is **not** added to either installer and **not** shared; both platform
  builders still ship Captain's Cabin alone.

- **M6 — the embedding audit: stop paying twice for every asset.** Plan 0002's review finding #5 said
  "the hero ships twice". **Measured 2026-08-05, it is worse and differently shaped than that: EVERY
  embedded asset ships twice, and the runtime half is the part that matters.** This milestone is the
  decision, and it is deliberately *after* the theme work so that a packaging change is never
  attributed to a colour change.

  **Measured facts — do not re-derive:**

  | asset | raw copy in the `.ccskin` | base64 copy inside `theme.css` |
  |---|---|---|
  | `hero-empty-state.webp` | 124,134 | 165,512 |
  | `fraunces-latin-variable.woff2` | 121,016 | 161,356 |
  | `monaspace-neon-latin-400.woff2` | 44,476 | 59,304 |
  | `literata-latin-variable.woff2` | 38,996 | 51,996 |
  | **total** | **328,622** | **438,168** |

  Base64 is **92%** of the 475,958-byte stylesheet; the package is 681,124 bytes. **`inject.js` — the
  only code that runs inside Codex — never reads `activeTheme.assets` at all**; it uses `.css`,
  `.manifest.landmarks` and `.id`. The loader nevertheless reads all 328,622 bytes into a `Map` in
  Codex's main process on every launch, and the **sole** consumer anywhere is
  [`injector/cli.js`](../../injector/cli.js)'s `cdx verify`, which sums them for one summary line.
  Woff2 and WebP are already compressed, so deflate does not recover the duplication.

  **Two separable problems. Measure before choosing on the second.**

  **(A) The duplicate payload — certain, and the fix is a real design choice, not a cleanup.**
  Two candidate shapes, both legitimate:
  - **A1 — stop packing the raw faces and the hero; keep the OFL licences.** The licences are *not*
    optional: SIL OFL 1.1 requires the licence to accompany the font, and the font travels as a data
    URI inside `theme.css`, so the licence must travel too. Package would fall from ~681 KB to
    ~352 KB. **Cost: this changes D-0001-4's package format** — `assets[]` becomes a *declaration of
    what the CSS embeds* rather than a *payload manifest*, and the loader's byte-count integrity check
    (`declares X bytes but the packaged entry is Y`) loses its subject. That check is load-bearing
    today and its replacement must be designed, not dropped.
  - **A2 — keep the format, make the loader lazy.** Do not read asset bytes unless a caller asks.
    Recovers the whole in-process cost with a much smaller blast radius, leaves D-0001-4 and the
    integrity check intact, and leaves package size unchanged. `cdx verify` becomes the one caller
    that opts in.

  **(B) The stylesheet is re-sent on every navigation — certain that it happens, UNMEASURED whether it
  costs anything.** `applyThemeViaStyleTag` finds-or-creates one `<style>` by stable id and replaces
  its `textContent`, and it re-runs on `dom-ready`, `did-navigate` **and `did-navigate-in-page`** —
  the last of which fires on in-app route changes. So ~476 KB crosses main→renderer as a string every
  time. **Do not "fix" this before measuring it.** The obvious repair — have the injected script skip
  the assignment when a content hash matches what is already there — is cheap and safe, but shipping
  it without a measurement would be optimising an unmeasured cost, which this repo does not do.

  **Gate:** (1) the re-application cost of (B) is **measured in the running app** — count of
  `applyTheme` calls in a real session and the wall-clock cost of each — and the number is recorded
  here whether or not it justifies a change; (2) a choice between **A1 and A2** is made and stamped as
  a decision with its reasoning, since both are defensible and the next agent must not re-litigate;
  (3) Captain's Cabin still emits **byte-identically** and `npm test` still passes — this milestone
  must not touch a token; (4) if the package format changes, the `.ccskin` is rebuilt, reinstalled,
  and **verified launching in the running app**, because D-0001-29's lesson is that a green suite can
  sit on top of a product that cannot start.

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
