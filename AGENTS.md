# Codexterity — Codex

**Read `docs/ENGINEERING.md` first, in full, before writing any code.** It is the authoritative engineering guide for this repository — architecture, non-negotiable rules, the non-destructive injection model, the design floor, and verification expectations. This file is a pointer by design. Do not copy guidance into it: a copy drifts, and nothing fails when it does.

Then read `docs/DECISIONS.md` — settled cross-tool decisions that must not be re-litigated.

## Codex specifics

- Make all guidance edits in `docs/ENGINEERING.md`, never in this file or in `CLAUDE.md`. Those two are thin wrappers so that Codex and Claude Code always read identical rules.
- When you settle something durable — an injection-mechanism change, a "do not do this" ruling, a resolved follow-up — append it to `docs/DECISIONS.md` in the same commit. Another agent will not see it otherwise.
- Implementation plans live in `docs/plans/`. Read a plan's status header before treating it as fact.
- This project styles **OpenAI's Codex Desktop** app, which you may be running inside. Never modify, patch, or re-sign Codex's own files, and never touch `~/.codex/auth.json`, `~/.codex/.credentials.json`, or API keys — this is a hard, structural boundary (see D-0001-3).
