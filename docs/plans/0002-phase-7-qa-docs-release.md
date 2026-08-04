# Plan 0002 — Phase 7: QA, update resilience, docs, release

**Status:** **OPEN. Opened 2026-08-04. M1, M2 and M3 DONE 2026-08-04; M4–M6 not started.** M3 ran the
full Windows round trip from the built artifact, **passed its gate**, and found **three real defects
(F1, F2, F3) plus one documentation defect (F5)**. The QA pass was recorded first, unchanged, in
commit `226a40e`; **the owner then authorised the fixes in the same session and all four are now fixed
and verified in the running app** — see "The fixes" at the end of M3. Suite **182/182**,
`audit.mjs` **272/272**, `theme.css`/`syntax.json` still byte-identical to M2's baseline. M4 is next.
This plan closes the last roadmap phase of
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

- **M1 — the documentation truth pass.** ✅ **DONE 2026-08-04.** Fix text that contradicts shipped
  reality. This is first because every later milestone reads these files, and because the Phase 7
  gate itself is wrong.

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

  **Outcome, 2026-08-04.** All seven listed items were still at the stated lines and all seven are
  fixed. `git diff --check` is clean; a script resolved **all 99 relative markdown links** across
  `DECISIONS.md`, `ENGINEERING.md` and both plans — **zero dead**. The one number that could not be
  taken on trust was re-measured rather than copied: `npm test` was run for this milestone and
  reported **181/181**, which is what `ENGINEERING.md` now states.

  Two changes beyond the list, both the same defect class in the same edit region:
  - `docs/ENGINEERING.md:7` described Captain's Cabin as a *"dark-wood"* aesthetic, which the same
    file contradicts eighty lines later (D-0001-6, Phase 2: navy ground, no wood, no texture).
  - `docs/ENGINEERING.md:9` still named Plan 0001 as the active plan.

  Two judgement calls worth recording:
  - **The `!important` amendment was annotated, never edited.** Per the "never delete an entry"
    rule, the D-0001-1 amendment's *"no `!important` is required anywhere"* text stands where it
    is, with a superseding note pointing at D-0001-12 and D-0001-18, plus the first row in
    `DECISIONS.md`'s previously empty **"Superseded or hollowed-out"** table. Only that clause is
    superseded — the amendment's actual ruling (the `executeJavaScript` style-tag API, no debug
    port) is untouched.
  - **Plan 0001 §12's `*(pending)*` marks on D-0001-2/3/4 were not rewritten in place**, because
    §12 is the Phase 1 sign-off record and rewriting history there would be the same mistake as
    deleting a decision. The status header now states they are superseded and shipped, and points
    at `DECISIONS.md` as the current ledger.

- **M2 — the recorded green baseline.** ✅ **DONE 2026-08-04** (see "The baseline" below). Re-run
  `npm test` and `node tools/palette/audit.mjs` on a
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

  ### The baseline, taken 2026-08-04

  | | |
  |---|---|
  | `npm test` | **181/181 pass**, 0 fail, 0 skipped, 0 todo (~0.93 s) |
  | `node tools/palette/audit.mjs` | **272/272 pass** — navy/dark 68, navy/light 68, oak/dark 68, oak/light 68 |
  | Codex package | `OpenAI.Codex_26.727.6591.0_x64__2p2nqsd0c76g0` (version `26.727.6591.0`) |
  | Node | v22.14.0, Windows 11 Pro 26200 |
  | Tree | `48caa35`, `themes/` clean against HEAD |
  | `theme.css` SHA-256 | `731CC9CA073220A724ABE92B7C764E35DEEE0314066D6C96F88927049754286E` |
  | `syntax.json` SHA-256 | `36DAD638BD053F6E246B77C14FDF5D27ADB36234E5082EC18BC2DDC1FC211FEB` |

  **The environment was proved capable before the numbers were believed**, which is the entire
  point of this milestone: `Get-AppxPackage -Name OpenAI.Codex` returned the package above, so the
  MSIX is visible to this shell and `tests/packaging/windows.test.js`'s suite-level `before()` hook
  can resolve Codex through `tools/make-ico.mjs`. A run that cannot do that reports **150 passed /
  31 failed** and the 31 never executed — **that is an unusable measurement, not a regression.**
  Check the package is visible *first*; a bare test count carries no evidence of which case it is.

  **The two hashes are not decoration.** This plan's own constraint is that `theme.css` and
  `syntax.json` are byte-identical at the end of Phase 7. Recording the digests at the baseline is
  what makes that gate *checkable* at M6 rather than asserted — re-hash and compare, and note that
  only `emit-theme.mjs` may legitimately change them (the packer copies its output verbatim).

