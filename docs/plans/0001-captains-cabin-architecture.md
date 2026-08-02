# Plan 0001 — Captain's Cabin: Architecture & Roadmap

**Status:** **Phase 4 (Packaging) IN PROGRESS — M1 (theme-loader + safe-CSS validation) COMPLETE 2026-08-02**, with the repo's first test harness (`npm test`, zero dependencies, 73/73) and three new decisions, D-0001-20/21/22; see the Phase 4 milestone list below. M2 (the `.ccskin` packer) is next. Phase 1 (Research & Architecture) **COMPLETE**. **Phase 3 (CSS & Theme Dev) COMPLETE 2026-08-02** — every surface measured in the running app in both modes; see the Phase 3 close-out below and D-0001-19. **Phase 4 (packaging) is IN PROGRESS — M1 done, M2 next.** Phase 2 (Palette, Type & Assets) **COMPLETE** — ground, palette and syntax palette locked and emitted. The hero artwork and the Layer 2 character pass both shipped 2026-08-01 (D-0001-9, D-0001-10). **Gate 0 RAN 2026-08-01 — see [`docs/research/gate0-findings.md`](../research/gate0-findings.md), which is now the authority on how this theme behaves in the real app.** Injection works and needs no debug port; the theme applies only **partially**, because the Tier-2 landmark inventory and the token-consumption model were both built by static analysis and do not match the shipped build. **Phase 3 was larger than this plan assumed** — that gap is now closed; the paragraph is kept for the history of how it was found.
**Inventory rebuilt 2026-08-01 — see [`docs/research/phase3-inventory-findings.md`](../research/phase3-inventory-findings.md), now the authority on Codex's token architecture and landmarks.** The styling strategy (D-0001-2) is confirmed correct against the running app; the theme's *token list* was the thing that was wrong, and the work is now enumerated rather than unknown.

**PHASE 3 IS COMPLETE as of 2026-08-02 (items 16–22 below, plus D-0001-19).** Every surface this plan set out to settle has now been *measured in the running app*, in **both modes**: menus, empty state, composer, sidebar, code blocks, and finally diffs and terminals. Contrast passes everywhere it was checked (diff/terminal 12.83:1 light, 15.43:1 dark). Three questions that looked like defects turned out to need **no code at all** — the translucent menu (§8.4), the empty-state controls (D-0001-15), and the missing empty-state cards (a Codex content rule, not a theme effect). Two real bugs were found and fixed: **D-0001-17** (the light hover was perceptually invisible; owner-verified fixed) and **D-0001-18** (Codex sets `--vscode-editor-font-family` on `<body>`, so a value on `<html>` could never govern it — **the token fix is verified, but see the correction below: it did not fix the terminal panel, which never reads that token**).

**D-0001-18 IS NOW VERIFIED IN THE RUNNING APP (2026-08-02, run 4) — and verifying it CORRECTED it.** `--vscode-editor-font-family` reads `'Monaspace Neon'` on **both `<html>` and `<body>`**, so the body-scoped block wins and the decision stands. **But the defect it was credited with fixing was misattributed.** Measured on one screen: the **diff renders `Monaspace Neon`** and is the *only* mono face present, while the **475x1280 terminal-class side panel still computes `ui-monospace`** — it sees `'Monaspace Neon'` in the variable, carries no inline style, and simply **does not read that variable**. Every link in D-0001-18's reasoning held and the conclusion was still wrong: *a token you successfully captured is not necessarily a token anyone reads* — the dual of §2.1's lesson, and the seventh instance of it.

**PHASE 3 IS COMPLETE, 2026-08-02.** The last open item — the terminal panel's code face — is closed as **D-0001-19**: the panel is **xterm.js**, which takes `fontFamily` from a **JavaScript options object** rather than from CSS, so **both** mono custom properties already resolved to `'Monaspace Neon'` at that very element while it painted Consolas. No token work could ever have reached it. Fixed with a landmark on `.xterm` / `.xterm-rows` / `.xterm-char-measure-element` — the last load-bearing, because xterm's DOM renderer sizes its cell grid by measuring it. **Verified in the running app:** `rows="Monaspace Neon" measureElement="Monaspace Neon" => COHERENT`, region `font="Monaspace Neon"` at 12.83:1, and the owner confirmed metrics by printing 400 characters (6 flush rows + 4 remainder = wrap column exactly 66), with cursor and selection landing on the glyphs. See findings §8.6.3.

**Phase 4 (packaging) is under way; M1 landed 2026-08-02 and M2 (the `.ccskin` packer) is next.** **Dialogs** remain the only surface never observed; Codex's settings screen carries no `[role=dialog]` and may simply not have one — report opportunistically, do not build a run for it.
**Depends on:** [`docs/research/phase1-research-findings.md`](../research/phase1-research-findings.md) (the evidence), [`docs/research/gate0-findings.md`](../research/gate0-findings.md) (first observations of the running app), and [`docs/research/phase3-inventory-findings.md`](../research/phase3-inventory-findings.md) (the measured token/landmark inventory). Where they disagree, the later document wins.
**Decision state:** D-0001-1 (injection) and D-0001-5 (naming) **accepted**; D-0001-1 **amended 2026-08-01** — the working API is `executeJavaScript` style-tag injection, not `insertCSS`, which is broken on this Electron fork; the no-debug-port guarantee is intact and the CDP fallback was **not** needed. D-0001-6 (flat surfaces) and D-0001-8 (rejected directions) **accepted 2026-07-31**. **D-0001-7 is fully CLOSED**: the ground/palette half always stood, and the typography half was reopened and re-closed on 2026-08-01 — **Fraunces = display, Literata = UI/body**, chosen by the owner from a render; the **code face was reopened and re-closed again on 2026-08-02 as Monaspace NEON** (Xenon is the slab-serif member and left the app serif at every level — superseded, do not re-propose). D-0001-9 (hero artwork), D-0001-10 (character pass), **D-0001-11 (accent policy)** and **D-0001-12 (`!important`, forced by measurement)** **accepted 2026-08-01**. **D-0001-13 (the theme paints the sidebar), D-0001-14 (brass active row), D-0001-15 (no landmark for the empty-state cards or the send control — measured, not assumed) and D-0001-16 (macOS verification deferred behind Phase 4 packaging) accepted 2026-08-02.** **D-0001-17 (row hover/press anchored to the sidebar and lifting in both modes — owner-verified in the app) and D-0001-18 (tokens Codex sets on `<body>` must be re-declared on `<body>`; `!important` on `<html>` cannot win an inheritance contest) accepted 2026-08-02.** D-0001-2/3/4 remain owner-pending. **D-0001-20 (in-repo zip I/O, no dependencies), D-0001-21 (manifest.json is generated) and D-0001-22 (the safe-CSS scanner resolves CSS escapes, because a byte compare is a VERIFIED bypass) accepted 2026-08-02 with Phase 4 M1.** **All twenty-two are CLOSED — nothing is open for re-litigation.**

