# Codexterity — Claude Code

The authoritative engineering guide for this repository is `docs/ENGINEERING.md`, imported below. It is shared with every coding agent that works on Codexterity — **make all guidance edits there, not in this file**, so Claude Code and Codex can never drift apart.

@docs/ENGINEERING.md

## Claude Code specifics

- Settled cross-tool decisions live in `docs/DECISIONS.md`. Read it before proposing work on the injector, the styling strategy, or anything marked CLOSED, and append there — not only to memory — when a session settles something durable. Memory is private to this tool and this machine; Codex cannot see it.
- Implementation plans live in `docs/plans/`. Use the `implement-milestone`, `wrap-up`, and `handoff` skills when the request matches them.
- This is the **Windows** development machine (PowerShell primary). The finished skin is also targeted at **macOS** (a collaborator's machine). Verify platform-specific launcher/packaging work against the OS it targets, not just this one.
