# Codexterity — Settled Decisions

Owner decisions that any coding agent (Claude Code, Codex, or otherwise) must respect and must not re-litigate.

**Why this file exists.** Agent memory stores are per-tool and per-machine. When one agent settles something and records it only in its own memory, the next agent cannot see it and will re-propose work already done or declined. This file is in git, so every agent reads the same truth.

**How this file relates to code markers.** Decisions attached to specific behaviour are marked `D-<plan>-<n>` in the code they govern (see "Settled Decisions" in `docs/ENGINEERING.md`). Those get **one line here plus a pointer**. Decisions with **no single code home** keep their full reasoning here.

**How to use it.** Read before proposing changes to the injection mechanism, the styling strategy, or anything marked CLOSED. Append when a session settles something durable. **Never delete an entry** — supersede it, and mark the old one SUPERSEDED with the reason.

---

## Decisions anchored in code

One line each. Once the governed code exists, its `D-` marker is authoritative and the reasoning lives at the anchor.

> **`D-0001-31` is deliberately absent here and is RESERVED**, not lost: [Plan 0002 M4](plans/0002-phase-7-qa-docs-release.md) allocates it in advance to the `targetVersionRange` ruling it will stamp. D-0001-32 was settled first, during M3, and took the next free number rather than the reserved one. **Do not renumber either.** **Every decision below is now anchored in real, shipped code** — the injector core, the palette tooling, the emitted theme, and (from Phase 4 M1) the theme loader. Grep the anchor before proposing a change to the behaviour it governs.