> **Phase 2 changed the brief.** The theme's ground is **deep navy `#0E141F`**, not dark oak, and all tiling textures were cut. Sections below that describe wood, leather, or texture assets are superseded — see [`docs/DECISIONS.md`](../DECISIONS.md) and [`docs/specs/asset-manifest.md`](../specs/asset-manifest.md).

### Phase 3 entry state — open items, in order

1. ~~**Hero artwork.**~~ **RESOLVED 2026-08-01.** Shipped as `themes/captains-cabin/assets/hero-empty-state.webp` (1600×900, 121 KB), D-0001-9. Chosen from Prompt A over two rejected Prompt B candidates in a rendered mockup comparison; one highlight-rolloff alteration only. Full accounting in [`asset-generation-prompts.md`](../specs/asset-generation-prompts.md) and [`asset-manifest.md`](../specs/asset-manifest.md).
2. ~~**Judge the character pass.**~~ **RESOLVED 2026-08-01.** Approved by the owner toggling [`docs/mockups/0002-captains-cabin-character-pass.html`](../mockups/0002-captains-cabin-character-pass.html) against the flat build. Shipped, narrower than the mockup, into `tools/palette/emit-theme.mjs` (D-0001-10) — see [`css-architecture.md`](../specs/css-architecture.md) Layer 2 for what shipped vs what waits on Gate 0.
3. ~~**Further image assets beyond the hero.**~~ **RESOLVED 2026-08-01.** The owner did not request any beyond the hero; none are planned.
4. ~~**Gate 0 — the injector launch test (§1).**~~ **RAN 2026-08-01.** Full report: [`gate0-findings.md`](../research/gate0-findings.md). Injection works with no debug port; the theme applies only partially.

### Phase 3 remaining work — set by Gate 0, in order

These replace the entry-state list above. Each is a consequence of an observation, not a guess.

1. ~~**Rebuild the hook and token inventory from the running app.**~~ **DONE 2026-08-01** — [`phase3-inventory-findings.md`](../research/phase3-inventory-findings.md). Instrument: [`injector/core/probe.js`](../../injector/core/probe.js) (`CDX_PROBE=1`, injection suppressed). Result: Codex's colour system is a four-stage chain whose semantic layer sits on **`.electron-dark` / `.electron-light` — exactly where this theme already targets**. D-0001-2 confirmed. The theme overrides **24 of 97** stage-1 tokens; the missing 73 are why the sidebar, menus and editor surfaces stayed stock. No `!important` needed anywhere. `customizable-ui-inventory.md` §Tier 2 is superseded by that document.
2. ~~**Re-derive Layer 2 against real landmarks.**~~ **DONE 2026-08-01.** *Landmarks now known.* All four old ones are dead, and Codex uses **build-hashed CSS-module class names** that must never be used as landmarks. The replacement is better: the app reads several custom properties it never defines — `--codex-titlebar-tint` (a direct, supported substitute for `.app-header-tint`), `--composer-top-tray-background`, `--composer-top-tray-border`, `--app-shell-tab-background`. Re-target the pass onto those, in `emit-theme.mjs`.
3. ~~**Resolve the typography reopening.**~~ **DONE 2026-08-01 — the owner chose Literata at 14px** (IBM Plex Sans named as runner-up) from the render; Fraunces keeps the ten `.heading-*` display classes, Monaspace Xenon keeps code. Shipped, and all three faces are now **embedded as data URIs** — which fixed a silent bug: the app had never actually rendered Fraunces (no `@font-face`, not installed) and was showing Georgia. D-0001-7 is fully closed. The comparison that settled it: — [`docs/mockups/0003-typography-comparison.html`](../mockups/0003-typography-comparison.html), generated by `tools/mockup/build-typography-comparison.mjs`. Seven cards on one screen (Fraunces control + three screen serifs + three humanist sans), live dark/light and 13/14/15px toggles, all faces SIL OFL 1.1 and embedded as data URIs. Verified: all seven load and render in their own face (eight distinct measured widths — no silent fallback). **Nothing is shipped to `theme.css`; D-0001-7's type half stays open until the owner picks from the render.**
4. ~~**Close the multi-accent violation.**~~ **DONE 2026-08-01** under **D-0001-11** — decorative blue/purple collapse to brass, semantic status hues stay distinct and re-derived. Verified by reading what the icons *paint*, not what the root resolves. *Source identified:* Exactly five chromatic colours are painted app-wide, all through Tailwind `text-token-charts-*` utilities, all tracing to five stage-1 tokens: `--color-text-accent`, `--color-accent-blue`, `--color-accent-green`, `--color-accent-purple`, `--color-accent-orange`. A five-token fix — **but the palette values are an owner decision**, because three of the five are semantic status hues (error/success/warning) that the design floor's one-accent rule would otherwise erase.
5. ~~**Amend D-0001-1**~~ **DONE 2026-08-01** — amendment in [`DECISIONS.md`](../DECISIONS.md), markers in [`injector/core/inject.js`](../../injector/core/inject.js).
6. ~~**Re-probe `pre, code, kbd, samp` on a screen containing code.**~~ **DONE 2026-08-02 — the selector MATCHES.** Observed on a real conversation containing a code block: `code=1 font="Monaspace Xenon"`, i.e. the selector is live *and* our mono face reaches it. It was never dead — it had only ever been checked on the empty state, which contains no code. `pre=0` on that screen because the block rendered as inline `<code>`; the fenced container is one of three `[class*="code"]` elements. The belt-and-braces fallback is therefore real, and code surfaces remain themed through stage-1 tokens regardless.

