# Phase 1 — Technical Research Findings

**Project:** Captain's Cabin — a premium custom skin for Codex Desktop
**Status:** Investigation complete. Evidence-based. No skin code written yet.
**Date:** 2026-07-31
**Method:** First-hand inspection of the local Windows install + three parallel investigations (renderer bundle analysis, injection/platform feasibility, community prior-art). Every load-bearing claim is tagged **[VERIFIED]** (proven on this machine or quoted from a fetched source), **[RESEARCHED]** (documented behaviour, not run here), or **[INFERRED]** (synthesis/judgement).

> This document is the *evidence*. The forward-looking plan lives in
> [`docs/plans/0001-captains-cabin-architecture.md`](../plans/0001-captains-cabin-architecture.md).

---

## 0. TL;DR for the busy reader

- Codex Desktop **is Electron** (Chromium 150, a branded fork OpenAI calls "owl"). Its entire UI is HTML/CSS in a Chromium renderer, so it is fundamentally skinnable. **[VERIFIED]**
- The UI is built on **Tailwind v4 with a semantic CSS-custom-property token layer**. Overriding ~40–60 `--color-*` / `--radius-*` variables on the root theme class recolours the whole app in one shot — including UI OpenAI hasn't shipped yet. This is the maintainability jackpot. **[VERIFIED]**
- On **Windows**, Codex is a **sealed MSIX from the Microsoft Store**. You cannot patch its files: the install dir is ACL-locked, integrity-checked, and replaced wholesale on every update. File-patching is a **dead end** on Windows. **[VERIFIED]**
- The app ships with **stock, un-hardened Electron fuses**. `NODE_OPTIONS` and the official `insertCSS()` API are available; ASAR integrity validation is **off**. A theme can be injected at runtime **without modifying, patching, or re-signing anything.** **[VERIFIED — I decoded the fuse bytes myself]**
- A real community already exists and **unanimously uses runtime injection, not file patching** — loopback Chrome DevTools Protocol (CDP) is the dominant convention. This corroborates our approach and gives us a theme-format convention to align with. **[VERIFIED]**
- **macOS is the opposite shape**: not sealed by ACLs, but Apple-Silicon code-signing means a *runtime* injector (same as Windows) is still the cleanest cross-platform path. One shared injection strategy works on both. **[RESEARCHED]**

**Bottom line:** the hard part of this project is **delivery and durability**, not aesthetics. The visual system is a solved problem once we pick a palette. Keeping it alive across silent Store auto-updates, on two platforms with completely different sealing models, is the actual engineering — and the evidence says a small **launcher + runtime CSS injector** is the answer.

---

## 1. How Codex Desktop is built

**[VERIFIED]** The Windows package at
`C:\Program Files\WindowsApps\OpenAI.Codex_26.721.11231.0_x64__2p2nqsd0c76g0\app`
contains the unmistakable Electron layout:

| Evidence | What it proves |
|---|---|
| `chrome.dll` (312 MB), Chromium version manifest `150.0.7871.128` | Chromium renderer engine |
| `v8_context_snapshot.bin`, `snapshot_blob.bin`, `icudtl.dat` | V8 + Chromium runtime |
| `resources/app.asar` (209 MB) | Electron app bundle (the UI) |
| `locales/`, `resources/default_app`, `ChatGPT.exe` | Electron app shell |
| `resources/owl-electron-app.json` → `"runtimeName": "owl"` | OpenAI ships a **branded Electron fork** named "owl" |
| Leaked build path `D:\codex-apps-workspace\codex\codex-apps\electron` | Confirms an Electron build pipeline |

The renderer's real entry point is `webview/index.html` inside `app.asar`; the main renderer bundle is a single 14 MB JS file (`webview/assets/app-initial-*.js`), and the primary stylesheet is `webview/assets/app-*.css` (~637 KB). **[VERIFIED via ASAR extraction]**

## 2. Is it Electron? — Yes. (see §1)

## 3. Native theme support?

**[VERIFIED]** Only **light / dark / system**. The renderer toggles two classes on the root element:

