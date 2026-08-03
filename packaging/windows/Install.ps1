<#
.SYNOPSIS
    Codexterity Windows installer (Phase 4 M4).

.DESCRIPTION
    Installs Codexterity for the CURRENT USER ONLY -- never elevates, never
    writes to a protected directory (no admin prompt, no UAC). Copies the
    payload built by tools/build-windows-package.js into
    %LOCALAPPDATA%\Codexterity, applies the Captain's Cabin theme once
    (cdx apply captains-cabin), and creates a Start Menu shortcut whose
    target is the argument-free "cdx" entry point (D-0001-24/D-0001-25) via
    the GUI-subsystem stub (Codexterity.exe, D-0001-27) -- so double-
    clicking it starts Codex themed, with no console window.

    Run this script from the extracted "Codexterity-Windows" folder, with
    "payload\" present beside it (that is exactly what
    tools/build-windows-package.js produces).

.NOTES
    D-0001-3 (non-destructive): this script never writes to Codex's own
    install directory, and never touches ~/.codex (auth.json,
    .credentials.json). It only reads Codex's package metadata
    (Get-AppxPackage) to report whether Codex is present.
#>

[CmdletBinding()]
param(
    # ------------------------------------------------------------------
    # Shortcut identity. Chosen by the owner 2026-08-03 from the rendered
    # comparison (docs/mockups/0004-shortcut-icon-comparison.html), per
    # Plan 0001's M4 entry: "produce candidates and ask; do not pick in
    # prose."
    #
    # The name is deliberately THEME-NEUTRAL, and that is load-bearing
    # rather than stylistic. ONE shortcut serves every present and future
    # theme, because its target is the argument-free `cdx`, which reads
    # the active theme from ~/.codexterity/state.json (D-0001-24) -- so
    # `cdx apply <other-theme>` repoints this same shortcut without
    # touching it. A name saying "Captain's Cabin" would therefore be
    # wrong the day a second theme ships. Same reasoning governs the
    # icon: it carries no theme's palette.
    #
    # Uninstall.ps1 MUST default to the identical string -- it deletes
    # "$ShortcutName.lnk", so a mismatch silently orphans the shortcut.
    # tests/packaging/windows.test.js asserts the two are byte-identical.
    # ------------------------------------------------------------------
    [string]$ShortcutName = 'Codexterity',
    [string]$IconFileName = 'Codexterity.ico',

    # Non-interactive control over the optional Desktop shortcut. Neither
    # switch given => prompt (this script is meant to be double-clicked or
    # run by a human); either switch given => never prompt, so a scripted
    # or silent install is possible.
    [switch]$Desktop,
    [switch]$NoDesktop
)

$ErrorActionPreference = 'Stop'

function Write-Info($Message) {
    Write-Host "[codexterity-install] $Message" -ForegroundColor Cyan
}

function Write-Fail($Message) {
    Write-Host "[codexterity-install] FAILED: $Message" -ForegroundColor Red
    exit 1
}

if ($Desktop -and $NoDesktop) {
    Write-Fail '-Desktop and -NoDesktop cannot both be passed.'
}

# ---------------------------------------------------------------------------
# 1. Node.js >= 22 is a genuine prerequisite (the injector and the CLI are
#    Node scripts) -- say so plainly rather than failing obscurely later.
# ---------------------------------------------------------------------------
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Fail ('Node.js was not found on PATH. Codexterity requires Node.js 22 or later. ' +
        'Install it from https://nodejs.org (the LTS build is fine), then re-run this installer.')
}
$nodeVersionRaw = (& node --version).Trim()
if ($nodeVersionRaw -notmatch '^v(\d+)\.') {
    Write-Fail "Could not read Node's version from '$nodeVersionRaw'."
}
$nodeMajor = [int]$Matches[1]
if ($nodeMajor -lt 22) {
    Write-Fail ("Codexterity requires Node.js 22 or later; found $nodeVersionRaw. " +
        'Install a newer Node.js from https://nodejs.org, then re-run this installer.')
}
Write-Info "Node.js $nodeVersionRaw found."

