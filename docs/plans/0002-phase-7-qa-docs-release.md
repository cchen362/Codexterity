# Plan 0002 — Phase 7: QA, update resilience, docs, release

**Status:** **OPEN, not started. Opened 2026-08-04.** This plan closes the last roadmap phase of
[Plan 0001](0001-captains-cabin-architecture.md) §11. Plan 0001 stays the architecture authority;
this plan owns only the work that turns a finished, owner-verified product into a released one.
**Phases 1–6 are COMPLETE** (Phase 4 M1–M4 landed 2026-08-02/03; Phases 5 and 6 are satisfied by
M4). The suite is **181/181** and `node tools/palette/audit.mjs` is **272/272**, both re-run and
green on this machine on 2026-08-04 against installed Codex `OpenAI.Codex_26.727.6591.0_x64`.

**Depends on:** [Plan 0001](0001-captains-cabin-architecture.md) (architecture, Phase 4 record,
roadmap), [`docs/DECISIONS.md`](../DECISIONS.md) (30 settled decisions, D-0001-1 … D-0001-30),
and [`docs/research/multi-theme-authoring-and-switching-exploration.md`](../research/multi-theme-authoring-and-switching-exploration.md)
(what comes after this plan). Where documents disagree, the later one wins.

**What this plan may NOT do.** No token value changes. No emitter refactor. No second theme. No
theme picker. No live repainting. `theme.css` and `syntax.json` must be byte-identical at the end
of this plan, and `audit.mjs` must stay 272/272. Everything in that list is *after* Phase 7 — see
§"After Phase 7" below.

---

## Owner rulings, 2026-08-04

Three decisions were settled by the owner when this plan was scoped. They are inputs, not
questions.

1. **macOS is not a blocker and never depends on another person.** The macOS package is built and
   is documented as unverified. That is its finished state (D-0001-16, as amended). The roadmap's
   Phase 7 gate still says *"Both platforms green"*, which contradicts that decision. **Correcting
   that gate text is M1 work, and it is the reason M1 exists.**
2. **Windows behaviour in ordinary use is confirmed by the owner.** The Captain's Cabin theme has
   been in daily use and looks correct, and launching Codex from its own Start-menu icon gives
   **stock** Codex — the expected behaviour under D-0001-30, re-confirmed in use. This removes the
   "does it work day to day" question from M3. It does **not** remove the clean-machine round trip,
   which M3 still owns.
3. **Update resilience: no version gate is built. The manifest range stays declarative.** See the
   ruling below.

### The update-resilience ruling, and why it is "record it", not "build it"

**The measured fact.** `manifest.json` declares `targetVersionRange` (`min "26"`, `max "27"`) and
`verifiedAgainst` (`26.727.6591.0`). A repo-wide search finds **no code anywhere that compares
either value with the installed Codex version.** `injector/theme-loader/manifest.js` validates
their *shape* only. So the package advertises a compatibility claim that nothing enforces and
nothing reports.

**A version gate is optional, not mandatory, and the recommended default is to NOT build one.**
Three reasons, in order of weight:

- **Blocking on a version mismatch is the worse failure.** Codex updates itself from the Store on
  its own schedule. A gate that refuses to apply outside the range would remove a working theme
  from a working app on a routine update, with the user unable to do anything about it. The
  project's rule is to degrade when a theme *cannot apply cleanly* — not when a number moved.
- **The real resilience mechanism already exists and is version-independent.** The injector reads
  landmarks from the manifest, probes them in the live DOM, and reports each one, telling a missing
  **required** landmark apart from an absent optional one (D-0001-25). Token overrides degrade to
  the stock look by construction (D-0001-2, D-0001-3). What protects the user is the landmark
  report, not a version string.
- **A warn-only gate would need the version to cross a layer boundary.** Only the launchers can
  read the host version, and they already do — `launch.ps1` reads `$package.Version` from
  `Get-AppxPackage`, and `launch.sh` reads `CFBundleShortVersionString`. Feeding it to the
  theme-agnostic injector core means a new environment variable and a new comparison. That is a
  small, clean change, but it buys a log line the landmark report already covers better.

**Therefore: record the limit instead of building around it.** M4 stamps the decision at the code
that owns the field, and proves resilience by *simulating the failure*, which is testable today,
instead of waiting for a Codex update, which is not.

**If this is ever revisited**, the shape is fixed in advance so nobody re-derives it: the launcher
exports `CDX_HOST_VERSION`, the injector core compares and **logs**, and it never refuses. The
version read stays in `launcher/<os>/` because the layer rule in `docs/ENGINEERING.md` reserves
platform branches for the launchers.

