# Codexterity

Codexterity is a personal theming layer for OpenAI's Codex Desktop app. It applies packaged visual themes when Codex is launched through Codexterity, while leaving the installed Codex application untouched.

This is an independent personal project and is not affiliated with or endorsed by OpenAI.

## Safety by design

- Codexterity does not modify, patch, or re-sign Codex.
- It does not read or change Codex credentials, account data, or API keys.
- A normal Codex launch remains stock.
- Removing Codexterity does not require reinstalling Codex.

## Requirements

- OpenAI Codex Desktop
- Node.js 22 or newer

## Using Codexterity

### Windows

Use the installer included with a Windows release package, then launch **Codexterity** from the Start menu. Close any running Codex window before launching so the theme can be applied cleanly.

**Always launch from the Codexterity shortcut.** Launching Codex from **Codex's own** icon gives you plain, unthemed Codex. That is expected and cannot be worked around: the theme is attached at the moment Codex's process starts, so a Codex that Codexterity did not start is a stock Codex. It is the most common reason for "my theme is gone".

The Windows installer and packaged launcher have been verified in the running app.

### macOS

A macOS package is available for collaborator testing, but has not yet been verified on macOS hardware. See the [macOS package guide](packaging/macos/README.md) for the current setup and removal steps.

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

Codex updates itself from the Microsoft Store on its own schedule, and the theme keeps applying. Codexterity styles Codex by overriding Codex's own colour, spacing and shadow variables rather than by matching its page structure, so an update that reorganises the interface generally costs nothing. Codexterity never checks which Codex version you have and never refuses to apply a theme because of one.

If some surface ever looks unstyled after an update, the injector log names the exact piece of Codex's interface that stopped matching. This was proved by deliberately breaking every one of those references at once: Codex stayed fully usable and fully themed, and the log named each broken one individually.

## Where the logs are

Each launch through the Codexterity shortcut rewrites two log files, so each one always describes the most recent launch only:

```powershell
Get-Content "$env:USERPROFILE\Codexterity\logs\injector.log" -Tail 40 -Encoding UTF8
Get-Content "$env:USERPROFILE\Codexterity\logs\launcher.log" -Tail 40 -Encoding UTF8
```

`injector.log` is the theming record — the theme package it loaded, the colours it set, and the interface landmarks it found or did not find. `launcher.log` is the launch record — how Codex itself was started, and any error the failure dialog quotes back at you.

If `injector.log` is missing or empty after a launch, the usual cause is that Codex was already running: Codexterity refuses to start a second copy over a running one, so nothing was themed and nothing was logged. Quit Codex completely and launch from the Codexterity shortcut again.

## Working from the repository

Run the automated checks with:

```powershell
npm test
node tools/palette/audit.mjs
```

Project contributors should begin with the [engineering guide](docs/ENGINEERING.md), then read the [decision log](docs/DECISIONS.md). Implementation plans live in [`docs/plans/`](docs/plans/), exploratory work in [`docs/research/`](docs/research/), and release notes in [`docs/releases/`](docs/releases/) — the current release is [v0.1.0](docs/releases/v0.1.0.md).

## License

[MIT](LICENSE)
