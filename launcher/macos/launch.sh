#!/usr/bin/env bash
#
# Codexterity macOS launcher.
#
# The ONLY macOS-specific code in Codexterity (docs/ENGINEERING.md "Layer
# rule"): it resolves the installed Codex Desktop .app bundle in a
# version-independent way and starts it with NODE_OPTIONS pointed at
# injector/core/preload.js, so the shared, platform-agnostic injector core can
# run D-0001-1's primary mechanism. It contains NO styling or injection logic.
#
# D-0001-3 (non-destructive): this script only READS from the Codex bundle
# (directory listing, Info.plist, codesign metadata). It never writes into the
# bundle, never patches or re-signs anything, and never touches
# ~/.codex/auth.json or ~/.codex/.credentials.json.
#
# ---------------------------------------------------------------------------
# VERIFICATION STATUS — READ THIS BEFORE TRUSTING IT
#
# This script has NEVER BEEN RUN ON macOS. It was written on the Windows
# development machine, and docs/ENGINEERING.md is explicit that a
# cross-platform claim requires the target OS. Nothing here should be
# described as working until a collaborator runs it on an Apple-Silicon Mac
# with Codex Desktop installed.
#
# Three things specifically are UNVERIFIED, and each fails loudly rather than
# quietly if the assumption is wrong:
#
#   1. THE BUNDLE'S IDENTITY. On Windows the executable is ChatGPT.exe inside
#      a package named OpenAI.Codex -- product name and binary name differ.
#      The macOS bundle name, bundle identifier and CFBundleExecutable are all
#      therefore unknown from here, so this script DISCOVERS them instead of
#      hardcoding a guess (see resolve_bundle below) and prints what it found.
#   2. THE NODE_OPTIONS FUSE. Phase 1 verified Codex ships stock, un-hardened
#      Electron fuses by decoding the fuse bytes out of the Windows chrome.dll.
#      The macOS build is a separate binary and its fuses were never read. If
#      EnableNodeOptionsEnvironmentVariable is off there, the app will launch
#      completely normally and simply not be themed -- so this script checks
#      the injector actually attached rather than assuming a clean launch
#      means success (see the CDX_DEBUG_LOG_PATH note at the end).
#   3. D-0001-13's !important. Codex's own sidebar rule is gated
#      :not([data-codex-window-chrome=application-menu]). The Windows main
#      window carries that attribute, which is why the sidebar was unpainted
#      there. On macOS the menu bar is the system menu bar, so the main window
#      most likely does NOT carry it -- meaning Codex's own rule, at
#      specificity (0,3,0), probably DOES match and outranks our (0,2,0)
#      landmark rule. Run the probe (CDX_PROBE=1) on macOS and read
#      `windowGuards.documentElementAttrs` to settle it. Do not "fix" this by
#      adding !important on a hunch.
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

info() { printf '[codexterity-launcher] %s\n' "$*"; }
fail() { printf '[codexterity-launcher] FAILED: %s\n' "$*" >&2; exit 1; }

usage() {
    cat <<'EOF'
Usage: launch.sh [--theme-css <path>] [--app <path to Codex .app>]

  --theme-css  Theme CSS to inject. Defaults to
               themes/captains-cabin/theme.css in this repo.
  --app        Skip discovery and use this .app bundle. Use when discovery
               reports several candidates, or none.

Environment variables are passed through to the injector unchanged:
  CDX_DEBUG_LOG_PATH  write the injector's log here (strongly recommended)
  CDX_VERIFY_AT       ms after dom-ready to run the settled check
  CDX_PROBE=1         suppress injection and run the inventory probe instead
  CDX_PROBE_OUT       directory for probe JSON reports
  CDX_PROBE_AT        ms after dom-ready to sample (comma-separated for several)
EOF
}

THEME_CSS_PATH=""
APP_BUNDLE=""
while [ $# -gt 0 ]; do
    case "$1" in
        --theme-css) [ $# -ge 2 ] || fail "--theme-css needs a value"; THEME_CSS_PATH="$2"; shift 2 ;;
        --app)       [ $# -ge 2 ] || fail "--app needs a value";       APP_BUNDLE="$2";     shift 2 ;;
        -h|--help)   usage; exit 0 ;;
        *)           usage >&2; fail "unrecognised argument '$1'" ;;
    esac
done

# ---------------------------------------------------------------------------
# 0. Refuse to run anywhere but macOS.
#
# The whole point of the layer rule is that platform assumptions stay inside a
# launcher. A launcher that runs its platform assumptions on the wrong platform
# is worse than one that does not run at all.
# ---------------------------------------------------------------------------
[ "$(uname -s)" = "Darwin" ] || fail "this is the macOS launcher; on Windows use launcher/windows/launch.ps1."

# ---------------------------------------------------------------------------
# 1. Resolve the theme CSS payload (read-only; ours, not Codex's).
# ---------------------------------------------------------------------------
if [ -z "$THEME_CSS_PATH" ]; then
    THEME_CSS_PATH="${REPO_ROOT}/themes/captains-cabin/theme.css"
