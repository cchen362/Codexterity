# Codexterity

Codexterity is a personal theming layer for OpenAI's Codex Desktop app. It applies packaged visual themes when Codex is launched through Codexterity, while leaving the installed Codex application untouched.

This is an independent personal project and is not affiliated with or endorsed by OpenAI.

## Safety by design

- Codexterity does not modify, patch, or re-sign Codex.
- It does not read or change Codex credentials, account data, or API keys.
- A normal Codex launch remains stock.
- Removing Codexterity does not require reinstalling Codex.

## Requirements

- OpenAI Codex Desktop, **version 26.917 or newer** (September 2026 onwards). That release of Codex renamed the interface names themes attach to. Codexterity v0.2.0 targets only the new names, so an older Codex shows stock. [v0.1.0](docs/releases/v0.1.0.md) is the build for an older Codex, and it is no longer maintained.
- Node.js 22 or newer

## Using Codexterity

### Windows

Use the installer included with a Windows release package, then launch **Codexterity** from the Start menu. Close any running Codex window before launching so the theme can be applied cleanly.

**Always launch from the Codexterity shortcut.** Launching Codex from **Codex's own** icon gives you plain, unthemed Codex. That is expected and cannot be worked around: the theme is attached at the moment Codex's process starts, so a Codex that Codexterity did not start is a stock Codex. It is the most common reason for "my theme is gone".

The Windows installer and packaged launcher have been verified in the running app, on Codex 26.917, in both light and dark mode. The theme covers the whole app, including the ChatGPT Chat and Work areas that now live inside Codex. One deliberate exception: the code colours inside Codex's diff view stay OpenAI's own.

### macOS

A macOS package is built, but it has never been run on a Mac: not installed, not launched, not seen themed. Treat it as untested. See the [macOS package guide](packaging/macos/README.md) for the current setup and removal steps.

## Going back to stock Codex (Windows)

Codexterity keeps one setting — which theme is active — in `%USERPROFILE%\.codexterity\state.json`. Clearing it returns every future launch to stock Codex, and leaves everything else in place:

```powershell
node "$env:USERPROFILE\Codexterity\injector\cli.js" restore
```

It prints `Cleared the active theme. Future launches through Codexterity start stock Codex.` The Codexterity shortcut keeps working after this — it simply starts plain Codex. A Codex window that is already open stays themed until you restart it; nothing can un-paint a live window.

To put the theme back:

```powershell
node "$env:USERPROFILE\Codexterity\injector\cli.js" apply captains-cabin
```

This only records the choice — it does not launch or repaint anything. Start Codex from the Codexterity shortcut afterwards to see it.

## Removing Codexterity (Windows)

Run `Uninstall.ps1` from the same extracted `Codexterity-Windows` folder you installed from:

```powershell
powershell -ExecutionPolicy Bypass -File Uninstall.ps1
```

It restores stock Codex, removes the install folder, both shortcuts and the settings folder, then prints a `PASS` or `FAIL` line for each of those four so you can see what was actually removed. A `FAIL` line is usually themed Codex still being open — Codexterity keeps a small process alive for as long as Codex is running, which holds its own files in use. Quit Codex and run the uninstaller again.

Codex itself, your account, your conversations and everything under Codex's own `~/.codex` folder are never touched.

## When Codex updates

Codex updates itself from the Microsoft Store on its own schedule. Codexterity styles Codex by overriding Codex's own named colour, spacing and shadow variables rather than by matching its page structure, so an update that reorganises the interface generally costs nothing. Codexterity never checks which Codex version you have and never refuses to apply a theme because of one.

**Most updates cost nothing. One so far did.** Two updates in August 2026 needed no change at all, including one with a major browser-engine jump underneath Codex. Codex 26.917 (September 2026) was different. It moved onto a new runtime and **renamed the variables themes attach to**, so the theme still loaded without an error but matched nothing, and Codex looked stock. Nothing was blocked: the launcher, the theme engine and the package format all kept working unchanged. Fixing it took a new Codexterity release ([v0.2.0](docs/releases/v0.2.0.md)) that uses the new names.

**If Codex looks completely stock after an update**, check that you launched from the Codexterity shortcut, then open `injector.log` (below). If it says `injected OK` and lists interface landmarks as `PRESENT`, the theme is reaching Codex and Codex has renamed what it attaches to. That needs a Codexterity update; reinstalling will not fix it.

**If only some surface looks unstyled**, the same log names the exact piece of Codex's interface that stopped matching. That path was proved by deliberately breaking every one of those references at once: Codex stayed fully usable and fully themed, and the log named each broken one individually.

## Where the logs are

Each launch through the Codexterity shortcut rewrites two log files, so each one always describes the most recent launch only:

```powershell
Get-Content "$env:USERPROFILE\Codexterity\logs\injector.log" -Tail 40 -Encoding UTF8
Get-Content "$env:USERPROFILE\Codexterity\logs\launcher.log" -Tail 40 -Encoding UTF8
```

`injector.log` is the theming record — the theme package it loaded, the colours it set, and the interface landmarks it found or did not find. `launcher.log` is the launch record — how Codex itself was started, and any error the failure dialog quotes back at you.

An **empty** `injector.log` is correct after you have run `restore`: that launch attaches no theme, so there is nothing to log. Otherwise, if it is missing or empty after a launch, the usual cause is that Codex was already running: Codexterity refuses to start a second copy over a running one, so nothing was themed and nothing was logged. Quit Codex completely and launch from the Codexterity shortcut again.

## Working from the repository

Run the automated checks with:

```powershell
npm test
node tools/palette/audit.mjs
```

Project contributors should begin with the [engineering guide](docs/ENGINEERING.md), then read the [decision log](docs/DECISIONS.md). Implementation plans live in [`docs/plans/`](docs/plans/), exploratory work in [`docs/research/`](docs/research/), and release notes in [`docs/releases/`](docs/releases/) — the current release is [v0.2.0](docs/releases/v0.2.0.md).

### Adding a theme

A theme is generated from a **recipe** — a single file naming that theme's authored choices. The engine derives every colour from it in OKLCH and solves the contrast-critical ones against their WCAG AA target, so no colour in a shipped theme is hand-picked. Adding a theme writes a recipe; it never edits the emitter.

```powershell
node tools/mockup/build-palette-directions.mjs --hero <image>   # 1. render the options
node tools/palette/emit-theme.mjs <theme-id>                    # 3. build the chosen one
node tools/pack-ccskin.js themes/<theme-id>                     # 4. package it
```

Step 1 renders a chooser — several complete palettes, each shown as a full dark and light interface mock with the hero in place behind the empty state. Between steps 1 and 3 sits **step 2, which is authoring**: the chosen direction becomes `tools/palette/recipes/<theme-id>.mjs`, written by hand. The emitter then **refuses to write anything at all** if either mode fails AA, or if a landmark the recipe declares is absent from the stylesheet it just generated — so a failing theme cannot reach disk half-built.

The standing set of palette directions lives in [`tools/palette/directions.mjs`](tools/palette/directions.mjs). A hero image contributes **one further direction** when the picture genuinely names a colour, and none when it does not; the creative direction itself comes from the person authoring the theme, not from the image.

## License

[MIT](LICENSE)
