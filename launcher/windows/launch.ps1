<#
.SYNOPSIS
    Codexterity Windows launcher -- Gate 0.

.DESCRIPTION
    The ONLY Windows-specific code in Codexterity (docs/ENGINEERING.md "Layer
    rule"). Resolves the installed Codex Desktop MSIX package via
    Get-AppxPackage (never a hardcoded WindowsApps path -- the Store rewrites
    the install directory on every update), then launches it directly with
    NODE_OPTIONS pointed at injector/core/preload.js so the shared injector
    core can attempt D-0001-1's primary mechanism
    (NODE_OPTIONS=--require <preload> + webContents.insertCSS()).

    This script contains NO styling/injection logic. All of that lives in
    injector/core/. This script only resolves-and-launches, per the Layer
    rule in docs/ENGINEERING.md.

    D-0001-3 (non-destructive): this script only ever READS from the Codex
    install directory (Get-AppxPackage, file existence checks) and never
    writes to it, patches it, or touches ~/.codex/auth.json or
    ~/.codex/.credentials.json.

.NOTES
    Gate 0 (Plan 0001 §1) is testing whether NODE_OPTIONS survives into the
    packaged app's main process at all. Codex Desktop's Application entry in
    its MSIX manifest declares EntryPoint="Windows.FullTrustApplication" --
    i.e. it is a full-trust Win32 process wrapped for package identity
    (Desktop Bridge), not an AppContainer UWP app. That is what makes a
    *direct* child-process launch of its exe worth attempting: a normal
    Win32 CreateProcess child inherits the parent's environment block the
    ordinary way. The alternative activation route (`shell:AppsFolder\<AUMID>`
    via explorer.exe) would NOT inherit env vars we set here, because
    explorer.exe -- not this script -- would be the actual parent process.
    That distinction is exactly what this script exists to test.
#>

[CmdletBinding()]
param(
    # Absolute path to the theme CSS to inject. Left empty here and defaulted in
    # the body on purpose: under Windows PowerShell 5.1, $PSScriptRoot is not yet
    # populated while param() default expressions are evaluated for a script
    # invoked via -File, so defaulting here yields an empty Join-Path and a
    # confusing failure far from its cause.
    [string]$ThemeCssPath
)

$ErrorActionPreference = 'Stop'

function Write-Fail($Message) {
    Write-Host "[codexterity-launcher] FAILED: $Message" -ForegroundColor Red
    exit 1
}

function Write-Info($Message) {
    Write-Host "[codexterity-launcher] $Message" -ForegroundColor Cyan
}

# ---------------------------------------------------------------------------
# 1. Resolve the theme CSS payload (read-only; ours, not Codex's).
# ---------------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($ThemeCssPath)) {
    $ThemeCssPath = Join-Path $PSScriptRoot '..\..\themes\captains-cabin\theme.css'
}
$ThemeCssPath = [System.IO.Path]::GetFullPath($ThemeCssPath)
if (-not (Test-Path -LiteralPath $ThemeCssPath -PathType Leaf)) {
    Write-Fail "Theme CSS not found at '$ThemeCssPath'. Pass -ThemeCssPath explicitly if Captain's Cabin has moved."
}
Write-Info "Theme CSS: $ThemeCssPath"

# ---------------------------------------------------------------------------
# 2. Resolve the installed Codex package -- version-independent.
#    NEVER hardcode a WindowsApps path; Store updates rewrite it.
# ---------------------------------------------------------------------------
$package = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue
if (-not $package) {
    Write-Fail ("Codex Desktop (package 'OpenAI.Codex') is not installed for this user. " +
        "Install it from the Microsoft Store, then re-run this launcher.")
}
Write-Info "Resolved package: $($package.PackageFullName) (version $($package.Version))"

$manifestPath = Join-Path $package.InstallLocation 'AppxManifest.xml'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    Write-Fail "AppxManifest.xml not found under '$($package.InstallLocation)'. Cannot resolve the executable."
}

