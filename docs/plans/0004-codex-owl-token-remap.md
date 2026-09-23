# Plan 0004 — Re-target the theme at Codex's new token layer (the "OWL" update)

**Status:** **DRAFT, 2026-09-23 — awaiting owner review. No milestone started.** Nothing below is
implemented. The two owner questions must be answered before M2; M1 can begin on approval of this
draft because it changes nothing that ships.

**Depends on:** [Plan 0001](0001-captains-cabin-architecture.md) (architecture authority — D-0001-2's
styling strategy is the thing this plan amends), [Plan 0003](0003-image-led-theme-authoring.md) (the
recipe/emitter split this plan works inside — D-0003-1), [`docs/DECISIONS.md`](../DECISIONS.md), and
[`docs/research/phase3-inventory-findings.md`](../research/phase3-inventory-findings.md) (the last
measured inventory of Codex's token layer, now superseded for the running version).

---

## What this plan is for

**The theme stopped showing up because Codex renamed the hooks it hangs on — not because Codex
locked it out.** Some time between 2026-08-05 (`26.730.8199.0`, last verified themed) and 2026-09-23
(`26.917.6896.0`), Codex moved onto a new browser engine that OpenAI calls **OWL**, and in the same
move re-organised its colour system. The theme still reaches Codex, is loaded and is inserted without
a single error — and then matches nothing, so the app renders stock.

This plan re-points the engine at Codex's new names, keeps both shipped themes looking exactly as
they did, and records what happened honestly: `docs/ENGINEERING.md` currently says the design
"survives Codex updates" and was measured doing so. **This update is the first one it did not
survive unchanged.** The architecture held (injector, launcher, package format, installer); the
vocabulary layer did not. That distinction is the point of the record.

**Not in this plan's purpose:** any new visual design. Success is Captain's Cabin and Deep Navy
Portrait looking as they did on 2026-08-05, on the new Codex.

---

## Verified facts, measured 2026-09-23 — do not re-derive these

All measured on this machine against **Codex `26.917.6896.0`** using a second, isolated Codex
instance (`ChatGPT.exe --user-data-dir=<temp>` plus a `NODE_OPTIONS` preload), which never touched the
owner's running Codex. The technique is reusable and M1 relies on it.

1. **The injection mechanism still works (D-0001-1 holds).** The installed injector (byte-identical
   to the repo's `injector/`) attached in Codex's main process, loaded
   `deep-navy-portrait.ccskin` (2,308,725 bytes of CSS, 6 landmarks), and logged
   `injected OK via insertCSS` on every window. No debug port, no change needed.
2. **The `NODE_OPTIONS` fuse is still ON.** Electron fuse block in `app\chrome.dll` reads
   `101100011`; position 2 (`EnableNodeOptionsEnvironmentVariable`) is `1`. The CDP fallback is not
   needed.
3. **The runtime is new.** `ChatGPT.exe` is now a Chromium 153 shell (`153.0.8010.53`); the Electron
   API is compiled into `chrome.dll` under `owl\browser\api\…`; Node is `24.19.0` (`owl-node`);
   `resources\owl-electron-app.json` names `runtimeName: "owl"`. The package entry point is still
   `app/ChatGPT.exe`, so the launcher's resolution (`Get-AppxPackage`) is unaffected.
4. **`injector/core/inject.js`'s one-tick deferral is still sufficient.** `require('electron')` throws
   synchronously inside the preload (as it always has — see the comment at `start()`), and resolves
   by `setImmediate`. A plain-Node probe confirmed `electron` becomes resolvable once Codex's own
   bootstrap requests it (~300 ms after preload); the injector's `setImmediate` lands after that on
   this runtime. **Do not "fix" the deferral** — it is not the defect.
5. **THE DEFECT, part 1 — the mode hook moved.** `<html>` no longer carries `.electron-dark` /
   `.electron-light` (root class is empty). It now carries:
   `data-theme="dark"`, `data-codex-window-type="electron"`, `data-window-type="electron"`,
   `data-codex-os="win32"`, `data-codex-window-chrome="application-menu"`,
   `data-reduced-motion="false"`. Every rule the emitter writes is scoped under the old classes (34
   literal occurrences in `emit-theme.mjs`, 38 in the shipped `theme.css`, plus `ROOT_CLASSES` in
   `codex-surface.mjs` and two landmark probes per recipe), so **none of it matches**.
6. **THE DEFECT, part 2 — the token names moved.** Codex's stylesheets now define **779** distinct
   `--color-*` properties. Captain's Cabin overrides **77**; **only 20 still exist**, **57 do not**,
   including `--color-background-surface`, every `--color-background-button-*`, every
   `--color-icon-*`, `--color-border-light/-heavy/-focus`, `--color-text-foreground*`, the
   application-menu trio, and all of `--color-accent-*`. (Measured by name against stylesheet
   definitions; M1 must confirm against `var()` *reads*, which is the real evidence.)
7. **Codex's token blocks are now zero-specificity and can nest.** The defining selectors are
   `:where(:root, [data-theme])` and
   `:where(:root:not([data-codex-window-type="extension"]))[data-theme="dark"|"light"]` **and the
   same with a descendant space** — i.e. `[data-theme]` may be set on an inner element, re-declaring
   tokens for a subtree. A separate full token set exists for `data-codex-window-type="extension"`.
   Consequence to measure in M1: D-0001-18's lesson (a token declared on a closer ancestor beats any
   root rule, `!important` or not) may now apply to any element carrying `[data-theme]`.
8. **Structure is largely intact.** At the settled check (+15 s) on the main window, landmarks
   `sidebar-panel`, `sidebar-active-row`, `heading-display` and `home-hero` were all **PRESENT** —
   consistent with the owner's report that the UI "hasn't really changed". `terminal` and
   `code-surfaces` were absent only because nothing on screen used them (unrun, not negative).
9. **Stock values seen, dark mode:** `--color-token-main-surface-primary` `#111111`,
   `--color-token-bg-primary` and `--color-token-side-bar-background` `#0e0e0e`,
   `--color-text-primary` `#fcfcfc`, `--color-border` `rgba(252,252,252,0.084)`; body font is
   `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` — so the **font tokens are also
   unmatched**, not only colour.
10. **New token families exist** that did not before, e.g. `--color-chat-*` (8), `--color-artifact-*`,
    `--color-codex-*` (47), `--color-surface-*` (8) — consistent with the owner's observation that
    ChatGPT Chat and Work were folded into Codex. Where they paint is unmeasured.
11. **The owner's currently running Codex was started from the plain Codex tile** (parent process is
    the Windows shell), not the Codexterity shortcut — so it would render stock regardless.