### Phase 3 — work added 2026-08-02

8. ~~**Light mode: the mint-green sidebar.**~~ **DONE — D-0001-13.** Not a palette bug. Every ancestor of `.app-shell-left-panel` up to `<html>` computes `rgba(0,0,0,0)`; Codex's own sidebar rule is gated `:not([data-codex-window-chrome=application-menu])` and the Windows main window carries exactly that attribute, so Codex deliberately leaves the panel transparent and Windows 11 Mica shows the **desktop wallpaper** through it. Sampled before the fix: `#E6F9F6` / `#B7C5C6` / `#EAF7F3` down its length — not one colour, so not a token. Fixed by painting the authored `.app-shell-left-panel` landmark from `--color-background-surface-under`. A **contrast** fix: sidebar text sat over an arbitrary wallpaper, so its contrast was unprovable. Verified `#EBE2D0` uniform. Findings §2.1 corrects the inventory's mis-attribution.
9. ~~**Brass active-row indicator.**~~ **DONE — D-0001-14.** Verified matched, computed and painted.
22. **The code face now reaches diffs and terminals — D-0001-18.** The probe corpus showed Codex
    setting `--vscode-editor-font-family` **on `<body>`**, while this theme sets it on
    `.electron-dark`/`.electron-light` (i.e. on `<html>`). Custom properties **inherit**, so the
    closer ancestor wins for every descendant and **`!important` on the root cannot take it** — not a
    specificity contest. That is why diffs and terminals rendered in Consolas while every colour
    around them was correct. Fixed with a `body`-scoped block; verified by reproducing the conflict
    in a browser (before `ui-monospace`, after `Monaspace Neon`, control proving `!important` on
    `<html>` loses). **D-0001-12 one level down.** A corpus sweep found 17 body-set properties, 2
    colliding, the other benign. **CONFIRMED IN THE RUNNING APP 2026-08-02 (run 4): the token reads
    `'Monaspace Neon'` on both `<html>` and `<body>`, so the block wins.** The **diff** renders
    Monaspace Neon and is the only mono face on screen. **The terminal-class side panel does not** —
    it reads the token as Neon and computes `ui-monospace` regardless, i.e. it never consumed the
    token. That panel is a separate open defect, not a D-0001-18 failure. See findings §8.6.2.

20. ~~**OPEN — does the theme SUPPRESS the four empty-state cards?**~~ **RESOLVED — nothing was ever
    broken.** With injection suppressed the cards were *also* absent, and the stock DOM shows a
    `group/home-suggestion-list-item` in their place: **the four cards and the home-suggestion list
    are mutually exclusive.** Codex shows a personalised suggestion when it has one, the four generic
    cards when it does not. Both owner screenshots are stock and differ by that, not by the theme.
    Two wrong conclusions were reached before this — "Codex removed them", then "the theme suppresses
    them" — both from comparing states that differed in more than one variable. Original text: Runs 1 and 2 concluded Codex had
    removed them; **that conclusion is retracted.** An owner screenshot of **stock** Codex shows all
    four on the same screen, so they exist and do not appear under the theme. Two themed runs
    agreeing with each other was never a control. Our CSS cannot remove DOM nodes (custom properties
    plus three landmark rules, none touching `display`/`visibility`/`content`), so **no mechanism is
    identified and none should be guessed.** One clue: a themed sample found a `<div>` 224x110 with
    `--tw-ring-color` set to our `--color-border` but a box-shadow of `rgba(0,0,0,0) 0 0 0 0` — the
    hairline resolves and never paints. **Resolve with `CDX_PROBE=1` (injection suppressed), not
    with more themed runs.** See [findings §8.5.1](../research/phase3-inventory-findings.md).

21. **Diffs and terminals MEASURED 2026-08-02 (run 3) — legible, but the code face misses them.**
    Light `#182336` on `#F0E7D5` = **12.83:1**; dark `#F4EAD4` on `#0E141F` = **15.43:1**. Both pass
    handsomely, and these were Phase 3's last unmeasured surfaces. Two defects, both reads-vs-paints:
    the panel computes **`ui-monospace`** (Consolas on Windows), so **Monaspace Neon does not reach
    it** despite this theme setting four mono variables; and it paints from
    `--color-background-surface`, leaving `--color-token-diff-surface` and
    `--color-background-editor-opaque` **inert**. Needs a probe to find the governing rule —
    **do not add a landmark first.** See [findings §8.6.1](../research/phase3-inventory-findings.md).

19. **Sidebar hover/active — REOPENED and FIXED 2026-08-02 (D-0001-17). VERIFIED in the running app
    by the owner the same day: *"The hover contrast is great!"*, both modes.** Item 10 below dropped this
    as "a non-problem" on the strength of a chain trace. The chain was healthy and the conclusion was
    still wrong: the owner reported the light hover as invisible in the running app, and it measured
    ΔL **0.0122** against dark's **0.0574** — 4.7× weaker *from the same formula*, because row states
    were derived from the **ground** while the sidebar sits below it in both modes, so dark diverged
    and light converged. Re-anchored to the sidebar and made to **lift** in both modes, which is what
    dark always did. Light now ΔL 0.0600. Chosen over an equal-sized darkening because lifting stays
    inside the existing ramp: **zero** other palette tokens move and contrast *rises* (meta on hover
    4.96 → 6.17), where darkening would have forced 9 ink tokens to re-solve to satisfy
    `deriveChrome`'s guard. Audit **272/272** with two new checks. *A resolved token is not a visible
    pixel — the third form of the same lesson as §2.1 and §8.3.*

