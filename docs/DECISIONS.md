# Codexterity — Settled Decisions

Owner decisions that any coding agent (Claude Code, Codex, or otherwise) must respect and must not re-litigate.

**Why this file exists.** Agent memory stores are per-tool and per-machine. When one agent settles something and records it only in its own memory, the next agent cannot see it and will re-propose work already done or declined. This file is in git, so every agent reads the same truth.

**How this file relates to code markers.** Decisions attached to specific behaviour are marked `D-<plan>-<n>` in the code they govern (see "Settled Decisions" in `docs/ENGINEERING.md`). Those get **one line here plus a pointer**. Decisions with **no single code home** keep their full reasoning here.

**How to use it.** Read before proposing changes to the injection mechanism, the styling strategy, or anything marked CLOSED. Append when a session settles something durable. **Never delete an entry** — supersede it, and mark the old one SUPERSEDED with the reason.

---

## Decisions anchored in code

One line each. Once the governed code exists, its `D-` marker is authoritative and the reasoning lives at the anchor. **No product code exists yet (end of Phase 1)** — these are accepted decisions whose markers will be stamped into the code as each is built. Full reasoning currently lives in Plan 0001.

| ID | Ruling | Reasoning lives in |
|---|---|---|
| **D-0001-1** | **Injection mechanism.** Build our own injector (no dependency on existing projects). Primary = `NODE_OPTIONS=--require <preload>` running official `webContents.insertCSS()` in the main process — **no debug port ever opened**. Fallback (built, not default) = loopback CDP injection. | `injector/` (marker at build) · [Plan 0001 §1](plans/0001-captains-cabin-architecture.md) · [findings §5](research/phase1-research-findings.md) |
| **D-0001-2** | **Styling strategy.** Token-first: override semantic `--color-*` / `--radius-*` / `--shadow-*` on `.electron-dark` / `.electron-light`. Structural selectors only as declared, verified landmarks with graceful degradation. | `themes/*/theme.css` (marker at build) · [Plan 0001 §4](plans/0001-captains-cabin-architecture.md) |
| **D-0001-3** | **Non-destructive by construction.** Never modify, patch, or re-sign Codex's files on any OS. The injector structurally cannot read/write `auth.json`, `.credentials.json`, or API keys. Worst case = stock look; never brick. | `injector/` + `launcher/` (marker at build) · [Plan 0001 §1](plans/0001-captains-cabin-architecture.md) |
| **D-0001-4** | **Theme package format.** `.ccskin` = zip of `manifest.json` (target app + version range + landmarks) + safe-CSS-validated `theme.css` + `syntax.json` + embedded assets. Size-capped; no remote references. | `injector/theme-loader/` (marker at build) · [Plan 0001 §5](plans/0001-captains-cabin-architecture.md) |

## Superseded or hollowed-out — do not re-stamp

| Decision | Status |
|---|---|
| _None yet._ | |

## Decisions with no code home

External facts, project identity, and policy that no single file governs.

**This section is complete by design, not a backlog.**

### D-0001-5 — Project & CLI naming (CLOSED)
- **Repo / product / engine name: `Codexterity`** (codex + dexterity — "craftsmanship applied to Codex"). Chosen 2026-07-31 after checking for brand collisions; `Codexterity` is clear where shorter candidates (Gildex, Amberdex, Illumindex, Emberdex, Adornex, Aurodex, Lumindex, Hearthdex) were all taken.
- **CLI command: `cdx`** (`cdx apply <theme>` / `cdx verify` / `cdx restore`) — short alias so the long product name never has to be typed at the terminal.
- **First theme name: `Captain's Cabin`** — the theme name stays deliberately premium/elegant per the brief and is intentionally *not* tied to the engine name, so future themes (e.g. Observatory, Submarine) sit under Codexterity without a naming clash.
- **Do not re-propose** engine renames without a concrete collision or trademark reason.

### Codex Desktop environment facts (reference, verified 2026-07-31)
- Codex Desktop is **Electron** ("owl" fork, Chromium 150). Windows = sealed **MSIX** from the Store (files un-patchable); macOS = signed `.dmg`, Apple-Silicon.
- The app ships with **stock, un-hardened Electron fuses** (`NODE_OPTIONS` honoured, ASAR integrity validation off) — verified by decoding the fuse bytes in `chrome.dll`. This is what makes D-0001-1's primary mechanism available. If a future Codex build flips these fuses, the CDP fallback path applies.
- Full evidence: [`docs/research/phase1-research-findings.md`](research/phase1-research-findings.md).