```js
e.classList.toggle(`electron-dark`, mode === `dark`)
e.classList.toggle(`electron-light`, mode === `light`)
```

There is **no user-facing custom-theme feature, no theme picker, no "install a skin" hook.** A skin must therefore be applied by an external mechanism — the app will not load one on its own. **[INFERRED from absence + [VERIFIED] no theme keys in `~/.codex/.codex-global-state.json`]**

There *is* a named theme registry — `pierre-dark`, `pierre-light`, plus colour-blind variants — but that is OpenAI's **"Pierre" family for code syntax highlighting only**, lazy-loaded as separate chunks. It is a *separate surface* from the app chrome, and Captain's Cabin will need its own syntax palette to match. **[VERIFIED]**

## 4. How community skin projects work

**[VERIFIED]** A genuine, fast-growing (largely Chinese-authored) ecosystem exists. Credible, actively-maintained projects and their mechanisms:

| Project | Mechanism | Notes |
|---|---|---|
| **CodeDrobe** (`CodeDrobe/core`) | Loopback **CDP** injection; app-agnostic runtime with per-app adapters; declares required DOM "landmarks" and fails loudly if missing | Most architecturally rigorous. Only touches 3 appearance keys in `~/.codex/config.toml`, backs them up. |
| **Codex Dream Skin** (`aithink001/…`, `Fei-Away/…`) | Loopback **CDP** on `127.0.0.1`; "will not modify, replace or re-sign official application files" | ZIP theme pkg: `manifest.json` + `theme.json` + `theme.css` + one background image; size-capped. Marketplace ambitions ("DreamSkin.cc"). |
| **codex-qq-skin** (`angziii/…`) | Loopback **CDP**; user starts Codex with a CDP endpoint, CLI attaches via `CODEX_CDP_ENDPOINT` | Cleanly states the CDP threat model (see §11). |
| **codex-plusplus** (`b-nnett/…`) | **asar patching** — the outlier | Confirms MSIX blocks in-place patching: it "creates a writable managed app copy under `%LOCALAPPDATA%/codex-plusplus/store-apps/` since the Store sandbox prevents direct app modifications." Needs a watcher to re-repair after every update. |

**Convergence:** every credible, non-destructive project uses **runtime injection over a loopback debug connection**, *not* file patching. Only the one asar-patching outlier goes the invasive route, and it had to invent an MSIX workaround and an auto-repair watcher to survive updates.

⚠️ **Trust caveat [VERIFIED/INFERRED]:** several repos show star counts (12.8k, 3.6k) wildly out of proportion to a niche reskin tool, with **zero organic Reddit/HN discussion** and a cluster of co-registered lookalike marketing domains (`codexskin.{org,im,me,cc,store,site}`). This is a classic star-inflation / SEO-farm signature. **We treat these projects as convention references to study, not code to run.** We will build our own.

## 5. Injection techniques compared

| Technique | Viable here? | Evidence |
|---|---|---|
| **Loopback CDP** (attach to a debug port on `127.0.0.1`, inject CSS/DOM) | **Yes — proven on Codex** | The entire credible community uses it. **[VERIFIED]** |
| **`NODE_OPTIONS=--require <preload>`** → main-process `webContents.insertCSS()` | **Yes — fuse-enabled** | Fuse `EnableNodeOptionsEnvironmentVariable` decoded **on**. Uses the official Electron CSS API; no open port. **[VERIFIED fuse; RESEARCHED behaviour]** |
| **`--inspect` Node inspector** | Yes | Fuse `EnableNodeCliInspectArguments` **on**. More invasive to drive. **[VERIFIED]** |
| **In-place `app.asar` patch (Windows)** | **Dead end** | MSIX ACLs + block-map integrity + versioned-folder updates. **[VERIFIED]** |
| **In-place `app.asar` patch (macOS)** | Possible but ugly | Breaks code signature; needs mandatory ad-hoc re-sign on Apple Silicon; re-do every update. **[RESEARCHED]** |
| **UI Automation / overlay window** | Dismissed | Cannot alter the real CSSOM; a fake floating layer that breaks on scroll/resize. **[INFERRED]** |

