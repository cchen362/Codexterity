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
    # Absolute path to a theme PACKAGE: either a theme directory (e.g.
    # themes/captains-cabin) or a built .ccskin file. Left empty here and
    # defaulted in the body on purpose: under Windows PowerShell 5.1,
    # $PSScriptRoot is not yet populated while param() default expressions are
    # evaluated for a script invoked via -File, so defaulting here yields an
    # empty Join-Path and a confusing failure far from its cause.
    #
    # D-0001-25 (Phase 4 M3) — replaces -ThemeCssPath. The injector now loads
    # a whole package through the validating theme-loader (manifest.json,
    # theme.css, syntax.json, assets), not a bare stylesheet, so this
    # parameter names the PACKAGE, not the CSS file inside it. Defaults to
    # the theme DIRECTORY, never dist/*.ccskin: dist/ is gitignored build
    # output (tools/pack-ccskin.js) and may not exist on a fresh checkout,
    # while themes/captains-cabin always does.
    [string]$ThemePackage,

    # D-0001-32 (settled 2026-08-04) — start Codex with NO injector attached
    # at all. This is a SWITCH, deliberately not "pass an empty
    # -ThemePackage": an unset $ThemePackage already means "use the default
    # theme" per its own comment above (it falls back to
    # themes/captains-cabin), so overloading emptiness would make "launch
    # plain" and "launch the default theme" the same value and
    # indistinguishable from each other. Passing both -NoTheme and
    # -ThemePackage together is a caller bug, not a preference to resolve
    # quietly -- see the guard right after param() below. When this is set,
    # theme-package resolution is skipped entirely and neither NODE_OPTIONS
    # nor CDX_THEME_PACKAGE is set on the child process, so the injector
    # preload never loads and Codex starts exactly as it would from its own
    # icon.
    [switch]$NoTheme,

    # D-0001-27 (Phase 4 M4) — the log fork. Unset (the default), this
    # script's behaviour is byte-for-byte what it was before this parameter
    # existed: every line still goes to the console via Write-Host, nothing
    # more. When set, every line this script would Write-Host — its own
    # [codexterity-launcher] lines AND Codex's streamed stdout/stderr — is
    # ALSO appended to this file. This does not replace the console output
    # (a developer running the script by hand still sees everything); it is
    # an additional sink for the ONE caller that has no console to read from
    # at all: a double-clicked shortcut running through the GUI-subsystem
    # stub (packaging/windows/Codexterity.cs), which sets
    # CDX_LAUNCHER_LOG and is read by injector/cli.js's cmdLaunch(), which
    # passes it through as this parameter. A logging failure (e.g. an
    # unwritable path) must never take down the launch itself — see the
    # try/catch around every write below.
    [string]$LogFile
)