| ID | Ruling | Reasoning lives in |
|---|---|---|
| **D-0001-1** | **Injection mechanism.** Build our own injector (no dependency on existing projects). Primary = `NODE_OPTIONS=--require <preload>` running an official Electron main-process API — **no debug port ever opened**. **AMENDED 2026-08-01: the API is `webContents.executeJavaScript` appending one `<style>` element, not `insertCSS()`** — see the amendment below. Fallback (built, not default) = loopback CDP injection, **not needed**. | [`injector/core/inject.js`](../injector/core/inject.js) · [Plan 0001 §1](plans/0001-captains-cabin-architecture.md) · [gate0-findings §2](research/gate0-findings.md) |
| **D-0001-2** | **Styling strategy.** Token-first: override semantic `--color-*` / `--radius-*` / `--shadow-*` on `.electron-dark` / `.electron-light`. Structural selectors only as declared, verified landmarks with graceful degradation. | `themes/*/theme.css` (marker at build) · [Plan 0001 §4](plans/0001-captains-cabin-architecture.md) |
| **D-0001-3** | **Non-destructive by construction.** Never modify, patch, or re-sign Codex's files on any OS. The injector structurally cannot read/write `auth.json`, `.credentials.json`, or API keys. Worst case = stock look; never brick. | `injector/` + `launcher/` (marker at build) · [Plan 0001 §1](plans/0001-captains-cabin-architecture.md) |
| **D-0001-4** | **Theme package format.** `.ccskin` = zip of `manifest.json` (target app + version range + landmarks) + safe-CSS-validated `theme.css` + `syntax.json` + embedded assets. Size-capped; no remote references. | `injector/theme-loader/` (marker at build) · [Plan 0001 §5](plans/0001-captains-cabin-architecture.md) |
| **D-0001-6** | **Surfaces are flat token colour.** No tiling texture, no gradient wash, no image behind content. Contrast figures are computed against flat colour; luminance variation behind text makes the worst pixel governing rather than the average. Depth comes from the surface ramp and borders. | [`themes/captains-cabin/theme.css`](../themes/captains-cabin/theme.css) (marker in file header) |
| **D-0001-9** | **Hero artwork: `hero-empty-state.webp`, shipped ungraded except for a highlight rolloff.** The generated lamp core clipped at luminance 0.935 — effectively blown white in a deliberately low-key image — and is rolled off to 0.530. Nothing else is altered. A brass re-tint toward `#C0A454` was built, rendered and **rejected on sight**; see D-0001-8. | [`themes/captains-cabin/assets/`](../themes/captains-cabin/assets/) · [`asset-manifest.md`](specs/asset-manifest.md) |
| **D-0001-10** | **Layer 2 "character pass" is approved and shipped.** Chrome-only decoration: brass selection, thin brass scrollbars, a brass hairline on `.app-header-tint`, depth + lit edge on `.popupContent`, and the scroll fade resolved to our ground. Scoped to chrome so D-0001-6 and the contrast proof are untouched. | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker in the Layer 2 block) |
| **D-0001-11** | **Accent policy for Codex's five stock hues.** The two DECORATIVE accents (`--color-accent-blue` = link/mention, `--color-accent-purple` = discovery) collapse into brass, per the design floor's one-accent rule. The three SEMANTIC status hues (`--color-accent-green` / `-red` / `-orange`) stay DISTINCT and are re-derived into this theme's palette instead — an error that looks identical to a success is a readability failure, and readability outranks aesthetics. Decided by the owner 2026-08-01 from the measured accent trace. **Do not "finish the job" by collapsing the status hues too.** | [`tools/palette/palette-engine.mjs`](../tools/palette/palette-engine.mjs) (marker on `deriveChrome`) · [findings §3](research/phase3-inventory-findings.md) |
| **D-0001-12** | **Every token declaration in `theme.css` is `!important`, and must be.** Codex writes 67 custom properties as an inline style on `<html>` shortly after boot; 47 collide with this theme's. Inline beats any non-important author rule, so without this the theme applies at `dom-ready` and is silently reverted — measured. This is the author-origin cost of D-0001-1's amendment (a user-origin sheet would win without it, but `insertCSS` is broken here). Safe in scope: these are property *definitions*, so nothing is forced on the properties that read them. | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker in the generated header) · [findings §1.1](research/phase3-inventory-findings.md) |
| **D-0001-13** | **The theme PAINTS the sidebar; no token override can.** Measured 2026-08-02 in the running app in confirmed light mode: every ancestor of `.app-shell-left-panel` up to `<html>` is `rgba(0,0,0,0)`. Codex's own sidebar rule is gated `:not([data-codex-window-chrome=application-menu])`, and the Windows main window carries exactly that attribute — so Codex deliberately leaves the panel transparent and lets Windows 11 Mica show through. The owner's "pale mint-green sidebar" was **the desktop wallpaper** (sampled `#E6F9F6` / `#B7C5C6` / `#EAF7F3` down its length — not one colour, so not a token). Fixed with a real `background` declaration on the authored `.app-shell-left-panel` landmark. This is a **contrast** fix: D-0001-6 computes every figure against flat colour, and sidebar text sat over an arbitrary user wallpaper, making its contrast not merely unproven but unprovable. **Do not "restore" the translucent look** — it voids the contrast proof. | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker on the landmark block) · [findings §2.1](research/phase3-inventory-findings.md) |
| **D-0001-14** | **Active sidebar row carries a brass left-edge mark, hooked on TWO independent selectors.** `[data-app-action-sidebar-thread-active="true"]` (Codex's own authored app-action contract name) **and** `[aria-current="page"]` (the web standard), both measured on a real conversation screen (28 rows, exactly one active). Both are matched deliberately: they fail independently, so renaming either leaves the indicator working, and if both go the row keeps Codex's own highlight — a single hook would be one rename from silent removal, which is how the four pre-Gate-0 landmarks died. This is the *only* part of the Phase 2 sidebar mockup theming can deliver; that mockup drew a brass primary button, brass-bordered cards and a brass-railed list, **none of which Codex has**. It is a palette study, not a target — **do not re-attempt to reproduce it.** Verified matched, computed AND painted (32 px at x=8–9). | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker on the block) |
| **D-0001-15** | **The empty-state card hairlines and the composer send control get NO landmark — deliberately.** Both were carried as approved-but-unbuilt (Plan 0001 item 11) on the assumption they needed one. Measured 2026-08-02: neither does. (a) On Electron the cards' `border` is **zeroed** and replaced by `electron:ring-[0.5px] electron:ring-token-border-heavy` — a **box-shadow, not a border**, computed width `0 0 0 0`. It resolves to **`--color-border-heavy`**, a stage-1 token this theme already defines. Any rule written against `border-color` would have applied cleanly and painted nothing, which is exactly how the four pre-Gate-0 landmarks died. (b) The send control and the voice control are **one element** whose `aria-label` flips; it is painted by `bg-token-foreground` → **`--color-text-foreground`**, also already defined — and that token is the app's main text colour, so it *cannot* be retargeted at the button alone. Both verified **painted** in the running app in dark: ring `#5F6675` on card `#0E141F` (3.20:1, AA non-text), disc `#F4EAD4` with glyph `#222731` (12.52:1). **Do not add a selector for either.** The verification lives in the settled check instead. | [`injector/core/inject.js`](../injector/core/inject.js) (markers on the `cardHairline` and `composerAction` checks) · [findings §8](research/phase3-inventory-findings.md) |
| **D-0001-18** | **Tokens Codex sets on `<body>` must be re-declared on `<body>`; `!important` on `<html>` cannot win.** Custom properties **inherit**, so a value set on a *closer ancestor* governs every descendant regardless of specificity — this is not a specificity contest and no `!important` on the root can take it. Measured in the probe corpus: `:is([data-codex-window-type=browser],[…=chrome-extension],[…=electron]) body { --vscode-editor-font-family: ui-monospace, … }`. Consequence, measured in the running app: **the diff and terminal panels rendered in Consolas**, so D-0001-7's code face was missing from the surface most made of code while every colour around it was correctly themed. Fixed with a `.electron-dark body, .electron-light body` block. **Same shape as D-0001-12 one level down** — that decision handled Codex writing tokens inline on `<html>` and nobody checked `<body>`. A corpus sweep finds Codex sets **17** custom properties on body, of which exactly **2** collide with this theme; the other, `--color-background-elevated-primary`, is benign (it re-points our token to our own `-opaque` token, which the emitter always gives the same value, and its rule is gated on `.electron-opaque`, which this window does not carry). Verified by reproducing the conflict in a browser: before = `ui-monospace`, after = `Monaspace Neon`, and a control proving `!important` on `<html>` still loses. **Before adding any token, check whether Codex also sets it on body.** **VERIFIED IN THE RUNNING APP 2026-08-02** — `--vscode-editor-font-family` reads `'Monaspace Neon'` on **both** `<html>` and `<body>`, so the block wins and the decision stands. **But its stated CONSEQUENCE is CORRECTED: capturing this token does NOT fix the diff/terminal panels.** Measured on one screen: the **diff renders `Monaspace Neon`** (and is the only mono face present), while the **475x1280 terminal-class side panel still computes `ui-monospace`** — it sees `'Monaspace Neon'` in the variable, carries no inline style, and does not read the variable at all. The panel is a **separate, still-open defect**; the ruling above governs the token only. See [findings §8.6.2](research/phase3-inventory-findings.md). | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker on the body block) · [findings §8.6.1](research/phase3-inventory-findings.md), [§8.6.2](research/phase3-inventory-findings.md) |
| **D-0001-19** | **The terminal is xterm.js and needs a LANDMARK — no token can ever reach it.** Measured 2026-08-02, three identical samples: the panel is `class="xterm-rows"`, `fontOrigin` is the element itself, `inline=none`, and **both** `--vscode-editor-font-family` **and** `--default-mono-font-family` already resolve to `'Monaspace Neon'` *at that element* — which painted `ui-monospace` (Consolas) anyway. xterm.js takes `fontFamily` from a **JavaScript options object** and writes a literal stack into a stylesheet it generates at runtime, so it reads neither variable. **D-0001-18 captured the token at every level and structurally could not reach this surface**: a captured token is not a consumed token. The rule targets `.xterm`, `.xterm-rows` **and `.xterm-char-measure-element`** — the last is **load-bearing and must not be dropped**: xterm's DOM renderer sizes its cell grid by measuring that element, so styling the rows alone would make it measure Consolas while painting Monaspace, desynchronising the grid (misplaced cursor, offset selection). Metric-compatibility is not available — Monaspace and Consolas differ. Hooks are xterm's own public class names, not Codex build hashes; if xterm is replaced the rule stops matching and the terminal returns to its stock face. **Only possible because Codex runs xterm's DOM renderer** (`xterm-dom-renderer-owner-1`) — under the canvas/WebGL renderer glyphs are rasterized from the JS font and no CSS could touch it. **Verified in the running app:** `rows="Monaspace Neon" measureElement="Monaspace Neon" => COHERENT`, region `font="Monaspace Neon"` at **12.83:1**, and the owner confirmed metrics by printing 400 chars — 6 flush rows + 4 remainder, i.e. wrap column exactly 66, with cursor and selection landing on the glyphs. | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker on the xterm block) · [`injector/core/inject.js`](../injector/core/inject.js) (marker on the xterm coherence check) · [findings §8.6.2](research/phase3-inventory-findings.md) |
| **D-0001-17** | **Row hover/press are anchored to the SIDEBAR, and LIFT in both modes.** They were a fraction of the ramp measured from the *ground* until 2026-08-02. Because the sidebar sits below the ground in both modes, that made dark's hover move away from it (ΔL 0.0574) and light's move toward it (**0.0122** — invisible; the owner reported it in the running app and it measured 4.7× weaker than dark). Same formula, opposite outcome, decided purely by ramp direction. Now `surf(SIDEBAR_DL + ROW_HOVER_DL)` with a **positive** direction in both modes: a hovered row *lifts*, which is what dark always did. Light lands at ΔL **0.0600** against dark's 0.0574 — symmetric by construction. **Chosen over an equally-sized DARKEN because lifting stays inside the existing ramp**, so it costs **zero** other palette changes and *raises* contrast (meta on hover 4.96 → **6.17**, body 11.80 → **14.67**) instead of spending it; darkening pushed the row past the ramp and, per `deriveChrome`'s guard, would have forced 9 ink tokens to re-solve. Owner chose lift from a render, 2026-08-02. **Do not re-derive row states from the ground.** | [`tools/palette/palette-engine.mjs`](../tools/palette/palette-engine.mjs) (marker on the row hover/press block) · [findings §8.5.2](research/phase3-inventory-findings.md) |
| **D-0001-20** | **`.ccskin` zip I/O is implemented in-repo on `node:zlib`. No third-party dependency, ever — the repo has `package.json` with an empty dependency list and it stays that way.** Two reasons, in order of weight. (1) **Trust boundary:** this module is loaded into *Codex's own Electron main process* (D-0001-1), so a dependency here is third-party code shipped into someone else's application process, inside a project whose central promise (D-0001-3) is that it is non-destructive *by construction*. A small audited surface is the mechanism, not a preference. (2) **The defences a general-purpose unzip library cannot give us**, because it does not know this project's rules: rejecting path traversal and absolute entry names through the one shared guard both source kinds route through, rejecting unsupported compression methods by name, capping entry count, **refusing symlink entries and duplicate entry names** (two `manifest.json` entries would otherwise let an archive show the validator one file and a later consumer another — resolved by refusal, not by a last-one-wins rule some other tool may not share), and — the load-bearing one — enforcing the **32 MiB** cap *during* inflation via `zlib`'s `maxOutputLength` rather than on a fully-materialised result, which is what makes a zip bomb abort partway instead of after allocating.

  **A bug this owning-the-parser caught, that a library would have hidden:** the upper 16 bits of a zip entry's external attributes mean *two different things* — DOS file attributes (`0x10` = directory) on a DOS/NTFS-made archive, and a Unix `st_mode` on a Unix-made one. Testing `0x10` unconditionally misreads mode `0755` (`0x81ED`), whose group-execute bit sits in exactly that position, as a **directory** — so every executable-mode entry is **silently skipped**, with no error and no symptom until something reports a manifest-declared file inexplicably absent. It would have landed the first time a `.ccskin` was built on macOS or Linux, i.e. on the collaborator's machine in Phase 4 M4, which is the worst place to discover it. Read `S_IFDIR` for Unix, the DOS bit for DOS. A zip of stored/deflated entries is directly readable with `inflateRawSync`; the only thing Node lacks is CRC-32, which is ~15 lines. The central directory is authoritative for sizes and CRCs — local headers are consulted **only** to locate where an entry's data begins. Zip64 is rejected explicitly rather than misread. | [`injector/theme-loader/zip.js`](../injector/theme-loader/zip.js) (marker in the file header) |