10. **Sidebar hover/active rows — ~~VERIFIED, no code needed~~ SUPERSEDED by item 19 above.** `--color-token-list-hover-background` → `--vscode-list-hoverBackground` → **`--color-background-button-secondary-hover`**, a stage-1 token this theme already defines. Measured on the active row: `#E7DECC`, our value. A plan to re-derive the interaction steps was **dropped after tracing the chain** — the ramp is not broken and widening a step in an owner-approved palette to fix a non-problem was the wrong instinct.
11. ~~**Empty-state card hairlines and composer send control.**~~ **DONE 2026-08-02 — D-0001-15, and the answer was that NEITHER NEEDS CODE.** Measured on the empty state, then verified painted in the running app. (a) On Electron the cards' border is **zeroed** and replaced by `electron:ring-[0.5px] electron:ring-token-border-heavy` — a **box-shadow, not a border** (computed width `0 0 0 0`), resolving to **`--color-border-heavy`**, a stage-1 token this theme already defines. Verified: `4 card(s); ring-color=#5F6675 border-width=0px bg=rgb(14,20,31)`, 3.20:1, AA non-text. **The two guessed selectors would have targeted `border-color` and painted nothing** — item 11 existed because that was never measured. (b) The send control and the voice control are **one element** whose `aria-label` flips; painted by `bg-token-foreground` → **`--color-text-foreground`**, already defined, and unretargetable alone because that token is the app's main text colour. Verified: `disc=rgb(244,234,212) glyphFill=rgb(34,39,49)`, **12.52:1**. Full accounting in [findings §8](../research/phase3-inventory-findings.md).
12. **Light-mode hero — DECLINED by the owner 2026-08-02** ("I can live without the hero, at least for now") after seeing light mode in the running app. Light keeps the flat parchment empty state. If revisited, the scrim must be **re-solved** — image and scrim are one contrast proof.
13. ~~**Code face reopened by the owner 2026-08-02.**~~ **DONE — the code face is Monaspace NEON.** Xenon rendered correctly all along; the fault was that it is the **slab-serif** Monaspace, leaving the app serif at every level and erasing the texture that marks code as literal rather than prose. Neon is metric-identical, so the swap had zero layout consequence and the owner judged it in the running app: *"reads so MUCH better."* Verified `code=1 font="Monaspace Neon"` in both modes. Rejected on the way, recorded in D-0001-7: IBM Plex Sans / Work Sans (proportional — breaks indentation, diffs and hash columns) and Codex's stock mono (Consolas on Windows, SF Mono on macOS, and unembeddable).

15. **macOS launcher WRITTEN, UNVERIFIED — [`launcher/macos/launch.sh`](../../launcher/macos/launch.sh), 2026-08-02.** Closes the "no macOS launcher exists" half of the standing cross-platform gap; it does **not** close the verification half, and `docs/ENGINEERING.md` requires the target OS. It resolves the bundle by **identifier** (Windows already proves product name ≠ binary name: package `OpenAI.Codex`, executable `ChatGPT.exe`), reads `CFBundleExecutable` from `Info.plist` rather than guessing, refuses to choose when discovery returns several candidates, and mirrors the Windows single-instance refusal. The load-bearing line is that it **`exec`s `Contents/MacOS/<binary>` directly and never uses `open -a`** — `open` makes launchd the parent, so `NODE_OPTIONS` would be dropped and the app would come up unthemed **with no error**, the exact analogue of the Windows launcher's `explorer.exe` note. Three things need a Mac: the bundle's real identity; whether the macOS build's `EnableNodeOptionsEnvironmentVariable` fuse is on (Phase 1 decoded the fuses out of the **Windows** `chrome.dll` only); and **D-0001-13's `!important`** — on macOS the menu bar is the system menu bar, so the main window probably lacks `data-codex-window-chrome=application-menu`, meaning Codex's own `(0,3,0)` sidebar rule likely *does* match and outranks our `(0,2,0)`. Run the probe there and read `windowGuards.documentElementAttrs`. **Deliberately not "pre-fixed" on a hunch.**

    **BLOCKED, and the ordering is now settled (owner, 2026-08-02): macOS verification cannot happen until Phase 4 ships an installer.** The owner has no Mac. The only available machine belongs to a collaborator who is willing to install and try it — but a collaborator will not be asked to clone a repo, install Node and run a shell script by hand. That means **`launcher/macos/launch.sh` stays unverified until there is a `.ccskin` + installer to hand them**, and it reverses one piece of this plan's stated sequencing: "settle the look first, packaging adds nothing visual" holds for *Windows*, but macOS verification is now **downstream of Phase 4**, not parallel to it. **Do not schedule, re-propose, or block Phase 3 on macOS verification, and do not ask the owner to find a Mac.** Everything the launcher can be given without a Mac it already has: it fails loudly rather than silently on each of the three unknowns above.

17. **The translucent-menu question — ANSWERED, and it needed no code.** Two steps, 2026-08-02.
    (a) *Bounded analytically* ([findings §8.4.1](../research/phase3-inventory-findings.md)): the
    panel is 90% opaque, so a backdrop can move it at most 10% toward black or white; compositing
    over pure black and pure white therefore bounds it **unconditionally**. Menu label and
    secondary text pass over *any* backdrop (worst **9.13**/**5.12** dark, **8.88**/**5.69** light).
    The four solved-to-target tiers do not — because `audit.mjs` binary-searches them onto exactly
    4.5:1, leaving 0.11–0.36 of headroom, which no translucent surface fits inside. Every
    break-even is a mid-grey and the app's surfaces are nowhere near mid-grey. (b) *Then measured*
    (§8.4.2): the `[role=menu]` panels are **opaque, `backdropFilter=none`**, paint from
    `--color-background-application-menu` `#E7DECC` — **not** the `--color-background-control-opaque`
    that §8.3 named — and carry exactly **two** ink tiers, `#34425C` (7.56) and `#323A48` (8.57),
    both with headroom. **No landmark written**, same shape of answer as D-0001-15. The `/90` +
    `blur(8px)` popover family of §8.3 is a *different* surface and remains unmeasured; §8.4.1's
    bound is its standing answer. Instrument work in [`inject.js`](../../injector/core/inject.js):
    compositing is measured on a 1×1 canvas rather than modelled, and the panel's alpha is
    recovered from two paints rather than trusted.