12. **Unexplained, and on a version no longer installed:** the last launch through the Codexterity
    shortcut (2026-09-03, Codex `26.901.1978.0`) left `injector.log` at **0 bytes**, whereas today's
    isolated run of the same injector on `26.917` writes a full log. Either `26.901` behaved
    differently or something about the shortcut path differs. Closed by M4's real-shortcut launch,
    not by theory.

---

## Owner questions — answer before M2

### Q1. Should the theme also cover the ChatGPT Chat and Work areas now inside Codex?

**Plain language.** Codex now includes screens it didn't have when the theme was built. We can
either theme just the Codex coding areas the theme always covered, or extend it to the new Chat and
Work areas too.

**Example.** You open a Work item from the sidebar. With "Codex areas only", the sidebar stays navy
and brass, and the Work pane might show OpenAI's stock dark grey — or stock *white* in light mode.

**Implication.** Covering them costs more inventory and verification time (probably one extra
milestone, M3 below) and grows the contrast proof. Skipping them risks exactly the "half-styled app"
the project rules forbid, *if* those areas use their own colours. It may turn out to be free: if they
read the same tokens, re-pointing the core names themes them automatically.

**Recommendation.** Decide **after M1**, from rendered stock screenshots of those areas plus a
measured answer to "do they share the core tokens?". You decide best from what you can see, and M1
produces exactly that. Pre-commit only to this: **no area may end up half-styled** — each one is
either properly themed or left fully stock.

### Q2. Do we keep supporting older, pre-OWL versions of Codex?

**Plain language.** After the fix, should the theme still work on Codex versions from before this
update, or only on the new ones?

**Example.** Your macOS collaborator's Codex hasn't taken the update yet. With "new only", their
Codex would show stock until it updates; with "both", it stays themed.

**Implication.** "Both" means the theme carries two complete sets of colour names, old and new —
roughly double the colour rules, plus two sets of landmarks to keep honest, indefinitely.
"New only" is simpler, and the existing `v0.1.0` release remains the correct build for an older
Codex. Codex updates itself from the Store (and on macOS by its own updater), so old versions are
transient. D-0001-31 already rules out version checks, so "both" could not be switched by version —
it would always ship both.

**Recommendation.** **New only.** Old versions disappear on their own. Carrying two vocabularies
forever is exactly the drift this codebase is built to avoid. `v0.1.0` is already the answer for
anyone behind.

---

## Milestones

Ordered so nothing is re-mapped by guesswork: measure first, then change, then prove in the real app.