### The decisive fact: Electron fuses (decoded first-hand) **[VERIFIED]**

I scanned `chrome.dll` for the Electron fuse sentinel `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX` (found at offset `268639568`) and decoded the 9-fuse wire `101100011`:

| # | Fuse | State | Consequence |
|---|---|---|---|
| 0 | RunAsNode | **ON** | `ELECTRON_RUN_AS_NODE` honoured |
| 1 | EnableCookieEncryption | off | — |
| 2 | **EnableNodeOptionsEnvironmentVariable** | **ON** | `NODE_OPTIONS` preload injection possible |
| 3 | EnableNodeCliInspectArguments | ON | `--inspect` honoured |
| 4 | **EnableEmbeddedAsarIntegrityValidation** | **OFF** | no runtime hash check on the bundle |
| 5 | OnlyLoadAppFromAsar | off | loose files can load |
| 6 | LoadBrowserProcessSpecificV8Snapshot | off | — |
| 7 | GrantFileProtocolExtraPrivileges | on | — |
| 8 | WasmTrapHandlers | on | — |

**Every value matches Electron's stock defaults.** OpenAI did not run `flip-fuses` to lock this build down. **Framing that matters:** we are not defeating a protection. The app's own shipped runtime leaves these doors open; a theme rides in through them using official APIs. That is the line between "a skin" and "a security bypass," and Captain's Cabin stays firmly on the skin side.

## 6. Which UI elements *can* be customized

Detailed inventory: [`docs/specs/customizable-ui-inventory.md`](../specs/customizable-ui-inventory.md). Summary:

- **Fully skinnable via CSS-variable override** (highest leverage): all backgrounds, surfaces, elevated panels, borders, text colours, icon colours, accent/button colours, radii, shadows, editor diff colours — anything built on the `--color-*` / `--radius-*` / `--shadow-*` token layer. **[VERIFIED]**
- **Skinnable via targeted selectors** (stable, hand-written class hooks): `app-header-tint`, `app-shell-main-content-top-fade`, `hide-scrollbar`, `popupContent`, `draggable` / `no-drag`. **[VERIFIED]**
- **The toolbar / title-bar area is custom HTML** (`titleBarStyle: 'hidden'` + `titleBarOverlay` on Windows; `hiddenInset` + `vibrancy` on macOS) — fully restyle-able. **[VERIFIED]**
- **Fonts** — UI font is `OpenAI Sans`; monospace is a system stack. Both overridable. **[VERIFIED]**

## 7. Which elements realistically *cannot* be customized

