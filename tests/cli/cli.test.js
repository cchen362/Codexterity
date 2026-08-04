'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  parseArgs,
  stateFilePath,
  readState,
  writeState,
  clearState,
  resolveThemeSource,
  main,
} = require(path.join('..', '..', 'injector', 'cli.js'));

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-cli-home-'));
}

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-cli-repo-'));
}

function writeMinimalThemeDir(dir, overrides = {}) {
  const manifest = Object.assign(
    {
      formatVersion: 1,
      id: 'test-theme',
      name: 'Test Theme',
      version: '0.1.0',
      author: 'test',
      license: 'MIT',
      description: 'A fixture theme.',
      targetApp: 'openai-codex-desktop',
      targetVersionRange: { min: '26.727', max: '27' },
      verifiedAgainst: '26.727.6591.0',
      files: { css: 'theme.css', syntax: 'syntax.json' },
      landmarks: [
        { name: 'sidebar-panel', selector: '.app-shell-left-panel', governedBy: 'D-0001-13', required: true },
      ],
      assets: [],
    },
    overrides
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'theme.css'), '.a { color: red; }');
  fs.writeFileSync(path.join(dir, 'syntax.json'), '{"keyword":"#000"}');
  return manifest;
}

function makeCtxOverrides(overrides = {}) {
  const stdoutLines = [];
  const stderrLines = [];
  return {
    ctx: Object.assign(
      {
        stdout: (text) => stdoutLines.push(text),
        stderr: (text) => stderrLines.push(text),
        now: () => '2026-08-03T12:34:56.789Z',
        // Default to a spawn that THROWS rather than to the real one. No test
        // today reaches it without overriding, but the default matters: this
        // suite runs on the Windows development machine, where falling
        // through to the real spawnSync would start the actual Codex app
        // mid-`npm test` and then block until someone closed it. A test
        // harness that can launch the program under test is a trap to close
        // before it springs, and a loud throw names the mistake precisely.
        spawnSync: () => {
          throw new Error('test attempted a REAL spawn — pass a fake spawnSync to makeCtxOverrides()');
        },
      },
      overrides
    ),
    stdoutLines,
    stderrLines,
  };
}

// ---------------------------------------------------------------------
// State file round-trip
// ---------------------------------------------------------------------

test('stateFilePath() is home/.codexterity/state.json', () => {
  const home = tempHome();
  assert.equal(stateFilePath(home), path.join(home, '.codexterity', 'state.json'));
});

test('writeState() -> readState() round-trips, 2-space indented with a trailing newline', () => {
  const home = tempHome();
  const state = {
    formatVersion: 1,
    activeTheme: { id: 'captains-cabin', source: path.join(home, 'dist', 'captains-cabin.ccskin'), appliedAt: '2026-08-03T00:00:00.000Z' },
  };
  const filePath = writeState(home, state);
  assert.equal(filePath, stateFilePath(home));

  const raw = fs.readFileSync(filePath, 'utf8');
  assert.match(raw, /\n$/);
  assert.equal(raw, JSON.stringify(state, null, 2) + '\n');

  const readBack = readState(home);
  assert.deepEqual(readBack, state);
});

test('readState() returns null when no state file exists', () => {
  const home = tempHome();
  assert.equal(readState(home), null);
});

test('readState() reports a corrupt state file rather than crashing', () => {
  const home = tempHome();
  fs.mkdirSync(path.join(home, '.codexterity'), { recursive: true });
  fs.writeFileSync(stateFilePath(home), '{ this is not json');

  assert.throws(() => readState(home), (err) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /corrupt/);
    return true;
  });
});

// ---------------------------------------------------------------------
// clearState()
// ---------------------------------------------------------------------

test('clearState() removes state.json AND the now-empty .codexterity directory', () => {
  const home = tempHome();
  writeState(home, { formatVersion: 1, activeTheme: { id: 'x', source: 'y', appliedAt: 'z' } });
  const dir = path.join(home, '.codexterity');
  assert.ok(fs.existsSync(dir));

  clearState(home);

  assert.equal(fs.existsSync(stateFilePath(home)), false);
  assert.equal(fs.existsSync(dir), false);
});

test('clearState() leaves the .codexterity directory alone when it is not empty afterward', () => {
  const home = tempHome();
  writeState(home, { formatVersion: 1, activeTheme: { id: 'x', source: 'y', appliedAt: 'z' } });
  const dir = path.join(home, '.codexterity');
  // Something else lives in the directory besides state.json.
  fs.writeFileSync(path.join(dir, 'other-file.txt'), 'not state');

  clearState(home);

  assert.equal(fs.existsSync(stateFilePath(home)), false);
  assert.equal(fs.existsSync(dir), true);
  assert.ok(fs.existsSync(path.join(dir, 'other-file.txt')));
});

