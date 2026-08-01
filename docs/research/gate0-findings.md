# Gate 0 — Injector launch test against real Codex

**Run 2026-08-01** on the Windows development machine, against Codex Desktop
`26.727.6591.0` (Electron / Chromium `150.0.7871.182`), installed as an MSIX package
`OpenAI.Codex_26.727.6591.0_x64__2p2nqsd0c76g0`.

**This is the first time anything in this project has been observed in the running app.**
Every visual claim made before this date traces to a mockup. Where this document and an
older spec disagree, this document wins — it is observation, they are static analysis.

Code under test: [`injector/core/inject.js`](../../injector/core/inject.js),
[`launcher/windows/launch.ps1`](../../launcher/windows/launch.ps1) (commit `09fa96c`).

---

## Verdict in one line

**Injection works and needs no debug port. The theme applies only partially, because the
DOM landmarks and the token-consumption model both came from static analysis and do not
match this build.**

---

## 1. The mechanism — D-0001-1's assumption HELD

`NODE_OPTIONS=--require <preload>` reaches the packaged app's Electron main process.

The plan anticipated that MSIX activation might block environment inheritance, because a
packaged app is normally started through its AUMID via `explorer.exe` — which would make
`explorer.exe` the parent, not our launcher. **That route is not required.** Codex's
`AppxManifest.xml` declares:

```xml
<Application ... EntryPoint="Windows.FullTrustApplication">
```

A full-trust packaged application's executable can be started as an ordinary Win32 child
process, which inherits the parent's environment block normally. The launcher resolves it
via `Get-AppxPackage OpenAI.Codex` (never a hardcoded `WindowsApps` path) and launches it
directly.

### Three real bugs found on the way

| Bug | Root cause | Fix |
|---|---|---|
| `NODE_OPTIONS` path silently corrupted (`C:\Users\…` → `C:Users…`) | Node's own CLI-option tokenizer treats backslashes in a quoted `NODE_OPTIONS` value as escape characters and eats them | Forward slashes for the `NODE_OPTIONS` value only. `CDX_THEME_CSS_PATH` keeps native backslashes — it is read by `fs`, which never sees Node's parser |
| `require('electron')` throws `MODULE_NOT_FOUND` in every process | Node's internal preload step runs *before* Electron's bootstrap patches `Module._load` to register its virtual `electron` module | Defer the require one tick via `setImmediate`. Same process, same mechanism, no debug port |
| Launcher failed with an empty `Join-Path` | `$PSScriptRoot` is not populated while `param()` default expressions are evaluated for a script invoked via `-File` on Windows PowerShell 5.1 | Default the parameter in the body, where `$PSScriptRoot` is reliable |

---

## 2. `insertCSS` is unavailable on this fork — and it did not cost us the security model

`webContents.insertCSS()` fails on every window:

```
TypeError: o.webFrame[t] is not a function
    at node:electron/js2c/sandbox_bundle:2:104512
    at IpcRendererInternal.<anonymous> (node:electron/js2c/sandbox_bundle:2:98869)
```

The throw is inside **Electron's own sandboxed-renderer `webFrame` proxy** — the internal
IPC bridge `insertCSS` uses to reach the renderer. It fails identically with
`{ cssOrigin: 'user' }` and with no options, which rules out a configuration problem. It is
not fixable from the main process without modifying Codex's files, which D-0001-3 forbids
absolutely.

**This does not force the CDP fallback.** `webContents.executeJavaScript` travels a
*different* main→renderer channel and works. Appending one `<style>` element through it
applies the theme successfully — verified on every webContents, `lastChildOfHead=true`.

That distinction is load-bearing: it is still an official Electron API and still opens **no
debug port**, so the entire security rationale that made mechanism A preferable to B
survives. Falling back to CDP would have opened a port for no reason.

### What the style-tag route costs

Two real differences from `insertCSS`, both recorded in the code:

- **Author origin, not user origin.** Our overrides are custom-property definitions at
  equal specificity to Codex's own, so later-wins carries them. A stock author rule marked
  `!important` would *not* be beaten the way a user-origin sheet beats it.
