# Plan 0005 — Launch Codex with package identity and inject over loopback CDP

**Status:** **CLOSED 2026-09-26. M1–M3 all DONE.** Shipped as tag `v0.3.0` ([notes](../releases/v0.3.0.md)). Both themes verified through the real installed shortcut on Codex `26.924.1866.0`; the owner's on-sight confirmation of Deep Navy Portrait is recorded in M3. Owner approved the CDP route in chat on 2026-09-26
after the diagnosis below. Three milestones: M1 the shared CDP attacher, M2 the Windows launcher
re-route, M3 docs, decision records, package, install and owner verification.

**Depends on:** [Plan 0001](0001-captains-cabin-architecture.md) (architecture authority — D-0001-1 is
the decision this plan amends), [Plan 0004](0004-codex-owl-token-remap.md) (the OWL vocabulary this
plan does not touch), [`docs/DECISIONS.md`](../DECISIONS.md).

---

## What this plan is for

**Codexterity cannot start Codex `26.924` at all, and the injector is not the reason.** Codex updated
itself on 2026-09-26 to `26.924.1866.0`. Its new startup requires the process to carry a Windows
**package identity** — the identity a Store app gets when Windows itself activates it. Codexterity has
always started Codex the other way: run `ChatGPT.exe` directly as a child process so the two
environment variables (`NODE_OPTIONS`, `CDX_THEME_PACKAGE`) reach it. A process started that way has
**no** package identity, so Codex's bootstrap now fails before any of our code runs, and the user sees
"ChatGPT failed to start. The process has no package identity."

This plan changes **how Codex is started and how the stylesheet reaches it**, and nothing else. The
theme packages, the loader, the landmark reporting, the emitter, the `.ccskin` format and the `cdx`
CLI's contract are unchanged. Success is both shipped themes looking exactly as they did on
2026-09-23, launched through the real installed shortcut, on Codex `26.924`.

**Not in this plan's purpose:** any visual change; macOS (its launcher is documented UNVERIFIED,
D-0001-16, and macOS apps have no package-identity check — it keeps `NODE_OPTIONS`).

---

## Verified facts, measured 2026-09-26 — do not re-derive these

All measured on this machine against **Codex `26.924.1866.0`** (`OpenAI.Codex_26.924.1866.0_x64__2p2nqsd0c76g0`,
Chromium `154.0.8037.57`, V8 `15.4`).

1. **A direct child-process launch of `ChatGPT.exe` fails identically WITH and WITHOUT the injector.**
   `launch.ps1 -NoTheme` (no `NODE_OPTIONS`, no preload) produced the same stdout as the themed
   launch: `Desktop bootstrap failed to start the main app phase=bootstrap-import-main`, then the
   updater's `[sparkle] Failed to set up updater errorMessage="The process has no package identity."`,
   then exit code 0 and the dialog. Every Codex log line reads `appPackageCoreActive=false`. **The
   injector's log stayed at 0 bytes** — not even its first line, `preload loaded into main process`,
   was written — because Codex's own bootstrap failed before Electron reached the point where the
   preload's `setImmediate` would have run anything observable. The launch route is the defect;
   the preload mechanism was never reached, so whether the `NODE_OPTIONS` fuse is still on is
   **unknown and now irrelevant** (fact 4).
2. **`Invoke-CommandInDesktopPackage` gives a process the package's identity.** A `powershell.exe`
   started with `-PackageFamilyName OpenAI.Codex_2p2nqsd0c76g0 -AppId App` reports
   `GetCurrentPackageFullName` = `OpenAI.Codex_26.924.1866.0_x64__2p2nqsd0c76g0` (rc 0); the same
   script from an ordinary shell reports rc `15700` (`APPMODEL_ERROR_NO_PACKAGE`). `-PreventBreakaway`
   makes no difference to this.