18. **LIGHT MODE VERIFIED 2026-08-02** ([findings §8.4.3](../research/phase3-inventory-findings.md)).
    30 samples, zero probe failures. Composer control `#182336`/`#DFD7C5` **11.00:1**; active-row
    brass `#896D15` on `#EBE2D0` **3.83:1** (AA non-text); title-bar tint `#E7DECC`; code surface
    Monaspace Neon `#182336` on `#E7DECC` **11.80:1**; all three fonts load; hero correctly absent;
    accent collapse holds (`--color-token-charts-purple: #6F5708`). **Two things did not close:**
    the run ended at +204s of a 300s schedule, so **dialogs and the terminal were never reached**;
    and the **four empty-state cards were not found in light** on the home screen with an empty
    composer — neither documented cause applies, both hooks missed, and it is unexplained. See §8.6.

16. **Menus, popovers, diffs, terminal — PARTIALLY seen, and one new open question.** *(Superseded
    in part by items 17–18 above: the "new open question" is the translucency one, now answered for
    `[role=menu]` and bounded for the popover family.)* The open menu panel traces to **`--color-background-control-opaque`** (defined by this theme), *not* to `--color-background-elevated-primary-opaque` which findings §2's impact table names for "menus, popovers, dialogs" — the **third** reads-vs-paints trap, see [findings §8.3](../research/phase3-inventory-findings.md). Diffs were seen once by the owner and are coherent, but never measured under the theme, and **the diff view uses no `pre`/`code`/`kbd`/`samp` elements at all**, so the settled check's code-surface line does not cover it. Dialogs and the terminal remain entirely unobserved. **New open question ([findings §8.4](../research/phase3-inventory-findings.md)):** menu panels are `/90` over `backdrop-filter: blur(8px)`, so their text does **not** sit on flat colour and D-0001-6's assumption does not hold there. Stated open, not fixed — the fix needs a landmark, and no number has been produced yet.

14. **DARK MODE VERIFIED 2026-08-02.** Both of this session's visual changes confirmed in the running app in dark: `root class electron-dark`, `--color-background-surface-under: #0B111C` (the sidebar had been showing Mica in dark too, just unnoticeably), and the active-row indicator matched with `::before bg=rgb(192,164,84)` = `#C0A454`, dark brass. Light was verified separately by pixel sampling.

_(item 7 below is retained from the Gate 0 list)_ The settled check now reports each tag's count *and the font it resolved* on every launch, so the answer records itself the first time anyone opens a conversation containing code — no special run needed. It could not be forced in this session: Codex's Electron window exposes no UI-automation tree, so the sidebar cannot be driven programmatically from here. Still zero on the empty state, which contains no code — untested, not refuted. Much less load-bearing than it was either way: code surfaces are already themed through stage-1 tokens (`--color-background-editor-opaque`, `--color-token-text-code-block-background`) with no element selector at all, and the mono *face* now reaches code through `--font-mono` / `--vscode-editor-font-family` as tokens. The selector is only a belt-and-braces fallback.
7. ~~**Launcher: detect a running Codex instance.**~~ **DONE 2026-08-01.** Codex is single-instance; launching over a running copy handed off and exited, so the injector silently did not attach and the user got an unthemed app with no error. The launcher now refuses with an explanation, matching on the **package path** (the executable is `ChatGPT.exe`, and a name match would also hit the unrelated *ChatGPT Classic* app). It reports and stops rather than terminating anything — closing the user's running editor is not a launcher's decision. Both paths tested: refuses when Codex runs, launches and injects when it does not.

**The load-bearing constraint for all of the above:** decoration behind body text breaks the contrast proof; decoration on chrome does not. D-0001-6 is scoped to content surfaces, and the character pass stays on chrome deliberately.

---

## 1. Architecture recommendation

### The model: a Launcher + a Runtime CSS Injector (never touch app files)

```
┌────────────────────────────────────────────────────────────────┐
│  Captain's Cabin Launcher  (thin, per-OS)                        │
│  · resolves the installed Codex executable (version-independent) │
│  · starts it with the injector attached                          │
└───────────────┬────────────────────────────────────────────────┘
                │ launches with injection enabled
                ▼
┌────────────────────────────────────────────────────────────────┐
│  Codex Desktop (unmodified, official, signed)                    │
│                                                                  │
│   Injector  ──►  webContents.insertCSS( theme.css )  on every    │
│   (Node)         window + re-inject on new windows/navigations   │
│                                                                  │
│   theme.css = ~40–60 CSS-variable overrides on .electron-dark    │
│               + a few named-hook rules + embedded texture vars   │
└────────────────────────────────────────────────────────────────┘
```

**Core principles (non-negotiable):**
1. **Zero mutation of app files.** No asar patching, no re-signing, no writing into `WindowsApps`/`.app`. Survives updates by never depending on app files staying put.
2. **Token-first styling.** Override the semantic `--color-*` layer on the theme class; use structural selectors only as a last resort, and only as verified "landmarks."
3. **Non-destructive & reversible.** Worst case = launch Codex normally, get the stock look. Nothing can be bricked. A `restore`/no-op path is first-class.
4. **Never touch auth/config.** The injector structurally cannot read or write `auth.json`, `.credentials.json`, or API keys. Hard boundary, not a convention.
5. **One shared codebase; thin per-OS launcher only.**

### Injection mechanism: primary + pre-designed fallback

Two mechanisms are proven-available (see findings §5). We design for both and let a one-time launch test pick the default:

| | **A — `NODE_OPTIONS` preload + `insertCSS()`** | **B — Loopback CDP injection** |
|---|---|---|
| How | Launcher sets `NODE_OPTIONS=--require <preload.js>`; preload runs in main process, calls the official `webContents.insertCSS()` on each window | Launch Codex with a debug port bound to `127.0.0.1`; attach over CDP; inject a `<style>` / stylesheet |
| Security posture | ✅ **No open port.** Our small audited script runs in main process using an official API | ⚠️ Debug port open for the session — any *same-user* local process could attach while open |
| Proven on Codex? | Fuse-verified available; not yet runtime-tested here | ✅ Yes — the whole community uses it |
| Blast radius | Main process (must keep our code tiny + audited) | Renderer only (can't touch privileged surfaces) |
| Cross-platform | Identical Node on both OSes | Identical Node on both OSes |

**Recommendation:** **Primary = A (`NODE_OPTIONS` + `insertCSS`)** because it opens no debug port (cleaner security story, no trust-boundary caveat to warn your friend about) and uses an official Electron API. **Fallback = B (CDP loopback)**, which is community-proven on Codex and independent of the fuse config. **Gate 0 of Phase 3** is a controlled launch test to confirm A actually works on the MSIX process (the one untested assumption); if it doesn't, we ship B. Both are designed for; this is not a fork, it's a tested default with a ready alternative.

> This is the one genuinely user-owned call — see §12 for the security tradeoff framed in plain language.

## 2. Installation strategy

**The unavoidable UX cost, stated upfront:** because there is no official skin hook, **Codex must be launched via Captain's Cabin** to be themed. Launch it from the normal icon → you get the stock look. This is inherent to *every* non-asar approach (it's what the whole community does too). We make it as invisible as possible:

- **Windows:** installer places a "Codex (Captain's Cabin)" Start-menu shortcut + optional desktop shortcut that runs the launcher. Optional convenience: offer to repoint the user's existing taskbar pin. The launcher resolves the MSIX exe via `Get-AppxPackage` (version-independent), so Store updates don't break it.
- **macOS:** a small `.app` wrapper (or shell script + `.command`) that launches Codex's `.app` with the injector. Placed in `/Applications`. May trigger a first-run Gatekeeper prompt for the wrapper itself (not for Codex).
- **Both:** an `apply` / `restore` / `verify` CLI under the hood for power users and for our own testing.

