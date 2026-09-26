<#
.SYNOPSIS
    Codexterity Windows launcher -- Plan 0005 M2 (loopback CDP route).

.DESCRIPTION
    The ONLY Windows-specific code in Codexterity (docs/ENGINEERING.md "Layer
    rule"). Resolves the installed Codex Desktop MSIX package via
    Get-AppxPackage (never a hardcoded WindowsApps path -- the Store rewrites
    the install directory on every update), then launches it through
    Invoke-CommandInDesktopPackage so the child process carries the package's
    Windows identity, and runs the shared Node "attacher"
    (injector/attach-cdp.js) against a loopback debugging port to apply the
    theme.

    Codex 26.924 requires package identity to start at all (Plan 0005,
    "verified facts" 1-2) -- a direct child-process launch of ChatGPT.exe now
    fails before any Codexterity code runs, identically themed or not. That
    identity-carrying launch route does not pass this script's environment
    block through to the child (fact 3), so the old preload mechanism
    (NODE_OPTIONS=--require <preload>) cannot reach Codex on Windows any
    more. What the route DOES pass through is command-line arguments, and
    Codex honours --remote-debugging-port (fact 4) -- so this script starts
    Codex with a loopback debugging port open and a separate Node process
    (the attacher) connects to it over Chrome DevTools Protocol and injects
    the theme into every Codex page, the same way the preload used to do it
    from inside Codex's own process.

    This script contains NO styling/injection logic. All of that lives in
    injector/core/ and injector/attach-cdp.js. This script only resolves,
    picks a port, launches, and runs the attacher, per the Layer rule in
    docs/ENGINEERING.md.

    D-0001-3 (non-destructive): this script only ever READS from the Codex
    install directory (Get-AppxPackage, file existence checks) and never
    writes to it, patches it, or touches ~/.codex/auth.json or
    ~/.codex/.credentials.json.

.NOTES
    macOS is unaffected by any of this (its launcher keeps NODE_OPTIONS,
    D-0001-16) -- macOS apps have no package-identity check. This file is
    Windows-only, per the Layer rule.
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
    # quietly -- see the guard right after param() below. Under Plan 0005,
    # this still means "start Codex through the identity-carrying route with
    # no debugging port opened and no attacher run" (D-0005-1's own
    # mitigation: don't leave a port open when nothing needs it) -- Codex
    # starts exactly as it would from its own icon.
    [switch]$NoTheme,

    # D-0001-27 (Phase 4 M4) — the log fork. Unset (the default), this
    # script's behaviour is byte-for-byte what it was before this parameter
    # existed: every line still goes to the console via Write-Host, nothing
    # more. When set, every line this script would Write-Host — its own
    # [codexterity-launcher] lines AND, under Plan 0005, the attacher's
    # streamed stdout/stderr — is ALSO appended to this file. This does not
    # replace the console output (a developer running the script by hand
    # still sees everything); it is an additional sink for the ONE caller
    # that has no console to read from at all: a double-clicked shortcut
    # running through the GUI-subsystem stub (packaging/windows/Codexterity.cs),
    # which sets CDX_LAUNCHER_LOG and is read by injector/cli.js's
    # cmdLaunch(), which passes it through as this parameter. A logging
    # failure (e.g. an unwritable path) must never take down the launch
    # itself — see the try/catch around every write below.
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
#    no package to resolve, no port opened, and no attacher run (step 4 and
#    step 5 below both branch on $NoTheme too). Codex starts exactly as it
#    would from its own icon.
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
Write-Info "AUMID: $aumid"

if ($entryPoint -ne 'Windows.FullTrustApplication') {
    Write-Fail ("Codex's Application entry has EntryPoint='$entryPoint', not 'Windows.FullTrustApplication'. " +
        "Invoke-CommandInDesktopPackage is validated only for full-trust packaged apps; a different " +
        "EntryPoint means this launch route may not apply, and this is a real finding, not something to " +
        "route around.")
}

# ---------------------------------------------------------------------------
# 2a. Refuse to launch over a running instance.
#
# Codex is single-instance. Starting it while a copy is already running makes
# the new process hand off to the existing one ("Opening in existing browser
# session") and exit immediately -- so this launch would never open the
# debugging port the theme needs and the theme is silently NOT applied. The
# user sees a perfectly normal, completely unthemed Codex and no error at
# all, which is the worst failure mode available to us.
#
# Detection matches on the process's ExecutablePath, not Get-Process (Plan
# 0005, fact 8): a process started through Invoke-CommandInDesktopPackage
# carries package identity, and Get-Process's .Path property is denied for
# such a process from an ordinary shell -- it silently reports zero matches,
# which would make this guard a no-op exactly when it matters. Win32_Process
# (via Get-CimInstance) has no such restriction and reports the full command
# line for every ChatGPT.exe process. Matching on ExecutablePath rather than
# process name because the executable is ChatGPT.exe (not Codex.exe), and a
# name match on "ChatGPT" would also hit the unrelated "ChatGPT Classic" app.
#
# This reports and stops rather than terminating anything. Closing the user's
# running editor -- possibly mid-conversation -- is not a launcher's decision.
# ---------------------------------------------------------------------------
$running = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($package.InstallLocation, [StringComparison]::OrdinalIgnoreCase)
})
if ($running.Count -gt 0) {
    Write-Fail ("Codex is already running ($($running.Count) process(es), e.g. PID $($running[0].ProcessId)). " +
        "Codex is single-instance: launching now would hand off to the running copy and exit, and the " +
        "theme would NOT be applied -- with no visible error. Quit Codex completely, then re-run this " +
        "launcher. Nothing has been changed or closed for you.")
}