- **It is a DOM node**, so the app could in principle re-render it away, where an inserted
  stylesheet could not. The stable `id` makes re-application idempotent, and the injector
  re-applies on `dom-ready`, `did-navigate` and `did-navigate-in-page`.

---

## 3. What is confirmed live

| Fact | Status |
|---|---|
| Root element carries `electron-dark` | **CONFIRMED** — D-0001-2's core assumption, never before checked against a running app |
| `--color-background-surface` resolves to `#0E141F` | CONFIRMED |
| `--color-text-primary` resolves to `#F4EAD4` | CONFIRMED |
| `--color-background-button-primary` resolves to `#C0A454` | CONFIRMED |
| `--radius-lg` resolves to `7px` | CONFIRMED |
| Fraunces renders throughout the app | CONFIRMED (by inheritance from the theme class) |
| Codex stays fully functional after a failed injection | CONFIRMED — degrade-to-stock works |
| No Codex file modified; no auth/credential file touched; no port opened | CONFIRMED |

---

## 4. What is broken — the actual Phase 3 work

### 4.1 Every declared landmark matched nothing

```
landmark MISSING: app-header-tint                    (".app-header-tint")
landmark MISSING: popupContent                       (".popupContent")
landmark MISSING: app-shell-main-content-top-fade    (".app-shell-main-content-top-fade")
landmark MISSING: code-surfaces                      ("pre, code, kbd, samp")
```

All four come from [`customizable-ui-inventory.md`](../specs/customizable-ui-inventory.md)
§Tier 2, which was built by static analysis of a shipped bundle. **They do not exist in this
build's live DOM.**

Consequence: **the Layer 2 character pass shipped in `da8d26d` is inert.** It paints nothing
today beyond `::selection` and `scrollbar-color`, which need no landmark. It degrades
exactly as designed — an unmatched selector paints nothing, and the app is not half-styled —
but the treatment the owner approved is not actually visible.

`pre, code, kbd, samp` matching nothing is expected on the empty/new-session screen, which
contains no code. It must be re-probed on a screen that does before being called missing.

### 4.2 The app is only partly themed

Observed on the real empty state: Fraunces renders and the main content area takes the
navy, but **the sidebar, composer and menu bar remain stock**, and the four empty-state card
icons are still stock **blue, purple, green and red** — four accent colours in a theme whose
design floor permits exactly one.

### 4.3 A measurement that failed, recorded so it is not repeated

A token-gap probe reported *"app defines 60 root custom properties; theme overrides 52; 8
unclaimed"*, the 8 being cosmetic (startup-splash shimmer, tab throbber).

**That figure is invalid and must not be quoted as a coverage result.** It reads
`getComputedStyle(document.documentElement)` *after* our own injection, so most of the 52
"covered" properties are ones **we** placed on the root — not evidence that Codex consumes
them. The probe cannot distinguish our tokens from the app's.

**The open question it was meant to answer:** which custom properties does Codex actually
read when painting its chrome? Answering it needs a probe that samples **before** injection,
or that walks specific elements and reports which `var()` references resolve their computed
values. Until that exists, the size of Layer 1's real coverage is unknown.

---

## 5. What this changes

- **D-0001-1 stands, with an amendment to record:** the primary mechanism is
  `NODE_OPTIONS` + an official main-process API, but the specific API is
  `executeJavaScript` style-tag injection rather than `insertCSS`, because `insertCSS` is
  broken on this fork. The no-debug-port guarantee — the reason A beat B — is intact. The
  CDP fallback remains built-but-not-default and was **not** needed.
- **D-0001-2 is confirmed in principle** (the root theme class exists and our custom
  properties resolve on it) but **its reach is unproven**. Token-first styling demonstrably
  does not reach most of Codex's chrome in this build.
- **The Tier-2 hook inventory is stale** and must be rebuilt from the running app.

Phase 3 is larger than the plan assumed. That is the correct outcome for a gate: the
unknown surfaced before packaging rather than after.