test('clearState() is a no-op (does not throw) when nothing was ever applied', () => {
  const home = tempHome();
  assert.doesNotThrow(() => clearState(home));
});

// ---------------------------------------------------------------------
// parseArgs()
// ---------------------------------------------------------------------

test('parseArgs() maps bare argv to launch', () => {
  assert.deepEqual(parseArgs([]), { verb: 'launch', args: [] });
});

test('parseArgs() maps "launch" to launch', () => {
  assert.deepEqual(parseArgs(['launch']), { verb: 'launch', args: [] });
});

test('parseArgs() maps "apply <theme>" to apply with one arg', () => {
  assert.deepEqual(parseArgs(['apply', 'captains-cabin']), { verb: 'apply', args: ['captains-cabin'] });
});

test('parseArgs() rejects "apply" with no theme argument', () => {
  const result = parseArgs(['apply']);
  assert.ok(result.error);
  assert.match(result.error, /apply/);
});

test('parseArgs() rejects "apply" with more than one argument', () => {
  const result = parseArgs(['apply', 'a', 'b']);
  assert.ok(result.error);
});

test('parseArgs() maps "restore" to restore with no args', () => {
  assert.deepEqual(parseArgs(['restore']), { verb: 'restore', args: [] });
});

test('parseArgs() rejects "restore" with an argument', () => {
  const result = parseArgs(['restore', 'extra']);
  assert.ok(result.error);
});

test('parseArgs() maps bare "verify" to verify with no args', () => {
  assert.deepEqual(parseArgs(['verify']), { verb: 'verify', args: [] });
});

test('parseArgs() maps "verify <theme>" to verify with one arg', () => {
  assert.deepEqual(parseArgs(['verify', 'captains-cabin']), { verb: 'verify', args: ['captains-cabin'] });
});

test('parseArgs() rejects "verify" with more than one argument', () => {
  const result = parseArgs(['verify', 'a', 'b']);
  assert.ok(result.error);
});

test('parseArgs() maps "list" to list with no args', () => {
  assert.deepEqual(parseArgs(['list']), { verb: 'list', args: [] });
});

test('parseArgs() maps "help", "--help" and "-h" to help', () => {
  assert.deepEqual(parseArgs(['help']), { verb: 'help', args: [] });
  assert.deepEqual(parseArgs(['--help']), { verb: 'help', args: [] });
  assert.deepEqual(parseArgs(['-h']), { verb: 'help', args: [] });
});

test('parseArgs() reports an error on an unknown verb', () => {
  const result = parseArgs(['frobnicate']);
  assert.ok(result.error);
  assert.match(result.error, /frobnicate/);
});

// ---------------------------------------------------------------------
// resolveThemeSource()
// ---------------------------------------------------------------------

test('resolveThemeSource() accepts an explicit existing path verbatim (resolved absolute)', () => {
  const repoRoot = tempRepo();
  const explicitDir = path.join(repoRoot, 'somewhere-else', 'my-theme');
  writeMinimalThemeDir(explicitDir);

  const resolved = resolveThemeSource(explicitDir, repoRoot);
  assert.equal(resolved, path.resolve(explicitDir));
});

test('resolveThemeSource() prefers dist/<id>.ccskin over themes/<id>/ when both exist', () => {
  const repoRoot = tempRepo();
  const distDir = path.join(repoRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const ccskinPath = path.join(distDir, 'captains-cabin.ccskin');
  fs.writeFileSync(ccskinPath, Buffer.from('not a real zip, just needs to exist'));
  writeMinimalThemeDir(path.join(repoRoot, 'themes', 'captains-cabin'), { id: 'captains-cabin' });

  const resolved = resolveThemeSource('captains-cabin', repoRoot);
  assert.equal(resolved, ccskinPath);
});

test('resolveThemeSource() falls back to themes/<id>/ when dist/ has no matching .ccskin (or is absent)', () => {
  const repoRoot = tempRepo();
  // No dist/ directory at all -- must be treated as normal, not thrown.
  const themeDir = path.join(repoRoot, 'themes', 'captains-cabin');
  writeMinimalThemeDir(themeDir, { id: 'captains-cabin' });

  const resolved = resolveThemeSource('captains-cabin', repoRoot);
  assert.equal(resolved, themeDir);
});

test('resolveThemeSource() throws naming both locations it checked when nothing resolves', () => {
  const repoRoot = tempRepo();
  assert.throws(() => resolveThemeSource('nonexistent-theme', repoRoot), (err) => {
    assert.match(err.message, /nonexistent-theme/);
    assert.match(err.message, /dist/);
    assert.match(err.message, /themes/);
    return true;
  });
});

// ---------------------------------------------------------------------
// main(): apply refuses to write state when loadTheme throws
// ---------------------------------------------------------------------

test('main(["apply", ...]) does not write state when the theme fails to load', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  const badThemeDir = path.join(repoRoot, 'themes', 'broken-theme');
  // Unsafe CSS -- loadTheme() must throw CSS_UNSAFE before anything is persisted.
  writeMinimalThemeDir(badThemeDir, { id: 'broken-theme' });
  fs.writeFileSync(path.join(badThemeDir, 'theme.css'), '@import url("https://evil.example/x.css");');

  const { ctx, stderrLines } = makeCtxOverrides({ home, repoRoot });
  const code = main(['apply', 'broken-theme'], ctx);

  assert.equal(code, 1);
  assert.equal(fs.existsSync(stateFilePath(home)), false);
  assert.ok(stderrLines.some((line) => line.includes('CSS_UNSAFE')));
});

