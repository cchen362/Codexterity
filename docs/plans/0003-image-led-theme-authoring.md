# Plan 0003 — Image-led theme authoring: the hero-to-palette pipeline

**Status:** **OPEN. Opened 2026-08-05. M1, M2, M3, M3b, M4 and M5 all DONE 2026-08-05. M6 is the only
milestone left.** M5 installed the private theme properly and proved the themed launch no longer
depends on the repository; after it, `npm test` **299/299**, `audit.mjs` **272/272**, all three
Captain's Cabin digests unchanged, and no code changed at all except one decision marker. M4's gate is met: the theme was confirmed in the real running app, showing the portrait in
**both** modes, and the owner's observations across two launches settled the last two open questions:
the governing contrast threshold (3:1, not 4.5:1 — only the heading is over the photograph) and the
hero's anchor (`center`; a shifted anchor was shipped and then **rejected on sight**). Both the final
veil and the reverted anchor have now been seen in the running app. After M4: `npm test` **299/299**, `audit.mjs` **272/272**, all three Captain's Cabin digests
unchanged. M3 met its stated gate but solved
the wrong shape of problem — read "Scope correction" before treating any of M3's framing as settled.
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

> **SCOPE CORRECTION, 2026-08-05, after the owner reviewed M3's sheet. Read this before anything
> below it.** M3 built an *instrument* that answers "what colour is this picture?" The owner needs a
> **generator** that answers "here are several ways this app could look with this picture in it." The
> owner's words, and they govern:
>
> > *"I provide a preferred hero image > based on the hero image theme/aesthetic/palette **or
> > direction from me** (i.e: Dior inspired palette + another 2 bolder/creative version), it will
> > create the mockups like what shown in 0005 > I decided on palette from the mockup > we build the
> > new theme."*
>
> Three consequences, all of which correct assumptions made when this plan was scoped:
>
> 1. **The creative direction comes from the OWNER, not from the image.** The image constrains and
>    informs; it does not decide. M3 assumed the image was the source of direction, which is why a
>    monochrome hero produced a one-card sheet and read as a dead end rather than as an answer.
> 2. **This is GENERAL, and BW_Jisoo is only the first input.** The owner's own example is a
>    *cyberpunk neon-lit city skyline*. Nothing built here may be shaped around one photograph — a
>    milestone that works only for the portrait has failed the plan's actual purpose.
> 3. **An authored input was never forbidden, and treating it as forbidden is what mis-shaped M3.**
>    The hard constraint below rules out hand-picking the hundreds of *final token colours*. It has
>    never ruled out an authored *input*: navy `#0E141F` is itself an authored input a human chose.
>    "Dior inspired" becoming a ground hue and an accent hue is the same move, and everything
>    downstream is still solved by the engine and proven by the audit.
>
> **Owner rulings 1 and 3 are narrowed accordingly.** Ruling 3 ("dark keeps the shipped navy") was
> about *this theme*, not a standing rule for every future one — the owner: *"I was asking to keep the
> Deep Navy in dark mode because I thought it still looks great with the new hero image, NOT ship
> every future new theme with only Deep Navy for dark mode."* Directions may move **both** modes.
> For **Deep Navy Portrait specifically** the owner has settled it: **shipped navy in dark, and a
> parchment-family light mode**, with a cooler variant to be shown rather than argued.

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
3. ~~**Dark mode keeps the shipped navy palette exactly. Light mode is re-derived cooler.**~~
   **REVERSED BY THE OWNER 2026-08-05, ON SIGHT, AND THIS IS THE CURRENT RULING: BOTH MODES KEEP THE
   SHIPPED PALETTE EXACTLY.** The original concern was real and is recorded here so nobody re-derives
   it — *"I do think the light mode has too much yellow for the hero"* — and M3b tested it properly
   by rendering three light grounds against the actual portrait: the shipped warm parchment
   (`#F0E7D5`), a cooler paper-grey (`#E1E9EF`) and a blue-leaning paper (`#DBEAF7`). Shown those, the
   owner chose **the shipped warm parchment**: *"I will go with the 'As it ships — warm parchment'
   option as I don't really like the light blue options."*

   **Do not attempt to cool light mode again.** This is the documented pattern of a stated preference
   reversing once it is rendered, and it has now been tested; re-opening it means re-running an
   experiment whose answer is recorded.

   **CONSEQUENCE, and it makes M4 much smaller than originally scoped.** With dark navy unchanged and
   light parchment unchanged, and with the accent hue unchanged (the monochrome portrait names no hue,
   measured in M3), **Deep Navy Portrait's palette is IDENTICAL to Captain's Cabin's.** The two themes
   differ only in: identity (name/description/id), the hero asset, the fact that the hero appears in
   **both** modes rather than dark only, and the two scrims. There is no new colour in this theme, so
   its `audit.mjs` result is by construction the same 68/68 twice — the emitter's refusal still runs,
   but it is not where M4's risk lives. **M4's real work is the scrims**, and that is genuinely new.
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

