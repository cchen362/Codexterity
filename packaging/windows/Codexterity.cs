// Codexterity — Windows shortcut target (Phase 4 M4)
// ---------------------------------------------------------------------------
// D-0001-27: this stub exists ONLY to solve the console-window problem
// measured before this milestone was written (see docs/plans/0001, M4 entry,
// and the handoff prompt's "THE CONSOLE-WINDOW PROBLEM" section). Four
// launch variants were measured on this machine by polling EnumWindows at
// ~5 ms and diffing on-screen top-level windows:
//
//   V0 plain "powershell.exe -File launch.ps1"        -> full console window
//      on screen for the whole session.
//   V1 "-WindowStyle Hidden"                          -> STILL a full
//      on-screen window: Windows 11 hands the console to Windows Terminal,
//      a SEPARATE process, which PowerShell's own -WindowStyle cannot reach.
//   V2 "-WindowStyle Hidden" + a .lnk with WindowStyle=7
//                                                      -> no on-screen
//      window, but a ~100-170 ms taskbar blip, and it only works by
//      side-stepping the Windows Terminal handoff, which depends on a
//      SETTING ON THE RECIPIENT'S MACHINE we do not control.
//   V3 a GUI-subsystem (/target:winexe) stub          -> NO new on-screen
//      window at any sample, 3/3 runs, by construction: a GUI-subsystem
//      process never allocates a console in the first place, so there is
//      nothing for conhost or Windows Terminal to host.
//
// V3 shipped. This file IS that stub. It must be compiled at PACKAGE-BUILD
// time (tools/build-windows-package.js), never on the recipient's machine --
// running csc.exe on a user's machine is itself a well-known malware
// heuristic and would make Windows Defender treat our own installer as a
// compiler-dropper.
//
// The command line this process runs is fixed and argument-free by design
// (D-0001-24 / D-0001-25): "node <installDir>\injector\cli.js" with NO
// arguments, i.e. the same bare "cdx" entry point documented in
// injector/cli.js's own header. "cdx apply <theme>" / "cdx restore" change
// what that bare invocation launches by rewriting ~/.codexterity/state.json
// -- they never change this shortcut's target.
//
// "Fail loudly" (docs/ENGINEERING.md) governs the one design choice here
// that might look like over-engineering: a GUI-subsystem process that exits
// non-zero produces NOTHING on screen by default -- no console, no output,
// nothing. For a non-technical recipient that is the single worst outcome
// available: a double-click that silently does nothing at all. So a
// non-zero exit shows a MessageBox naming the failure and the tail of the
// launcher log (CDX_LAUNCHER_LOG below) rather than vanishing. A clean
// exit (0) stays silent, on purpose -- that IS success.

using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;