test('main(["apply", ...]) validates and persists state on a valid theme', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  const themeDir = path.join(repoRoot, 'themes', 'good-theme');
  writeMinimalThemeDir(themeDir, { id: 'good-theme' });

  const { ctx, stdoutLines } = makeCtxOverrides({ home, repoRoot });
  const code = main(['apply', 'good-theme'], ctx);

  assert.equal(code, 0);
  const state = readState(home);
  assert.equal(state.formatVersion, 1);
  assert.equal(state.activeTheme.id, 'good-theme');
  assert.equal(state.activeTheme.source, path.resolve(themeDir));
  assert.equal(state.activeTheme.appliedAt, '2026-08-03T12:34:56.789Z');
  assert.ok(stdoutLines.some((line) => line.includes('Applied')));
});

// ---------------------------------------------------------------------
// main(): restore is a clean round-trip
// ---------------------------------------------------------------------

test('main(["restore"]) clears a previously applied theme', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  const themeDir = path.join(repoRoot, 'themes', 'good-theme');
  writeMinimalThemeDir(themeDir, { id: 'good-theme' });

  main(['apply', 'good-theme'], makeCtxOverrides({ home, repoRoot }).ctx);
  assert.ok(fs.existsSync(stateFilePath(home)));

  const { ctx, stdoutLines } = makeCtxOverrides({ home, repoRoot });
  const code = main(['restore'], ctx);

  assert.equal(code, 0);
  assert.equal(fs.existsSync(stateFilePath(home)), false);
  assert.equal(fs.existsSync(path.join(home, '.codexterity')), false);
  assert.ok(stdoutLines.some((line) => line.includes('Cleared')));
});

// ---------------------------------------------------------------------
// main(): verify reports the active theme
// ---------------------------------------------------------------------

test('main(["verify"]) with no active theme fails clearly', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  const { ctx, stderrLines } = makeCtxOverrides({ home, repoRoot });

  const code = main(['verify'], ctx);

  assert.equal(code, 1);
  assert.ok(stderrLines.some((line) => line.includes('no theme is currently active')));
});

test('main(["verify"]) reports the applied theme by reading state', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  const themeDir = path.join(repoRoot, 'themes', 'good-theme');
  writeMinimalThemeDir(themeDir, { id: 'good-theme' });
  main(['apply', 'good-theme'], makeCtxOverrides({ home, repoRoot }).ctx);

  const { ctx, stdoutLines } = makeCtxOverrides({ home, repoRoot });
  const code = main(['verify'], ctx);

  assert.equal(code, 0);
  const joined = stdoutLines.join('');
  assert.match(joined, /id:\s+good-theme/);
  assert.match(joined, /sidebar-panel/);
});

// ---------------------------------------------------------------------
// main(): list
// ---------------------------------------------------------------------

test('main(["list"]) reports "none found" rather than throwing when both roots are missing', () => {
  const repoRoot = tempRepo(); // empty -- no dist/, no themes/
  const home = tempHome();
  const { ctx, stdoutLines } = makeCtxOverrides({ home, repoRoot });

  const code = main(['list'], ctx);

  assert.equal(code, 0);
  assert.ok(stdoutLines.some((line) => /none found|No themes found/i.test(line)));
});

test('main(["list"]) marks the active theme', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  const themeDir = path.join(repoRoot, 'themes', 'good-theme');
  writeMinimalThemeDir(themeDir, { id: 'good-theme' });
  main(['apply', 'good-theme'], makeCtxOverrides({ home, repoRoot }).ctx);

  const { ctx, stdoutLines } = makeCtxOverrides({ home, repoRoot });
  const code = main(['list'], ctx);

  assert.equal(code, 0);
  assert.ok(stdoutLines.some((line) => line.includes('good-theme') && line.includes('[active]')));
});

// ---------------------------------------------------------------------
// main(): launch with no active theme, per D-0001-32, launches Codex
// UNTHEMED via -NoTheme rather than refusing -- it never spawns a REAL
// Codex/PowerShell process in this suite (see makeCtxOverrides' default
// spawnSync, which throws on an un-faked spawn).
// ---------------------------------------------------------------------

