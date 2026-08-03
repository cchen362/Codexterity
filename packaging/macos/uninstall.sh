#!/bin/bash
#
# Codexterity macOS uninstaller.
#
# Removes exactly what install.sh can have created, and nothing else:
#   1. clears the active theme via "cdx restore" (D-0001-24's own
#      mechanism — this script does NOT reimplement state removal);
#   2. deletes the installed Codexterity.app;
#   3. VERIFIES both are gone and prints a PASS/FAIL table rather than
#      asserting success.
#
# NEVER touches ~/.codex (Codex's own config/credentials directory) —
# D-0001-3's non-destructive boundary applies here exactly as it does
# everywhere else in Codexterity.
#
# The paths this script checks are NOT hardcoded here. They are read from
# packaging/macos/install-manifest.js — the ONE shared source install.sh's
# own targets are derived from — via "node install-manifest.js", so this
# script and that module cannot silently disagree about what install.sh
# left behind. See install-manifest.js's own header for why.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

info() { printf '[codexterity-uninstall] %s\n' "$*"; }
fail() { printf '[codexterity-uninstall] FAILED: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "this uninstaller is for macOS only."

command -v node >/dev/null 2>&1 || fail "Node.js is required to run this uninstaller (it was required to install Codexterity in the first place)."

MANIFEST_JS="${SCRIPT_DIR}/install-manifest.js"
[ -f "$MANIFEST_JS" ] || fail "'${MANIFEST_JS}' is missing — cannot determine what to remove without it."

PATHS_JSON="$(node "$MANIFEST_JS")"

# Every path below comes OUT of that JSON — appCandidates, stateFile,
# stateDir are install-manifest.js's own property names, read here rather
# than re-typed as shell string literals.
APP_CANDIDATES="$(node -e 'console.log(JSON.parse(process.argv[1]).appCandidates.join("\n"))' "$PATHS_JSON")"
STATE_FILE="$(node -e 'console.log(JSON.parse(process.argv[1]).stateFile)' "$PATHS_JSON")"
STATE_DIR="$(node -e 'console.log(JSON.parse(process.argv[1]).stateDir)' "$PATHS_JSON")"

# ---------------------------------------------------------------------------
# 1. Find the installed app among install-manifest.js's candidate
#    directories (install.sh may have used either, depending on which was
#    writable at install time) and restore via ITS OWN payload's cli.js —
#    never a second, hand-rolled copy of D-0001-24's restore logic.
# ---------------------------------------------------------------------------
FOUND_APP=""
while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if [ -d "$candidate" ]; then
        FOUND_APP="$candidate"
        break
    fi
done <<< "$APP_CANDIDATES"

if [ -n "$FOUND_APP" ]; then
    PAYLOAD_CLI="${FOUND_APP}/Contents/Resources/payload/injector/cli.js"
    if [ -f "$PAYLOAD_CLI" ]; then
        info "Restoring the active theme via ${PAYLOAD_CLI}..."
        node "$PAYLOAD_CLI" restore || info "cdx restore reported a problem (see above); continuing with removal."
    else
        info "NOTE: '${FOUND_APP}' has no payload/injector/cli.js — cannot run 'cdx restore' through it. Removing the bundle anyway; ${STATE_FILE} is handled directly below."
        if [ -f "$STATE_FILE" ]; then
            rm -f "$STATE_FILE"
        fi
        if [ -d "$STATE_DIR" ] && [ -z "$(ls -A "$STATE_DIR" 2>/dev/null)" ]; then
            rmdir "$STATE_DIR"
        fi
    fi
    info "Removing ${FOUND_APP}..."
    rm -rf "$FOUND_APP"
else
    info "No installed Codexterity.app was found in any candidate location; nothing to restore or remove there."
fi

# ---------------------------------------------------------------------------
# 2. Verify. Report a PASS/FAIL table rather than asserting success — the
#    project's standing rule (docs/ENGINEERING.md) is that a script does not
#    get to claim an outcome it has not checked.
# ---------------------------------------------------------------------------
PASS=1

check() {
    local label="$1"
    local ok="$2"
    if [ "$ok" = "1" ]; then
        printf '  PASS  %s\n' "$label"
    else
        printf '  FAIL  %s\n' "$label"
        PASS=0
    fi
}

echo
echo "Codexterity uninstall verification:"

while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if [ -d "$candidate" ]; then
        check "removed: ${candidate}" "0"
    else
        check "removed: ${candidate}" "1"
    fi
done <<< "$APP_CANDIDATES"

if [ -f "$STATE_FILE" ]; then
    check "removed: ${STATE_FILE}" "0"
else
    check "removed: ${STATE_FILE}" "1"
fi

if [ -d "$STATE_DIR" ]; then
    check "removed: ${STATE_DIR}" "0"
else
    check "removed: ${STATE_DIR}" "1"
fi

echo

if [ "$PASS" = "1" ]; then
    info "Nothing residual. ~/.codex was never touched (Codexterity never reads or writes it)."
else
    fail "one or more items above were not removed. Nothing under ~/.codex was touched, but the failures above need manual cleanup."
fi