$exePath = Join-Path $package.InstallLocation $executableRelative
if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    Write-Fail "Resolved executable does not exist at '$exePath'."
}
$exePath = [System.IO.Path]::GetFullPath($exePath)
Write-Info "Resolved executable: $exePath"

# ---------------------------------------------------------------------------
# 3. Locate the shared CDP attacher and node.exe. Skipped entirely under
#    -NoTheme (D-0001-32) -- there is nothing to run.
# ---------------------------------------------------------------------------
if (-not $NoTheme) {
    $attacherPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\injector\attach-cdp.js'))
    if (-not (Test-Path -LiteralPath $attacherPath -PathType Leaf)) {
        Write-Fail "CDP attacher not found at '$attacherPath'."
    }
    Write-Info "CDP attacher: $attacherPath"

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    }
    if (-not $nodeCommand) {
        Write-Fail "node.exe was not found on PATH. Install Node.js (>=22.4) to run the CDP attacher."
    }
    $nodePath = $nodeCommand.Source
    Write-Info "node.exe: $nodePath"
}

# ---------------------------------------------------------------------------
# 4. Pick a free loopback port, then launch Codex through
#    Invoke-CommandInDesktopPackage so the child process carries the
#    package's Windows identity (Plan 0005, fact 2) -- a direct child-process
#    launch of ChatGPT.exe no longer starts at all on Codex 26.924 (fact 1).
#
#    This route does NOT pass this script's environment block through to the
#    child (fact 3), so NODE_OPTIONS/CDX_THEME_PACKAGE would never reach
#    Codex here -- that mechanism is gone on Windows. What it DOES pass
#    through is command-line arguments, and Codex honours
#    --remote-debugging-port (fact 4), which is how the attacher (step 5)
#    reaches it instead.
#
#    The port is never fixed (D-0005-1): a random per-launch ephemeral
#    loopback port, closed again the moment it is read, so the debugging
#    endpoint Codex later opens is not a stable, guessable name on the
#    machine. Under -NoTheme, no -Args are passed at all, so Codex never
#    opens a debugging port in the first place -- there is nothing here for
#    the attacher to attach to, and none is run.
# ---------------------------------------------------------------------------
$port = $null
if (-not $NoTheme) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    Write-Info "Debugging port: $port"
}

try {
    if ($NoTheme) {
        Invoke-CommandInDesktopPackage -PackageFamilyName $package.PackageFamilyName -AppId $appId -Command $exePath | Out-Null
    } else {
        Invoke-CommandInDesktopPackage -PackageFamilyName $package.PackageFamilyName -AppId $appId -Command $exePath -Args "--remote-debugging-port=$port" | Out-Null
    }
} catch {
    Write-Fail "Failed to launch Codex via Invoke-CommandInDesktopPackage (exception: $($_.Exception.Message))."
}

Write-Info "Codex launched via Invoke-CommandInDesktopPackage (package identity)."

if ($NoTheme) {
    Write-Info 'Unthemed launch complete: no debugging port was opened and no attacher was run.'
    exit 0
}

