Codexterity for Windows — Captain's Cabin
==========================================

What this is
------------
Codexterity reskins OpenAI's Codex Desktop app with the "Captain's Cabin"
theme — a deep-navy-and-brass chart-room-at-night aesthetic — without modifying a
single file inside Codex itself. Nothing here patches, replaces, or
re-signs any Codex file, on this machine or any other.

Before you install
-------------------
1. Node.js 22.4 or later must be installed. If you don't have it, get it
   from https://nodejs.org (the LTS build is fine) and install it first.
2. Codex Desktop should be installed from the Microsoft Store. If it isn't
   yet, that's fine — install it whenever you like, before or after this.

How to install
---------------
1. Right-click "Install.ps1" and choose "Run with PowerShell".
   (If Windows blocks it as an untrusted script, open a PowerShell window
   in this folder and run:  powershell -ExecutionPolicy Bypass -File Install.ps1)
2. The installer will:
   - check that Node.js is present and new enough,
   - copy Codexterity into your own user folder (no admin prompt — it
     never asks for one, and never needs one),
   - apply the Captain's Cabin theme,
   - create a Start Menu shortcut named "Codexterity",
   - optionally offer to add a Desktop shortcut too.
3. Launch Codex from that new shortcut, exactly like you'd launch any
   other app. There is nothing to type, ever, after this point.

If you already have Codex open when you launch the shortcut, close it
first — Codex only allows one running copy at a time, and the themed
launch needs to be the one that starts it.

How to remove it
------------------
Run "Uninstall.ps1" the same way you ran the installer. It restores
stock, unthemed Codex, removes both shortcuts, and deletes everything
Codexterity installed. It prints a pass/fail line for each of those so
you can see exactly what was removed. Your Codex account, conversations,
and settings are never touched — Codexterity never reads or writes
anything under Codex's own configuration folder.

Something not working?
------------------------
- "Node.js was not found on PATH" — install Node.js from
  https://nodejs.org, then run Install.ps1 again.
- The shortcut does nothing, or a small error window appears — that error
  window is deliberate: Codexterity always tells you when something failed
  rather than silently doing nothing. It will name the problem (for
  example, Codex not being installed, or Codex already running).
- Codex looks unthemed after installing — make sure you launched it from
  the "Codexterity" shortcut, not Codex's own icon. Codex's own icon always
  launches the stock, unthemed app.
