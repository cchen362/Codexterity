#!/bin/bash
#
# Codexterity — macOS-ONLY final packaging step.
#
# Ad-hoc signs the wrapper Codexterity.app (never Codex itself — D-0001-3)
# and builds a .dmg containing it plus an /Applications symlink. This
# CANNOT run anywhere but macOS: codesign and hdiutil are both macOS
# system tools with no cross-platform equivalent, which is why this is a
# shell script handed off to be run on the Mac, rather than something
# packaging/macos/build-macos-package.js (which runs anywhere) attempts.
#
# Usage: build-dmg.sh <path to Codexterity.app> [output .dmg path]
#   Defaults the output to ./Codexterity.dmg next to the input .app.
#
# What this script does NOT do: notarize. Ad-hoc signing (--sign -) proves
# the bundle has not been altered since signing; it does not satisfy
# Gatekeeper's notarization requirement, so a Gatekeeper prompt on first
# launch is EXPECTED and documented in README.md, not a defect to silence.

set -euo pipefail

info() { printf '[codexterity-build-dmg] %s\n' "$*"; }
fail() { printf '[codexterity-build-dmg] FAILED: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "this script builds a .dmg and can only run on macOS (needs codesign and hdiutil, both macOS system tools)."
command -v codesign >/dev/null 2>&1 || fail "'codesign' was not found. This should always be present on macOS; something is unusual about this system."
command -v hdiutil >/dev/null 2>&1 || fail "'hdiutil' was not found. This should always be present on macOS; something is unusual about this system."

APP_PATH="${1:-}"
[ -n "$APP_PATH" ] || fail "usage: build-dmg.sh <path to Codexterity.app> [output .dmg path]"
[ -d "$APP_PATH" ] || fail "'${APP_PATH}' is not a directory (expected a .app bundle)."
APP_PATH="$(cd -- "$APP_PATH" && pwd)"

OUT_DMG="${2:-$(dirname -- "$APP_PATH")/Codexterity.dmg}"

# ---------------------------------------------------------------------------
# 1. Icon: generate Codexterity.icns from PNGs if present, on this machine
#    only (iconutil is macOS-only, same reason as codesign/hdiutil above).
#    Absence is NOT fatal — the .app must still launch with the system
#    default icon (degrade, never fail). The icon's actual design is a
#    separate, pending owner decision made from a render; this step only
#    ever converts whatever PNG set is handed to it.
# ---------------------------------------------------------------------------
ICONSET_DIR="$(dirname -- "$APP_PATH")/Codexterity.iconset"
ICNS_DEST="${APP_PATH}/Contents/Resources/Codexterity.icns"
if [ -d "$ICONSET_DIR" ]; then
    if command -v iconutil >/dev/null 2>&1; then
        info "Building Codexterity.icns from ${ICONSET_DIR}..."
        iconutil -c icns "$ICONSET_DIR" -o "$ICNS_DEST"
    else
        info "NOTE: iconutil not found; skipping icon generation. The app will launch with the system default icon."
    fi
else
    info "NOTE: no ${ICONSET_DIR} found; shipping without a custom icon. The app will launch with the system default icon (this is expected until the icon is chosen from a render)."
fi

# ---------------------------------------------------------------------------
# 2. Ad-hoc sign the WRAPPER — never Codex, which this tool never touches
#    (D-0001-3). "--deep" covers the shim binary and any resources; "-"
#    is the ad-hoc identity (no Apple Developer certificate involved).
# ---------------------------------------------------------------------------
info "Ad-hoc signing ${APP_PATH}..."
codesign --force --deep --sign - "$APP_PATH"

info "Verifying the signature..."
if codesign -dv "$APP_PATH" 2>&1; then
    info "codesign -dv reported the signature above."
else
    fail "codesign -dv could not verify the signature just applied."
fi

# spctl's assessment is reported, not asserted as pass/fail — an ad-hoc
# signature is EXPECTED to be rejected by Gatekeeper's default policy
# (no Developer ID, no notarization). That rejection is what produces the
# first-run prompt README.md documents; a clean spctl accept here would
# actually be surprising and worth investigating, not celebrating.
info "Gatekeeper assessment (an ad-hoc-signed app is normally rejected here — that is expected, see README.md):"
spctl -a -vv "$APP_PATH" 2>&1 || true

# ---------------------------------------------------------------------------
# 3. Build the .dmg: the .app plus an /Applications symlink, the
#    conventional macOS "drag to install" layout.
# ---------------------------------------------------------------------------
STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGING_DIR"' EXIT

cp -R "$APP_PATH" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

info "Building ${OUT_DMG}..."
hdiutil create -volname "Codexterity" -srcfolder "$STAGING_DIR" -ov -format UDZO "$OUT_DMG"

info "Done: ${OUT_DMG}"
