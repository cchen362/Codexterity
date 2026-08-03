#!/bin/bash
#
# Codexterity macOS installer.
#
# Run this from inside the handed-over folder, next to Codexterity.app
# (i.e. the tree packaging/macos/build-macos-package.js produced, or the
# contents of the .dmg build-dmg.sh built from it). It:
#
#   1. verifies Node >= 22 is on PATH (a genuine prerequisite; nothing here
#      bundles a runtime — docs/ENGINEERING.md, the "Node is a genuine
#      prerequisite" fact from the milestone brief);
#   2. copies Codexterity.app to /Applications (or ~/Applications if the
#      former is not writable) — NEVER with sudo;
#   3. fixes the executable bit on the copied bundle's shim — see below,
#      this is not optional and not a formality;
#   4. runs "cdx apply captains-cabin" ONCE, against the payload just
#      installed;
#   5. prints plain-language next steps.
#
# THIS SCRIPT DOES NOT LAUNCH CODEX AND DOES NOT TOUCH ~/.codex. It only
# ever writes under the install target and under ~/.codexterity
# (D-0001-24) — the same non-destructive boundary (D-0001-3) that governs
# every other part of Codexterity.
#
# ---------------------------------------------------------------------------
# THE EXECUTABLE-BIT DECISION — why step 3 exists and is not skippable.
#
# Codexterity.app/Contents/MacOS/Codexterity was generated on the Windows
# development machine, which has no POSIX permission bits at all — whatever
# chmod that build attempted is not a real, transportable exec bit (verified:
# it lands as a plain read/write file there). And even a bundle built on a
# POSIX machine can lose that bit crossing to this one: D-0001-20 already
# found, the hard way, that a zip archive's external attributes can silently
# misencode a Unix 0755 as something else entirely (0755's group-execute bit
# sits exactly where a DOS zip reads its directory flag) — and this script
# has no control over what archiver, if any, carried the .app here (zip,
# tarball, cloud sync, USB all behave differently). A .app whose
# Contents/MacOS/<exe> is not chmod +x will not launch from Finder — with NO
# error dialog, nothing in Console, nothing to go on. So this script sets the
# bit itself, explicitly, on the copy it just made, regardless of how that
# copy arrived. Do not remove this step on the assumption the bundle "should"
# already be executable.
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_SOURCE="${SCRIPT_DIR}/Codexterity.app"

info() { printf '[codexterity-install] %s\n' "$*"; }
fail() { printf '[codexterity-install] FAILED: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS only."

[ -d "$APP_SOURCE" ] || fail "Codexterity.app was not found next to this script at '${APP_SOURCE}'. Run install.sh from inside the folder it shipped in."

# ---------------------------------------------------------------------------
# 1. Node prerequisite.
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
    fail "Node.js (>=22) is required and was not found on PATH. Install it from https://nodejs.org/ and re-run this installer."
fi
NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
    fail "Node.js >= 22 is required; found $(node --version) on PATH. Install a newer Node from https://nodejs.org/ and re-run."
fi
info "Node $(node --version) found."

# ---------------------------------------------------------------------------
# 2. Pick an install target — NEVER sudo. Prefer /Applications; fall back to
#    ~/Applications (created if it does not exist) when /Applications is not
#    writable by this user.
# ---------------------------------------------------------------------------
if [ -w "/Applications" ]; then
    INSTALL_DIR="/Applications"
else
    INSTALL_DIR="${HOME}/Applications"
    mkdir -p "$INSTALL_DIR"
    info "/Applications is not writable by this user; installing to ${INSTALL_DIR} instead (no sudo will be used)."
fi
APP_DEST="${INSTALL_DIR}/Codexterity.app"

if [ -d "$APP_DEST" ]; then
    info "An existing install at '${APP_DEST}' will be replaced."
    rm -rf "$APP_DEST"
fi

info "Installing to ${APP_DEST}..."
cp -R "$APP_SOURCE" "$APP_DEST"

# ---------------------------------------------------------------------------
# 3. The executable-bit fix — see the header comment. This is the ACTUAL
#    guarantee, not the build script's best-effort chmod.
# ---------------------------------------------------------------------------
SHIM_PATH="${APP_DEST}/Contents/MacOS/Codexterity"
[ -f "$SHIM_PATH" ] || fail "'${SHIM_PATH}' is missing from the installed bundle — the package is malformed."
chmod +x "$SHIM_PATH"
info "Set the executable bit on ${SHIM_PATH}."

# ---------------------------------------------------------------------------
# 4. Apply the theme once. This only PERSISTS the choice to
#    ~/.codexterity/state.json (D-0001-24) — it does not launch or paint
#    anything, exactly as "cdx apply" documents itself.
# ---------------------------------------------------------------------------
PAYLOAD_CLI="${APP_DEST}/Contents/Resources/payload/injector/cli.js"
[ -f "$PAYLOAD_CLI" ] || fail "'${PAYLOAD_CLI}' is missing from the installed bundle — the package is malformed."
node "$PAYLOAD_CLI" apply captains-cabin

# ---------------------------------------------------------------------------
# 5. Plain-language next steps.
# ---------------------------------------------------------------------------
cat <<EOF

Codexterity is installed at: ${APP_DEST}

Next steps:
  1. Open it from Finder / Spotlight like any other app: "Codexterity".
     The FIRST launch will likely show a Gatekeeper prompt because the
     wrapper is ad-hoc signed, not notarized. See this folder's README.md
     for exactly what that prompt says and what to click.
  2. Codexterity will start Codex Desktop themed with Captain's Cabin.
     Codex itself is never modified — only how it is launched.
  3. To remove Codexterity later, run uninstall.sh from this same folder.

This machine and this installer have NOT been verified by the Codexterity
project — see README.md for exactly what is and is not proven here, and
what to report back if something does not work.
EOF
