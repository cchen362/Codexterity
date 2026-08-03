<#
.SYNOPSIS
    Codexterity Windows uninstaller (Phase 4 M4).

.DESCRIPTION
    Leaves NOTHING residual (D-0001-3's user-facing promise): restores stock
    Codex (cdx restore), removes both shortcuts, removes the install
    directory, and then VERIFIES every one of those is actually gone,
    printing a PASS/FAIL line per item rather than assuming success.

    Never touches ~/.codex (Codex's own config/credentials) -- that
    boundary is absolute and this script does not construct a path under
    it anywhere.

.NOTES
    $ShortcutName's default MUST match Install.ps1's -- both scripts derive
    $InstallDir / $StartMenuShortcut / $DesktopShortcut from the identical
    expressions so the two lists (what install creates, what uninstall
    removes) cannot silently drift apart. If you change one script's
    formula, change the other's identically.

    That is enforced, not merely requested: tests/packaging/windows.test.js
    compares the three path EXPRESSIONS across the two files AND compares
    the $ShortcutName defaults byte-for-byte. The defaults need their own
    check because the expressions are "$ShortcutName.lnk" in both scripts
    and stay identical even when the two defaults have drifted apart --
    which would leave the uninstaller hunting a filename that was never
    created, and report PASS for a shortcut still sitting in the Start Menu.
#>

[CmdletBinding()]
param(
    # MUST stay byte-identical to Install.ps1's default -- see .NOTES above.
    [string]$ShortcutName = 'Codexterity'
)

$ErrorActionPreference = 'Stop'

function Write-Info($Message) {
    Write-Host "[codexterity-uninstall] $Message" -ForegroundColor Cyan
}

# D-0001-29 -- must stay byte-identical to Install.ps1's expression (a test
# compares them). NOT %LOCALAPPDATA%: MSIX redirects that path away from
# Codex's view, so the payload is installed under %USERPROFILE% instead --
# see Install.ps1's step 3 for the measurement behind that.
$InstallDir = Join-Path $env:USERPROFILE 'Codexterity'
$StartMenuDir = [Environment]::GetFolderPath('Programs')
$StartMenuShortcut = Join-Path $StartMenuDir "$ShortcutName.lnk"
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) "$ShortcutName.lnk"
$CodexterityHome = Join-Path $env:USERPROFILE '.codexterity'

# ---------------------------------------------------------------------------
# 1. cdx restore -- clears ~/.codexterity/state.json so future launches
#    start stock Codex. Tolerate a missing install dir entirely: if
#    Codexterity was already partially removed, there is nothing to restore
#    FROM, and that is not a failure of this uninstall.
# ---------------------------------------------------------------------------
if (Test-Path -LiteralPath $InstallDir -PathType Container) {
    $cliPath = Join-Path $InstallDir 'injector\cli.js'
    if (Test-Path -LiteralPath $cliPath -PathType Leaf) {
        Write-Info 'Restoring stock Codex (cdx restore)...'
        & node $cliPath restore
        if ($LASTEXITCODE -ne 0) {
            Write-Host ("[codexterity-uninstall] WARNING: cdx restore exited with code $LASTEXITCODE -- " +
                'continuing with removal anyway; state.json will be deleted directly below regardless.') -ForegroundColor Yellow
        }
    } else {
        Write-Host ('[codexterity-uninstall] WARNING: install directory exists but injector/cli.js is missing -- ' +
            'skipping "cdx restore" and removing the directory directly.') -ForegroundColor Yellow
    }
} else {
    Write-Info "No install directory found at '$InstallDir' -- skipping 'cdx restore' (nothing to restore from)."
}

# Every removal below goes through this helper rather than calling
# Remove-Item directly, and that is a correctness fix rather than tidiness:
# $ErrorActionPreference is 'Stop', so ONE locked file (most likely
# bin\Codexterity.exe, which stays alive for as long as themed Codex is open)
# would throw and abort this script BEFORE the PASS/FAIL report below --
# killing the exact output the uninstaller exists to produce, and leaving the
# user with a raw sharing violation instead of a list of what is still there.
# Removal failures are swallowed here ON PURPOSE because the verification pass
# in step 4 is what actually reports them: it re-tests every path and prints
# FAIL for anything still present. Nothing is hidden -- it is reported later,
# by the step whose job that is.
function Remove-Quietly($Path, [switch]$Recurse) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    try {
        if ($Recurse) {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        } else {
            Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
        }
    } catch {
        Write-Host ("[codexterity-uninstall] Could not remove '$Path': $($_.Exception.Message)") -ForegroundColor Yellow
    }
}

# A corrupt or already-cleared state file must not block removal: delete
# ~/.codexterity directly regardless of what "cdx restore" above did or
# could not do, exactly the same "residue must go" reasoning as
# injector/cli.js's own clearState().
Remove-Quietly $CodexterityHome -Recurse

# ---------------------------------------------------------------------------
# 2. Remove both shortcuts.
# ---------------------------------------------------------------------------
Remove-Quietly $StartMenuShortcut
Remove-Quietly $DesktopShortcut

# ---------------------------------------------------------------------------
# 3. Remove the install directory itself.
# ---------------------------------------------------------------------------
Remove-Quietly $InstallDir -Recurse

# ---------------------------------------------------------------------------
# 4. Verify and report -- PASS/FAIL per item, never just "done".
# ---------------------------------------------------------------------------
function Report($Label, $Path) {
    $gone = -not (Test-Path -LiteralPath $Path)
    if ($gone) {
        Write-Host ('  PASS  {0}' -f $Label) -ForegroundColor Green
    } else {
        Write-Host ('  FAIL  {0}  (still present: {1})' -f $Label, $Path) -ForegroundColor Red
    }
    return $gone
}

Write-Host ''
Write-Host 'Codexterity removal report:' -ForegroundColor Cyan
$allGone = $true
$allGone = (Report '~/.codexterity removed'      $CodexterityHome)    -and $allGone
$allGone = (Report 'Install directory removed'    $InstallDir)        -and $allGone
$allGone = (Report 'Start Menu shortcut removed'  $StartMenuShortcut) -and $allGone
$allGone = (Report 'Desktop shortcut removed'     $DesktopShortcut)   -and $allGone

Write-Host ''
if ($allGone) {
    Write-Host 'Codexterity has been fully removed.' -ForegroundColor Green
} else {
    Write-Host 'Some Codexterity files could not be removed -- see FAIL lines above.' -ForegroundColor Yellow
}
Write-Host "Codex's own configuration and credentials (~/.codex) were never touched -- that boundary is absolute." -ForegroundColor Cyan