# ---------------------------------------------------------------------------
# 2. Codex Desktop presence -- WARN and CONTINUE, never fail. A recipient
#    may reasonably install Codex second.
# ---------------------------------------------------------------------------
$codexPackage = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue
if ($codexPackage) {
    Write-Info "Codex Desktop found: version $($codexPackage.Version)."
} else {
    Write-Host ('[codexterity-install] WARNING: Codex Desktop (package "OpenAI.Codex") was not found. ' +
        'You can install it from the Microsoft Store any time, before or after this installer finishes -- ' +
        'the Codexterity shortcut will simply report a clear error until Codex is present.') -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 3. Copy payload\ -> %USERPROFILE%\Codexterity, replacing cleanly.
#
#    D-0001-29 -- the install root MUST NOT be under %LOCALAPPDATA%.
#
#    %LOCALAPPDATA%\<App> is the conventional no-elevation install root, and it
#    is exactly the one place this particular payload cannot live. Codex Desktop
#    is a packaged MSIX app, and MSIX applies filesystem REDIRECTION to
#    %LOCALAPPDATA% / %APPDATA%: a packaged process reading %LOCALAPPDATA%\X
#    resolves it inside its own package container
#    (…\Packages\OpenAI.Codex_…\LocalCache\Local\X), not the real user folder.
#    So files we write there are simply INVISIBLE to Codex.
#
#    Measured, not inferred. Installed to %LOCALAPPDATA%\Codexterity, the
#    shortcut launched and Codex died with exit code 13:
#        Cannot find module 'C:/Users/<u>/AppData/Local/Codexterity/injector/core/preload.js'
#    while Test-Path on that exact file returned True from an ordinary process.
#    The identical payload copied to a path under %USERPROFILE% then launched
#    cleanly and the injector attached (12,624-byte injector log, theme loaded,
#    6 landmarks). One variable changed; the outcome flipped.
#
#    %USERPROFILE%\Codexterity is still per-user and still needs NO elevation,
#    which is the property that mattered about %LOCALAPPDATA% in the first
#    place. It is deliberately NOT nested inside ~/.codexterity (the state
#    directory, D-0001-24): keeping the program and the state as siblings means
#    Uninstall.ps1's four verification checks stay independent, with no
#    remove-ordering hazard between a parent and its child.
# ---------------------------------------------------------------------------
$InstallDir = Join-Path $env:USERPROFILE 'Codexterity'
$PayloadSource = Join-Path $PSScriptRoot 'payload'

if (-not (Test-Path -LiteralPath $PayloadSource -PathType Container)) {
    Write-Fail ("Payload not found at '$PayloadSource'. Run this installer from inside the extracted " +
        "Codexterity-Windows folder, with 'payload\' present beside Install.ps1.")
}

if (Test-Path -LiteralPath $InstallDir) {
    Write-Info "Removing previous installation at '$InstallDir'..."
    try {
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
    } catch {
        # Much the likeliest cause, and one the raw "file in use" error does
        # not name: Codexterity.exe waits for the whole Codex session
        # (packaging/windows/Codexterity.cs), so re-installing while themed
        # Codex is open holds bin\Codexterity.exe open. Say that, rather than
        # letting a bare Win32 sharing violation reach a non-technical reader.
        Write-Fail ("Could not replace the previous installation at '$InstallDir': $($_.Exception.Message)`n" +
            'If themed Codex is currently running, quit it completely and re-run this installer -- ' +
            'Codexterity keeps a process alive for as long as Codex is open, which holds these files in use.')
    }
}

Write-Info "Installing to '$InstallDir'..."
Copy-Item -LiteralPath $PayloadSource -Destination $InstallDir -Recurse -Force

# ---------------------------------------------------------------------------
# 4. Apply the theme once. cdx apply ONLY persists the choice
#    (~/.codexterity/state.json, D-0001-24) -- it never launches or repaints
#    anything, and it must succeed before this install is considered done.
# ---------------------------------------------------------------------------
$CliPath = Join-Path $InstallDir 'injector\cli.js'
Write-Info 'Applying the Captain''s Cabin theme (cdx apply captains-cabin)...'
& node $CliPath apply captains-cabin
if ($LASTEXITCODE -ne 0) {
    Write-Fail "cdx apply captains-cabin failed (exit code $LASTEXITCODE). Installation did not complete."
}

# ---------------------------------------------------------------------------
# 5. Start Menu shortcut -- ALWAYS created. Target is the compiled
#    GUI-subsystem stub (D-0001-27), never powershell.exe or launch.ps1
#    directly, so double-clicking it opens no console window (see
#    packaging/windows/Codexterity.cs's own header for the measured reason).
# ---------------------------------------------------------------------------
$ExePath = Join-Path $InstallDir 'bin\Codexterity.exe'
$IconPath = Join-Path $InstallDir "bin\$IconFileName"

if (-not (Test-Path -LiteralPath $ExePath -PathType Leaf)) {
    Write-Fail "Installed payload is missing '$ExePath' -- the installer's payload looks incomplete."
}

# The .ico is a COSMETIC asset, so a missing one degrades rather than fails
# (docs/ENGINEERING.md: "degrade to the stock look and report it"). The same
# icon is also embedded in the exe itself at build time via csc's /win32icon,
# so falling back to the exe still yields the right picture -- it just loses
# the ability to swap the icon without recompiling.
if (-not (Test-Path -LiteralPath $IconPath -PathType Leaf)) {
    Write-Host ("[codexterity-install] WARNING: icon file '$IconPath' is missing; falling back to the " +
        'icon embedded in Codexterity.exe.') -ForegroundColor Yellow
    $IconPath = $ExePath
}

$shell = New-Object -ComObject WScript.Shell

$StartMenuDir = [Environment]::GetFolderPath('Programs')
$StartMenuShortcut = Join-Path $StartMenuDir "$ShortcutName.lnk"

$startShortcut = $shell.CreateShortcut($StartMenuShortcut)
$startShortcut.TargetPath = $ExePath
$startShortcut.WorkingDirectory = $InstallDir
$startShortcut.IconLocation = $IconPath
$startShortcut.Description = "$ShortcutName -- Codex Desktop, themed by Codexterity"
$startShortcut.Save()
Write-Info "Start Menu shortcut created: $StartMenuShortcut"

# ---------------------------------------------------------------------------
# 6. Desktop shortcut -- optional. -Desktop / -NoDesktop make this
#    non-interactive when driven by another script; with neither, ask once.
# ---------------------------------------------------------------------------
$wantDesktop = $false
if ($Desktop) {
    $wantDesktop = $true
} elseif ($NoDesktop) {
    $wantDesktop = $false
} else {
    $answer = Read-Host 'Also create a Desktop shortcut? [y/N]'
    $wantDesktop = ($answer -match '^\s*y(es)?\s*$')
}

$DesktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) "$ShortcutName.lnk"

if ($wantDesktop) {
    $deskShortcut = $shell.CreateShortcut($DesktopShortcut)
    $deskShortcut.TargetPath = $ExePath
    $deskShortcut.WorkingDirectory = $InstallDir
    $deskShortcut.IconLocation = $IconPath
    $deskShortcut.Description = "$ShortcutName -- Codex Desktop, themed by Codexterity"
    $deskShortcut.Save()
    Write-Info "Desktop shortcut created: $DesktopShortcut"
} else {
    Write-Info 'Skipped the Desktop shortcut (the Start Menu shortcut is always created).'
}

Write-Host ''
Write-Host 'Codexterity is installed.' -ForegroundColor Green
Write-Host "Find it in your Start Menu as `"$ShortcutName`" and launch it like any other app -- no terminal, no commands."
Write-Host 'The first launch may take a few seconds to start Codex; that is normal.'
Write-Host 'To remove Codexterity later and restore stock Codex, run Uninstall.ps1 from this same folder.'