internal static class Codexterity
{
    // MessageBox is called via a raw user32.dll P/Invoke rather than a
    // reference to System.Windows.Forms -- WinForms is a much larger
    // dependency surface to embed in a small auditable stub for one dialog.
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);

    private const uint MB_OK = 0x00000000;
    private const uint MB_ICONERROR = 0x00000010;

    private static void ShowError(string message)
    {
        MessageBoxW(IntPtr.Zero, message, "Codexterity", MB_OK | MB_ICONERROR);
    }

    [STAThread]
    private static int Main()
    {
        // Resolve our OWN directory from the running assembly's location --
        // never a hardcoded path. This is the one thing that lets the same
        // compiled exe work regardless of where the installer places it
        // (Install.ps1 targets %USERPROFILE%\Codexterity -- NOT an AppData
        // path, see D-0001-29 -- a per-user location
        // that varies by machine and username).
        string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        // bin\Codexterity.exe sits one level below the install root, which
        // is itself the payload root (payload/ IS the repo root as far as
        // cli.js is concerned -- see build-windows-package.js).
        string installDir = Path.GetFullPath(Path.Combine(exeDir, ".."));
        string cliPath = Path.Combine(installDir, "injector", "cli.js");
        string logsDir = Path.Combine(installDir, "logs");

        try
        {
            Directory.CreateDirectory(logsDir);
        }
        catch
        {
            // A failure to create the logs directory must not stop the
            // launch itself -- logging is diagnostics, not the feature.
        }

        string injectorLogPath = Path.Combine(logsDir, "injector.log");
        string launcherLogPath = Path.Combine(logsDir, "launcher.log");

        if (!File.Exists(cliPath))
        {
            ShowError(
                "Codexterity cannot find its own launcher script:\r\n" + cliPath + "\r\n\r\n" +
                "The installation looks incomplete or damaged. Try reinstalling Codexterity."
            );
            return 1;
        }

        string nodePath = FindOnPath("node.exe");
        if (nodePath == null)
        {
            ShowError(
                "Codexterity needs Node.js to run themed Codex, and could not find \"node.exe\" on your PATH.\r\n\r\n" +
                "Install Node.js from https://nodejs.org (the LTS build is fine), then try again."
            );
            return 1;
        }

        ProcessStartInfo psi = new ProcessStartInfo
        {
            FileName = nodePath,
            Arguments = "\"" + cliPath + "\"",
            WorkingDirectory = installDir,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        // D-0001-27 -- the log fork. launch.ps1 (invoked by cli.js's
        // cmdLaunch) already streams every line it would Write-Host, plus
        // Codex's own stdout/stderr, to CDX_LAUNCHER_LOG when that variable
        // is set (see the -LogFile plumbing added to launch.ps1 and cli.js
        // for this same milestone). A double-clicked shortcut has no console
        // to stream to at all, so this is the ONLY way a failure under this
        // stub leaves a trace. CDX_DEBUG_LOG_PATH is the injector's own
        // pre-existing ground truth (injector/core/inject.js) and is set the
        // same way. "Only if not already set" lets a developer override
        // either path from their own shell without this stub clobbering it.
        bool ownsInjectorLog = SetIfUnset(psi.EnvironmentVariables, "CDX_DEBUG_LOG_PATH", injectorLogPath);
        bool ownsLauncherLog = SetIfUnset(psi.EnvironmentVariables, "CDX_LAUNCHER_LOG", launcherLogPath);

        // Truncate the logs THIS process owns, so each file holds exactly one
        // launch. Two reasons, and the first is a correctness bug rather than
        // housekeeping:
        //
        //   1. ReadTail() below quotes the end of the launcher log into the
        //      failure dialog. Appending forever means a launch that fails
        //      BEFORE writing anything would show the PREVIOUS session's lines
        //      under the heading "Last log output" -- an alarm reporting a
        //      stale cause as if it were the current one. That is the same
        //      class of defect as M3's always-firing landmark alarm: an
        //      instrument that misleads is worse than one that says nothing.
        //   2. Unbounded growth. These files are appended to on every single
        //      launch, forever, with nothing else rotating them.
        //
        // Only files whose paths WE assigned are truncated. If a developer set
        // CDX_DEBUG_LOG_PATH or CDX_LAUNCHER_LOG in their own shell, that file
        // is theirs and this stub must not clear it.
        if (ownsInjectorLog) TruncateQuietly(injectorLogPath);
        if (ownsLauncherLog) TruncateQuietly(launcherLogPath);

        Process process;
        try
        {
            process = Process.Start(psi);
        }
        catch (Exception ex)
        {
            ShowError("Codexterity could not start Node.js:\r\n" + ex.Message);
            return 1;
        }

        process.WaitForExit();
        int exitCode = process.ExitCode;

        if (exitCode != 0)
        {
            string tail = ReadTail(launcherLogPath, 4000);
            string detail = tail.Length > 0
                ? "\r\n\r\nLast log output:\r\n" + tail
                : "\r\n\r\n(No launcher log was found at " + launcherLogPath + ".)";
            ShowError(
                "Codex did not start cleanly (exit code " + exitCode + ")." + detail
            );
        }

        return exitCode;
    }

    /// <summary>
    /// Set an environment variable for the child only if it is not already
    /// set. Returns true if THIS call set it, i.e. if we own that path — the
    /// caller uses that to decide whether truncating the file is ours to do.
    /// </summary>
    private static bool SetIfUnset(System.Collections.Specialized.StringDictionary env, string name, string value)
    {
        if (!env.ContainsKey(name) || string.IsNullOrEmpty(env[name]))
        {
            env[name] = value;
            return true;
        }
        return false;
    }

    /// <summary>
    /// Start a log file empty for this launch. Never throws: a log we cannot
    /// truncate is a diagnostics problem, and diagnostics must not be able to
    /// stop the launch this stub exists to perform.
    /// </summary>
    private static void TruncateQuietly(string path)
    {
        try
        {
            using (new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite)) { }
        }
        catch
        {
            // Deliberately silent — see the summary above.
        }
    }

    /// <summary>
    /// Search PATH for an executable by name, the way a shell would, since
    /// letting Process.Start fail first would surface a raw Win32Exception
    /// instead of a message a non-technical recipient can act on.
    /// </summary>
    private static string FindOnPath(string exeName)
    {
        string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (string dir in pathEnv.Split(Path.PathSeparator))
        {
            if (string.IsNullOrEmpty(dir)) continue;
            string candidate;
            try
            {
                candidate = Path.Combine(dir, exeName);
            }
            catch (ArgumentException)
            {
                // A malformed PATH entry (stray quote, illegal character) is
                // the caller's environment's problem, not ours -- skip it
                // rather than letting Path.Combine's exception end the search.
                continue;
            }
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }
        return null;
    }

    /// <summary>
    /// Read up to the last `maxBytes` bytes of a log file as text, for the
    /// failure MessageBox. Missing file returns an empty string rather than
    /// throwing -- a log that was never created is itself informative
    /// (nothing ran long enough to write one) but not a reason to crash the
    /// crash-reporting path.
    /// </summary>
    private static string ReadTail(string path, int maxBytes)
    {
        if (!File.Exists(path)) return string.Empty;
        try
        {
            using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                long start = Math.Max(0, stream.Length - maxBytes);
                stream.Seek(start, SeekOrigin.Begin);
                byte[] buffer = new byte[stream.Length - start];
                int read = 0;
                while (read < buffer.Length)
                {
                    int n = stream.Read(buffer, read, buffer.Length - read);
                    if (n <= 0) break;
                    read += n;
                }
                return Encoding.UTF8.GetString(buffer, 0, read);
            }
        }
        catch
        {
            return string.Empty;
        }
    }
}