# ---------------------------------------------------------------------------
# 5. Run the shared CDP attacher in the FOREGROUND as a child of this script.
#    Invoke-CommandInDesktopPackage returns promptly and does not wait for
#    Codex to exit (Plan 0005, fact 5), so the attacher -- not Codex's own
#    process -- is what this script waits on; it connects to the port above,
#    applies the theme to every Codex page, and exits when Codex does (or on
#    a theme-load failure, or a port-poll timeout). Its exit code becomes
#    this script's exit code: 0 Codex exited normally, 1 the theme package
#    failed to load, 2 the debugging port never came up within the timeout.
#    In every case Codex itself keeps running (or already exited) -- a
#    failure here means Codex is running unthemed, never that Codex failed
#    to start.
#
#    D-0001-28 (Phase 4 M4) -- do not revert this to an event handler.
#
#    This DELIBERATELY does not use Register-ObjectEvent + BeginOutputReadLine,
#    which is what this script used until Phase 4 M4 and which does not work.
#    Measured, not theorised: a child emitting 800 lines fired the -Action
#    scriptblock exactly 4 times, with ZERO exceptions raised -- and a slow child
#    emitting 40 lines over 4 seconds also fired it 4 times, so the loss is
#    rate-independent. The cause is that PowerShell dispatches -Action handlers on
#    the runspace's own pipeline thread, and this script then blocks that very
#    thread in $process.WaitForExit(). A blocked runspace pumps no events, so the
#    handlers simply never run. (Start-Sleep does not pump them either, which is
#    why "wait a moment for events to drain" does not rescue it.)
#
#    That defect was found reading Codex's own stdout/stderr; it applies just as
#    much to the attacher's, which is why the same reader loop is kept here
#    unchanged rather than reintroduced with the flaw. The attacher's log lines
#    are what a failure dialog (packaging/windows/Codexterity.cs) would quote,
#    so an empty log would turn a real failure into an unexplained one.
#
#    The replacement reads both streams with .NET async Tasks and polls them from
#    THIS thread. Task completion is driven by the threadpool and needs no
#    PowerShell event pumping, so nothing depends on the runspace being idle. Both
#    streams are read concurrently, which is what avoids the classic deadlock of
#    draining one pipe to EOF while the other fills its buffer.
#
#    The streams cannot be touched before Start(), so the loop lives below it.
# ---------------------------------------------------------------------------
# Quote-Arg: build a single command-line argument the way node.exe (an
# ordinary MSVCRT-style argv parser) expects it, rather than using
# ProcessStartInfo.ArgumentList -- that property does not exist under
# Windows PowerShell 5.1, because 5.1 runs on .NET Framework, where
# ArgumentList was never added to ProcessStartInfo (it is a .NET Core-only
# member). This script targets 5.1 (the stub and injector/cli.js both invoke
# powershell.exe), so ProcessStartInfo.Arguments -- a single pre-quoted
# string -- is the only option, and it has to be quoted by hand. The
# MSVCRT/CRT convention this follows: wrap the argument in double quotes,
# and escape any embedded double quote as \". A literal backslash is NOT an
# escape character under this convention unless it immediately precedes a
# quote, so an ordinary Windows path with backslashes (e.g. a theme
# package's absolute path) needs no backslash-escaping at all -- only quotes
# inside the argument (which none of these arguments contain) would need it.
function Quote-Arg([string]$Value) {
    return '"' + ($Value -replace '"', '\"') + '"'
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $nodePath
$psi.Arguments = @(
    (Quote-Arg $attacherPath),
    '--port',
    "$port",
    '--theme',
    (Quote-Arg $ThemePackage)
) -join ' '
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $false
$psi.WorkingDirectory = $PSScriptRoot

# The attacher inherits this script's environment unmodified -- CDX_DEBUG_LOG_PATH
# (read by the attacher's log() sink exactly as inject.js reads it) comes through
# untouched, because this is an ordinary child-process launch of node.exe, not
# the identity-carrying route used for Codex itself.
foreach ($entry in [System.Environment]::GetEnvironmentVariables().GetEnumerator()) {
    $psi.EnvironmentVariables[$entry.Key] = $entry.Value
}

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi

try {
    $started = $process.Start()
} catch {
    Write-Fail ("Failed to start the CDP attacher (exception: $($_.Exception.Message)). " +
        "Codex is running unthemed.")
}

if (-not $started) {
    Write-Fail "Process.Start() returned false -- the CDP attacher did not launch. Codex is running unthemed."
}

Write-Info "CDP attacher launched (PID $($process.Id)). Streaming its stdout/stderr below."

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

switch ($process.ExitCode) {
    0 { Write-Info "CDP attacher exited 0: Codex exited." }
    2 { Write-Info "CDP attacher exited 2: Codex never opened its debugging port within the timeout -- Codex is running unthemed." }
    1 { Write-Info "CDP attacher exited 1: theme package failed to load -- Codex is running unthemed." }
    default { Write-Info "CDP attacher exited with code $($process.ExitCode)." }
}

exit $process.ExitCode
