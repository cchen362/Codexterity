# Plan 0001 — Captain's Cabin: Architecture & Roadmap

**Status:** Phase 1 (Research & Architecture) **COMPLETE**. Phase 2 (Palette, Type & Assets) **COMPLETE** — ground, palette, syntax palette and typography are locked and emitted; the theme ships **no raster assets**. **Phase 3 (CSS & Theme Dev) is the active next milestone**, beginning with Gate 0: launch-testing the injector against the real app.
**Depends on:** [`docs/research/phase1-research-findings.md`](../research/phase1-research-findings.md) (the evidence).
**Decision state:** D-0001-1 (injection) and D-0001-5 (naming) **accepted**. D-0001-6 (flat surfaces), D-0001-7 (ground/palette/type locked) and D-0001-8 (rejected directions) **accepted 2026-07-31**, each from a rendered visual. D-0001-2/3/4 remain owner-pending but do not gate Phase 3.

> **Phase 2 changed the brief.** The theme's ground is **deep navy `#0E141F`**, not dark oak, and all tiling textures were cut. Sections below that describe wood, leather, or texture assets are superseded — see [`docs/DECISIONS.md`](../DECISIONS.md) and [`docs/specs/asset-manifest.md`](../specs/asset-manifest.md).

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
2. **Layer 2 — Named-hook rules.** *Phase 3.* A handful of rules on stable classes (`app-header-tint`, scrollbars, `popupContent`) for the title-bar treatment that tokens alone can't express.
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

## 6. Platform compatibility

See findings §12. One runtime-injection strategy on both OSes; only the launcher + installer are per-OS. Estimated <10% platform-specific code. **One Mac verification pass is required** (confirm DOM parity + that the wrapper launches Codex's `.app` with injection) — scheduled as a Phase 6 gate with your friend.

## 7. Customizable UI inventory

See [`docs/specs/customizable-ui-inventory.md`](../specs/customizable-ui-inventory.md).

## 8. Required assets

See [`docs/specs/asset-manifest.md`](../specs/asset-manifest.md). **Outcome of Phase 2: two OFL fonts, and nothing else.** All tiling textures were cut (D-0001-6); the empty-state hero and the compass-rose crest remain optional and unbuilt. The `.ccskin` is text plus two woff2 files, which retires the 32 MiB cap in §5 as a practical concern.

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
| **3. CSS & Theme Dev** *(active)* | **Gate 0: launch-test the injector (A vs B) on the real app.** Then Layer 2 named hooks, editor palette wiring, hot-reload dev loop | Theme visibly applied to running Codex, verified in-app by you |
| **4. Packaging** | `.ccskin` format + injector CLI (apply/restore/verify) + safe-CSS validation | Clean apply/restore round-trip; nothing residual |
| **5. Windows Installer** | Launcher + MSIX exe resolver + installer + shortcuts | Fresh-machine install works; survives a simulated app-version bump |
| **6. macOS Installer** | Wrapper `.app` + `.dmg`; **friend's Mac verification** (DOM parity + launch) | Friend confirms theme applies on macOS |
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