| **D-0001-21** | **`manifest.json` is GENERATED by `emit-theme.mjs`, never hand-written.** D-0001-4 gives the manifest two jobs that are *facts about the emitted CSS* rather than package metadata: the declared structural landmarks, and the assets whose bytes the CSS embeds. A hand-maintained copy of either drifts the moment a rule is edited and the manifest is not — and drift here is uniquely bad, because a stale landmark list makes the injector's verification report a landmark healthy when the rule that needed it is gone. That is precisely the silent-success failure that killed the four pre-Gate-0 landmarks. So the emitter, the only thing that knows what it just wrote, writes the manifest too, and **every landmark carries a `probe`: an exact substring of the generated stylesheet, asserted at build time.** Rename or delete a rule without updating the list and the build *fails* instead of shipping a manifest that describes a stylesheet that no longer exists. Same reason `assets[]` is derived from the emitter's own font list rather than from a directory listing — `assets/fonts/` also holds five faces this theme does **not** use (the losing typography candidates plus the superseded Monaspace Xenon), which are kept as the record of D-0001-7 and must never reach a `.ccskin`. | [`tools/palette/emit-theme.mjs`](../tools/palette/emit-theme.mjs) (marker on the manifest block) |
| **D-0001-22** | **The safe-CSS scanner resolves CSS escapes when matching identifiers, because the engine does. Matching raw bytes instead is a VERIFIED bypass of both of D-0001-4's prohibitions — do not "simplify" it back.** Measured 2026-08-02 in a live Chromium engine, not read off a spec: `\75\72\6C("https://…")` computes to `url("https://example.com/b.png")`; the partially-escaped `\75 rl("https://…")` does the same; and `@\69 mport url("https://…")` parses into a real `CSSImportRule`. Per CSS Syntax §4.3.4 the engine resolves escapes while *consuming* an ident-like token and only then compares it to `url`, so a scanner comparing undecoded bytes reports a file clean while the engine fetches from the network — the worst failure mode available to a validator. The fix is at the root: ident reading is escape-aware, exactly as the engine is, so scanner and engine cannot disagree. **The blunt alternative — rejecting any CSS containing a backslash — is wrong and was rejected:** this theme's own hero landmark is `.\[container-name\:home-main-content\]:has(.heading-xl)`, and escapes in a *selector* are legitimate. | [`injector/theme-loader/safe-css.js`](../injector/theme-loader/safe-css.js) (marker on the ident reader) |
| **D-0001-23** | **The `.ccskin` writer is byte-reproducible BY CONSTRUCTION, and its 32-bit size/offset fields are range-CHECKED, never masked.** Two rulings in one, both about fields a normal zip writer is free to vary. **(a) Everything that could vary is pinned:** entry mtime to the DOS epoch (1980-01-01), "version made by" to MS-DOS with external attributes `0x00000000`, the UTF-8 name flag only when a name actually needs it, entry order taken from the caller and never sorted, and zlib's `level`/`memLevel`/`strategy` all three set explicitly. The zlib parameters matter for the same reason as the timestamp and are pinned together: the promise is byte-identical output **across machines and Node versions**, not merely across two runs on this one, and an implicit default is exactly the value that is stable today and silently different after an upgrade. Without this, "pack → load → byte-compare" compares a moving target and M4 cannot distinguish a real change from a rebuild. **(b) A bug found in review, which must not be reintroduced:** the first implementation wrote the size and local-header-offset fields as `writeUInt32LE(value >>> 0)`. `Buffer.writeUInt32LE` **throws** above `0xFFFFFFFF`; `>>> 0` **truncates**, so the mask converted a loud failure into a structurally valid archive whose central directory points at the wrong bytes — silent corruption, the failure mode `docs/ENGINEERING.md`'s "fail loudly" rule exists to prevent. Those fields are never products of a signed `<<`, so the mask bought nothing. `>>> 0` **is** correct where a composed value comes from a signed shift (see the external-attributes line in `tests/theme-loader/zip.test.js`), which is exactly why it looks harmless here — **do not "make it consistent" by adding it back.** The writer now refuses the Zip64 boundary explicitly, matching `zip.js`, which refuses to read Zip64 by name rather than misread a truncated value. **Verified against an independent parser:** .NET `System.IO.Compression.ZipFile` opens the real 681,124-byte package, lists all 10 entries at their correct sizes, reports every mtime as 1980-01-01 00:00:00, and inflates `theme.css` correctly — our own reader accepting our own writer proves self-consistency, not that the archive is a valid zip. | [`injector/theme-loader/zip-write.js`](../injector/theme-loader/zip-write.js) (marker in the file header) |
| **D-0001-24** | **The active theme is persisted at `~/.codexterity/state.json` — one home-relative path, no per-OS branch — and `restore` removes it and its directory.** The obvious design was `%APPDATA%\Codexterity` on Windows and `~/Library/Application Support/Codexterity` on macOS. That was **rejected**: `injector/` is platform-agnostic and the layer rule in `docs/ENGINEERING.md` reserves platform branches for `launcher/<os>/`, so a per-OS config-directory switch in the CLI would be precisely the leak that rule exists to prevent. `os.homedir()` resolves correctly on both targets with zero branching, and the `.codexterity` name mirrors Codex's own `~/.codex` rather than inventing a convention. It also satisfies **D-0001-3 structurally** — the CLI never constructs a path under `~/.codex`, so it cannot collide with or be mistaken for a tool that reads the app's credential store. **Why persisted state exists at all:** the owner's requirement is that starting themed Codex is idiot-proof (*"not some technical hobbyist way of applying a theme"*), and a desktop shortcut is a **fixed command line that cannot carry a changing argument**. So the launch entry point must be argument-free and read its theme from somewhere — that requirement, not convenience, is what forces the state file. `restore` is D-0001-3's user-facing promise and leaves **nothing residual**: it unlinks `state.json` and then `rmdir`s `.codexterity` **only if that leaves it empty** — never a recursive delete of a directory whose full contents Codexterity does not own. A **corrupt** state file is reported and then cleared rather than refused, because unremovable residue is the exact failure `restore` exists to prevent. | [`injector/cli.js`](../injector/cli.js) (marker on the state-path block) |
| **D-0001-25** | **The injector's input is `CDX_THEME_PACKAGE`, routed through `loadTheme()`; `CDX_THEME_CSS_PATH` and the hardcoded `DECLARED_LANDMARKS` are DELETED, with no fallback and no compatibility shim.** Two changes with one motive — the engine must not carry its own copy of a fact something else already generates. **(a) The loader is now unskippable.** M1 and M2 built manifest validation, the escape-resolving safe-CSS scan (D-0001-22) and the 32 MiB cap, and **nothing called any of it**: `inject.js` did `fs.readFileSync(CDX_THEME_CSS_PATH, 'utf8')` on a raw stylesheet. A validator nothing calls is documentation, not a guarantee. Routing through `loadTheme()` makes validation run before a byte of CSS reaches Codex, and makes the development theme **directory** and the shipped **`.ccskin`** travel one code path — `loadTheme` tells them apart with `statSync`, never by extension, so a packaged theme has no second, untested route. Measured cost inside Codex's main process at preload: **27 ms** for the zip, 14 ms for the directory. **(b) Landmarks come from `manifest.landmarks[]`.** There were two disagreeing lists: a Gate-0-era constant of **4** selectors in the engine and the generated manifest's **6**. A hardcoded list rots silently — that is exactly how the four pre-Gate-0 landmarks died, reporting healthy while the rules they needed were gone — whereas the generated list carries a build-time `probe` and **fails the build** when a rule is renamed (D-0001-21). It also removes a theme-specific fact from the theme-agnostic injector core, which the layer rule requires anyway. Runtime reporting distinguishes a missing `required: true` landmark (only `sidebar-panel`, D-0001-13) from an absent optional one, because five of the six exist only on certain screens and a bare "MISSING" would relitigate *"a negative result must name its query"*. **(c) The loaded theme lives in a mutable module-level slot**, not a closure-captured local threaded through `attachToWindow`. Repainting is **not** launch-bound — only *attachment* is — so a later milestone can repoint the slot and re-run `applyTheme` on live windows. **M3 builds only the slot: no change signal, no watcher, no IPC.** | [`injector/core/inject.js`](../injector/core/inject.js) (markers on the slot, the landmark builder and the loader call) |
| **D-0001-27** | **The Windows shortcut target is a compiled GUI-subsystem (`/target:winexe`) stub, never a direct `powershell.exe -File` invocation, and the launcher's log sink forks on an ENVIRONMENT variable, never a new CLI flag.** Measured on this machine by polling `EnumWindows` at ~5 ms across four variants: plain `powershell.exe -File launch.ps1` and `-WindowStyle Hidden` both left a full on-screen console window for the whole session (`-WindowStyle Hidden` cannot reach the window because Windows 11 hands the console to Windows Terminal, a SEPARATE process); a `.lnk` with `WindowStyle=7` avoided the on-screen window but left a ~100-170 ms taskbar blip and depends on a Windows Terminal default-terminal setting on the *recipient's* machine, which is not controllable; a GUI-subsystem stub produced **no on-screen window at any sample, 3/3 runs**, by construction — such a process never allocates a console at all. The stub is compiled at **build time** (`tools/build-windows-package.js`), never on a recipient's machine, because running `csc.exe` on a user's machine is itself a malware heuristic. Its command line is fixed and argument-free (`node injector/cli.js`, no args) per D-0001-24/25 — `cdx apply`/`cdx restore` change what it launches by rewriting `~/.codexterity/state.json`, never by changing the shortcut. Because a GUI-subsystem process has no console to report a failure to, a non-zero exit shows a `MessageBox` naming the failure and the tail of the launcher log — silence on failure is exactly the "fail loudly" violation `docs/ENGINEERING.md` forbids; a clean exit (0) stays silent. The log fork itself (`launch.ps1`'s `-LogFile` parameter, `cli.js`'s `CDX_LAUNCHER_LOG` env var) lives in the **environment**, not a new verb/flag, because the entry point must stay argument-free for the same reason as above — a developer terminal and the installed shortcut are told apart only by which one set `CDX_LAUNCHER_LOG`, and `launch.ps1`'s streaming-to-console behaviour is byte-for-byte unchanged when `-LogFile` is unset. | [`packaging/windows/Codexterity.cs`](../packaging/windows/Codexterity.cs) (marker in the file header) · [`launcher/windows/launch.ps1`](../launcher/windows/launch.ps1) (marker on the `-LogFile` parameter) · [`injector/cli.js`](../injector/cli.js) (marker in `cmdLaunch`) |
| **D-0001-28** | **`launch.ps1` streams Codex's output by polling .NET async Tasks, NOT with `Register-ObjectEvent` — do not "simplify" it back to an event handler.** The event-based version did not work, and the failure was **silent**: measured on this machine, a child emitting 800 lines fired the `-Action` scriptblock exactly **4 times, with zero exceptions raised**, and a slow child emitting 40 lines over 4 seconds also fired it **4 times** — so the loss is rate-independent and is not file contention. The cause is that PowerShell dispatches `-Action` handlers on the runspace's own pipeline thread, and the script then blocks that very thread in `$process.WaitForExit()`; a blocked runspace pumps no events, so the handlers never run. `Start-Sleep` does not pump them either, which is why "wait for events to drain" does not rescue it. **This defect pre-dates Phase 4** — the console streaming this launcher advertised had never actually worked — and it went unnoticed for the whole project because the injector writes its own log directly from inside Codex's process via `CDX_DEBUG_LOG_PATH`, which is what every launch was really verified against. M4 made it worth fixing rather than merely recording: the shortcut's failure dialog (D-0001-27) quotes the launcher log, so an empty log would turn a real failure into an unexplained one for the exact user least able to diagnose it. The replacement reads **both** streams with `ReadLineAsync()` and polls `IsCompleted` from the main thread — Task completion is threadpool-driven and needs no PowerShell event pumping, so nothing depends on the runspace being idle — and reads them **concurrently**, which is what avoids the classic deadlock of draining one pipe to EOF while the other fills its buffer. Verified with the same harness that exposed the bug: **800/800 and 4000/4000 lines, zero loss on either stream**, against the event version's 4/800. | [`launcher/windows/launch.ps1`](../launcher/windows/launch.ps1) (marker on the streaming loop) |
| **D-0001-29** | **The Windows install root is `%USERPROFILE%\Codexterity` and must NEVER be `%LOCALAPPDATA%` (or `%APPDATA%`) — MSIX filesystem redirection hides those paths from Codex.** `%LOCALAPPDATA%\<App>` is *the* conventional per-user, no-elevation install root, which is exactly why this needs writing down: it is the obvious choice and it silently does not work here. Codex Desktop is a packaged **MSIX** app, and MSIX redirects `%LOCALAPPDATA%`/`%APPDATA%` into the package container — a packaged process reading `%LOCALAPPDATA%\X` resolves `…\Packages\OpenAI.Codex_…\LocalCache\Local\X`, never the real user folder — so anything installed there is **invisible to Codex**. **Measured at M4's install gate, not inferred:** installed to `%LOCALAPPDATA%\Codexterity`, the shortcut launched and Codex exited **13** with `Cannot find module 'C:/Users/<u>/AppData/Local/Codexterity/injector/core/preload.js'`, while `Test-Path` on that exact file returned **True** from an ordinary process; the **identical payload** copied under `%USERPROFILE%` then launched cleanly with the injector attached (12,624-byte injector log, theme loaded, 6 landmarks). One variable changed, the outcome flipped. `%USERPROFILE%\Codexterity` keeps the property that actually mattered about `%LOCALAPPDATA%` — per-user, **no elevation** — while staying outside the redirection scope. It is deliberately **not** nested inside `~/.codexterity` (the state directory, D-0001-24) so that program and state remain siblings and `Uninstall.ps1`'s four verification checks stay independent, with no parent/child remove-ordering hazard. **This is also the milestone's standing lesson: the suite was 180/180 green while the installed product could not start at all.** A unit test cannot see a redirection boundary; only installing from the built artifact and launching it could. | [`packaging/windows/Install.ps1`](../packaging/windows/Install.ps1) (marker on the install-root block) · [`packaging/windows/Uninstall.ps1`](../packaging/windows/Uninstall.ps1) (marker on `$InstallDir`) |
| **D-0001-30** | **The shortcut sets NO `System.AppUserModel.ID`, so themed Codex shows the running indicator under CODEX's taskbar icon, not Codexterity's. This is correct — do not "fix" it.** Windows groups taskbar buttons by AppUserModelID. Codex's is fixed by MSIX package identity (`OpenAI.Codex_<hash>!App`, verified) and belongs to **the window**, so Codex's window files itself under Codex's button regardless of who launched it; our stub owns **no window at all** (`MainWindowHandle = 0`, verified — that is precisely what removes the console window, D-0001-27), so there is nothing for a separate button to attach to. **Reported by the owner as a possible defect and confirmed by them as desired behaviour (2026-08-03):** the Codexterity icon is a *launcher*, and it opens the real Codex app rather than presenting itself as a second application. The owner's own framing is the reason this is load-bearing rather than merely tolerable — *"this helps in future when we have more themes: apply the preferred theme via CLI, launch the same Codexterity icon, and it launches the personalised version in the original Codex app"* — i.e. it is the same theme-neutrality that governs the icon and name (D-0001-24: the shortcut's target is the argument-free `cdx`). **Two fixes exist and both are rejected.** (a) Setting `System.AppUserModel.ID` on the shortcut to Codex's AUMID *would* merge the pinned Codexterity button with Codex's own into one button carrying our icon and the running dot — it was offered and declined; it is a real, one-way change to how the user's taskbar behaves and is never to be applied silently. (b) Calling `app.setAppUserModelId()` from inside the injector is out of bounds regardless: **the injector's reach is styling only** (`docs/ENGINEERING.md`), and overriding the AUMID of a packaged app tends to be ignored or to break toast notifications. **Related and equally expected:** launching from Codex's *own* icon yields **stock** Codex, because `NODE_OPTIONS` is read at process start (D-0001-1) so the injector never attaches. That is the one unavoidable UX cost of having no official skin hook (Plan 0001 §2) and is inherent to every non-asar approach — not a defect to design around. | [`packaging/windows/Install.ps1`](../packaging/windows/Install.ps1) (marker on the shortcut-creation block) |
| **D-0001-32** | **After `cdx restore`, the Codexterity shortcut must LAUNCH PLAIN CODEX — not refuse.** Settled by the owner 2026-08-04 from the failure in Plan 0002 M3's round trip (F3). Measured, not inferred: with no `state.json`, the shortcut's exact command line (`node injector/cli.js`, no arguments — D-0001-24/27) exits **1** with `cdx: no theme is applied`, and because the GUI-subsystem stub owns no console (D-0001-27) that stderr line is invisible; the user gets *"Codex did not start cleanly (exit code 1). (No launcher log was found…)"* — uninformative, through no fault of the stub, because `launch.ps1` never ran so the log it truncates at startup stayed 0 bytes. **The contradiction is inside one file:** `cmdRestore` prints *"Future launches through Codexterity start stock Codex"*, `cmdLaunch` makes that false. **The owner's ruling is that the restore message is right and the refusal is the defect** — the Codexterity icon is a *launcher for Codex* (the same theme-neutrality that governs the icon, the name and the argument-free target, D-0001-24/30), so "restore" means "go back to plain", never "break the icon". **This is not a one-line fix and must not be bandaided into one:** `launch.ps1` requires `-ThemePackage` today, so a theme-less launch path does not exist yet — the launcher must be able to start Codex with **no injector attached at all**, which is also the cleanest possible expression of D-0001-3 (worst case = stock, never bricked). **Do not "fix" this by re-pointing the shortcut, by having `restore` delete the shortcut, or by making the dialog merely nicer** — the first two break D-0001-30's one-icon-serves-every-theme property, and the third accepts a broken path and improves its error message. | [`injector/cli.js`](../injector/cli.js) (marker at `cmdLaunch`) · [`launcher/windows/launch.ps1`](../launcher/windows/launch.ps1) (marker at the theme-less path) · [Plan 0002 M3 §F3](plans/0002-phase-7-qa-docs-release.md) |
| **D-0001-33** | **A required landmark's MISSING verdict is gated on the WINDOW'S URL, not on the DOM — and the settled check runs BY DEFAULT.** Two halves of one repair, from Plan 0002 M3's F1 and F2. **(a)** `verifySchedule()` returned `[]` unless `CDX_VERIFY_AT` was set, and **nothing in the shipped launch path ever set it** — so the one `required: true` landmark (`sidebar-panel`, D-0001-13) was **never adjudicated for a real user**; every launch logged *"not yet present … the settled check is what convicts it"* and no verdict ever arrived. It now defaults to a single sample at **15000 ms**, a value inside the range M3 measured settled and stable (+8000/+15000/+25000). An explicitly **empty** `CDX_VERIFY_AT` means "the default", not "disabled" — the two are indistinguishable in a shell and the safety net must not switch off by accident; but a non-empty list whose entries are **all invalid** yields an empty schedule and no fallback, because that is the caller's typo and substituting a default would hide it. **(b)** Codex opens a second window at `?initialRoute=%2Favatar-overlay`; the theme applies to it correctly but it can never hold `.app-shell-left-panel`, so the per-webContents verdict printed *"REQUIRED and absent … This is a real defect"* on every healthy launch. The verdict is now gated on the adjudicated window's URL carrying no `initialRoute` parameter. **The gate is on the URL and NOT on the DOM, deliberately:** a DOM gate (*"only judge windows containing some `.app-shell*` ancestor"*) is near-circular, since `.app-shell-left-panel` **is** the landmark — rename that family and the alarm goes **silent** exactly when it is needed, which is how the four pre-Gate-0 landmarks died. The URL gate fails **noisily** instead: change Codex's routing and today's false alarm returns, visible and recoverable. **An unparseable URL is adjudicated as PRIMARY** — the opposite default from a missing parameter — so a URL we cannot read can never quiet the alarm. **Do not "simplify" this to a DOM check, and do not make the settled check opt-in again.** | [`injector/core/inject.js`](../injector/core/inject.js) (markers on `verifySchedule` and on the gate in `reportLandmarks`) · [Plan 0002 M3 §F1, §F2](plans/0002-phase-7-qa-docs-release.md) |
| **D-0001-7** | **Captain's Cabin ground, palette and typography are locked.** Ground = deep navy `#0E141F`; light mode = parchment with navy ink; accent = antique brass. **Type (typography half re-closed 2026-08-01; CODE FACE re-closed again 2026-08-02): Fraunces = DISPLAY only, Literata = UI/body, Monaspace NEON = code** — all three SIL OFL 1.1, all three embedded as data URIs. **Monaspace Xenon was the code face until 2026-08-02 and is superseded** — see the code-face note below. Values are *derived* in OKLCH by `tools/palette/`, never hand-picked. | [`themes/captains-cabin/theme.css`](../themes/captains-cabin/theme.css) · [`tools/palette/palette-engine.mjs`](../tools/palette/palette-engine.mjs) |

### D-0001-1 — amendment, 2026-08-01: the working primary API

Recorded after Gate 0 ran the injector against the real app. **The decision itself does not
change**; only the specific API it names, and the amendment strengthens rather than weakens
the guarantee it was chosen for.

**`webContents.insertCSS()` is broken on this Electron fork.** It throws
`TypeError: o.webFrame[t] is not a function` inside Electron's own sandboxed-renderer
`webFrame` proxy, on every window, identically with and without `cssOrigin`. Not a
configuration problem, and not fixable without modifying Codex's files, which D-0001-3
forbids absolutely.

**The shipped primary is `webContents.executeJavaScript` appending a single `<style>` element**
with a stable id. It travels a *different* main→renderer channel, it is equally official, and
it opens **no debug port** — so the whole reason mechanism A beat mechanism B survives intact.
**The CDP fallback was not needed and must not be made default without owner approval.**

Two costs, both real, both commented at the code:

- **Author origin, not user origin.** Our overrides are custom-property definitions competing
  with Codex's own. In practice this is comfortable: Codex defines its semantic layer inside
  `@layer utilities`, and an unlayered author rule beats a layered one regardless of order or
  specificity. Verified in the running app — **no `!important` is required anywhere**
  ([phase3-inventory-findings §1](research/phase3-inventory-findings.md)). A stock author rule
  marked `!important` would still win, and none currently is.

  > **That last claim is SUPERSEDED by D-0001-12 — every declaration in `theme.css` now carries
  > `!important`, and must.** The paragraph above is kept, not corrected, because its reasoning
  > is still sound and still true *about the cascade*: an unlayered author rule does beat Codex's
  > layered `@layer utilities` definitions. What it did not account for is a second mechanism
  > entirely — Codex writes 67 custom properties as an **inline style on `<html>`** shortly after
  > boot, and inline beats any non-important author rule regardless of layering. So the theme
  > applied at `dom-ready` and was then silently reverted — measured, not inferred. This is the
  > project's recurring lesson in its cleanest form: *winning the contest you measured does not
  > mean you measured the contest that decides.* See **D-0001-12** in the table above, and
  > **D-0001-18** for the same shape one level down (tokens Codex sets on `<body>`, which
  > `!important` on `<html>` cannot win at all, because inheritance is not a specificity contest).
- **It is a DOM node**, so the app could in principle re-render it away, where an inserted
  stylesheet could not. The stable id makes re-application idempotent, and the injector
  re-applies on `dom-ready`, `did-navigate` and `did-navigate-in-page`.

Anchor: [`injector/core/inject.js`](../injector/core/inject.js) (`applyThemeViaStyleTag`).

## Superseded or hollowed-out — do not re-stamp

| Decision | Status |
|---|---|
| **D-0001-1 amendment (2026-08-01), the clause "no `!important` is required anywhere"** | **SUPERSEDED by D-0001-12, 2026-08-01.** That clause only — the amendment's ruling (the primary API is `executeJavaScript` style-tag injection, no debug port) stands in full. Codex writes 67 custom properties inline on `<html>`, which beats any non-important author rule, so every declaration in `theme.css` is `!important`. Text kept in place with the reasoning; see the note under the amendment. |

## Open — reopened by the owner, not yet settled

_Nothing open._ D-0001-7's typography half was reopened and re-closed on 2026-08-01; the
history is kept below because the reasoning is worth not repeating.

### D-0001-7 (code face) — REOPENED and RE-CLOSED 2026-08-02: Xenon → Neon

**RESOLUTION (CLOSED). The code face is Monaspace NEON.** The owner judged it in the
running app — *"the Neon reads so MUCH better"* — and it is verified rendering, not
falling back: `code=1 font="Monaspace Neon"` on a real `<code>` element, in both modes.

**Why Xenon failed, and it was not a bug.** Xenon rendered correctly the whole time; the
settled check confirmed the face was loadable and applied. The problem was the face itself:
**Xenon is the slab-serif member of the Monaspace family**, so with Fraunces (display) and
Literata (UI/body) the app was serif at *every* level. Code normally signals "literal text,
not prose" partly through texture, and a slab-serif mono inside serif body copy erases that
signal. The owner's report — *"the text/font inside the code block reads a little weird"* —
was that, not a rendering fault.

**Why no comparison render this time**, unlike the Literata decision. The Monaspace family
shares **identical metrics across all five faces**, so Xenon → Neon is a font-file swap with
zero layout consequence — same advance width, same line breaks, same column alignment. The
owner declined a mockup on those grounds and judged it directly in the app, which is the
better instrument anyway. *This is not a precedent for skipping renders on faces with
different metrics.*

**Rejected on the way, and why — do not re-propose:**
- **IBM Plex Sans / Work Sans for code.** Both are PROPORTIONAL. Code needs a fixed advance
  width or indentation, file trees, diffs and commit-hash columns all break. Not aesthetics,
  function. (**IBM Plex Mono** is the faithful form of that request and remains a legitimate
  future candidate; Work Sans has no mono sibling.)
- **Codex's own stock mono.** Measured unthemed as `ui-monospace, SFMono-Regular, SF Mono,
  Menlo, Consolas, Liberation Mono, monospace` — which resolves to **Consolas on Windows and
  SF Mono on macOS**, i.e. a different face on each of the two target platforms, and Consolas
  is Microsoft-licensed so it can never ship inside a `.ccskin`.

### D-0001-7 (typography half) — REOPENED and RE-CLOSED 2026-08-01

**RESOLUTION (CLOSED).** The owner judged the rendered comparison
([`docs/mockups/0003-typography-comparison.html`](mockups/0003-typography-comparison.html))
and chose **Literata at 14px** for UI and body, with **IBM Plex Sans** named as the runner-up
should Literata ever need replacing. **Fraunces stays as the display face** (Codex's ten
authored `.heading-*` classes); **Monaspace Xenon** is unchanged for code. Shipped in
`tools/palette/emit-theme.mjs`; the diagnosis below — that the fix was a split, not a
replacement — held.

**Two things this surfaced, both worth keeping:**

1. **The app had never rendered Fraunces at all.** `theme.css` named it with no `@font-face`,
   and it is not installed on either machine, so the app was showing the CSS fallback,
   Georgia. The eye strain that reopened this decision was therefore Georgia at 13–14px. All
   three faces are now **embedded as data URIs** — this is a correctness requirement, not a
   packaging step, and it is why `theme.css` is ~300 KB.
2. **A `font-family` naming an unavailable face fails silently** — the computed value still
   reports the name you asked for, which is exactly how Gate 0 recorded a false confirmation.
   Verify with `document.fonts.load()` *then* `document.fonts.check()`. Both are now permanent
   in `injector/core/inject.js`.

The original reasoning, kept because it is the argument that produced the right answer:

---

**The ground/palette half of D-0001-7 stands and is not in question.** Only the type
half is reopened, by the owner, after seeing Fraunces render in the real app at Gate 0:
*"the fonts are not crisp enough and it can be challenging or tough to read in long
sessions."*

**Why this is a legitimate reopening rather than a preference.** It collides with the
project's own first design law in `docs/ENGINEERING.md`: *"Readability outranks
aesthetics — always. A gorgeous low-contrast theme that tires the eyes over a long
coding session is a failed theme."* An owner reporting eye strain in the running app is
that law firing.

**Diagnosis (to be tested, not assumed).** Fraunces is a *display* serif — high stroke
contrast, softly modulated terminals, optical sizing tuned for large settings. It is
currently doing double duty as both the display face and the UI/body face. At 13–14px
UI text the stroke contrast is what reads as "not crisp"; `opsz 14` mitigates it but
cannot change what the face is.

**The likely resolution is a split, not a replacement:** keep Fraunces for display
(headings, hero, title bar) where it earns its character, and introduce a dedicated
*text* face for UI and body. That is the pairing Fraunces was designed to be half of.

**Do not pick the text face in prose.** The owner judges type from a rendered visual and
has reversed a stated preference on sight before. Build the comparison first — same
screen, same sizes, several candidates — then ask. Any candidate must clear the design
floor (no Inter/Roboto/Arial/Open Sans/Lato/system-ui) and must be OFL or otherwise
redistributable inside a `.ccskin`.

~~**Not settled. Do not ship a font change until the owner approves one from a render.**~~
Settled 2026-08-01 by exactly that route — see the resolution at the top of this entry.

## Decisions with no code home

External facts, project identity, and policy that no single file governs.

**This section is complete by design, not a backlog.**

### D-0001-5 — Project & CLI naming (CLOSED)
- **Repo / product / engine name: `Codexterity`** (codex + dexterity — "craftsmanship applied to Codex"). Chosen 2026-07-31 after checking for brand collisions; `Codexterity` is clear where shorter candidates (Gildex, Amberdex, Illumindex, Emberdex, Adornex, Aurodex, Lumindex, Hearthdex) were all taken.
- **CLI command: `cdx`** (`cdx apply <theme>` / `cdx verify` / `cdx restore`) — short alias so the long product name never has to be typed at the terminal.
- **First theme name: `Captain's Cabin`** — the theme name stays deliberately premium/elegant per the brief and is intentionally *not* tied to the engine name, so future themes (e.g. Observatory, Submarine) sit under Codexterity without a naming clash.
- **Do not re-propose** engine renames without a concrete collision or trademark reason.

### D-0001-8 — Rejected design directions (CLOSED, do not re-propose)

Settled 2026-07-31 by the owner, each from a **rendered visual**, not from a description. Recorded so no agent spends another cycle on them.

- **Aubergine / purple ground (`#1E0D2B`).** Built as a full derived palette, rendered in the approval mockup, and rejected on sight. Do not propose a purple or indigo ground for this theme.
- **Tiling surface textures** (oak grain, leather grain, parchment grain, canvas/linen). Cut. Two reasons, in order of weight: tiled grain is high-frequency variation that reads as compression artifact or discolouration rather than as material, especially on a ~9% lightness ground where it can only lighten; and it invalidates the flat-surface assumption behind every contrast figure the theme claims. See D-0001-6.
- **A full-bleed atmospheric background behind the whole app** (the "glass panels over artwork" look). Considered against a reference the owner supplied, and narrowed to *empty states only* before textures were cut altogether. Imagery is permitted only where no dense text sits over it.
- **A serif-plus-sans pairing** (Alegreya + Alegreya Sans + Commit Mono) was offered as the safer, quieter option and not chosen. Fraunces carries both display and UI.

### D-0001-16 — macOS verification is deferred behind Phase 4 packaging (CLOSED, 2026-08-02)

**Ruling by the owner.** There is no Mac on this project. The one available machine
belongs to a collaborator who is willing to install the finished thing and try it — and
that is the *only* form macOS verification can take. A collaborator will not be asked to
clone the repo, install Node, and run `launcher/macos/launch.sh` by hand.

**Consequences, all deliberate:**

- **`launcher/macos/launch.sh` ships unverified** and stays that way until Phase 4 produces
  a `.ccskin` and an installer. Its header says so; do not soften that wording, and do not
  mark it verified on the strength of a Windows run or a code review.
- **macOS verification is downstream of Phase 4, not parallel to it.** This partly reverses
  Phase 3's "settle the look first — packaging adds nothing visual" sequencing. That framing
  still holds for Windows; it does not hold for the cross-platform gap.
- **The three macOS unknowns stay open and stay loud** rather than being guessed at: the
  bundle's real identity, the `EnableNodeOptionsEnvironmentVariable` fuse on the macOS
  binary (Phase 1 decoded fuses out of the *Windows* `chrome.dll` only), and whether
  D-0001-13 needs `!important` there (Codex's own sidebar rule scores (0,3,0) against our
  (0,2,0) and probably *does* match on a window without application-menu chrome).
  **Do not "pre-fix" any of them.**

**Do not re-propose macOS verification as Phase 3 work, and do not ask the owner to obtain
a Mac.** The next honest step is Phase 4, and the macOS answer arrives with it.

#### AMENDED 2026-08-02 — macOS verification is an ARTIFACT WE HAND OVER, not a gate we wait on

Refined by the owner when Phase 4 was scoped: *"the macOS collaborator might not like or want
to run/test it… I will provide the macOS installer to the collaborator and it's up to him
whether he wants to install it and provide feedback."*

**The ruling above stands** — macOS verification still cannot happen before an installer
exists. What changes is what happens **after**: the collaborator running it is **optional and
outside this project's control**, so no milestone, gate, or release may depend on it.

- **Build and verify everything on Windows.** Windows is the only machine where "verified in
  the running app" can mean what `docs/ENGINEERING.md` requires it to mean.
- **Ship the macOS installer as a deliverable, produced and handed over.** It is complete when
  it is built and documented, not when someone runs it. Feedback, if it comes, is a bonus.
- **Roadmap Phase 6's gate is therefore changed.** It was *"Friend confirms theme applies on
  macOS."* No milestone may be blocked on another person's willingness. The gate is now
  *"installer built, and its unverified status documented."*
- **The three macOS unknowns stay open, stay loud, and stay unguessed** (bundle identity, the
  `EnableNodeOptionsEnvironmentVariable` fuse on the macOS binary, whether D-0001-13 needs
  `!important` there). Do not "pre-fix" them, and **do not soften `launcher/macos/launch.sh`'s
  unverified header** — that honesty is now permanent rather than temporary, because the run
  that would retire it may never happen.

**Consequence to internalise: macOS may never be verified, and that is an accepted outcome,
not an outstanding task.** Do not carry it as open work or re-raise it as a blocker.

### D-0001-26 — The diff pane's "second click does nothing" is CODEX'S BUG, not the theme's (CLOSED, 2026-08-03)

**Observed by the owner** during M3's verification launch: with a diff open, clicking a
*different* diff in the same conversation does not switch the pane — no response at all.

**Controlled, not assumed.** Codex was then launched from its **normal Start-menu icon**, with
no injector in the process at all, and **the bug reproduces identically**. One variable changed
between the two runs (our code present or absent) and the behaviour did not, so the theme is
excluded. **This is Codex's own bug and there is nothing for Codexterity to fix.**

**Why the control was run rather than the theme being audited into the clear.** A grep first
established that the theme has *no plausible mechanism*: its entire structural footprint is six
rules (sidebar panel, the row `::before`, xterm, the home hero, chrome, type), it sets **no**
`z-index`, `isolation`, `contain` or `overflow` anywhere, and its single `pointer-events` is
`none` on a 2px marker — which can only make hit-testing more permissive, never block a click.
That was **not treated as sufficient**. "No mechanism identified" is exactly the reasoning that
produced two wrong conclusions about the missing empty-state cards (Plan 0001 item 20), and the
lesson recorded there is that only a suppressed-injection or stock control settles it. It is
cheap; run it.

**Also relevant, and checked:** M3 changed **no CSS**. `theme.css` was byte-identical across
the milestone (`git diff --stat` empty, `audit.mjs` 272/272), so this could never have been an
M3 regression in either direction.

**Do not re-investigate this as a theming defect, and do not add a landmark or a
`pointer-events` rule to "fix" it.** If it ever needs chasing, it is an upstream Codex report.

### Phase 2 outcome (reference, 2026-07-31)

Captain's Cabin ships **no raster assets**. The theme is text plus two OFL fonts. This retires the 32 MiB package cap, the seamless-tiling pipeline, and the per-ground texture re-grade as concerns. An atmospheric hero for the empty state remains a documented *optional future* addition — nothing has been generated, and the theme is complete and correct without it.

### Codex Desktop environment facts (reference, verified 2026-07-31)
- Codex Desktop is **Electron** ("owl" fork, Chromium 150). Windows = sealed **MSIX** from the Store (files un-patchable); macOS = signed `.dmg`, Apple-Silicon.
- The app ships with **stock, un-hardened Electron fuses** (`NODE_OPTIONS` honoured, ASAR integrity validation off) — verified by decoding the fuse bytes in `chrome.dll`. This is what makes D-0001-1's primary mechanism available. If a future Codex build flips these fuses, the CDP fallback path applies.
- Full evidence: [`docs/research/phase1-research-findings.md`](research/phase1-research-findings.md).