3. **That route does NOT pass the caller's environment through.** `NODE_OPTIONS` and a probe variable
   set in the calling PowerShell were **absent** in the identity-launched process, with and without
   `-PreventBreakaway`. So the preload mechanism (D-0001-1's primary) cannot ride this route. There is
   no `AppExecutionAlias` for the main app either (the manifest declares aliases only for
   `codex-chrome-native-host.exe` and `codex-core-command-runner.exe`), so no alias-based launch exists.
4. **The route DOES pass command-line arguments, and Codex honours `--remote-debugging-port`.**
   `Invoke-CommandInDesktopPackage … -Command '<absolute path>\app\ChatGPT.exe' -Args '--remote-debugging-port=9333'`
   started Codex fully (main window, renderers, `codex.exe` app-server, `MainWindowTitle` set), and
   `http://127.0.0.1:9333/json/version` answered with `webSocketDebuggerUrl`. The port is bound to
   loopback by Chromium's default. **`-Command` must be an absolute path**: the package-relative
   `app\ChatGPT.exe` produced a "Windows cannot find 'app\ChatGPT.exe'" dialog and, after the dialog
   timed out, the cmdlet threw `0x800704C7` "The operation was canceled by the user".
5. **The cmdlet returns promptly; it does not wait for Codex to exit.** The successful launch returned
   within ~8 s while Codex stayed running. The launcher can therefore run the attacher in the
   foreground after it.
6. **Injecting over CDP paints.** A `Runtime.evaluate` on the main page target (`app://-/index.html`)
   that appended a `<style>` with `[data-theme]{--app-color-background-surface:#0E141F !important;…}`
   returned `#0E141F | theme=dark` from `getComputedStyle` — the token resolved to the theme's navy.
   The style-tag route is author origin; every emitted declaration is `!important` (D-0004-2), which
   is exactly what makes one stylesheet win by either route. **No emitter change is needed.**
7. **Codex exposes several page targets, and the main one is not the first.** `/json` listed, in this
   order: two `webview` targets (an inline-visualization sandbox and a `chatgpt.com` checkout page),
   `page app://-/index.html?initialRoute=%2Favatar-overlay`, `page app://-/detached-window.html?…`,
   and `page app://-/index.html`. The attacher must theme **every `page` target whose URL is
   Codex's own `app://` scheme** (the same rule the preload's per-window attach had implicitly, and the
   reason D-0004-1(a) gates every selector on `[data-codex-window-type]`), and must not touch
   `webview` targets, which are third-party content.
8. **`Get-Process … | Where-Object Path` cannot see an identity-launched Codex.** After the identity
   launch, the launcher's running-instance guard (`$_.Path.StartsWith($package.InstallLocation)`)
   matched **zero** processes while `Get-CimInstance Win32_Process` listed 12 `ChatGPT.exe` processes
   with full command lines. `Process.Path` is denied for those processes from an ordinary shell. The
   guard must move to `Win32_Process.ExecutablePath` / `CommandLine`, or a themed launch over a
   running stock Codex will silently hand off and not theme (the exact failure the guard exists for).
9. **The "CDP fallback" that D-0001-1 and `docs/ENGINEERING.md` describe as "built, not default" does
   not exist in the code.** `grep -ri "remote-debugging\|cdp" injector/` finds only the comment in
   `cli.js`'s header. It was designed and recorded, never written. This plan builds it — as the
   Windows primary, not a fallback.
10. **Node 22.14.0 (this machine) has a global `WebSocket` client.** No dependency is needed for the
    CDP client. `package.json`'s `engines` says `>=22`; the global is stable from Node 22.4, so M1
    raises the floor to `>=22.4` and the installer's version check (`Install.ps1` line ~84) must
    match.

---

## The design

**Shape: the launcher starts Codex with identity and a debugging port, then runs a shared Node
"attacher" that connects over loopback and applies the theme to every Codex page.** The layer rule
holds: `launcher/windows/launch.ps1` still only resolves-and-launches (now also picks a port and
starts the attacher); all injection logic is in `injector/core/`.