- **M3 — Windows end-to-end QA from the built artifact.** ✅ **DONE 2026-08-04** (see "The outcome"
  below). The only proof that counts. Build the
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

  ### The observation list — written 2026-08-04, BEFORE the launch

  The milestone says "prepare the observation list before launching; do not launch to explore."
  This is that list. It is split by **who has to be present**, because owner time is the scarce
  resource and most of this milestone does not need any.

  Paths are read from the code, not assumed: install root `%USERPROFILE%\Codexterity`
  (D-0001-29 — **never** `%LOCALAPPDATA%`), state `%USERPROFILE%\.codexterity\state.json`
  (D-0001-24), logs `%USERPROFILE%\Codexterity\logs\injector.log` and `…\launcher.log`
  (written by the shortcut stub, D-0001-27), Start-menu shortcut `Codexterity.lnk` under
  `[Environment]::GetFolderPath('Programs')`.

  **Part A — the agent does this alone, no owner present.** Build, install, and verify everything
  the filesystem and the logs can answer.

  1. `node tools/pack-ccskin.js` → `node tools/build-windows-package.js`. Record the `.ccskin` byte
     size and confirm it matches the packer's report. Confirm `dist/` and `*.ccskin` stay
     untracked (`git status --porcelain` shows nothing new) — build output is gitignored on
     purpose and must not be committed.
  2. Install from `dist/Codexterity-Windows/` by running `Install.ps1` the way a recipient would,
     from the extracted folder. It must need **no elevation**.
  3. Before any launch, capture the "before" state: `Test-Path` on the install root, both
     shortcuts, and `state.json`; and confirm `state.json` names `captains-cabin` (the installer
     runs `cdx apply`, which only *persists* the choice — it never launches or paints anything).

  **Part B — the single owner launch.** Everything below is answered from **one** start of the
  Start-menu shortcut. Ask all of it up front; do not launch to explore.

  | # | What the owner reports | Why it is on the list |
  |---|---|---|
  | B1 | **No console window and no taskbar blip** at any point during startup | The whole reason the shortcut targets a compiled GUI-subsystem stub (D-0001-27). A `.lnk` with `WindowStyle=7` was measured leaving a ~100–170 ms blip |
  | B2 | Codex opens **themed** — navy ground, brass accent — and is **fully usable** (type a message, open a conversation) | "Applies" and "does not break the app" are different claims and both are required |
  | B3 | Toggle Codex's appearance setting to **light**, then back to **dark**. Both look themed and readable | Both modes ship; the audit proves contrast arithmetic, not that the right sheet is live |
  | B4 | Anything that looks unstyled, half-styled, or wrong | The one open-ended question. Kept last so it cannot displace the specific ones |

  **What the agent measures from the same launch, needing no owner input:** quote
  `logs\injector.log` — it must show the theme loaded, the package path, and the **six** manifest
  landmarks with `sidebar-panel` (the only `required: true` one, D-0001-13) present. **A clean
  start does not prove the injector attached**; the log is the only thing that does. Also confirm
  `logs\launcher.log` is non-empty, because D-0001-28 fixed silent line loss there and the failure
  dialog quotes it.

  **Part C — teardown, agent alone.** `cdx restore` → relaunch the shortcut → Codex must come up
  **stock** (this second launch is cheap and needs no owner; the injector log tells us what
  happened). Then run `Uninstall.ps1` and confirm its four PASS/FAIL checks: install root gone,
  Start-menu shortcut gone, desktop shortcut gone, `~/.codexterity` gone. Finally confirm **Codex
  itself is untouched** — `Get-AppxPackage -Name OpenAI.Codex` still returns
  `26.727.6591.0` and Codex launches normally from its own icon.

  **Do not re-litigate on this launch** (already settled by the owner): the theme looks correct in
  ordinary daily use, and launching from **Codex's own** icon gives **stock** Codex — expected and
  inherent, D-0001-30. Neither is a defect and neither needs owner time.

  **A trap worth naming, because this project has hit it repeatedly.** If something appears
  missing or unstyled, the honest report names the query before the conclusion — a "NOT FOUND"
  here has usually been a fact about the probe, not about the screen. And if the theme is
  suspected of causing a behavioural bug, the settling move is a **stock control run** (launch
  Codex with no injector and see whether it reproduces), not an audit of the CSS — that is exactly
  how D-0001-26 was resolved.

  ### The outcome, 2026-08-04

  **The round trip completed and the gate is met.** Built → installed → launched → used → light/dark
  → restored → uninstalled → nothing residual, on this machine, from the built artifact, against
  Codex `26.727.6591.0`. **This session changed no application code, no token value and no test**, so
  every defect below is reported and none is fixed.

  **The environment was proved capable first** (M2's rule): `Get-AppxPackage -Name OpenAI.Codex`
  returned `OpenAI.Codex_26.727.6591.0_x64__2p2nqsd0c76g0` before anything was believed.

  #### Part A — build and install (agent alone)

  | | |
  |---|---|
  | `node tools/pack-ccskin.js` | `dist/captains-cabin.ccskin`, **681,124 bytes** |
  | `node tools/build-windows-package.js` | `dist/Codexterity-Windows`, 19 files, 969,989 bytes |
  | `git status --porcelain` | **empty** — build output stayed untracked, as intended |
  | `theme.css` SHA-256 | `731CC9…4286E` — **identical to M2's baseline** |
  | `syntax.json` SHA-256 | `36DAD6…211FEB` — **identical to M2's baseline** |

  **681,124 bytes is the same figure D-0001-23 recorded** against an independent .NET zip parser.
  Byte-reproducibility held across a rebuild on a different day, which is the whole point of pinning
  the writer's timestamps and zlib parameters — it makes "did anything really change?" answerable.

  **The prior install was removed first**, so this was a genuine clean install rather than an
  upgrade-in-place. That also exercised `Uninstall.ps1` an extra time for free, and its four checks
  were confirmed **independently** afterwards rather than taken from its own report.

  Install ran from the extracted folder as a recipient would, **with no elevation** (verified: the
  shell was confirmed non-Administrator via `WindowsPrincipal.IsInRole`, and the install still
  succeeded). Post-install, pre-launch state: install root `C:\Users\<u>\Codexterity` present
  (D-0001-29's `%USERPROFILE%` root, not `%LOCALAPPDATA%`), both shortcuts present, shortcut target
  `bin\Codexterity.exe` (the GUI stub, D-0001-27), and `state.json` naming `captains-cabin`.

  **`logs\` did not exist before the first launch.** That is deliberate evidence hygiene, and it is
  why the log quoted below can only describe this launch: the most common way this kind of QA lies to
  itself is reading a previous run's log.

  #### Part B — the owner launch

  All four questions answered from **one** start of the Start-menu shortcut, as budgeted.

  | # | Result |
  |---|---|
  | B1 | **PASS — no console window**, no taskbar blip. D-0001-27's GUI-subsystem stub does what it was measured to do |
  | B2 | **PASS** — themed (navy ground, brass accent), navigation and use normal |
  | B3 | **PASS** — light and dark both themed and readable across the toggle |
  | B4 | One observation, **since excluded by control** — see F4 below |

  **What the log established** (`logs\injector.log`, 24,894 bytes, 212 lines, this launch only):

  ```
  [codexterity] theme package loaded from C:\Users\<u>\Codexterity\dist\captains-cabin.ccskin
                (ccskin) — id=captains-cabin  475958 bytes of CSS  6 landmark(s) declared
  [codexterity] injected OK via executeJavaScript style tag on webContents#1
                — 475810 chars, lastChildOfHead=true
  [codexterity]   --color-background-surface: #0E141F
  [codexterity]   --color-text-primary: #F4EAD4
  [codexterity]   --color-background-button-primary: #C0A454
  [codexterity]   fonts loadable: Literata=YES  Fraunces=YES  Monaspace Neon=YES
  ```

  Counts from that launch: `theme package loaded` **1**, `preload loaded` **8**, `STARTUP FAILED` **7**,
  `injected OK` **4**, `settled token re-check` **0**.

  **The 7 "STARTUP FAILED" lines are expected and are not a defect** — `NODE_OPTIONS` is inherited by
  every process Codex spawns, and only one is an Electron main process. The number that matters is
  **`theme package loaded` = 1**: the seven processes that structurally cannot theme anything did not
  pay the measured 27 ms to inflate and safe-CSS-scan the package. Phase 4 M3's dependency-ordered
  guards are working.

  **`settled token re-check` = 0 is the finding, not a detail** — see F1.

  #### The settled landmark verdict — measured on a second launch, no owner time

  M3's gate wants `sidebar-panel` **present**, and the owner launch could not show it (F1). This was
  settled by relaunching with `CDX_VERIFY_AT=8000,15000,25000` — an agent-only launch, because the
  settled check is automatic and needs nobody watching. `launch.ps1` copies the whole environment into
  Codex's process, so the variable reaches it.

  Identical verdict at all three offsets, on **webContents#1**, the main window (`app://-/index.html`):

  ```
  settled token re-check on webContents#1 (+15000ms):
    landmark PRESENT: sidebar-panel        (1 match)  [D-0001-13]   ← the only required:true one
    landmark PRESENT: sidebar-active-row   (1 match)  [D-0001-14]
    landmark absent (optional, screen-dependent): terminal          [D-0001-19]
    landmark PRESENT: heading-display      (1 match)  [D-0001-7]
    landmark absent (optional, screen-dependent): code-surfaces     [D-0001-7]
    landmark PRESENT: home-hero            (1 match)  [D-0001-9]
  ```

  **The gate is met:** the required landmark is present on a settled DOM in the real running app, and
  the two absent ones are the screen-dependent pair with no terminal and no code block on screen — an
  unrun measurement, not a negative result.

  **A trap this milestone walked into and caught, worth recording because it is the project's own
  recurring lesson turned on the QA rather than the code.** The first pass filtered the log for lines
  containing `settled` — which matches every failure line and **no** `landmark PRESENT` line, because
  those do not carry the word. The filtered view showed the required landmark missing everywhere and
  looked like a serious defect. *A negative result must name its query*, and here the query was the
  fault. F2 below survived the correction; the headline did not.

  #### Part C — teardown (agent alone, plus one owner control run)

  `cdx restore` cleared `state.json` **and** removed `~/.codexterity` itself, leaving nothing residual
  (D-0001-24's promise, confirmed by `Test-Path`, not by its own output). **The relaunch after restore
  failed — that is F3.** `Uninstall.ps1` then reported **four PASS lines**, and all four were
  re-checked independently afterwards: install root, state directory, Start-menu shortcut and desktop
  shortcut all gone. **Codex itself is untouched** — `Get-AppxPackage` still returns
  `OpenAI.Codex_26.727.6591.0_x64__2p2nqsd0c76g0`, `Status: Ok`, and `~/.codex` was never touched.
  Repo clean, no build output tracked.

  ### Defects found. None fixed — this was an OPS+QA session.

  **F1 — the settled landmark check never runs in the shipped product. Severity: MEDIUM.**
  `scheduleSettledVerification` returns early unless `CDX_VERIFY_AT` is set
  ([`injector/core/inject.js`](../../injector/core/inject.js), `verifySchedule`), and nothing in the
  installed launch path sets it — not `Codexterity.cs`, not `cli.js`, not `launch.ps1`. So every real
  launch logs `landmark not yet present: sidebar-panel … the settled check (CDX_VERIFY_AT) is what
  convicts it` and **no verdict ever arrives.**
  *Root cause:* the variable was introduced as a debugging aid; when the settled sample later became
  the **only** check able to adjudicate a required landmark (the comment on
  `scheduleSettledVerification` records that change), it was never promoted into the shipped path.
  *Why it matters beyond tidiness:* this plan's own update-resilience ruling declines a version gate
  **because** "what protects the user is the landmark report". In the shipped configuration that
  report never reaches a verdict on the one landmark that is required.

  **F2 — the required-landmark verdict is applied per-webContents, and accuses a window that cannot
  have a sidebar. Severity: MEDIUM.** Codex opens a second window,
  `app://-/index.html?initialRoute=%2Favatar-overlay` (`webContents#3`). The theme applies to it
  correctly. But its settled check reports, at all three offsets:

  ```
  landmark MISSING (REQUIRED): sidebar-panel  (selector ".app-shell-left-panel" matched nothing
    at settled +15000ms)  [D-0001-13] — REQUIRED and absent on a settled DOM. This is a real defect.
  ```

  It is not a defect. *Root cause:* `reportLandmarks` decides `required` severity from the manifest
  alone, with no notion of whether this webContents is the main application shell. The earlier fix
  recorded in that function's own comment corrected **when** the verdict is taken (dom-ready →
  settled); it did not address **which windows** it applies to.
  *F1 and F2 are two halves of one problem:* switched off, nothing is adjudicated; switched on, it
  cries wolf on every launch. Either way the landmark report does not currently work end to end — and
  a required alarm that always fires is the exact failure that function was written to prevent.

  **F3 — after `cdx restore`, the Codexterity shortcut fails with an error dialog instead of
  launching stock Codex. Severity: HIGH (user-visible; breaks the documented "back to stock" path).**
  Reported by the owner from the desktop icon; reproduced deterministically by running the shortcut's
  exact command:

  ```
  $ node %USERPROFILE%\Codexterity\injector\cli.js        # no arguments — the shortcut's command line
  cdx: no theme is applied. Run "cdx apply <theme>" first, then "cdx" to launch it.
  exit code: 1
  ```

  The dialog the owner saw reads *"Codex did not start cleanly (exit code 1). (No launcher log was
  found at …\launcher.log.)"* — because the GUI stub has no console for that stderr line, and
  `launch.ps1` never ran, so the log the stub truncates at startup stayed 0 bytes and `ReadTail`
  returned nothing. The stub's behaviour is correct; the message is uninformative through no fault of
  its own.
  *Root cause:* [`injector/cli.js`](../../injector/cli.js) `cmdLaunch` treats "no theme applied" as an
  error (`return 1`), while `cmdRestore` in the same file prints **"Cleared the active theme. Future
  launches through Codexterity start stock Codex."** One file promises a behaviour another function in
  it forbids. This plan's own Part C text expected the same thing the restore message does.
  *Settled by the owner 2026-08-04 and recorded as **D-0001-32*** (see
  [`docs/DECISIONS.md`](../DECISIONS.md)): **the icon should open plain Codex.** Not implemented here.
  Note the fix is real work, not a one-liner — `launch.ps1` requires `-ThemePackage` today, so a
  theme-less launch path does not yet exist.

  **F4 — pasting from a code block keeps code-block formatting. NOT OURS — excluded by control.**
  Observed by the owner in themed Codex (B4). Settled the way D-0001-26 was: Codex was launched from
  **its own icon**, with no injector in the process at all, and **it reproduces identically**. One
  variable changed and the behaviour did not, so the theme is excluded. Supporting but *not*
  load-bearing: `theme.css` contains no `user-select`, no `white-space`, and exactly one
  `pointer-events` (`none`, on a 2 px marker). **Do not re-investigate this as a theming defect.**

  **F5 — `Install.ps1`'s `.DESCRIPTION` header says the payload is copied into
  `%LOCALAPPDATA%\Codexterity`. Severity: LOW (documentation only).** The code is correct and installs
  under `%USERPROFILE%`, with D-0001-29's full measured reasoning ~100 lines below in the same file.
  *Root cause:* the install root was moved during Phase 4 M4 and the file's own summary was not moved
  with it. Same defect class M1 swept for, one layer deeper — inside a code comment rather than a doc.

  ### What M3 does and does not establish

  **Establishes:** the built artifact installs without elevation, applies the theme, keeps Codex fully
  usable in both modes, is confirmed attached *by the log rather than by a clean start*, has its one
  required landmark genuinely present on a settled DOM, and removes itself completely while leaving
  Codex untouched.

  **Does not establish:** that the theme survives a Codex update (M4 simulates that), that the
  landmark safety net reports usefully to a real user (F1/F2 say it does not), or that `restore`
  returns a user to a working stock launch (F3 says it does not). **Nothing here is verified on
  macOS**, and per D-0001-16 as amended that is not a gap to close.

  ### The fixes, 2026-08-04 — authorised by the owner after the QA pass was recorded

  **Sequencing was deliberate: the QA record was committed FIRST and unchanged (`226a40e`), before a
  line of code was touched.** A verification record edited after the fact to match the fix is not
  evidence, and the two must be separable in the history.

  All four are fixed and **verified in the running app**, not by a green suite:

  | | Fix | Proof |
  |---|---|---|
  | **F1** | The settled check now runs **by default** (`DEFAULT_VERIFY_SCHEDULE = [15000]`). `CDX_VERIFY_AT` still overrides *when* it samples. **D-0001-33** | Launched with **no environment variable set at all** — the log shows `settled token re-check on webContents#1 (+15000ms)` |
  | **F2** | The `MISSING (REQUIRED)` verdict is gated on the window's URL carrying no `initialRoute`. **D-0001-33** | Same launch: `webContents#3` now logs `landmark absent (secondary window, not the app shell)… — not a defect`, naming its own URL |
  | **F3** | `cmdLaunch` falls through to a theme-less launch; `launch.ps1` gains `-NoTheme`. **D-0001-32** | With no theme applied, the shortcut's exact command launched stock Codex and **exited 0** (was 1). **No injector log was written at all** — the injector genuinely did not attach |
  | **F5** | `Install.ps1`'s `.DESCRIPTION` now names `%USERPROFILE%` and points at the D-0001-29 block | Read back; `Install.ps1` parses |

  Verified on the **rebuilt, reinstalled artifact**, not on the working tree. The settled verdict on
  the main window is unchanged from the QA pass — `sidebar-panel`, `sidebar-active-row`,
  `heading-display` and `home-hero` all **PRESENT**, `terminal` and `code-surfaces` absent with no
  terminal or code block on screen.

  **One defect was found in the fix itself, in review, and fixed before commit.** The first `-NoTheme`
  implementation copied the parent environment and then merely *declined to add* `NODE_OPTIONS`. An
  inherited `NODE_OPTIONS` — from a developer's shell, or another tool — would therefore have loaded
  the preload anyway and the "unthemed" launch would have come up **silently themed**, with nothing in
  the log to explain it. It now **removes** `NODE_OPTIONS` and `CDX_THEME_PACKAGE` from the child
  environment. *Not adding a variable is not the same as guaranteeing its absence*, and
  `docs/ENGINEERING.md` requires the code to make the violation impossible rather than merely avoid it.

  **A QA-technique correction worth keeping: `Get-Process -Name codex` is the WRONG QUERY for "is
  Codex running".** The Electron app's executable is **`ChatGPT.exe`** (`…\OpenAI.Codex_…\app\ChatGPT.exe`);
  `codex` matches only some auxiliary processes. Two launches in this session were refused by
  `launch.ps1`'s own single-instance guard while that query reported zero processes. **The guard was
  right and the query was wrong** — and the guard is the reliable instrument, because it refuses
  rather than handing off to a running copy and leaving the theme silently unapplied. Match on
  `Get-Process -Name ChatGPT`, or on `$_.Path -like '*OpenAI.Codex*'`.

- **M4 — update resilience, proved by simulation.** Two parts, one small.

  **M3's F1 and F2 are fixed, which unblocks part (b) rather than merely preceding it.** Part (b)
  proves the degradation path, and the degradation path *is* the landmark report. Proving it while the
  report was switched off in the shipped configuration (F1) or crying wolf on every launch (F2) would
  have proved the wrong thing. **The simulation in (b) must now assert the D-0001-33 gate too:** a
  broken landmark on the MAIN window must still convict, or the fix would have bought silence.

  **(a) Record the ruling.** Stamp **D-0001-31** at the `targetVersionRange` / `verifiedAgainst`
  validation in [`injector/theme-loader/manifest.js`](../../injector/theme-loader/manifest.js),
  plus one pointer row in `docs/DECISIONS.md`: the range is **declarative metadata**, is
  deliberately not enforced, and the reasoning is the section above. A reader who finds an
  unenforced field must find the decision beside it, or the next agent "fixes" it.

  **(b) Prove the degradation path, which is what update resilience actually means.** Build a test
  theme whose landmark selectors cannot match anything, load it, and confirm three things: Codex
  stays **fully functional**; the injector **names** each missing landmark; and a missing
  **required** landmark is reported differently from an absent optional one. Cover it in the suite,
  and confirm it once in the running app.

  **That confirmation needs NO owner time and must not be deferred for want of it.** M3 established
  that an agent can drive this end of the loop alone: `Start-Process
  "$env:USERPROFILE\Codexterity\bin\Codexterity.exe"`, wait ~25 s, and read
  `%USERPROFILE%\Codexterity\logs\injector.log`. The settled check now fires on its own (D-0001-33),
  so the landmark verdicts appear without setting anything. An owner is needed only to **judge how
  something looks** — which this milestone never asks. Two cautions, both measured in M3: quit Codex
  first (it is **`ChatGPT.exe`**, not `codex`; `launch.ps1` refuses to launch over a running instance,
  and a 0-byte `injector.log` usually means that guard fired), and remember `cdx apply` only persists
  the choice — it repaints nothing.

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