---

## Milestones

Ordered so each one is verifiable on Windows, and so the only milestone that spends an owner
launch (M3) runs once, with everything it must observe decided beforehand.

- **M1 — the documentation truth pass.** Fix text that contradicts shipped reality. This is first
  because every later milestone reads these files, and because the Phase 7 gate itself is wrong.

  Exact list, each verified against live files on 2026-08-04:
  - [`docs/plans/0001-captains-cabin-architecture.md:618`](0001-captains-cabin-architecture.md) —
    the Phase 7 roadmap gate reads *"Both platforms green; restore verified"*. **Rewrite to match
    D-0001-16 as amended:** Windows verified end to end from the built artifact; macOS built and
    documented unverified; no gate may depend on another person running it.
  - Same file, rows 4, 5 and 6 of the roadmap table carry no completion mark although all three
    are done. Mark them.
  - Same file, the status header (`:3` and `:12`) says Phase 4 is COMPLETE **and** "M2 next" **and**
    "M4 is next" **and** "IN PROGRESS" in one paragraph. Reduce to one true statement, and point at
    this plan as the active one.
  - Same file `:14` — "All twenty-two are CLOSED". There are now 30 decisions (D-0001-1 …
    D-0001-30).
  - [`docs/ENGINEERING.md:22`](../ENGINEERING.md) — "Phase 4 (packaging) is in progress — M1 …
    has landed. Phases 5–7 are planned". Phase 4 is complete and Phases 5–6 are satisfied by M4.
  - [`docs/ENGINEERING.md:113`](../ENGINEERING.md) — "it covers the theme loader, the `.ccskin`
    writer, and the packer — nothing else in the repo is under test". There are also CLI and
    Windows-packaging tests; the suite is 181.
  - [`docs/DECISIONS.md:70`](../DECISIONS.md) — the D-0001-1 amendment still says "**no
    `!important` is required anywhere**". D-0001-12 later measured the opposite and shipped
    `!important` on every declaration. **Do not delete either text** — add a pointer from the
    amendment to D-0001-12, per the "never delete an entry" rule.

  **Gate:** `git diff --check` clean; every status claim and every link checked against a live
  file; no claim of "verified" that has no run behind it.

  **Not claimed:** a docs pass proves nothing about the product.

- **M2 — the recorded green baseline.** Re-run `npm test` and `node tools/palette/audit.mjs` on a
  machine that can see the installed `OpenAI.Codex` MSIX package, and record the numbers with the
  Codex version they were taken against.

  **This exists because of a specific near-miss.** A run in a sandbox that could not see the MSIX
  reported **150 passed / 31 failed**. The 31 were one suite-level `before()` hook in
  `tests/packaging/windows.test.js` failing to resolve Codex's package through
  `tools/make-ico.mjs`, so every test behind it was reported without running. Re-run on this
  machine on 2026-08-04: **181/181, and audit 272/272**, against package
  `OpenAI.Codex_26.727.6591.0_x64__2p2nqsd0c76g0`. **Treat any test count taken in an environment
  without the MSIX as unusable, not as a regression.**

  **Gate:** 181/181 and 272/272 recorded here with the host version, and re-run once more after
  M4, since M4 is the only milestone that adds code.

- **M3 — Windows end-to-end QA from the built artifact.** The only proof that counts. Build the
  package the way a recipient gets it, install it, use it, remove it.

  Sequence, one pass: `node tools/pack-ccskin.js` → `node tools/build-windows-package.js` →
  install from the built output → launch the Start-menu shortcut → confirm the theme applies with
  **no console window** → check **dark and light** on one screen each → `cdx restore` → launch again
  and confirm stock → uninstall → confirm nothing residual (program directory, shortcut,
  `~/.codexterity`, and that Codex itself is untouched).

  **Already established by the owner in daily use, so do not re-litigate it:** the theme looks
  correct in ordinary work, and Codex's own icon launches stock Codex (D-0001-30).

  **Budget the owner's time.** One launch answers many questions only if the questions are written
  down first. Prepare the observation list before launching; do not launch to explore.

  **Gate:** the full round trip completes, and the injector log is quoted for the launch — a clean
  start does not by itself prove the injector attached.