- **M3b — DIRECTIONS: the generator the owner actually asked for.** Added 2026-08-05 by the scope
  correction above. M3's recommender stays and keeps its calibration gate, but it stops being the
  star: it becomes **one contributor of one direction** among several.

  A **direction** is a first-class authored record — a name, a one-line intent in plain language, and
  its recipe inputs (ground hue/chroma per mode, accent hue). Authored directions ("Dior atelier") and
  the *measured* direction read off a hero by `recommend-palette.mjs` are then the **same kind of
  object**, so a colourful hero contributes a direction automatically and a monochrome one simply
  contributes none — with no special case anywhere.

  **This milestone parameterises the light-mode ground (`PARCHMENT`)**, which M2 reserved for M4 and
  which M4 no longer owns: directions cannot differ in light mode until it is an input. The 40°
  accent separation floor (D-0003-2 clause c) still governs every direction, authored or measured.

  **The sheet is a DECISION SURFACE, not an instrument report — this is the half M3 got wrong.**
  Lead with large rendered UI mocks per direction in both modes, each named and carrying its intent in
  the product's voice. **The OKLCH figures, the hue-projection reasoning and the audit arithmetic move
  OFF the sheet and into the CLI**, where the engineer reads them; the owner's copy states only that a
  direction passed. The owner's verdict on M3's sheet is the specification here: *"a bunch of jargon
  and terms like `Ground OKLCH: L 0.191, C 0.024, H 262.2°` … doesn't help or serve any purpose for me
  visually."*

  **Gate:** (1) every direction is derived through `palette-engine.mjs` and passes `audit.mjs` before
  the sheet is written, and the builder still **refuses to write** if any fails; (2) the tool is
  demonstrably **general** — it takes an arbitrary hero plus an arbitrary direction set, with nothing
  shaped around `BW_Jisoo.png`, and a fresh clone lacking `assets/hero-sources/` still runs green;
  (3) Captain's Cabin still emits **byte-identically**; (4) the owner picks a direction from the
  rendered sheet, which is what unblocks M4.

  **BUILT 2026-08-05; gates 1–3 met, gate 4 is the owner's and is OPEN.** `npm test` **257 → 282**,
  `audit.mjs` 272/272, all three theme digests unchanged. The light-mode ground is now an input
  (`lightGround`, defaulting to the parchment constant, which stays the default and keeps its original
  reasoning). [`tools/palette/directions.mjs`](../../tools/palette/directions.mjs) holds the catalogue
  and `buildDirections()`; [`tools/mockup/build-palette-directions.mjs`](../../tools/mockup/build-palette-directions.mjs)
  writes `docs/mockups/0007-palette-directions.html`.

  **Five directions, all passing AA in both modes:** `shipped-navy` (the control), `dior-atelier`,
  `ember-quarterdeck`, `neon-fathom`, and `from-image` when the hero yields one. **`neon-fathom` is
  the generality proof** — a teal-black ground with a hot magenta accent, i.e. the owner's own
  cyberpunk example, derived and audited rather than hand-picked, with nothing in the tool shaped
  around any particular photograph.

  **The 0006 sheet and its builder are RETIRED, not kept alongside.** Its unique content — the
  calibration evidence and the hue reasoning — is fully covered by `directions.mjs`'s CLI and by the
  suite's calibration gate, so a second, superseded owner-facing sheet builder would only drift. Both
  the 0006 and 0007 filenames stay git-ignored (D-0003-3).

  **PRESENTATION IS NOW A STANDARD, NOT A PER-SHEET CHOICE (D-0003-4, owner 2026-08-05).** Future
  palette-options sheets follow `0005`'s shape: the hero **in** each option (behind the empty state,
  under a scrim solved per option with `hero-scrim.mjs` — `0007` put it alongside, which was a dodge
  around the unsolved portrait scrim), **one dark/light toggle** for the whole sheet rather than two
  panels per option, and **typography unchanged by default** so the comparison is about colour. **M4
  rebuilds the sheet to this standard**; it is not deferred.

  **What M3b settled that M3 got wrong, recorded because it is the reusable lesson:** a milestone can
  meet a written gate and still solve the wrong shape of problem. M3's gate ("every proposal passes
  the audit before the owner is shown anything") was fully met by a sheet the owner could not use.
  The gate measured *correctness* and never asked *is this a thing a person can decide from*. M3b's
  gate 4 is deliberately the owner's verdict for that reason.