function Write-Log($Message) {
    if ([string]::IsNullOrWhiteSpace($LogFile)) { return }
    try {
        $parent = Split-Path -Parent $LogFile
        if ($parent -and -not (Test-Path -LiteralPath $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        Add-Content -LiteralPath $LogFile -Value $Message -Encoding UTF8
    } catch {
        # Logging is diagnostics, not the feature (see the parameter's own
        # comment above) -- a failure here must never abort or alter the
        # launch this script exists to perform.
    }
}

$ErrorActionPreference = 'Stop'

function Write-Fail($Message) {
    $line = "[codexterity-launcher] FAILED: $Message"
    Write-Host $line -ForegroundColor Red
    Write-Log $line
    exit 1
}

function Write-Info($Message) {
    $line = "[codexterity-launcher] $Message"
    Write-Host $line -ForegroundColor Cyan
    Write-Log $line
}

# D-0001-32 -- a caller passing both switches has contradicted themselves
# (one says "start with no theme", the other names one to use); fail loudly
# rather than silently picking a winner. $PSBoundParameters, not a truthiness
# check on $ThemePackage, because the caller may have explicitly passed an
# empty string -- ContainsKey is the only test that means "was this argument
# actually supplied".
if ($NoTheme -and $PSBoundParameters.ContainsKey('ThemePackage')) {
    Write-Fail "-NoTheme and -ThemePackage are mutually exclusive -- pass one or the other, not both."
}

# ---------------------------------------------------------------------------
# 1. Resolve the theme package (read-only; ours, not Codex's). Accepts either
#    a theme DIRECTORY or a .ccskin FILE -- injector/theme-loader/index.js
#    tells them apart with statSync, never by extension, so this launcher does
#    not need to know or guess which kind it was handed.
#
#    D-0001-32 -- when -NoTheme is set, this whole step is skipped: there is
#    no package to resolve, no NODE_OPTIONS, no CDX_THEME_PACKAGE, and no
#    injector preload loaded (step 3 and the environment block in step 4
#    below both branch on $NoTheme too). Codex starts exactly as it would
#    from its own icon.
# ---------------------------------------------------------------------------
if ($NoTheme) {
    Write-Info 'Unthemed launch (-NoTheme): no injector will be attached.'
} else {
    if ([string]::IsNullOrWhiteSpace($ThemePackage)) {
        $ThemePackage = Join-Path $PSScriptRoot '..\..\themes\captains-cabin'
    }
    $ThemePackage = [System.IO.Path]::GetFullPath($ThemePackage)
    if (-not (Test-Path -LiteralPath $ThemePackage -PathType Container) -and
        -not (Test-Path -LiteralPath $ThemePackage -PathType Leaf)) {
        Write-Fail "Theme package not found at '$ThemePackage'. Pass -ThemePackage explicitly if Captain's Cabin has moved -- it may be a theme directory or a .ccskin file."
    }
    Write-Info "Theme package: $ThemePackage"
}

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
# 3. Locate the shared injector preload (platform-agnostic core). Skipped
#    entirely under -NoTheme (D-0001-32) -- there is nothing to require.
# ---------------------------------------------------------------------------
if (-not $NoTheme) {
    $preloadPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\injector\core\preload.js'))
    if (-not (Test-Path -LiteralPath $preloadPath -PathType Leaf)) {
        Write-Fail "Injector preload not found at '$preloadPath'."
    }
    Write-Info "Injector preload: $preloadPath"
}

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

# Start from the current environment, then layer in our two variables --
# unless -NoTheme is set (D-0001-32), in which case NEITHER is set and the
# child inherits a plain environment, exactly as if launched from Codex's
# own icon.
foreach ($entry in [System.Environment]::GetEnvironmentVariables().GetEnumerator()) {
    $psi.EnvironmentVariables[$entry.Key] = $entry.Value
}
if ($NoTheme) {
    # D-0001-32 -- REMOVE these rather than merely declining to set them. The
    # loop above copies the WHOLE parent environment, so a NODE_OPTIONS
    # inherited from the calling shell (a developer's own, or one left over
    # from another tool) would still load the injector preload and this
    # "unthemed" launch would come up silently THEMED -- the exact opposite of
    # what was asked for, with nothing in the log to say why. Not adding a
    # variable is not the same as guaranteeing its absence, and
    # docs/ENGINEERING.md's standard is that the code make the violation
    # impossible rather than merely avoid it.
    $psi.EnvironmentVariables.Remove('NODE_OPTIONS')
    $psi.EnvironmentVariables.Remove('CDX_THEME_PACKAGE')
    Write-Info 'Launching with NODE_OPTIONS / CDX_THEME_PACKAGE removed from the child environment (unthemed).'
} else {
    # NODE_OPTIONS is tokenized by Node's own CLI-option parser, which treats
    # backslashes inside a quoted value as escape characters (e.g. "\U", "\D",
    # "\C" are not recognized escapes and get silently dropped) -- this was
    # discovered during Gate 0 testing, where a backslash-separated Windows path
    # arrived in the child process as "C:Userscchen362Desktop...", an unresolvable
    # module specifier. Node accepts forward slashes in paths on Windows, so use
    # those for the NODE_OPTIONS value specifically; CDX_THEME_PACKAGE below is
    # read via fs, not Node's option parser, so it keeps native backslashes.
    $preloadPathForNodeOptions = $preloadPath -replace '\\', '/'
    $psi.EnvironmentVariables['NODE_OPTIONS'] = "--require `"$preloadPathForNodeOptions`""
    # D-0001-25 -- CDX_THEME_PACKAGE replaces CDX_THEME_CSS_PATH. This one is read
    # by the injector via plain fs (statSync/readFileSync inside the theme
    # loader), not by Node's own CLI-option tokenizer, so it keeps native
    # backslashes -- only NODE_OPTIONS above needs the forward-slash rewrite.
    $psi.EnvironmentVariables['CDX_THEME_PACKAGE'] = $ThemePackage

    Write-Info "Launching with NODE_OPTIONS=--require `"$preloadPathForNodeOptions`""
    Write-Info "Launching with CDX_THEME_PACKAGE=$ThemePackage"
}

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi

# ---------------------------------------------------------------------------
# Stream Codex's stdout/stderr. D-0001-28 (Phase 4 M4) -- do not revert this to an event handler.
#
# This DELIBERATELY does not use Register-ObjectEvent + BeginOutputReadLine,
# which is what this script used until Phase 4 M4 and which does not work.
# Measured, not theorised: a child emitting 800 lines fired the -Action
# scriptblock exactly 4 times, with ZERO exceptions raised -- and a slow child
# emitting 40 lines over 4 seconds also fired it 4 times, so the loss is
# rate-independent. The cause is that PowerShell dispatches -Action handlers on
# the runspace's own pipeline thread, and this script then blocks that very
# thread in $process.WaitForExit(). A blocked runspace pumps no events, so the
# handlers simply never run. (Start-Sleep does not pump them either, which is
# why "wait a moment for events to drain" does not rescue it.)
#
# That defect PRE-DATES this milestone -- it means the console streaming this
# launcher advertises has never actually worked -- and it went unnoticed because
# the injector writes its own log directly from inside Codex's process via
# CDX_DEBUG_LOG_PATH, which is what every launch in this project was really
# verified against. M4 made it worth fixing rather than merely noting: the
# shortcut's failure dialog (packaging/windows/Codexterity.cs) quotes this log,
# so an empty log would turn a real failure into an unexplained one.
#
# The replacement reads both streams with .NET async Tasks and polls them from
# THIS thread. Task completion is driven by the threadpool and needs no
# PowerShell event pumping, so nothing depends on the runspace being idle. Both
# streams are read concurrently, which is what avoids the classic deadlock of
# draining one pipe to EOF while the other fills its buffer.
#
# The streams cannot be touched before Start(), so the loop lives below it.

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

Write-Info "Codex launched (PID $($process.Id)). Streaming its stdout/stderr below."
Write-Info "Close Codex normally when you are done observing; this script exits when the process exits."

$stdoutReader = $process.StandardOutput
$stderrReader = $process.StandardError
$outTask = $stdoutReader.ReadLineAsync()
$errTask = $stderrReader.ReadLineAsync()
$outEof = $false
$errEof = $false

while (-not ($outEof -and $errEof)) {
    $didWork = $false

    if (-not $outEof -and $outTask.IsCompleted) {
        $line = $outTask.Result
        if ($null -eq $line) {
            $outEof = $true
        } else {
            Write-Host $line
            Write-Log $line
            $outTask = $stdoutReader.ReadLineAsync()
        }
        $didWork = $true
    }

    if (-not $errEof -and $errTask.IsCompleted) {
        $line = $errTask.Result
        if ($null -eq $line) {
            $errEof = $true
        } else {
            Write-Host $line -ForegroundColor Yellow
            Write-Log $line
            $errTask = $stderrReader.ReadLineAsync()
        }
        $didWork = $true
    }

    # Only idle when neither stream had anything ready, so a busy child is
    # drained at full speed and a quiet one costs ~nothing.
    if (-not $didWork) { Start-Sleep -Milliseconds 25 }
}

$process.WaitForExit()
Write-Info "Codex process exited with code $($process.ExitCode)."