- **M4 — update resilience, proved by simulation.** Two parts, one small.

  **(a) Record the ruling.** Stamp **D-0001-31** at the `targetVersionRange` / `verifiedAgainst`
  validation in [`injector/theme-loader/manifest.js`](../../injector/theme-loader/manifest.js),
  plus one pointer row in `docs/DECISIONS.md`: the range is **declarative metadata**, is
  deliberately not enforced, and the reasoning is the section above. A reader who finds an
  unenforced field must find the decision beside it, or the next agent "fixes" it.

  **(b) Prove the degradation path, which is what update resilience actually means.** Build a test
  theme whose landmark selectors cannot match anything, load it, and confirm three things: Codex
  stays **fully functional**; the injector **names** each missing landmark; and a missing
  **required** landmark is reported differently from an absent optional one. Cover it in the suite,
  and confirm it once in the running app if M3's launch can carry it without extra owner time.

  **Why simulate rather than wait:** the installed Codex is in range today and its version cannot
  be moved on demand. The failure mode a future update would cause — landmarks stop matching — can
  be reproduced now, exactly.

  **Gate:** the suite grows and stays green; the app stays usable with every landmark broken; the
  decision is stamped in code and in `DECISIONS.md` in the same commit.

- **M5 — user-facing documentation.** Keep the root [`README.md`](../../README.md) lean and add
  what a user actually needs: install, launch, switch back to stock, uninstall, and **what to
  expect when Codex updates** (the theme keeps applying; if a surface looks unstyled, the injector
  log names the landmark that stopped matching). State plainly that macOS is built and unverified.
  Do not move engineering guidance into the README — that lives in `docs/ENGINEERING.md`.

  **Gate:** every command in the README is run once, as written, and produces what the README says.

- **M6 — release.** Set a version, tag it, and write release notes that separate **verified** from
  **built but unverified**. List the artifacts and how to rebuild them
  (`node tools/pack-ccskin.js`, `node tools/build-windows-package.js`,
  `node packaging/macos/build-macos-package.js`). Build output stays gitignored — **do not commit
  a `.ccskin` or a `dist/` payload, and do not "fix" the gitignore.**

  **Gate:** the tag exists, the notes make no claim that no run supports, and M2's numbers are
  re-run once more against the tagged tree.

---

## After Phase 7 — setting the stage, not scheduling it

The next body of work is multi-theme authoring and distribution. It is explored in
[`docs/research/multi-theme-authoring-and-switching-exploration.md`](../research/multi-theme-authoring-and-switching-exploration.md)
and **reviewed independently on 2026-08-04**. The review confirmed the memo's core claim: the
runtime is already theme-agnostic, and the remaining work sits in the emitter and in the two
package builders. **Nothing below is approved or scheduled, and no Phase 7 milestone may drift
into it.**

Five things the review added, recorded here so the next session does not re-derive them:

1. **There is no contrast instrument for a new hero image.** The current hero's 5.99:1 figure lives
   in a comment in `emit-theme.mjs`; the tool that produced it is not in the repo.
   `tools/png-decode.mjs` accepts only 8-bit RGBA non-interlaced PNG and refuses everything else by
   name, there is no WebP decoder, there is no image encoder, and D-0001-20 forbids dependencies.
   **Build the instrument before the authoring refactor** — it decides whether a portrait hero is
   possible at all.
2. **In light mode the worst case flips direction.** The dark-mode scrim was solved against the
   **brightest** pixel, because light text sits over the image. Light mode puts dark ink over the
   image, so the **darkest** pixel governs. The method changes, not only the numbers.
3. **"272/272" is not a per-theme proof.** `audit.mjs` loops the `GROUNDS` registry (navy, oak):
   68 checks × 2 modes × 2 grounds. A theme that reuses an existing ground adds **no** checks.
   Recipe work must decide how an audit binds to a recipe.
4. **A generic emitter must keep the per-theme landmark `probe`** (D-0001-21). The probe is what
   makes a renamed rule fail the build instead of shipping a manifest that lies. Losing it in the
   refactor would restore the exact silent-success failure that killed the four pre-Gate-0
   landmarks.
5. **Embedded image weight is a runtime cost, not only a package cost.** A hero ships twice — as a
   declared asset and as base64 inside `theme.css` — base64 adds about a third, and that stylesheet
   is passed into Codex's main process as a string and re-applied on each window and navigation.
   Set a byte budget before approving any photographic hero.

The reviewed sequence, for when this is scheduled: Phase 7 baseline → the contrast instrument →
the recipe-driven emitter (with a byte-equivalence gate on Captain's Cabin) → multi-theme
distribution in both installers → a proof theme → the visual picker → live repainting last.

**One item is a decision, not engineering:** any theme built around a photograph of a real person
needs its distribution rights settled before the package is shared with anyone. Until then such a
theme stays local and private. This cannot be solved by attribution.