**No elevation required** on Windows (we never write to protected dirs). **No re-signing** on macOS (we never modify Codex's bundle).

## 3. Project folder structure

```
Codexterity/
├─ docs/
│  ├─ research/        # evidence (phase1-research-findings.md)
│  ├─ specs/           # living specs (ui inventory, asset manifest, css architecture)
│  ├─ plans/           # this file + future milestone plans
│  ├─ DECISIONS.md     # settled D-0001-n decisions
│  └─ ENGINEERING.md   # shared engineering rules (for Claude + Codex agents)
├─ themes/
│  └─ captains-cabin/
│     ├─ manifest.json         # name, version, author, target app + version range, landmarks
│     ├─ theme.css             # the payload: variable overrides + named-hook rules
│     ├─ syntax.json           # code-editor palette
│     ├─ assets/               # textures/fonts (embedded as vars at build)
│     └─ preview/              # screenshots for the eventual gallery
├─ injector/                   # SHARED core (Node)
│  ├─ core/                    # inject via insertCSS AND/OR CDP; landmark verify; restore
│  ├─ theme-loader/            # parse/validate a theme package, embed assets → CSS vars
│  └─ cli.js                   # apply / restore / verify / list
├─ launcher/
│  ├─ windows/                 # PowerShell/exe launcher; MSIX exe resolver
│  └─ macos/                   # shell/.app wrapper
├─ packaging/
│  ├─ windows/                 # installer (see §9)
│  └─ macos/                   # .dmg / pkg tooling
├─ tools/                      # asset-build scripts (texture tiling, asset→var embedding)
└─ tests/                      # theme validation, landmark checks, contrast checks
```

**Modularity for future themes:** `themes/<name>/` is a drop-in package; the injector is theme-agnostic. Adding "Observatory" or "Submarine" later = a new folder, no injector changes. This is why the theme format is a *package with a manifest*, not hardcoded CSS.

## 4. CSS architecture recommendation

Full detail in [`docs/specs/css-architecture.md`](../specs/css-architecture.md). Essence:

1. **Layer 1 — Token overrides (does 80% of the work).** ✅ *Built in Phase 2.* A block scoped to `.electron-dark` (and `.electron-light`) redefining the semantic `--color-*`, `--radius-*` variables to the Captain's Cabin palette. Because Codex's Tailwind utilities (`bg-token-*`, `text-token-*`) consume these variables, one override cascades everywhere — including future UI.
2. **Layer 2 — Named-hook rules.** ✅ *Shipped 2026-08-01 (D-0001-10), scope narrowed.* `::selection`, `scrollbar-color`, plus three real Tier-2 landmarks — `app-header-tint`, `popupContent`, `app-shell-main-content-top-fade`. Lives in `tools/palette/emit-theme.mjs`, not `theme.css` (see [`css-architecture.md`](../specs/css-architecture.md)). The mockup's other chrome flourishes have no confirmed landmark and wait for Gate 0.
3. **Layer 3 — Shape & typography.** ✅ *Built in Phase 2.* Tighter `--radius-*`, plus Fraunces and Monaspace Xenon. **Formerly "Texture/atmosphere"** — surface textures were cut (D-0001-6); there are no `--cc-texture-*` variables.
4. **Layer 4 — Syntax palette.** ✅ *Authored in Phase 2* as `--cc-syntax-*` vars plus `syntax.json`. Which one the editor consumes is a Phase 3 question.

**Rules:** never target hash-suffixed filenames; never rely on deep child chains; every structural selector is a declared landmark with graceful degradation; every text/surface pair passes WCAG AA. Authoring uses a real `.css` file (with a hot-reload dev loop via a file-watcher in the injector), compiled/inlined into the package at build.

## 5. Packaging strategy

**Theme package format** (aligned with the community convention so Captain's Cabin is portable and future-marketplace-friendly, but *our own* clean implementation):

```
captains-cabin.ccskin   (a zip)
├─ manifest.json    # {name, version, author, license, targetApp, targetVersionRange, landmarks[], assets[]}
├─ theme.css        # validated against a safe-CSS allowlist at load
├─ syntax.json
└─ assets/*.webp|woff2
```

- **Manifest declares target version range + required landmarks** → the injector can warn "this theme was built for Codex 26.x, you're on 27.x" instead of silently misbehaving.
- **Safe-CSS validation** at load (no `@import` of remote URLs, no `url()` to non-embedded resources) — abuse resistance + a clear "we never phone home" guarantee.
- **Size caps** (≤32 MiB) for fast injection.

**Distribution package** (what your friend downloads): a signed installer per OS (see §9) bundling the injector + launcher + the `captains-cabin.ccskin` theme.

### Phase 4 — milestones (added 2026-08-02, when Phase 3 closed)

Ordered so that **every milestone is verifiable on Windows**, per the D-0001-16 amendment: the
macOS installer is an artifact we produce and hand over, and nothing here waits on anyone running
it. `cdx` is the CLI name (D-0001-5).

- **M1 — theme-loader + safe-CSS validation** ✅ **DONE 2026-08-02.** `injector/theme-loader/`
  loads a theme from a directory *or* a `.ccskin` zip, validates `manifest.json` strictly
  (unknown keys are errors), enforces the safe-CSS allowlist and the **32 MiB** cap. The repo's
  **first test harness** landed with it — `npm test`, `node:test`, **zero dependencies**, 73/73
  green. Three decisions came out of it:
  - **D-0001-20** — zip I/O is in-repo on `node:zlib`; no third-party dependency ever, because
    this code runs inside Codex's own main process and because a general-purpose unzip library
    cannot enforce the cap *during* inflation (zip-bomb resistance).
  - **D-0001-21** — `manifest.json` is **generated** by `emit-theme.mjs`, with each declared
    landmark carrying a build-time `probe` asserted against the emitted stylesheet, so a renamed
    rule fails the build instead of shipping a manifest that lies.
  - **D-0001-22** — the safe-CSS scanner resolves CSS escapes when matching identifiers. The
    first implementation matched raw bytes, and that was **measured in a live Chromium engine to
    be a working bypass of both of D-0001-4's prohibitions**: `\75\72\6C("https://…")` fetches,
    and `@\69 mport` parses as a real `CSSImportRule`.

  Not claimed: this is the only Phase 4 milestone a unit test can honestly close, and a green
  run says nothing about how the theme looks.
- **M2 — `.ccskin` packer + the real package.** Zip `manifest.json` + `theme.css` + `syntax.json`
  + assets into `captains-cabin.ccskin`, and produce it for the actual theme. `theme.css` is
  **generated** (`tools/palette/emit-theme.mjs`), so the packer consumes the emitter's output and
  never edits it. Round-trip check: pack → load → validate → byte-compare.

  Four things settled when M1 closed, so M2 does not have to guess at them:

  - **What goes in the package is `manifest.json`'s `assets[]`, and nothing else.** Do **not**
    zip the `themes/captains-cabin/` directory wholesale. `assets/fonts/` holds five faces this
    theme does not use — the losing typography candidates and the superseded Monaspace Xenon —
    kept as the record of D-0001-7. The emitter already derives the real list (D-0001-21); the
    packer reads it. Measured payload today: `theme.css` 475,958 B plus 7 declared assets =
    **~0.78 MiB**, against the 32 MiB cap. The three OFL licence texts are in that list and are
    **not optional** — SIL OFL 1.1 requires the licence to accompany the font, and the fonts
    travel inside `theme.css` as data URIs.
  - **The writer lives at `injector/theme-loader/zip-write.js`, CommonJS, beside the reader**, so
    the container format has one home rather than two implementations that can disagree. It is
    subject to D-0001-20 — `node:zlib` only, no dependency. Reuse the exported `crc32` from
    `zip.js`; do not write a second one. The packer script itself is `tools/pack-ccskin.js`
    (CJS, not `.mjs`, so the round-trip test can plain-`require` both halves).
  - **Output goes to `dist/captains-cabin.ccskin`.** Both `dist/` and `*.ccskin` are already in
    `.gitignore` — the package is build output, reproducible from the repo by
    `node tools/pack-ccskin.js`. **Do not commit the binary and do not "fix" the gitignore.**
    M4's installer bundles the built artifact.
  - **The zip must be byte-reproducible**: fixed mtime (use the DOS epoch, 1980-01-01), fixed
    entry order, no OS-dependent external attributes. Otherwise "pack → load → byte-compare"
    compares a moving target, and M4 cannot tell a real change from a rebuild.
- **M3 — `cdx` CLI** (`injector/cli.js`): `apply` / `restore` / `verify` / `list`. **Gate:
  a clean apply/restore round-trip leaving nothing residual.** `restore` must return Codex to
  the stock look with the injector detached — that is D-0001-3's user-facing promise, and it is
  verified by launching the app, not by a green test.
- **M4 — installers.** Windows first (portable folder + `install.ps1`, or a signed exe if a cert
  exists) and verified on this machine. Then the macOS `.dmg`/wrapper `.app`, **built, documented
  as unverified, and handed over** — see the D-0001-16 amendment before touching it.

**Do not re-derive anything Phase 3 settled.** The theme is finished and owner-verified; Phase 4
packages it and must not change a single token value. `node tools/palette/audit.mjs` must stay
**272/272**.

## 6. Platform compatibility

See findings §12. One runtime-injection strategy on both OSes; only the launcher + installer are per-OS. Estimated <10% platform-specific code. A Mac verification pass would confirm DOM parity and that the wrapper launches Codex's `.app` with injection — but it is **no longer a required gate**. Per the D-0001-16 amendment (2026-08-02) the macOS installer is handed to a collaborator whose participation is optional, so **macOS may never be verified and that is an accepted outcome.** The three macOS unknowns stay open and loud; `launcher/macos/launch.sh` ships unverified and says so.

## 7. Customizable UI inventory

See [`docs/specs/customizable-ui-inventory.md`](../specs/customizable-ui-inventory.md).

## 8. Required assets

See [`docs/specs/asset-manifest.md`](../specs/asset-manifest.md). **Outcome of Phase 2: two OFL fonts, and nothing else.** All tiling textures were cut (D-0001-6). **Phase 3 (2026-08-01) added the empty-state hero** — `hero-empty-state.webp`, 1600×900, 121 KB (D-0001-9) — the theme's only raster asset. The compass-rose crest remains optional and unbuilt. The `.ccskin` is now text, two woff2 files, and one webp, which still sits comfortably under the 32 MiB cap in §5.

## 9. Packaging / installer strategy per OS

| | Windows | macOS |
|---|---|---|
| Format | Signed `.exe`/MSI (or a portable folder + `install.ps1`) | `.dmg` containing the wrapper `.app` |
| Places | Start-menu + optional desktop shortcut → launcher | Drag wrapper to `/Applications` |
| Signing | Code-sign the launcher/installer if a cert is available; unsigned = SmartScreen warning (acceptable for a friend-shared tool, documented) | Ad-hoc sign the *wrapper* (never Codex); first-run Gatekeeper prompt expected & documented |
| Update of the *theme* | Re-run installer or `apply` a new `.ccskin` | Same |
| **Never** | modify/patch/re-sign Codex itself | modify/patch/re-sign Codex itself |

## 10. Risk assessment

See findings §11 for the full table. The three that shape the plan:
- **Recurring Store updates** → launcher resolves the app dynamically; injector is version-tolerant. **Designed around.**
- **Token/DOM refactor by OpenAI** → token-first + landmark-verify + graceful degradation; never break the app. **Mitigated.**
- **Fuse hardening by OpenAI** → CDP fallback is independent. **Mitigated.**

Residual accepted risk: a major OpenAI UI overhaul will need a theme refresh (recolour, not rebuild). This is inherent to skinning any app and is cheap given the token architecture.

## 11. Development roadmap

| Phase | Goal | Key gate |
|---|---|---|
| **1. Research & Architecture** *(this doc)* | Understand + decide | **Your sign-off on §12** |
| **2. Palette, Type & Assets** ✅ **COMPLETE** | Lock ground + palette (exact hex, both modes); pick + licence fonts; author syntax palette; decide the asset set | ✅ Approved by owner from a rendered mockup (swatch board + restyled Codex UI, three grounds, both modes, both pairings). 152/152 WCAG AA. Textures cut; no raster assets |
| **3. CSS & Theme Dev** ✅ **COMPLETE 2026-08-02** | Hero embedded; character pass shipped; Gate 0 run; inventory rebuilt from the running app; every surface measured in **both modes** — menus, empty state, composer, sidebar, code blocks, diffs, terminals | ✅ Theme verified in the running Codex by the owner. Last item closed as **D-0001-19** (the xterm terminal). **Dialogs** are the only surface never observed — Codex may simply not have one |
| **4. Packaging** | `.ccskin` format + injector CLI (apply/restore/verify) + safe-CSS validation | Clean apply/restore round-trip; nothing residual |
| **5. Windows Installer** | Launcher + MSIX exe resolver + installer + shortcuts | Fresh-machine install works; survives a simulated app-version bump |
| **6. macOS Installer** | Wrapper `.app` + `.dmg`, handed to the collaborator | **Installer built, and its unverified status documented.** *(Gate CHANGED 2026-08-02 — see the D-0001-16 amendment. It was "friend confirms theme applies on macOS"; no milestone may depend on another person's willingness to run it. The collaborator may never install it, and that is an accepted outcome, not an open task.)* |
| **7. Testing & Release** | Cross-platform QA, update-resilience test, docs, release | Both platforms green; restore verified |

**Model economy:** I orchestrate + QA; Sonnet subagents do scripting/asset/CSS grunt work (max 2 in flight, non-overlapping). Browser/real-app verification is mine and yours — subagent self-reports don't count as "done."

## 12. Recommendations before implementation — and the one decision I need from you

**My firm recommendations:**
1. **Build our own lightweight injector; do not depend on any existing project.** The ecosystem shows the technique is sound but the mature repos carry star-inflation/SEO-farm red flags and we'd be running unaudited code against your dev environment. Our own ~few-hundred-line injector is auditable, does exactly what we want, and aligns with the proven convention. **This directly answers your "don't depend on an existing project unless compelling" brief: there is no compelling reason to depend, and good reasons not to.**
2. **Token-first styling** is the single highest-leverage decision — it's what makes this maintainable instead of a treadmill.
3. **Non-destructive by construction** — never touch app files, auth, or config on either OS. This keeps us safe, legal, and un-brickable.
4. **Design the fallback now** (CDP) even though we'll default to `NODE_OPTIONS` — cheap insurance against fuse hardening.

**The decision that's genuinely yours** (it's a values call, not an engineering one) — see the question I'll ask alongside this doc: the **primary injection mechanism**, because the two options trade off differently on the "is a debug port open" security question vs the "our code runs in the app's main process" question. I recommend `NODE_OPTIONS`, but you should pick with the tradeoff in front of you.

---

### Decisions (see [`docs/DECISIONS.md`](../DECISIONS.md))
- **D-0001-1** — Injection: build our own; primary = `NODE_OPTIONS`+`insertCSS` (no open port), fallback = CDP loopback. ✅ **Accepted 2026-07-31.**
- **D-0001-2** — Styling: token-first override of `--color-*` on `.electron-dark`/`.electron-light`. *(pending full sign-off)*
- **D-0001-3** — Non-destructive: never modify/patch/re-sign Codex; never touch auth/config. *(pending)*
- **D-0001-4** — Theme package: `.ccskin` = manifest + validated CSS + syntax + embedded assets. *(pending)*
