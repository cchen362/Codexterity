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

The Windows installer and packaged launcher have been verified in the running app.

### macOS

A macOS package is available for collaborator testing, but has not yet been verified on macOS hardware. See the [macOS package guide](packaging/macos/README.md) for the current setup and removal steps.

## Working from the repository

Run the automated checks with:

```powershell
npm test
node tools/palette/audit.mjs
```

Project contributors should begin with the [engineering guide](docs/ENGINEERING.md), then read the [decision log](docs/DECISIONS.md). Active implementation plans live in [`docs/plans/`](docs/plans/), and exploratory work lives in [`docs/research/`](docs/research/).

## License

[MIT](LICENSE)