- **Windows native caption buttons** (min/max/close glyphs) — OS-drawn. Only their *colour* is settable via `titleBarOverlay` (from `nativeTheme`), not their shape/CSS. **[VERIFIED]**
- **Native application menus / context menus** (`native-menu-locales` present) — OS-rendered, not CSS. **[VERIFIED]**
- **macOS traffic-light buttons** — OS-drawn. **[RESEARCHED]**
- **Content OpenAI renders as raster/canvas/video** (avatar overlay, some media) — not stylable by CSS. **[INFERRED]**
- Anything requiring **DOM structure changes** rather than restyling is fragile and out of scope for a *theme* (that's what the asar-patching outlier does, at high cost).

## 8. Is the DOM identical on Windows and macOS?

**[INFERRED — high confidence]** Same `app.asar`, same renderer bundle, same Electron fork across both platforms. The renderer is platform-agnostic; only the **main-process window-chrome config** differs (`titleBarOverlay` on Win vs `vibrancy`/`hiddenInset` on Mac). Custom Tailwind variants like `electron:` / `browser:` / `extension:` exist for surface-conditional styling, but the DOM *structure* the CSS targets is shared. **This must be confirmed once on the friend's Mac**, but the token-override strategy is exactly what makes small DOM deltas irrelevant.

## 9. Shared vs platform-specific (see plan §folder-structure)

- **Shared (one codebase):** the entire theme payload — CSS variable overrides, `theme.css`, syntax palette, image assets, manifest, and the *injection logic* (CDP/insertCSS is identical Node on both OSes).
- **Platform-specific (thin):** only the **launcher** — how each OS starts Codex with the injector attached (env var + exe path on Windows; shell wrapper + `.app` path on macOS), and packaging/installer format. Estimated **<10% of the code** is platform-specific.

## 10. Required image assets

> **SUPERSEDED by Phase 2 (2026-07-31).** This section records what Phase 1 *expected* to need. The actual answer turned out to be **almost nothing**: all tiling textures were cut and the theme ships no raster assets, only two OFL fonts. Kept unedited as a record of the original reasoning — read [`docs/specs/asset-manifest.md`](../specs/asset-manifest.md) for what is true now. The rest of this document (the Electron/fuse/token evidence) remains current.

Original Phase 1 expectation: dark-oak / leather / parchment textures (tiled, low-contrast), a subtle vignette/candlelight overlay, an optional title-bar crest, and a matching syntax palette. All kept small, low-contrast, and readability-first per the brief.

## 11. Risks from future Codex updates

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Store auto-update replaces the app (new versioned folder) | **Certain, recurring** | Injector path/version drift | Launcher resolves the package by name via `Get-AppxPackage`, not a hardcoded path — version-independent. **[VERIFIED path is versioned]** |
| OpenAI renames/restructures the `--color-*` token layer | Low–Medium | Recolouring partially breaks | Token overrides degrade gracefully (fall back to OpenAI's colours) rather than breaking the app; `verify` step reports drift. |
| OpenAI flips Electron fuses (hardens the build) | Low | `NODE_OPTIONS` path dies | Fall back to CDP loopback (independent mechanism); both designed for. |
| DOM structure refactor | Medium (over months) | Selector-based tweaks break | Prefer token overrides over structural selectors (community's #1 lesson); declare landmarks and fail loudly, never silently break the app. |
| CDP open-port trust boundary | N/A (design choice) | Any same-user local process can attach while port is open | Bind loopback only; keep the port open only during a session; prefer the no-port `NODE_OPTIONS` path if the launch test confirms it. |
| The app simply won't launch after an update | Low | Theme unusable until fixed | Injector is **non-destructive** — worst case the user launches Codex normally and gets the stock look; nothing is broken or bricked. |

## 12. Platform compatibility assessment (Windows ↔ macOS)

| Dimension | Windows | macOS |
|---|---|---|
| Distribution | Sealed **MSIX** (Microsoft Store) | Signed **.dmg** (direct), Apple-Silicon only |
| Install dir writable? | **No** (TrustedInstaller ACLs) | Yes (user-owned in `/Applications`) |
| File-patch viable? | **No** (integrity + ACL + versioned replace) | Yes but requires mandatory ad-hoc re-sign; ugly |
| Runtime injection viable? | **Yes** (stock fuses) | **Yes** (same Electron fork) |
| What differs for us | Launcher = env var + resolve MSIX exe | Launcher = shell wrapper + `.app` path; possible quarantine prompt on first run |
| **Recommended path** | **Runtime injector** | **Runtime injector** (same) |

**Conclusion:** the two platforms are sealed in *completely different ways*, which is exactly why we avoid touching app files on either. **One runtime-injection strategy ports cleanly to both** with only a thin per-OS launcher. That is the architecture.

---

### Verification ledger (what is proven vs assumed)

- **Proven on this machine:** Electron identity; MSIX seal + ACLs; fuse decode; Tailwind-v4 token layer; theme-class toggle; title-bar config; font stacks; absence of a theme feature.
- **Researched (not run here):** MSIX integrity/update behaviour; macOS signing/Gatekeeper; community mechanisms (quoted from READMEs).
- **The one untested assumption that gates the architecture:** whether the MSIX process inherits a shell-set `NODE_OPTIONS` when launched directly. **This is Gate 0 of Phase 3** — a controlled launch test, run only with your go-ahead, before any theme work. If it fails, we fall back to CDP loopback (which the community has already proven on Codex).