fi
[ -f "$THEME_CSS_PATH" ] || fail "Theme CSS not found at '${THEME_CSS_PATH}'. Pass --theme-css explicitly if Captain's Cabin has moved."
THEME_CSS_PATH="$(cd -- "$(dirname -- "$THEME_CSS_PATH")" && pwd)/$(basename -- "$THEME_CSS_PATH")"
info "Theme CSS: ${THEME_CSS_PATH}"

# ---------------------------------------------------------------------------
# 2. Resolve the installed Codex bundle -- by DISCOVERY, never a hardcoded name.
#
# The Windows launcher resolves its target with Get-AppxPackage rather than a
# WindowsApps path, because Store updates rewrite that path. The macOS hazard is
# different but the rule is the same: a user can rename an .app bundle, keep it
# in ~/Applications, or have both a release and a beta installed. So: ask
# Spotlight for every bundle whose identifier is OpenAI's, and fall back to a
# direct scan of the two Applications directories when Spotlight is unavailable
# (indexing off, or a volume that is not indexed).
#
# Discovery matches on the BUNDLE IDENTIFIER, not the display name, for the same
# reason the Windows launcher matches on package path rather than process name:
# on Windows the binary is called ChatGPT.exe while the package is OpenAI.Codex,
# so a name match finds the wrong thing in both directions. An identifier is the
# closest macOS equivalent of package identity.
# ---------------------------------------------------------------------------
plist_read() {
    # $1 = plist path, $2 = key. Empty output (not an error) when absent.
    /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || true
}

is_codex_bundle() {
    local app="$1"
    local plist="${app}/Contents/Info.plist"
    [ -f "$plist" ] || return 1
    local id
    id="$(plist_read "$plist" CFBundleIdentifier)"
    case "$id" in
        com.openai.codex|com.openai.codex.*) return 0 ;;
        *) return 1 ;;
    esac
}

CANDIDATES=()
if [ -n "$APP_BUNDLE" ]; then
    [ -d "$APP_BUNDLE" ] || fail "--app '${APP_BUNDLE}' is not a directory. Pass the .app bundle itself."
    CANDIDATES=("$APP_BUNDLE")
    info "Bundle supplied on the command line; discovery skipped."