```
Codexterity.exe (stub)  →  node cli.js  →  launch.ps1
                                              ├─ Invoke-CommandInDesktopPackage … ChatGPT.exe --remote-debugging-port=<P>
                                              └─ node injector/attach-cdp.js --port <P> --theme <pkg>   (foreground; exits when Codex does)
                                                     ├─ GET /json/version  (poll until up, bounded)
                                                     ├─ ws browser target: Target.setDiscoverTargets, attach to every app:// page
                                                     └─ per page: apply theme (style tag), landmark report, re-apply on navigation
```

**The attacher's contract (M1), fixed here so M1 and M2 can be built in parallel:**

- Entry: `node injector/attach-cdp.js --port <n> --theme <package path> [--timeout-ms <n>]`.
  Reads `CDX_DEBUG_LOG_PATH` exactly as `inject.js` does (same `log()` sink). Exit codes: `0` when
  the browser connection closes (Codex exited); `2` when the port never answered within the
  timeout (default 30 000 ms) — the launcher reports that plainly and leaves Codex running stock;
  `1` for a theme-load failure (already logged with its `ThemeLoadError` code) — also leaves Codex
  running stock.
- `injector/core/cdp-client.js`: a zero-dependency CDP client over the global `WebSocket`:
  `connect(wsUrl)`, `send(method, params, sessionId?)`, event subscription, flat sessions
  (`Target.attachToTarget` with `flatten: true`). Pure message framing and id matching are separable
  and unit-tested against a fake socket.
- `injector/core/cdp-page.js`: a **`webContents`-shaped adapter** over one attached page session —
  `{ id, getURL(), executeJavaScript(script) }` — so `reportLandmarkVerdicts()` and
  `reportRootEnvironment()` run **unchanged**. `executeJavaScript` maps to
  `Runtime.evaluate { expression, awaitPromise: true, returnByValue: true }` and rejects on
  `exceptionDetails`.
- Theme application per page: `Page.enable`, `Runtime.enable`, then
  `Page.addScriptToEvaluateOnNewDocument` with the style-tag script (so a navigated document is
  themed **before first paint** — this is what keeps the stock flash to the very first window
  only), plus an immediate `Runtime.evaluate` of the same script for the document already showing.
  Re-apply on `Page.frameNavigated` (top frame) — the D-0003-9 measurement stands: in-app route
  changes fire no navigation, so this is at most a few applies per session. `buildStyleTagScript()`
  is **moved** from `inject.js` into a small shared module both entry points require; it is not
  copied.
- Target filter: `type === 'page'` and URL starts with `app://`. New targets via
  `Target.targetCreated`; gone targets via `Target.targetDestroyed`.
- Landmark phases: `apply-time (cdp attach)` on first apply and the existing settled re-check
  (`scheduleSettledVerification`'s delay) on the main page, through the adapter.

**The launcher's contract (M2):**

- Port: a free ephemeral loopback port chosen per launch (`[System.Net.Sockets.TcpListener]` on
  `127.0.0.1:0`, read the port, close). Never a fixed port — two ports fixed in two products collide,
  and a fixed port is a stable name for something on the machine to look for.
- Launch: `Invoke-CommandInDesktopPackage -PackageFamilyName $package.PackageFamilyName -AppId $appId
  -Command $exePath -Args "--remote-debugging-port=$port"` with the **absolute** `$exePath` (fact 4).
  `-NoTheme` uses the same cmdlet with no `-Args` — so the Codexterity shortcut can start stock
  Codex `26.924` at all, which today's direct launch cannot (D-0001-32's promise).
- Then `node <injector>/attach-cdp.js --port $port --theme $ThemePackage` in the foreground, with
  its stdout/stderr streamed into the launcher log as Codex's used to be. The attacher's exit code
  is the launcher's.
