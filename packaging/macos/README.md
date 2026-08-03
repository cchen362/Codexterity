# Codexterity for macOS — read this before you install anything

Thank you for trying this. There is no Mac on this project, so **everything
in this folder is unverified on macOS** — it was built and tested on
Windows, and this is the first time any of it will run on an Apple machine.
That is not a formality: it means real bugs are plausible on first run, and
whether you install this at all is entirely up to you. If you'd rather not,
that's a completely fine answer and nobody is waiting on you.

If you do try it and something goes wrong, the "What a failure looks like"
section below tells you exactly what to note down so a report back is
useful instead of just "it didn't work."

## What this actually is

Codexterity re-skins OpenAI's Codex Desktop app at runtime — colors, fonts,
a few visual touches (Captain's Cabin: a dark-navy/brass "chart room at
night" look). **It never modifies, patches, or re-signs Codex itself.**
Codex's own app bundle on disk is untouched, byte for byte, always. What
Codexterity installs is a small separate wrapper app that *starts* Codex
with the styling attached — like launching an app through a shortcut that
also plays some extra setup, not like installing a Codex plugin. Codex
started any other way (its own icon, Spotlight, etc.) looks completely
normal and stock, because nothing about it was changed.

Codexterity also never reads or writes Codex's own login data
(`~/.codex/auth.json`, `~/.codex/.credentials.json`) — that boundary is
enforced structurally, not just promised.

## Prerequisites

- **Codex Desktop** already installed (in `/Applications` or
  `~/Applications`).
- **Node.js 22 or newer** on your `PATH`. This is a real requirement —
  nothing here bundles its own copy of Node. Check with `node --version`;
  if it's missing or older, get it from <https://nodejs.org/>.
  `install.sh` checks this for you and tells you plainly if it's missing.

## Installing

1. Unzip/open this folder so `Codexterity.app`, `install.sh`, and
   `uninstall.sh` are all next to each other.
2. Open Terminal, `cd` into that folder, and run:
   ```
   ./install.sh
   ```
3. It copies `Codexterity.app` into `/Applications` (or `~/Applications` if
   `/Applications` isn't writable by your account — either way, **no admin
   password / sudo is ever used**), fixes a file permission bit that has to
   be set correctly for the app to launch at all (see "The executable bit"
   below if you're curious why that's a whole step), and applies the theme
   once.
4. Open **Codexterity** from Launchpad/Spotlight/Applications like any
   other app.

## The Gatekeeper prompt you should expect on first launch

Codexterity's wrapper app is **ad-hoc signed** — verified as unmodified
since it was built, but not signed with an Apple Developer certificate and
not notarized by Apple (that costs money and an Apple Developer account,
neither of which this project has). macOS's Gatekeeper is suspicious of
that by default, so **the first time you open Codexterity, macOS will very
likely say it can't verify the developer, or refuse to open it outright.**

What to do: right-click (or Control-click) `Codexterity.app` in
`/Applications`, choose **Open**, and confirm **Open** in the dialog that
appears. This tells macOS you specifically approved this one app; you
should only need to do it once. If macOS instead shows a message with no
"Open" option at all, go to **System Settings → Privacy & Security**, scroll
down, and there should be an "Open Anyway" button for Codexterity shortly
after you tried to launch it.

This prompt is about the wrapper, never about Codex — Codex Desktop itself
is not touched and needs no such approval.

## Uninstalling

From the same folder:
```
./uninstall.sh
```
This clears the applied theme, deletes `Codexterity.app` from wherever it
was installed, and then **checks its own work** — it prints a line for
each thing it was supposed to remove, marked PASS or FAIL, rather than just
claiming success. It never touches `~/.codex` (Codex's own settings and
login data) under any circumstance. If you ever want to fully remove
Codexterity, this is guaranteed to leave nothing else behind.

## The three things nobody has been able to check without a Mac

These are named explicitly so that if something doesn't work, you can say
*which* of these it looks like, instead of just "it's broken" — that's the
difference between a report we can act on and one we can't.

1. **What Codex's app bundle actually looks like on macOS.**
   `launcher/macos/launch.sh` (inside the payload) *discovers* Codex rather
   than assuming a fixed name or path, and prints what it found. **What a
   failure looks like:** it reports it can't find Codex at all, or it finds
   more than one candidate and refuses to guess. Either way it will say so
   in plain text rather than failing silently — if you see this, that
   message is the useful part to send back.
2. **Whether the mechanism Codexterity uses to inject styling even works
   on the macOS build of Codex.** Windows Codex was verified to allow it;
   the macOS build has never been checked. **What a failure looks like:**
   Codex opens completely normally, looks exactly like stock Codex, no
   error of any kind — it just isn't themed. That's a real, expected-to-be-
   possible outcome, not a crash. If that happens, the log file (see
   below) is what tells us why.
3. **Whether one specific visual rule (a sidebar coloring fix) needs an
   extra adjustment on macOS.** **What a failure looks like:** everything
   else is themed (dark navy background, brass accents, etc.) except the
   left-hand sidebar looks unstyled or shows through to your desktop
   background/wallpaper.

If you hit any of the above, the log file at
`~/Library/Logs/Codexterity/codexterity-<timestamp>.log` (created
automatically on each launch) is the thing to attach to a report — it's
plain text and contains no personal data, credentials, or your Codex
conversations.

## The icon

Codexterity's app icon is not finalized yet — it's an open design decision
waiting on a rendered mockup, not something guessed at here. Until it
ships, `Codexterity.app` uses the generic macOS app icon. That's expected
and not a packaging bug.

## The executable bit (only if you're curious why install.sh does what it does)

A macOS `.app` is really just a folder with a specific layout, and inside
it there's one particular file (`Contents/MacOS/Codexterity`) that has to
be individually marked "this file is allowed to run" — a permission bit
that has nothing to do with file *content* and everything to do with how
it got to your machine. Because this wrapper was built on a Windows
machine (which has no equivalent concept of that permission at all) and
then transferred to you somehow (zip, cloud sync, USB — whatever channel),
that bit can very easily not survive the trip. `install.sh` sets it
explicitly, every time, right after copying the app — that's a deliberate,
necessary step, not a leftover debug line.

## Summary: what "unverified" concretely means for you

- It should install without needing your password.
- The first launch will very likely need the one-time Gatekeeper "Open
  Anyway" step above.
- After that, it may just work — or it may show Codex completely unthemed
  with no error, per unknown #2 above. Either outcome is a legitimate,
  useful result to report back, even "it opened, looked completely
  normal/stock" is worth knowing.
- Nothing here can damage your Codex installation or its login data, by
  construction — worst case is an unthemed but fully working Codex.
- You are not obligated to try any of this, and there's no deadline.
