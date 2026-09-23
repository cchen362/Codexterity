# Plan 0004 — Re-target the theme at Codex's new token layer (the "OWL" update)

**Status:** **OPEN. M1, M2 and M3 DONE 2026-09-23; M4 is next.** Owner answered Q1 and Q2 (see "Owner
rulings"). M1 measured the new Codex and found a rename, not a redesign. M2 re-targeted the engine.
M3 opened every remaining Chat/Work screen plus the terminal and a diff in an isolated instance. It
fixed the two things that did not follow the tokens (D-0004-4, the Chat bubble) and recorded the
Pierre diff colours as a deliberate gap (D-0004-5). Nothing is rebuilt into a package or installed
yet (M4). **Read M3's "harness limits" before M4's owner launch.**

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
13. **Added at M1 start (scouting, 2026-09-23) — how the new areas are reached.** "ChatGPT" and
    "Codex" are an **app-mode switch** in the sidebar header (`aria-label` "Switch mode, current mode:
    Codex|ChatGPT"; a real pointer click opens a two-item menu — synthetic `.click()` does not).
    **Chat and Work are not separate screens**: they are a two-button toggle on the ChatGPT-mode home
    composer (`[class*="home-mode-toggle"] button`, `aria-pressed`). Work is **accessible** on the
    owner's account. All of them render inside the **same app shell** — `.app-shell-left-panel` is
    present in ChatGPT mode, and no inner element carried its own `[data-theme]` on those screens.
14. **Light mode is account-driven now.** Codex decides the mode from an account setting and writes
    `document.documentElement.dataset.theme` itself, into a runtime `<style data-codex-app-themes>`
    whose rules sit inside **`@layer theme`**. For measurement, setting `dataset.theme = 'light'`
    from a probe sticks and switches the tokens (`--color-token-main-surface-primary` `#111111` →
    `#ffffff`); `nativeTheme.themeSource` and `prefers-color-scheme` emulation do **not**. Because
    Codex's tokens are layered, an unlayered stylesheet (which `insertCSS` produces) should win them
    regardless of specificity — **to be proven in M2, not assumed.**
15. **A new stock accent exists:** light mode paints the composer's send control
    `--color-background-composer-primary: #3a83f7` (blue). D-0001-11's one-accent policy applies to it
    in M2.

---

## Owner rulings, 2026-09-23

1. **Q1 — Chat and Work: cover them FULLY, or not at all.** The owner's words: a formatted sidebar
   next to a stock pane *"feels awful"*. The expectation is that the theme covers Chat and Work
   completely. The final go/no-go is reviewed after M1 against its measured cost and rendered
   captures, but the only acceptable outcomes are "every area themed" or "the theme is not shipped
   half-done". **A partially themed Chat/Work is not an acceptable finish for M3**, and M4's gate
   includes those areas.
2. **Q2 — New Codex only.** No support for pre-OWL Codex (`.electron-*` / old token names). There is
   currently **no other collaborator**; the macOS collaborator never installed the previous release,
   so nothing depends on old-version support. `v0.1.0` stays the historical build for pre-OWL Codex,
   and nothing is maintained for it. To be stamped as a **D-0004-n** decision in M2 alongside the
   selector change.

## Owner questions, as asked (answered above)

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
  instrument work. *(Corrected 2026-09-23: this line originally said the parser "must still pass its
  existing tests". It had none — `probe.js`'s header claims its pure parser is testable in Node, and
  it is exported for that, but no test file required it. M1 adds `tests/injector/probe.test.js`.
  Also measured: `probe.js` contains no `.electron-*` assumption at all — only its fixed paint-trace
  target list is era-specific.)*
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

  **DONE 2026-09-23. Gate met.** Findings: [`docs/research/owl-token-inventory.md`](../research/owl-token-inventory.md).
  **Headline: Codex moved its primitive layer under an `--app-` prefix; it did not redesign it.** Of
  the 77 colour tokens: **60 renamed** (`--color-X` → `--app-color-X`), **16 unchanged**, **1 gone**
  (`--color-text-quaternary`); all 9 font tokens survive (they broke only because their block is
  scoped under `.electron-*`). (a) mapped in the findings' §3 table, generated by
  [`tools/inventory/map-tokens.mjs`](../../tools/inventory/map-tokens.mjs). (b) `[data-theme]` on
  `<html>` is the only mode signal; **no inner `[data-theme]` on any of nine samples**. (c) no colour
  token inline on `<html>`; the only body-scoped colour re-point is the benign `-opaque` one D-0001-18
  already describes. (d) sidebar panel, rows, active-thread marker, all ten heading classes and the
  hero container survive; **`.app-header-tint`, `.popupContent` and
  `.app-shell-main-content-top-fade` are gone** (menus are now Radix, `[data-radix-menu-content]`);
  terminal unrun. (e) **Chat and Work read the same primitives** — every visible colour on both home
  screens traces to a token (paint-coverage census, findings §4); the only untraced colour anywhere is
  the web-citation link blue in a conversation view. (f) light mode is measurable in the isolated
  instance by writing `dataset.theme`, so M2's light check needs no owner launch. Q1 and Q2 were
  answered before M1 ran (owner rulings above); M1 shows ruling 1 is achievable by the same re-map.
  **Instrument work:** `tools/inventory/` (runner, in-process driver, map tool); `probe.js` gained a
  `[data-theme]` scope census, a layered/`:where()` summary of colour definitions and a paint-coverage
  census; `tests/injector/probe.test.js` is new. `npm test` **330/330** (312 → +18). Four instrument
  defects were found and fixed before any number was trusted — findings §0. **The ChatGPT/Codex mode
  choice is account-side state shared with the owner's Codex**; the driver restores what it found.
  Also measured, for M2: 1,320 of 1,333 colour definitions are inside `@layer`, so the unlayered
  `insertCSS` sheet wins them by cascade order, not specificity (to be proven painting in M2); 22
  `--app-color-*` primitives have no theme value yet (tooltips, cards, tip badge, inactive buttons,
  scrim); `--color-codex-syntax-*` are literal per mode and need `syntax.json` directly.

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

  **DONE 2026-09-23. Gate met.** Captain's Cabin is **painted** on Codex `26.917` in both modes, on
  Codex home, a Codex thread, and the ChatGPT Chat and Work homes. The proof is an isolated themed
  run (`node tools/inventory/run-inventory.mjs --theme themes/captains-cabin`, which now loads the
  real injector) that samples computed paint and captures every screen. Measured, dark / light:
  ground `#0E141F` / `#F0E7D5`, sidebar `#0B111C` / `#EBE2D0`, ink `#F4EAD4` / `#182336`,
  active-row brass `#C0A454` / `#896D15`, title-bar tint `#151B26`. Literata, Fraunces and
  Monaspace Neon each exist as a loaded `FontFace`, not merely `fonts.check()` true. Headings paint
  in Fraunces, body in Literata, inline code in Monaspace, and the citation link paints brass.
  Captures were reviewed by eye. The injector log reads `injected OK via insertCSS` on every window.
  `npm test` **347/347** (330 → +17). `audit.mjs` **292/292** (+5 checks, below). The emitter's AA
  refusal (73/73 per mode) and probe assertion pass for **both** recipes; Deep Navy Portrait was
  emitted into a temp directory only, since its rebuild is M4. The byte gate moved deliberately in
  this commit: `theme.css` SHA-256 `352957…9af8` (482,912 bytes). `syntax.json` (`36DAD6…1FEB`) and
  `manifest.json` (`0E44FF…5DB5`) are **unchanged**, because neither encodes a selector.
  **What changed:** `codex-surface.mjs` now owns every name. `MODE_SCOPE` / `ANY_MODE_SCOPE` replace
  `ROOT_CLASSES`, and `tokenProperty()` decides `--color-` vs `--app-color-`. The emitter's 34 literal
  root classes and every `var()` it writes interpolate from there. Each recipe changed two probes.
  The records are **D-0004-1** (selector and names), **D-0004-2** (`!important` everywhere) and
  **D-0004-3** (new Codex only), with D-0001-2, -12 and -18 amended in `docs/DECISIONS.md`.
  **Deviations from the scope above, each measured:**
  1. **`insertCSS` now works, and that changed the cascade argument.** Fact 1 read it as mere health.
     But `insertCSS` installs a *user*-origin sheet, where only `!important` beats author CSS. So
     M1's "unlayered wins by cascade order" (inventory §2) described the wrong origin. The rules
     that lacked `!important` (code face, selection, scrollbars, the active-row mark, the hero) would
     have lost. Every declaration is now `!important`, and a test enforces it (D-0004-2).
  2. **The composer send control is ink, not brass.** Fact 15 and inventory §6.4 said brass.
     D-0001-15 records it painted ink on the build the owner approved, and this plan's goal is
     parity.
  3. **Five component tokens M1's map could not see**, found by the first themed run still
     painting stock. They are the Chat/Work mode toggle (track, selected pill, border, inactive
     label) and the utility bar under every home composer. Codex sets them to per-mode literals
     that no primitive feeds. They now take solved roles. The utility bar is now opaque: stock dark
     is a 3% wash, so on a hero theme its labels sat over the photograph unproven (D-0003-7's
     trip-wire shape). The new instrument is
     [`tools/inventory/unmoved-tokens.mjs`](../../tools/inventory/unmoved-tokens.mjs): it compares a
     stock run with a themed run and lists every colour token the theme did not move.
  4. **Audit grew by five checks** for the new pairings: tip badge, error and warning ink on a
     popover, error ink on code, and the send glyph on its ink pill. The total is 272 → 292 (5 × 2
     modes × 2 grounds).
  5. **Three Layer 2 hooks needed no replacement.** `.app-header-tint`, `.popupContent` and the top
     fade had no rule in the emitter to port (Gate 0 had already replaced them with Codex's own tint
     variables, all four of which are still read on OWL). Parity holds without a Radix hook.
  **Handed to M3, with the census as the instrument:** the census lists 169 tokens that are read
  somewhere but painted on no sampled screen. Almost all are ChatGPT's design-system palette: the
  danger / success / info / discovery / caution variants, the user-message bubble, text selection,
  and the `primary-solid` hover. They are candidates for the screens M3 opens. Also for M3: the
  **app-update pill** (white label and glyph, shown only while an update is waiting), and
  `--app-color-simple-scrim`, which is deliberately left stock (a neutral ink wash; brass would be a
  fill). **Not verified in M2:** the terminal and a diff (still unrun), and the owner's real
  shortcut launch (M4).

- **M3 — The Chat / Work surfaces. Expected (owner ruling 1); confirmed after M1.**
  Needed if M1 shows those areas do not simply follow the core tokens. Full coverage or nothing:
  every Chat and Work screen M1 inventoried is themed and verified painted, both modes.
  *(After M1: the two home screens DO follow the core tokens, so M3 shrinks to what M1 did not open —
  a ChatGPT-mode conversation, Images, the Work view past its home, plus the citation-link blue — each
  verified painted after M2's re-map, and anything that does not follow the tokens fixed here.)*
  *(Added after M2: M3 also opens a Codex **terminal** and a **diff** in the isolated themed run —
  both were unrun in M1 and M2 — so D-0001-18/-19's font rules and the terminal/diff colours are
  proven before M4 spends an owner launch. It triages the 169 "read, not painted" tokens
  `tools/inventory/unmoved-tokens.mjs` lists against the screens it opens, and the app-update pill.)*
  Same discipline as M2: map from measurement, audit any new pairing, verify painted. If Q1 is "leave
  stock" or M1 shows they already follow the core tokens, this milestone is **closed as not needed**
  with the evidence, not silently dropped.

  **DONE 2026-09-23. Gate met, with two harness limits handed to M4 (below).** Every Chat/Work screen
  the account offers is themed and **painted** in both modes. So are the terminal and the diff. Measured
  on Codex `26.917` with a stock run (`2026-09-23T11-12-59.421Z`) and a final themed run
  (`2026-09-23T11-29-29.527Z`), 11 scenarios × 2 modes, all OK. Captures were reviewed by eye.
  Ground, sidebar, ink and brass read `#0E141F`/`#F0E7D5`, `#0B111C`/`#EBE2D0`,
  `#F4EAD4`/`#182336` and `#C0A454`/`#896D15` on every screen that shows them. All three faces are
  loaded. `npm test` **374/374** (347 → +27). `audit.mjs` **292/292** (unchanged). The emitter's AA
  refusal and probe assertion pass for both recipes. Deep Navy Portrait was emitted to a temp
  directory only. Byte gate moved deliberately: `theme.css` `8335dd…e20c79` (486,270 B),
  `manifest.json` `a35808…537683` (2,415 B, one new landmark). `syntax.json` is unchanged
  (`36dad6…211feb`).
  **How the new screens are reached**, measured by read-only scouting in throwaway instances (the
  owner's app mode was restored every run). **Work past its home** is a project thread opened in
  ChatGPT mode; its row carries a leaf `Work` badge. A **Chat conversation** is a "Recents" row without
  that badge; it sits below the fold and loads over the network. **Images** is the sidebar nav item. The
  **terminal** and the **review panel** open from Codex's own View menu (`Open Terminal`,
  `Toggle Review Panel`), invoked from the main process via `MenuItem.click`. A **diff** opens from a
  thread's "Edited N files" card, then its file header in the review panel. The driver clicks only
  those, types nothing, and verifies each screen from the DOM, with failure diagnostics and a
  screenshot.
  **What needed a fix: two things. Everything else followed the tokens.**
  1. **Chat conversation, user-message bubble.** Light mode still painted stock pale blue
     (`#e8f3fe` / `#0c274a`). Codex sets both as per-mode literals, the same shape as M2's mode toggle.
     Now `background-button-secondary` / `text-primary` in both modes. That pairing is already audited
     ("Body text on secondary button"), so there is no new pair. `-compact` takes the same role.
  2. **App-update pill (D-0004-4).** In dark mode its white glyph and label sat on the brass that
     D-0001-11 made of chart-blue: **3.11:1, below AA**. Stock white-on-blue had passed. There is no
     token route (`text-white` is a constant), so one declared rule, `.bg-chart-blue.text-white`, makes
     it the solved brass-button pairing: fill **and** ink, 6.19:1 dark / 4.61:1 light. This is the
     optional landmark `white-on-accent-fill`. A first version re-inked only the text. The directions
     catalogue caught it: `neon-fathom` failed the audit check it needed, because that pair is not
     solved for an arbitrary hue. So it was re-pointed at the solved pair and the check was dropped.
  **Resolved without a fix:**
  - **The citation-link blue** (M1's one untraced colour) is the link-text span inside
    `a[href^="http"]`: stock `rgb(130,182,230)` / `rgb(40,88,164)`. Themed, it paints brass-derived
    `rgb(186,161,93)` / `rgb(94,77,17)` in Codex and Work threads. Chat conversations show source
    *chips* instead, and those paint the theme's supporting ink.
  - **Terminal:** Monaspace Neon, ink on navy, in dark mode. D-0001-19's rule holds on OWL. Codex's
    terminal reads `--color-codex-terminal-*`, which the theme resolves per mode (light: `#182336`
    on `#F0E7D5`).
  - **Diff:** the ground, the Monaspace face, and the added and removed line tints come from tokens,
    which inherit into the renderer's shadow root. The code text stays OpenAI's Pierre palette by owner
    ruling. That is **D-0004-5**, with its measured light-mode cost recorded.
  - **`<webview>` guests** (an MCP visualisation sandbox and the ChatGPT pricing page) are OpenAI web
    content, hidden by default. They are not Codex UI and are out of the theme's reach by design.
  **Census, triaged.** `unmoved-tokens.mjs` stock → final themed: **206 unmoved, 16 PAINT, 166 read**.
  - **All 16 PAINT rows are shared `#fff`/`#000` constants**, traced by sample. `#000` is the default
    fill on the root `<svg>` of each icon, whose paths paint `currentColor` (M2's known false positive).
    `#fff` is the caption text on the **Images template cards**, over OpenAI's own dark gradient on each
    photograph. It is deliberately left stock: theme ink over arbitrary photos would read worse.
  - **The 166 read-only tokens** painted on none of the 21 screens. 102 are ChatGPT's status palettes
    (success, danger, warning, discovery, caution, info); the rest are file-type, avatar, focus-ring,
    activity-control and device chips. They are left stock and unproven. A screen that shows one (an
    error banner, say) is the thing to look for in M4's owner review.
  **Harness limits, handed to M4 and not claimed here.** The isolated instance's account is dark, so
  Codex's own state stays dark while the driver flips `data-theme`. Codex's terminal and diff read
  their colours **from that state when they mount**, and write their own inner `data-theme`. So the
  *light* captures of those two surfaces show dark-mounted colours: the terminal keeps dark ink over
  parchment, and the diff renders on dark rows. **The stock run shows the same dark rows**, which is
  how this was told apart from a theme defect. The theme's light terminal tokens resolve correctly.
  **M4's owner launch in real light mode must look at a terminal and a diff.**
  **Instrument:** `driver-preload.js` gained six scenarios (`codex-thread-links`, `codex-terminal`,
  `codex-diff`, `chatgpt-conversation`, `chatgpt-work-thread`, `chatgpt-images`). It also gained
  surface captures the probe census cannot see: diff lines inside the shadow root plus a dump of its
  CSS, terminal colours, link text colours, the update pill, inner `[data-theme]` scopes and the
  webContents list. The theme-check now runs in stock runs too. Three driver defects were found by
  running it and fixed at the root:
  1. Row verification accepted *any* active row, including the previous thread's, so it clicked 15 rows
     in 3 ms. It now requires the clicked row itself to be active.
  2. Clicks landed off-screen for below-the-fold rows. The driver now scrolls into view and refuses an
     out-of-viewport point.
  3. The inner-scope rewrite was undone when a panel remounted. It is now re-applied just before each
     capture.

- **M4 — Both themes in the real app, installed, and the record corrected.**
  Regenerate Deep Navy Portrait from its recipe (it is gitignored build output, D-0003-6) and install
  it to `%USERPROFILE%\Codexterity\dist\` (D-0003-8); rebuild both `.ccskin`s and the Windows
  installer; launch **through the real Codexterity shortcut** (owner launch — this is the check the
  isolated instance cannot substitute for) in both modes with both themes, and read
  `injector.log` to close fact 12. `cdx restore` round trip still yields plain, working Codex.
  *(Added by M3.)* In **real** light mode, the owner opens a **terminal** and a **diff**. The isolated
  instance cannot show those two surfaces mounted in light mode (see M3's harness limits). The owner
  also looks for any status banner or chip (M3's 166 read-only tokens) on the screens they use.
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