- Running-instance guard moves to `Get-CimInstance Win32_Process` filtered on `ExecutablePath`
  under `$package.InstallLocation` (fact 8).
- The `EntryPoint -ne 'Windows.FullTrustApplication'` refusal stays; the cmdlet is for full-trust
  packaged apps too.
- `cli.js` and the stub are unchanged: the argument-free entry point stays argument-free, and
  `-ThemePackage` / `-NoTheme` / `-LogFile` keep their meanings.

**What is deliberately given up, and recorded as D-0005-1 (M3):** D-0001-1's "no debug port ever
opened" guarantee. While a themed Codex runs, a Chromium DevTools endpoint is open on `127.0.0.1`
on a random port. It is reachable only from this machine, but any local process that finds it has
full control of Codex's pages, which is more reach than the theme needs. The owner accepted this on
2026-09-26 as the only route that satisfies Codex's identity check and reaches the page. The
mitigations are loopback binding (Chromium default), a random per-launch port, and the attacher
exiting with Codex. **Do not "improve" this by pinning a port or by leaving the port open after a
`-NoTheme` launch.**

**macOS stays on `NODE_OPTIONS`** and stays UNVERIFIED (D-0001-16). Nothing in this plan changes
`launcher/macos/launch.sh` or the preload path, which remain the mechanism for any platform where
environment inheritance works. `inject.js` is therefore kept, not deleted; `buildStyleTagScript`
moves out of it into the shared module.

---

## Milestones

### M1 — The shared CDP attacher (`injector/`) — DONE 2026-09-26

**Outcome.** Built to the contract; `npm test` 408/408 (374 + 34 new). Verified against a running
Codex `26.924` exactly as fact 4 launched it: theme loaded, all three `app://` pages attached,
`injected OK via CDP style tag` on each, and on the main page `sidebar-panel`, `sidebar-active-row`,
`heading-display` and `home-hero` PRESENT. **One defect was found only by M2's FRESH-launch test,
not by this attach-to-a-running-app check:** Chromium announces a new page target
(`Target.targetCreated`) with an empty URL, so the `app://` filter rejected every page and the first
real launch themed nothing while the log said "connected". Fixed by also attaching on
`Target.targetInfoChanged`; a regression test drives that exact sequence. `inject.js` shrank from
1,333 to 516 lines through the three extractions (`style-tag.js`, `log-sink.js`,
`root-environment.js`) and is otherwise unchanged.

Build `injector/core/cdp-client.js`, `injector/core/cdp-page.js`, `injector/core/style-tag.js`
(the moved `buildStyleTagScript`) and the entry `injector/attach-cdp.js` to the contract above.