- **M4 — Deep Navy Portrait, the first theme built by the pipeline.**

  **Three corrections to this milestone's scope, made by M3b — read before starting.**
  (1) **The engine work M4 used to own is already done.** `PARCHMENT` is now the `lightGround` build
  option, so light mode needs no engine change — only a recipe that sets it.
  (2) **M4 also rebuilds the directions sheet to D-0003-4**, the owner's presentation ruling: the hero
  **in** each option behind the empty state under a per-option solved scrim, **one** dark/light toggle
  for the whole sheet, typography unchanged by default. `0007` shows the hero *alongside* each option,
  which was a dodge around the portrait's unsolved scrim; solving that scrim is M4's work anyway, so
  the dodge has no remaining excuse.
  (3) ~~The light-mode ground is an OPEN OWNER CHOICE.~~ **SETTLED 2026-08-05: the owner picked the
  shipped warm parchment**, rejecting both cooler candidates on sight (see owner ruling 3 above, now
  reversed). **This no longer blocks anything.** The recipe sets no `lightGround` override at all —
  the default IS the answer — so `buildLight` is called exactly as Captain's Cabin calls it.

  **SCRIM FEASIBILITY, MEASURED 2026-08-05 — do not re-derive, and note the shipped stops are not a
  starting point but a proven failure.** Re-solved against `assets/hero-sources/BW_Jisoo.png` with
  this theme's real ground and ink in each mode (`tools/palette/hero-scrim.mjs`, 60 bands):

  | stop set | dark | light | image visible |
  |---|---|---|---|
  | Captain's Cabin's shipped stops | 1.03:1 **FAILS** | 1.02:1 **FAILS** | 83% of panel |
  | `[[0,0],[0.30,0.35],[0.45,0.70],[0.60,0.88],[0.80,0.95],[1,0.97]]` | **4.90:1 OK** | **5.43:1 OK** | 59% of panel |
  | `[[0,0.10],[0.30,0.55],[0.42,0.85],[0.60,0.95],[1,0.98]]` | 10.18:1 OK | 9.29:1 OK | 43% of panel |

  So the hero **can** carry text in both modes and still read as a picture over most of the panel.
  The middle row is a working starting point, not a recommendation — **solve each mode independently
  and judge the result by eye**, because these figures say only that text is legible, never that the
  portrait still looks good under that much veiling. The worst case lands at 43% of panel height in
  every case, which is where the heading sits.

  Dark mode: the shipped navy
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
  to one or the other. ~~Note the hero is embedded **once** even when both modes use it — the emitter
  passes a single base64 payload to every mode's rule — so a two-mode hero does not double anything.~~
  **THAT SENTENCE IS WRONG AND WAS DISPROVED BY BUILDING IT — see M4's outcome.** The emitter passes
  one base64 *string* to each mode's rule, and each rule writes its own copy into the stylesheet, so a
  two-mode hero embeds the image **twice**. Measured: the payload appears 2× at 1,993,928 bytes each,
  which is 46% of this theme's stylesheet. **This is M6's to decide, not M4's** — it is the same
  "every asset ships twice" question, one layer in.

  **BUILT AND VERIFIED 2026-08-05, with one gate outstanding.** `npm test` **282 → 299**, `audit.mjs`
  **272/272**, all three Captain's Cabin digests **unchanged** (`731CC9…4286E`, `36DAD6…211FEB`,
  `0E44FF…AD5DB5`, with `git status --porcelain themes/captains-cabin` empty). The theme is
  [`tools/palette/recipes/deep-navy-portrait.mjs`](../../tools/palette/recipes/deep-navy-portrait.mjs)
  and **needed no emitter change at all** — M2's two-mode hero support and the recipe/emitter boundary
  held exactly as designed, which is the strongest evidence so far that D-0003-1 is the right shape.
  The directions sheet is rebuilt to D-0003-4. **Still open: the running-app confirmation and the
  owner's choice of dark-mode veil (see "The dark-mode question" below).**

  **RECORDED MEASUREMENT (the gate's own ask), and it is a big number:**

  | | Captain's Cabin | Deep Navy Portrait |
  |---|---|---|
  | emitted `theme.css` | 475,958 | **4,302,301** (9.0×) |
  | packaged `.ccskin` | 681,124 | **4,895,121** (7.2×) |

  Two causes, both M6's: the duplicate embed above (1,993,928 bytes), and the source photograph
  itself, which is a **1,495,444-byte lossless PNG** against Captain's Cabin's 124,134-byte lossy
  WebP. A photograph is close to the worst case for PNG. Nothing was done about either here, on
  purpose — this milestone is about how the theme looks.

  **WHAT M4 SETTLED THAT THE SCOPING DID NOT ANTICIPATE — four measured facts:**

  1. **The module could only VERIFY a scrim, never produce one, and that gap is why a new hero felt
     like starting over.** `solveScrimStops()` closes it (**D-0003-5**): hand it an image, a ground, an
     ink and a mode, and it bisects the alpha that clears a contrast target. The two scrims went from
     a hand-tuned guess-and-check to two lines of recipe data.
  2. **A PASSING CONTRAST FIGURE HID AN ILLEGIBLE HEADING, and only rendering the empty state inside
     real app chrome caught it.** The first solved scrim ramped out to fully transparent at the top of
     the panel, exactly as Captain's Cabin's does, and reported a comfortable **5.53:1**. The heading
     rendered washed out and barely readable. The figure was not wrong — it described the region
     *below* the text line, which is all `textFrom: 0.42` ever claimed — and the heading had landed
     above it. Captain's Cabin survives a clear top only because its hero is a night scene, dark up
     there anyway; a high-key image turns the same clear band into a hole. **The fix is the shape, not
     the number**: the solved alpha is identical either way, held flat across the whole panel, and
     `solveScrimStops` now defaults to protecting everything. Same family as D-0001-7's silent font
     fallback and M3's double-prefixed custom property — *a green measurement of the wrong region
     looks exactly like success*.
  3. **The flat shape is crop-immune, and that is a property Captain's Cabin's scrim does not have.**
     Because the plateau is solved against the worst band anywhere in the image, the in-place worst
     case and the "any band could land anywhere" worst case are the **same** figure (5.53:1 dark).
     `background-size: cover` makes panel and image coordinates disagree on any panel shape but one,
     so a ramp's proof quietly depends on the window. See D-0003-5(a).
  4. **The solved figures, and the threshold that actually governs them (D-0003-7).** Both modes are
     solved independently, because the method inverts — dark's brightest pixel governs, light's
     darkest does — and dark genuinely needs *more* veil than light at any given target, which is the
     opposite of the intuition and is why neither is ever derived from the other. Shipped: **dark
     plateau 0.51 at 3.01:1, light plateau 0.47 at 3.06:1**, solved against **3:1 — WCAG AA for
     LARGE text**, which is the threshold that applies because the only text over the photograph is
     the empty state's heading. See fact 5 for how that was established, and the ruling for the
     trip-wire that puts 4.5:1 back in charge.

  5. **THE OWNER'S OBSERVATION IN THE RUNNING APP CORRECTED A RULING THIS MILESTONE HAD ALREADY
     WRITTEN DOWN — and the correction went in the *permissive* direction, which is the rarer and
     more instructive case.** The veil went through three values here. First 0.69/0.66 at a 5.5:1
     target (headroom nobody asked for). The owner asked for the portrait clearer *including below
     4.5:1*; shown a rendered ladder and told plainly that 4.5:1 is AA and that this project's first
     design law is "readability outranks aesthetics", they chose 4:1 knowingly, and that was recorded
     as a deliberate sub-AA exception. **Then they looked at the real app and pointed out that
     Codex's four suggestion cards and its composer are opaque** — *"not translucent so I don't think
     it has any issue even if there's NO scrim"* — which is true, and checkable: those surfaces paint
     `--color-background-elevated-primary`/`-secondary`, opaque hexes the palette audit already
     covers. So no normal-size text is over the image at all; only the large heading is, and **3:1 is
     its threshold**. The theme was never below the bar that applies. **Where the error came from is
     the reusable part:** the mockup used to judge the scrim invented a secondary line under the
     heading that Codex does not render, and reasoned about card labels as though they floated on the
     image. A mock that is wrong about *which elements are opaque* produces a contrast conclusion that
     is wrong in both directions at once — it over-veiled the picture and mis-recorded the reason.
     Same family as fact 2: the measurement was fine, its subject was not.

  **THE DARK-MODE PANEL SITS BRIGHTER THAN THE APP AROUND IT, AND THAT IS INHERENT TO THIS IMAGE.**
  The portrait's mean luminance is 0.657 against a ground at ~0.007, so at any veil that still shows
  a face the empty-state panel reads lighter than the navy sidebar and title bar. That was put to the
  owner as its own question with a three-rung ladder (0.69 / 0.78 / 0.86); they went the other way
  entirely and asked for *more* portrait, twice, which settles it — the luminous panel is wanted, not
  tolerated. **Do not re-raise it as a defect.**

  **THE HERO STAYS AT `background-position: center`. A SHIFTED ANCHOR WAS BUILT, SHIPPED AND THEN
  REJECTED ON SIGHT — do not re-propose one.** The owner reported from the running app that in a
  half-width window with the sidebar open the face was partly off-frame: `cover` crops horizontally
  once the panel is narrower than the image's aspect, and this subject sits right of centre. Five
  anchors were rendered side by side, `68% center` won that comparison and was emitted — and the
  owner then looked at it in the app and rejected it, because **at the window proportions they
  actually use it swings the face into the content**, crowding the heading and the suggestion cards,
  with the sidebar open *and* closed. The narrow-window crop is the lesser problem and is accepted.

  **The reusable part is why the comparison was wrong, and it is a third instance of this milestone's
  one recurring mistake.** The mock panels were ~300px wide against a real content panel of ~950px,
  so the experiment ran at an aspect ratio the app does not have — and `cover`'s whole behaviour is a
  function of that ratio. A tidy side-by-side of five options at the wrong proportions reads as
  conclusive while answering a different question. Same shape as fact 2 (a ratio measured over the
  wrong region) and fact 5 (a mock wrong about which elements are opaque): **the instrument was fine
  every time; what it was pointed at was not.** For anything governed by panel geometry — `cover`,
  `contain`, aspect-dependent crops, container queries — reproduce the real panel's proportions or do
  not run the comparison at all. Note this was never a contrast question in either direction:
  `bandImage()` takes the worst pixel across each band's **full width**, so the scrim is solved
  against every horizontal crop whatever the anchor.

- **M5 — install it privately and record what was settled.** Apply it locally through the existing
  `cdx apply`, confirm the theme-neutral shortcut carries it with no packaging change, and stamp the
  decisions this plan settles in code plus `docs/DECISIONS.md`.

  **Gate:** the package is **not** added to either installer and **not** shared; both platform
  builders still ship Captain's Cabin alone.

  **THIS MILESTONE IS SMALLER THAN IT LOOKS — M4 ALREADY DID MOST OF IT, so do not redo it.** Three
  measured facts, 2026-08-05:

  1. **The theme-agnostic runtime claim is already TESTED, and it passed.** M4's verification ran
     `cdx apply` on `dist/deep-navy-portrait.ccskin` and the owner launched through the installed
     Start-menu shortcut; the theme applied in both modes with no packaging change of any kind. That
     was M5's headline claim and it is now evidence rather than expectation.
  2. **The gate is structurally satisfied, not merely observed.**
     [`tools/build-windows-package.js`](../../tools/build-windows-package.js) hardcodes
     `themes/captains-cabin` as the theme it packs (line ~85), so no installer can pick this theme up
     by accident. Confirm the macOS builder the same way and the gate is met by construction.
  3. **The decisions are already stamped:** D-0003-5 (the scrim solver), D-0003-6 (the theme
     directory is git-ignored build output) and D-0003-7 (the scrim's governing contrast threshold,
     with its trip-wire) are in `docs/DECISIONS.md` with markers in the code they govern.

  **WHAT ACTUALLY REMAINS, and it is one real defect.** `~/.codexterity/state.json` currently points
  the owner's daily launch at
  `C:\Users\cchen362\Desktop\CodexSkin_Pirate\dist\deep-navy-portrait.ccskin` — a path inside a **git
  working tree**, in a directory that is **git-ignored build output** (`dist/`). Captain's Cabin, by
  contrast, is installed at `%USERPROFILE%\Codexterity\dist\captains-cabin.ccskin`. So the themed
  launch now depends on the repo staying where it is and on `dist/` never being cleaned — neither of
  which is true of build output, and a `git clean` would silently break the shortcut. **M5's job is
  to install the package properly**: copy it beside Captain's Cabin in the installed tree, re-apply
  from *that* path, and confirm the shortcut still launches themed. Note the install root is
  `%USERPROFILE%\Codexterity` for a measured reason (D-0001-29 — MSIX redirection hides
  `%LOCALAPPDATA%` from Codex); do not invent a new location. Also worth doing while there: the
  `cdx restore` round trip, since D-0001-32 makes "restore leaves a working plain-Codex launch" a
  promise this theme has not yet exercised.

  **DONE 2026-08-05. Gate met, and met by construction on both platforms.** The package is installed
  at **`C:\Users\cchen362\Codexterity\dist\deep-navy-portrait.ccskin`** (4,895,121 bytes, SHA-256
  `A9F8E1…C6F65`, byte-identical to the copy in the repository's `dist/`), applied **by theme id
  through the installed CLI** so `resolveThemeSource` resolves it under the install root rather than
  from a literal path, and `~/.codexterity/state.json` now names that installed path. **No code
  changed** beyond one decision marker; `npm test` **299/299**, `audit.mjs` **272/272**, all three
  Captain's Cabin digests unchanged (`731CC9…4286E`, `36DAD6…211FEB`, `0E44FF…AD5DB5`).

  **The gate:** [`tools/build-windows-package.js`](../../tools/build-windows-package.js) hardcodes
  `themes/captains-cabin` (~line 85), and the macOS side does the same in two places —
  [`packaging/macos/build-macos-package.js`](../../packaging/macos/build-macos-package.js) line 192
  defaults its payload to `dist/captains-cabin.ccskin` and
  [`packaging/macos/install.sh`](../../packaging/macos/install.sh) line 107 runs
  `cdx apply captains-cabin`. Neither installer can pick this theme up by accident. That is a **code
  read**, not a macOS run, so it does not touch D-0001-16.

  **THE INDEPENDENCE CLAIM WAS PROVED, NOT ASSUMED.** The repository's `dist/` was **renamed away for
  the whole verification** — all three launches below ran with it absent. `cdx verify` succeeded
  against the installed package (4,302,301 CSS bytes, 7 assets, 1,713,191 bytes) and `cdx list`
  enumerated both installed packages with `deep-navy-portrait [active]`. A `git clean` can no longer
  break the owner's daily launch.

  **The round trip, three launches, verified in the running app against Codex 26.730.8199.0:**

  1. **Themed, from the installed path.** The injector logged the package loading from
     `C:\Users\cchen362\Codexterity\dist\…`; at the settled +15s check the main window reported
     `hero: PAINTING … emptyStateHeading=yes` and **four landmarks PRESENT** (`sidebar-panel`,
     `sidebar-active-row`, `heading-display`, `home-hero`), with `terminal` and `code-surfaces` absent
     only because neither was on screen — an unrun measurement. Brass active-row mark at 2×16 px
     `rgb(192,164,84)`, sidebar `#0B111C`, title bar `rgb(21,27,38)`, `--color-text-primary #F4EAD4`,
     all three fonts loadable, and the two decorative chart accents collapsed to brass
     (`rgb(172,143,63)`) while green and orange stayed distinct (D-0001-11). **The owner confirmed the
     portrait in BOTH dark and light mode** — the light-mode appearance is this theme's own smoke test,
     since Captain's Cabin deliberately has no hero there.
  2. **`cdx restore`, then launch — D-0001-32 exercised for the first time with this theme.** Restore
     removed `state.json` *and* the `.codexterity` directory, leaving no residue. The shortcut then
     launched **plain Codex with no error dialog**, and the launcher log proves it structurally rather
     than by eye: *"Unthemed launch (-NoTheme): no injector will be attached"*, *"NODE_OPTIONS /
     CDX_THEME_PACKAGE removed from the child environment"*, and `injector.log` **0 bytes**.
  3. **Re-applied and launched.** The theme returned from the installed path, same four landmarks
     PRESENT, hero painting. Deep Navy Portrait is the theme left applied, at the owner's choice.

  **What M5 settled that the re-scoping did not anticipate — three facts:**

  1. **Where a private theme lives is a real decision, and two of the three obvious homes are already
     forbidden.** Stamped as **D-0003-8**. The repository's `dist/` is git-ignored build output, so a
     `git clean` breaks the launch; `~/.codexterity/` looks ideal because no installer touches it, but
     D-0001-24 keeps `cdx restore`'s no-residue promise by `rmdir`ing that directory **only when
     empty**, so a `themes/` subdirectory there would quietly turn a documented guarantee into a lie.
     The install root is what remains, and D-0001-29 already pins it.
  2. **`Install.ps1` wipes the install directory recursively, so a reinstall DROPS the private
     package — and that is correct.** The installer's last step re-runs `cdx apply captains-cabin`, so
     a reinstall self-heals to a theme that is certainly present rather than leaving `state.json`
     naming a file that is gone. Recorded in D-0003-8 with a "do not preserve stray `.ccskin`" marker
     at the wipe, because the tidy-looking fix is the wrong one.
  3. **A SECOND REAL CODEX UPDATE HELD, WITH ZERO CHANGES.** `docs/ENGINEERING.md` records
     26.727.6591.0 → 26.730.7989.0 (the Electron 150 → 151 jump). Codex has since moved again to
     **26.730.8199.0**, and everything above was measured against that build. This one is a weaker
     datapoint than the first and is recorded as such: Electron/Chromium are **unchanged** at
     151.0.7922.71 (Node 24.14.0, V8 15.1.206.10), so it is a Codex build bump, not a runtime jump —
     evidence that the token binding survives ordinary app releases, not a second proof of the
     hardening question.

  **A MEASUREMENT TECHNIQUE THAT IS WRONG AND LOOKS RIGHT — the launcher TRUNCATES `injector.log` at
  every startup.** Reading the log's line count before a launch and diffing against it afterwards
  reports only the tail of a file that was emptied and refilled, and it briefly convicted a fully
  successful launch of never attaching. **Anchor on line 1's timestamp, not on the file's length.**
  Two lines in that file also look like defects and are not: the
  `STARTUP FAILED, 'electron' module unavailable` entries are Codex's **child** processes (they run
  the same preload and have no Electron), and `Codex process exited with code 1` is the MSIX
  activation stub handing off. Same family as this plan's other three instrument mistakes — the tool
  was fine; what it was pointed at was not.

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

  **A THIRD COPY EXISTS, FOUND IN M4, and M6 owns it too.** A hero used in BOTH modes is embedded
  **once per mode rule**, not once — this plan previously asserted the opposite under M4 and was
  wrong. Measured on Deep Navy Portrait: the payload appears 2× at **1,993,928 bytes each**, i.e.
  **46%** of that theme's 4,300,500-byte stylesheet, on top of the raw copy in the package. The fix
  is small and does **not** touch D-0001-4's package format — emit the `url(data:…)` once into a
  custom property and have each mode's rule read it — but it belongs here with A1/A2 rather than in a
  visual milestone, for the same reason M4's byte work was moved out. **Also worth measuring here,
  and separable:** that theme's source image is a 1,495,444-byte **lossless PNG** of a photograph
  against Captain's Cabin's 124,134-byte lossy WebP, so the format choice costs more than the
  duplication does. Note the constraint that produced it — zero-dependency Node can decode PNG and
  cannot decode WebP (M1 fact 1), so the scrim solver needs a PNG even if the *shipped* asset is not.

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