- **M1 — Measure the new surface. Changes nothing that ships.**
  Re-run the Phase 3 inventory against `26.917` using the existing
  [`injector/core/probe.js`](../../injector/core/probe.js) (`CDX_PROBE=1`, theme suppressed — it reads
  which tokens Codex *defines*, which it *reads via `var()`*, and what actually paints each probed
  region), driven through the isolated-instance technique, so no owner launch is spent.
  `probe.js` itself will need its regions and any `.electron-*` assumptions updated first; that is
  instrument work, and the probe's parser must still pass its existing tests.
  Answer, with a selector and a declaration each:
  (a) for each of the 77 colour tokens the theme overrides (`codex-surface.mjs`'s `tokenGroups()` /
  `TOKEN_ALIASES`) and each of the nine `FONT_FAMILY_TOKENS`, the new token(s) that carry that role, or "no equivalent" plus where that
  paint now comes from;
  (b) the dark/light switch — confirm `[data-theme]` is the only mode signal, and whether inner
  elements carry their own `[data-theme]` (fact 7) and in which regions;
  (c) tokens Codex sets inline on `<html>` or on `<body>` (D-0001-12 / D-0001-18 shapes) in the new
  build;
  (d) whether each landmark's selector and each hand-written rule target in the emitter
  (sidebar paint D-0001-13, active row D-0001-14, card hairline / composer control D-0001-15,
  terminal D-0001-19, hero D-0001-9, Layer 2 D-0001-10) still exists and still needs the rule;
  (e) the Chat / Work / "extension" surfaces: do they exist in this window, what do they read, and
  do they share the core tokens — plus **rendered stock captures** of them
  (`webContents.capturePage()` in the isolated instance) for Q1;
  (f) whether light mode can be selected inside the isolated instance, which decides whether M2's
  light-mode check needs an owner launch.
  **Deliverable:** `docs/research/owl-token-inventory.md` — an old-role → new-token map with
  evidence per row, superseding `phase3-inventory-findings.md` for the running version.
  **Gate:** every one of those 77 + 9 tokens is mapped or explicitly unmapped with a reason; (b)–(f)
  answered; owner answers Q1 and Q2 from the captures.

- **M2 — Re-target the engine (Captain's Cabin first).**
  The change lives where D-0003-1 says it must: **`codex-surface.mjs` owns Codex's names**, so the
  new root selector and the M1 token map go there; the emitter's hand-written blocks (34 literal
  `.electron-*` occurrences) move to the same selector — ideally interpolated from one constant
  rather than re-spelled 34 times, which is the tidy-up the file's own header anticipates. Each
  recipe's landmark `probe` strings change with them (D-0001-21's build-time assertion is what proves
  nothing was missed). `inject.js`'s `reportRootEnvironment()` probe list and its `.electron-*`
  commentary are updated so the live diagnostics report the new names — otherwise every future log
  would show "(unset)" for a working theme.
  **Selector specificity must be re-argued, not assumed:** Codex's blocks are now `:where()`
  (zero specificity), so the old "equal specificity, later wins" reasoning in `inject.js`
  (~line 1017) no longer describes the situation; M1(b)'s nested-scope finding decides whether our
  rules must also match `[data-theme]` descendants.
  **Contrast:** no palette value changes — new tokens are assigned existing, already-solved roles.
  Any *new* text/surface pairing M1 surfaces is added to the audit, not eyeballed.
  **Records:** amend **D-0001-2** (the mode hook and token names it cites) and stamp **D-0004-n** for
  the root-selector choice and the Q2 answer, in the same commit.
  **Gate:** `npm test` green, **with the three Captain's Cabin byte digests deliberately updated in
  the same commit that moves them** (ENGINEERING.md's rule — never the other way round);
  `audit.mjs` 272/272; the emitter's own AA refusal and probe assertion pass; an isolated-instance
  settled check shows the theme **painted** (surface, ink, brass, sidebar, title-bar tint, the three
  faces by `document.fonts.check()`), not merely defined, in dark mode, and in light mode if M1(f)
  allows.

- **M3 — The Chat / Work surfaces. CONDITIONAL on Q1.**
  Only if M1 shows those areas do not follow the core tokens *and* the owner chose to theme them.
  Same discipline as M2: map from measurement, audit any new pairing, verify painted. If Q1 is "leave
  stock" or M1 shows they already follow the core tokens, this milestone is **closed as not needed**
  with the evidence, not silently dropped.

- **M4 — Both themes in the real app, installed, and the record corrected.**
  Regenerate Deep Navy Portrait from its recipe (it is gitignored build output, D-0003-6) and install
  it to `%USERPROFILE%\Codexterity\dist\` (D-0003-8); rebuild both `.ccskin`s and the Windows
  installer; launch **through the real Codexterity shortcut** (owner launch — this is the check the
  isolated instance cannot substitute for) in both modes with both themes, and read
  `injector.log` to close fact 12. `cdx restore` round trip still yields plain, working Codex.
  **Docs:** `ENGINEERING.md` (the "survives Codex updates" section gets this update's honest result;
  the "no open plan" line), `docs/specs/customizable-ui-inventory.md` and `css-architecture.md` to the
  new names, `DECISIONS.md`. macOS stays **built and documented unverified** (D-0001-16 as amended) —
  the package builder is rebuilt, not verified on a Mac.
  **Gate:** owner confirms both themes on sight in the running app; `git diff --check` clean; plan
  closed.

---

## Out of scope — deliberately, with the reason

- **No palette, typography or hero changes.** The goal is parity with 2026-08-05; any visual change
  would make "did the re-map work?" unanswerable by eye.
- **No version gate** of any kind — D-0001-31 stands, and this update is precisely the case it
  anticipated: the landmark report, not a version check, is what surfaced the problem.
- **No move to the CDP fallback.** The primary mechanism is measured healthy (facts 1–2).
- **No change to the `.ccskin` format or the loader** (D-0001-4, D-0003-9).
- **`manifest.json`'s `verifiedAgainst` is updated only as a by-product of the digests moving**, not
  as a goal (D-0001-31: nothing reads it).