Tests (`tests/injector/cdp-client.test.js`, `tests/injector/cdp-page.test.js`,
`tests/injector/attach-cdp.test.js`): framing/id matching and session routing against a fake
socket; the adapter's `executeJavaScript` mapping including the `exceptionDetails` rejection; the
target filter (page + `app://` in, `webview` and `chatgpt.com` out, using fact 7's real list); the
argument parser and the three exit codes with the port poll injected; and that
`reportLandmarkVerdicts()` runs unchanged through the adapter (extend `tests/injector/landmarks.test.js`
with a fake adapter, not a real socket). `inject.js` must still compile and `npm test` stay green.

**Verified by:** launching Codex by hand exactly as fact 4 did, then running the attacher against
that port with `themes/captains-cabin`, and reading `injector.log`: theme loaded, every `app://` page
attached, `injected OK via CDP style tag` per page, landmarks PRESENT on the main page, and the
theme visible on screen. Then closing Codex and seeing the attacher exit 0.

### M2 — The Windows launcher re-route — DONE 2026-09-26

**Outcome.** `launch.ps1` re-routed per the contract; `build-windows-package.js` already copies
`injector/` recursively, so no packaging change was needed. **One defect was caught in review:** the
first draft used `ProcessStartInfo.ArgumentList`, which exists in .NET Core but not in the .NET
Framework that Windows PowerShell 5.1 runs on, so every real launch would have thrown; replaced with
a quoted `Arguments` string. Verified from a developer shell with `node injector/cli.js` and Deep Navy
Portrait applied: Codex `26.924` started with identity on a random port, the theme painted (captured
from the running app), the hero reported PAINTING, four landmarks PRESENT, the launcher log carried
the attacher's lines, and the script exited 0 when Codex closed. `-NoTheme` through the same cmdlet
started stock Codex with **zero** listening sockets owned by any Codex process. With Codex open,
`cdx` refused and named the PID (the CIM-based guard).

Change `launcher/windows/launch.ps1` to the launcher contract above. Extend
`tests/cli/cli.test.js` only if `cli.js` changes (it should not). `tests/packaging/windows.test.js`
must still pass (it checks the payload's shape, which gains one file, `injector/attach-cdp.js`, plus
the three core modules — update `build-windows-package.js`'s copy list and the test's expectation
in the same commit).

**Verified by:** from a developer shell, `node injector/cli.js` (i.e. `cdx`) with Deep Navy Portrait
applied: Codex `26.924` starts with identity, the theme paints, `launcher.log` carries the attacher's
lines, and closing Codex ends the script. Then `cdx restore` and `cdx` again: stock Codex starts
**through the same route with no port open** (`netstat` shows nothing on the chosen port). Then the
running-instance guard: with Codex open, `cdx` refuses and names the PID.

### M3 — Records, package, install, owner verification — DONE 2026-09-26

**Outcome.** D-0005-1 and the D-0001-1 amendment are in `docs/DECISIONS.md`, with markers in
`attach-cdp.js` and `launch.ps1`. `docs/ENGINEERING.md` carries the second "did not survive" record
and the corrected fallback claim; README, the packaging README and `Install.ps1` state Node `22.4`.
Three stale `NODE_OPTIONS` messages in `cli.js` were reworded. Package rebuilt, installed from the
built artifact (the install matches the payload byte for byte apart from the stub, which the C#
compiler stamps non-reproducibly, and the private theme). **Launched through the real Start-menu
shortcut**: Captain's Cabin first (the installer's default), then Deep Navy Portrait after
`cdx apply`. Both logs show the theme loaded, three pages themed, the hero PAINTING, the brass
active-row mark, all three fonts, and four landmarks PRESENT. Deep Navy Portrait was left running
for the owner's on-sight confirmation. Tagged `v0.3.0`.

**Left as is, deliberately:** the first window's brief stock flash (recorded in the release notes),
and `manifest.json`'s `verifiedAgainst` (D-0001-31, metadata nothing enforces).

- `docs/DECISIONS.md`: D-0005-1 (above), and an amendment row on D-0001-1: the primary mechanism is
  now platform-split — CDP over loopback on Windows (required by Codex `26.924`'s identity check),
  `NODE_OPTIONS` preload on macOS (unverified). Markers in `attach-cdp.js` and `launch.ps1`.
- `docs/ENGINEERING.md`: the Injector paragraph and the "survives updates" record gain this update
  as the second measured case — the one where the **launch route**, not the vocabulary, broke;
  fact 9's correction (the fallback was never built); the new diagnosis order (a 0-byte
  `injector.log` with a bootstrap failure in `launcher.log` means the launch route, not the theme).
- `README.md` and `packaging/windows/README.txt`: the debug-port statement, Node `>=22.4`.
- `Install.ps1`: Node floor `22.4`.
- Rebuild (`pack-ccskin.js`, `build-windows-package.js`), reinstall from the built artifact, and the
  owner launches both themes through the **real shortcut**, both modes, plus a `cdx restore` round
  trip. Tag `v0.3.0` with `docs/releases/v0.3.0.md`.

---

## Open questions for the owner

None. The one product decision (accept a loopback debug port) was taken in chat on 2026-09-26 and
is recorded as D-0005-1 in M3.