else
    while IFS= read -r line; do
        [ -n "$line" ] && CANDIDATES+=("$line")
    done < <(mdfind "kMDItemCFBundleIdentifier == 'com.openai.codex*'" 2>/dev/null || true)

    if [ ${#CANDIDATES[@]} -eq 0 ]; then
        # Spotlight found nothing. That is not proof of absence -- indexing can
        # be disabled -- so scan the two conventional locations directly before
        # concluding Codex is not installed.
        info "Spotlight returned no match; scanning /Applications and ~/Applications directly."
        for dir in "/Applications" "${HOME}/Applications"; do
            [ -d "$dir" ] || continue
            for app in "$dir"/*.app; do
                [ -d "$app" ] || continue
                is_codex_bundle "$app" && CANDIDATES+=("$app")
            done
        done
    fi
fi

if [ ${#CANDIDATES[@]} -eq 0 ]; then
    fail "Codex Desktop was not found in /Applications or ~/Applications, and Spotlight knows no bundle with an OpenAI Codex identifier. Install it, or pass --app <path to the .app>."
fi
if [ ${#CANDIDATES[@]} -gt 1 ]; then
    printf '[codexterity-launcher] Several candidate bundles were found:\n' >&2
    printf '  %s\n' "${CANDIDATES[@]}" >&2
    fail "refusing to guess which Codex to launch. Re-run with --app <one of the paths above>."
fi

APP_BUNDLE="${CANDIDATES[0]}"
INFO_PLIST="${APP_BUNDLE}/Contents/Info.plist"
[ -f "$INFO_PLIST" ] || fail "'${APP_BUNDLE}' has no Contents/Info.plist -- that is not an app bundle."

BUNDLE_ID="$(plist_read "$INFO_PLIST" CFBundleIdentifier)"
BUNDLE_VERSION="$(plist_read "$INFO_PLIST" CFBundleShortVersionString)"
BUNDLE_EXEC="$(plist_read "$INFO_PLIST" CFBundleExecutable)"
[ -n "$BUNDLE_EXEC" ] || fail "Info.plist in '${APP_BUNDLE}' declares no CFBundleExecutable; cannot resolve the binary to launch."

EXE_PATH="${APP_BUNDLE}/Contents/MacOS/${BUNDLE_EXEC}"
[ -x "$EXE_PATH" ] || fail "Declared executable '${EXE_PATH}' does not exist or is not executable."

info "Resolved bundle: ${APP_BUNDLE}"
info "Bundle identifier: ${BUNDLE_ID:-(none)} (version ${BUNDLE_VERSION:-unknown})"
info "Resolved executable: ${EXE_PATH}"

# The Electron framework's presence is what makes NODE_OPTIONS meaningful at
# all. Reporting it here means a future non-Electron Codex is a visible finding
# on the first run rather than a mysterious silent no-op.
ELECTRON_FRAMEWORK="${APP_BUNDLE}/Contents/Frameworks/Electron Framework.framework"
if [ -d "$ELECTRON_FRAMEWORK" ]; then
    info "Electron Framework present (NODE_OPTIONS is the right mechanism to try)."
else
    info "NOTE: no 'Electron Framework.framework' in this bundle. If injection does not attach, that is the first thing to investigate -- do not assume a bug in the injector."
fi

# ---------------------------------------------------------------------------
# 2a. Refuse to launch over a running instance.
#
# Codex is single-instance (findings §5): starting it while a copy runs makes
# the new process hand off to the running one and exit, so NODE_OPTIONS never
# reaches an Electron main process and the app comes up perfectly normal and
# completely unthemed, with no error. That is the worst failure mode available,
# so it is refused rather than risked.
#
# Matching is on the resolved executable PATH, not the process name, for the
# same reason as on Windows: the binary name is a product detail we do not
# control and may collide with an unrelated OpenAI app.
#
# This reports and stops. Quitting the user's running editor, possibly
# mid-conversation, is not a launcher's decision.
# ---------------------------------------------------------------------------
RUNNING_PIDS="$(pgrep -f "^${EXE_PATH}" 2>/dev/null || true)"
if [ -n "$RUNNING_PIDS" ]; then
    RUNNING_COUNT="$(printf '%s\n' "$RUNNING_PIDS" | wc -l | tr -d ' ')"
    FIRST_PID="$(printf '%s\n' "$RUNNING_PIDS" | head -n 1)"
    fail "Codex is already running (${RUNNING_COUNT} process(es), e.g. PID ${FIRST_PID}). Codex is single-instance: launching now would hand off to the running copy and exit, and the theme would NOT be applied -- with no visible error. Quit Codex completely, then re-run this launcher. Nothing has been changed or closed for you."
fi

# ---------------------------------------------------------------------------
# 3. Locate the shared injector preload (platform-agnostic core).
# ---------------------------------------------------------------------------
PRELOAD_PATH="${REPO_ROOT}/injector/core/preload.js"
[ -f "$PRELOAD_PATH" ] || fail "Injector preload not found at '${PRELOAD_PATH}'."
info "Injector preload: ${PRELOAD_PATH}"

# NODE_OPTIONS is tokenized by Node's own CLI-option parser, which treats a
# double-quoted value's contents as escapable. macOS paths use forward slashes
# so the Windows backslash-mangling bug cannot occur here -- but a path
# containing a space or a quote still would, and ~/Applications paths under a
# user's full name routinely contain spaces. Quote it, and refuse the one
# character that cannot be quoted safely rather than shipping a path that
# silently truncates.
case "$PRELOAD_PATH" in
    *'"'*) fail "the repository path contains a double-quote character, which cannot be passed safely through NODE_OPTIONS. Move the repository somewhere without one." ;;
esac

# ---------------------------------------------------------------------------
# 4. Launch the binary DIRECTLY -- never `open -a`.
#
# This is the macOS analogue of the Windows launcher's explorer.exe note, and
# it is the single most important line in this file. `open -a Codex` asks
# launchd to activate the app; launchd, not this shell, becomes the parent
# process, and the app inherits launchd's environment rather than ours. Every
# variable set below would be silently dropped and the app would come up
# unthemed with no error. Exec'ing Contents/MacOS/<binary> makes this shell the
# parent, so the environment block is inherited the ordinary POSIX way.
#
# The cost of the direct launch is that the app is not registered with launchd
# as a normal activation, which can affect app-nap and Dock/recent-items
# behaviour. That is cosmetic; a silently unthemed app is not.
#
# D-0001-1: no --remote-debugging-port is set here or anywhere. The CDP
# fallback is a different mechanism and is not the default.
# ---------------------------------------------------------------------------
export NODE_OPTIONS="--require \"${PRELOAD_PATH}\""
export CDX_THEME_CSS_PATH="${THEME_CSS_PATH}"

info "Launching with NODE_OPTIONS=${NODE_OPTIONS}"
info "Launching with CDX_THEME_CSS_PATH=${CDX_THEME_CSS_PATH}"
if [ -n "${CDX_DEBUG_LOG_PATH:-}" ]; then
    info "Injector log: ${CDX_DEBUG_LOG_PATH}"
else
    info "CDX_DEBUG_LOG_PATH is not set. On an unverified platform, set it -- a clean launch does NOT prove the injector attached, and the log is the only place that says so."
fi
if [ -n "${CDX_PROBE:-}" ]; then
    info "CDX_PROBE is set: theme injection is SUPPRESSED and the inventory probe will run instead."
fi

info "Codex is starting. Its stdout/stderr follow; this script exits when the app exits."
exec "$EXE_PATH" "$@"