test('main([]) (bare) launches Codex unthemed (-NoTheme) when no theme is applied, and returns the launcher exit status', () => {
  const home = tempHome();
  const repoRoot = tempRepo();

  let capturedCommand = null;
  let capturedArgs = null;
  const fakeSpawnSync = (command, args) => {
    capturedCommand = command;
    capturedArgs = args;
    return { status: 7, error: null };
  };

  const { ctx, stdoutLines } = makeCtxOverrides({ home, repoRoot, platform: 'win32', spawnSync: fakeSpawnSync });

  const code = main([], ctx);

  // The launcher's own exit status is returned verbatim -- not a hardcoded
  // 1 for "refused" (there is no more refusal on this path).
  assert.equal(code, 7);
  assert.ok(stdoutLines.some((line) => line.includes('no theme is applied')));
  assert.equal(capturedCommand, 'powershell.exe');
  assert.ok(capturedArgs.includes('-File'));
  assert.ok(capturedArgs.includes(path.join(repoRoot, 'launcher', 'windows', 'launch.ps1')));
  assert.ok(capturedArgs.includes('-NoTheme'));
  assert.ok(!capturedArgs.includes('-ThemePackage'));
});

test('main([]) (bare) with no active theme still plumbs -LogFile through when CDX_LAUNCHER_LOG is set', () => {
  const home = tempHome();
  const repoRoot = tempRepo();

  let capturedArgs = null;
  const fakeSpawnSync = (command, args) => {
    capturedArgs = args;
    return { status: 0, error: null };
  };

  const { ctx } = makeCtxOverrides({
    home,
    repoRoot,
    platform: 'win32',
    spawnSync: fakeSpawnSync,
    env: { CDX_LAUNCHER_LOG: 'C:\\fake\\codexterity-launcher.log' },
  });

  const code = main([], ctx);

  assert.equal(code, 0);
  assert.ok(capturedArgs.includes('-NoTheme'));
  assert.ok(!capturedArgs.includes('-ThemePackage'));
  assert.ok(capturedArgs.includes('-LogFile'));
  assert.ok(capturedArgs.includes('C:\\fake\\codexterity-launcher.log'));
});

test('main(["launch"]) refuses an unsupported platform', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  const themeDir = path.join(repoRoot, 'themes', 'good-theme');
  writeMinimalThemeDir(themeDir, { id: 'good-theme' });
  main(['apply', 'good-theme'], makeCtxOverrides({ home, repoRoot }).ctx);

  const { ctx, stderrLines } = makeCtxOverrides({ home, repoRoot, platform: 'linux' });
  const code = main(['launch'], ctx);

  assert.equal(code, 1);
  assert.ok(stderrLines.some((line) => line.includes('unsupported platform')));
});

test('main(["launch"]) spawns the Windows launcher with the persisted theme path, without a real subprocess', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  const themeDir = path.join(repoRoot, 'themes', 'good-theme');
  writeMinimalThemeDir(themeDir, { id: 'good-theme' });
  main(['apply', 'good-theme'], makeCtxOverrides({ home, repoRoot }).ctx);

  let capturedCommand = null;
  let capturedArgs = null;
  const fakeSpawnSync = (command, args) => {
    capturedCommand = command;
    capturedArgs = args;
    return { status: 0, error: null };
  };

  const { ctx } = makeCtxOverrides({ home, repoRoot, platform: 'win32', spawnSync: fakeSpawnSync });
  const code = main(['launch'], ctx);

  assert.equal(code, 0);
  assert.equal(capturedCommand, 'powershell.exe');
  assert.ok(capturedArgs.includes('-File'));
  assert.ok(capturedArgs.includes(path.join(repoRoot, 'launcher', 'windows', 'launch.ps1')));
  assert.ok(capturedArgs.includes('-ThemePackage'));
  assert.ok(capturedArgs.includes(path.resolve(themeDir)));
});

// ---------------------------------------------------------------------
// main(): unknown verb and usage
// ---------------------------------------------------------------------

test('main(["bogus"]) prints usage and exits non-zero', () => {
  const { ctx, stderrLines } = makeCtxOverrides({ home: tempHome(), repoRoot: tempRepo() });
  const code = main(['bogus'], ctx);
  assert.equal(code, 1);
  assert.ok(stderrLines.some((line) => line.includes('unknown command')));
});

test('main(["help"]) prints usage and exits zero', () => {
  const { ctx, stdoutLines } = makeCtxOverrides({ home: tempHome(), repoRoot: tempRepo() });
  const code = main(['help'], ctx);
  assert.equal(code, 0);
  assert.ok(stdoutLines.some((line) => line.includes('cdx <verb>')));
});