[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$ns = New-Object System.Xml.XmlNamespaceManager($manifest.NameTable)
$ns.AddNamespace('a', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')

$appNode = $manifest.SelectSingleNode('//a:Applications/a:Application', $ns)
if (-not $appNode) {
    Write-Fail "No <Application> entry found in AppxManifest.xml -- cannot resolve the executable or AUMID."
}

$appId = $appNode.Id
$executableRelative = $appNode.Executable
$entryPoint = $appNode.EntryPoint
$aumid = "$($package.PackageFamilyName)!$appId"

Write-Info "AppId: $appId"
Write-Info "EntryPoint: $entryPoint"
Write-Info "AUMID (for reference, not used by this launch path): $aumid"

if ($entryPoint -ne 'Windows.FullTrustApplication') {
    Write-Fail ("Codex's Application entry has EntryPoint='$entryPoint', not 'Windows.FullTrustApplication'. " +
        "This launcher's direct-exe-launch approach is validated only for full-trust packaged apps; a " +
        "different EntryPoint means direct child-process launch may not carry package identity or may be " +
        "blocked outright, and this is a real Gate 0 finding, not something to route around.")
}

# ---------------------------------------------------------------------------
# 2a. Refuse to launch over a running instance.
#
# Codex is single-instance. Starting it while a copy is already running makes
# the new process hand off to the existing one ("Opening in existing browser
# session") and exit immediately -- so our NODE_OPTIONS never reaches an
# Electron main process and the theme is silently NOT applied. The user sees a
# perfectly normal, completely unthemed Codex and no error at all, which is the
# worst failure mode available to us.
#
# Detection matches on the PACKAGE PATH, not the process name: the executable
# is ChatGPT.exe (not Codex.exe), and a name match on "ChatGPT" would also hit
# the unrelated "ChatGPT Classic" app.
#
# This reports and stops rather than terminating anything. Closing the user's
# running editor -- possibly mid-conversation -- is not a launcher's decision.
# ---------------------------------------------------------------------------
$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and $_.Path.StartsWith($package.InstallLocation, [StringComparison]::OrdinalIgnoreCase)
})
if ($running.Count -gt 0) {
    Write-Fail ("Codex is already running ($($running.Count) process(es), e.g. PID $($running[0].Id)). " +
        "Codex is single-instance: launching now would hand off to the running copy and exit, and the " +
        "theme would NOT be applied -- with no visible error. Quit Codex completely, then re-run this " +
        "launcher. Nothing has been changed or closed for you.")
}

$exePath = Join-Path $package.InstallLocation $executableRelative
if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    Write-Fail "Resolved executable does not exist at '$exePath'."
}
Write-Info "Resolved executable: $exePath"

# ---------------------------------------------------------------------------
# 3. Locate the shared injector preload (platform-agnostic core).
# ---------------------------------------------------------------------------
$preloadPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\injector\core\preload.js'))
if (-not (Test-Path -LiteralPath $preloadPath -PathType Leaf)) {
    Write-Fail "Injector preload not found at '$preloadPath'."
}
Write-Info "Injector preload: $preloadPath"

# ---------------------------------------------------------------------------
# 4. Launch Codex directly as a child process, with NODE_OPTIONS and the
#    theme path set in the environment block this specific child inherits.
#    D-0001-1: NODE_OPTIONS is the primary mechanism under test. No
#    --remote-debugging-port is ever set here (that is the CDP fallback,
#    a different mechanism, not part of Gate 0).
# ---------------------------------------------------------------------------
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exePath
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $false
$psi.WorkingDirectory = $package.InstallLocation

# Start from the current environment, then layer in our two variables.
foreach ($entry in [System.Environment]::GetEnvironmentVariables().GetEnumerator()) {
    $psi.EnvironmentVariables[$entry.Key] = $entry.Value
}
# NODE_OPTIONS is tokenized by Node's own CLI-option parser, which treats
# backslashes inside a quoted value as escape characters (e.g. "\U", "\D",
# "\C" are not recognized escapes and get silently dropped) -- this was
# discovered during Gate 0 testing, where a backslash-separated Windows path
# arrived in the child process as "C:Userscchen362Desktop...", an unresolvable
# module specifier. Node accepts forward slashes in paths on Windows, so use
# those for the NODE_OPTIONS value specifically; CDX_THEME_CSS_PATH below is
# read via fs, not Node's option parser, so it keeps native backslashes.
$preloadPathForNodeOptions = $preloadPath -replace '\\', '/'
$psi.EnvironmentVariables['NODE_OPTIONS'] = "--require `"$preloadPathForNodeOptions`""
$psi.EnvironmentVariables['CDX_THEME_CSS_PATH'] = $ThemeCssPath

Write-Info "Launching with NODE_OPTIONS=--require `"$preloadPathForNodeOptions`""
Write-Info "Launching with CDX_THEME_CSS_PATH=$ThemeCssPath"

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi

$stdoutBuilder = New-Object System.Text.StringBuilder
$stderrBuilder = New-Object System.Text.StringBuilder

$stdoutAction = {
    if ($null -ne $EventArgs.Data) {
        Write-Host $EventArgs.Data
    }
}
$stderrAction = {
    if ($null -ne $EventArgs.Data) {
        Write-Host $EventArgs.Data -ForegroundColor Yellow
    }
}

Register-ObjectEvent -InputObject $process -EventName OutputDataReceived -Action $stdoutAction | Out-Null
Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -Action $stderrAction | Out-Null

try {
    $started = $process.Start()
} catch {
    Write-Fail ("Failed to start Codex directly (exception: $($_.Exception.Message)). " +
        "This may indicate the full-trust exe cannot be launched outside its package activation context " +
        "-- a real Gate 0 finding, not a bug in this script.")
}

if (-not $started) {
    Write-Fail "Process.Start() returned false -- Codex did not launch."
}

$process.BeginOutputReadLine()
$process.BeginErrorReadLine()

Write-Info "Codex launched (PID $($process.Id)). Streaming its stdout/stderr below."
Write-Info "Close Codex normally when you are done observing; this script exits when the process exits."

$process.WaitForExit()
Write-Info "Codex process exited with code $($process.ExitCode)."
