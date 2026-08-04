'use strict';

const test = require('node:test');
const { before } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');

const { resolveThemeSource, main } = require(path.join('..', '..', 'injector', 'cli.js'));
const {
  OUTPUT_ROOT,
  PAYLOAD_ROOT,
  resolveCsc,
} = require(path.join('..', '..', 'tools', 'build-windows-package.js'));

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PACKAGING_WINDOWS_DIR = path.join(REPO_ROOT, 'packaging', 'windows');

// make-ico.mjs, png-decode.mjs and palette-engine.mjs are ESM (make-ico.mjs
// imports the ESM-only palette-engine.mjs so its spectrum is the exact
// owner-approved numbers — see make-ico.mjs's own header on why it converted
// from CJS). This test file stays CommonJS, so these are loaded ONCE via a
// dynamic `import()` in a `before()` hook into module-scoped bindings, per
// node:test's documented support for async `before` hooks, rather than
// re-importing (and re-decoding the real Codex asset, and re-installing the
// module) inside every single test that needs them.
let makeIco;
let rasterise;
let encodePng;
let buildIco;
let writeUInt32Checked;
let ICON_SIZES;
let NEUTRAL_GROUND;
let decodePng;
let oklchToHex;

before(async () => {
  const makeIcoModule = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'make-ico.mjs')).href);
  ({ makeIco, rasterise, encodePng, buildIco, writeUInt32Checked, ICON_SIZES, NEUTRAL_GROUND } = makeIcoModule);

  const pngDecodeModule = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'png-decode.mjs')).href);
  ({ decodePng } = pngDecodeModule);

  const paletteEngineModule = await import(
    pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'palette-engine.mjs')).href
  );
  ({ oklchToHex } = paletteEngineModule);
});

function readPackagingFile(name) {
  return fs.readFileSync(path.join(PACKAGING_WINDOWS_DIR, name), 'utf8');
}

/**
 * Extract the exact right-hand-side expression a PowerShell script assigns
 * to `$name`, from its first (non-parameter) assignment. This is the
 * "shared source" mechanism the install/uninstall completeness tests below
 * rely on: rather than each test hardcoding its OWN idea of where
 * $InstallDir/$StartMenuShortcut/$DesktopShortcut point, both scripts'
 * ACTUAL text is parsed and compared — so a change to one script's formula
 * without the matching change to the other fails immediately, which is
 * exactly the drift a hand-maintained pair of expected-path lists could not
 * catch.
 */
function extractAssignment(scriptText, varName) {
  const re = new RegExp(`^\\$${varName}\\s*=\\s*(.+?)\\s*$`, 'm');
  const match = scriptText.match(re);
  return match ? match[1] : null;
}

/** Does `scriptText` contain a `Remove-Item ... $varName ...` line? */
/**
 * Does the script remove the path held in $varName?
 *
 * Matches either a direct `Remove-Item` or a call to the `Remove-Quietly`
 * wrapper. The wrapper exists because $ErrorActionPreference is 'Stop', so a
 * single locked file (typically bin\Codexterity.exe, alive for as long as
 * themed Codex is open) would otherwise abort Uninstall.ps1 before its
 * PASS/FAIL report — the output the script exists to produce. A separate test
 * asserts the wrapper really does call Remove-Item, so accepting its name here
 * does not weaken this check into "mentions the variable somewhere".
 */
function removesVariable(scriptText, varName) {
  const re = new RegExp(`Remove-(?:Item|Quietly)[^\\n]*\\$${varName}\\b`);
  return re.test(scriptText);
}

// ---------------------------------------------------------------------
// Installer path computation — the payload/-is-repo-root invariant
// ---------------------------------------------------------------------

test('build-windows-package: PAYLOAD_ROOT is OUTPUT_ROOT/payload, and OUTPUT_ROOT sits under dist/', () => {
  assert.equal(PAYLOAD_ROOT, path.join(OUTPUT_ROOT, 'payload'));
  assert.equal(path.basename(path.dirname(OUTPUT_ROOT)), 'dist');
  assert.equal(path.basename(OUTPUT_ROOT), 'Codexterity-Windows');
});

test('the payload shape makes resolveThemeSource() find the packaged theme with ZERO code change', () => {
  // This is the load-bearing invariant the whole build script exists to
  // produce: injector/cli.js computes REPO_ROOT as one level above its own
  // __dirname, and resolveThemeSource() looks for dist/<id>.ccskin under
  // that root. Prove it with cli.js's REAL exported function against a
  // directory shaped exactly like build-windows-package.js's payload/ —
  // not a re-description of the rule, the rule itself, exercised.
  const fakePayloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-payload-shape-'));
  const distDir = path.join(fakePayloadRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const ccskinPath = path.join(distDir, 'captains-cabin.ccskin');
  fs.writeFileSync(ccskinPath, Buffer.from('fixture, not a real zip'));
  // injector/ also lives directly under the payload root, one level below
  // where cli.js itself would sit (payload/injector/cli.js) — mirrored here
  // only to the extent resolveThemeSource's contract cares about: the
  // "repoRoot" argument IS the payload root, and dist/ hangs off it.
  fs.mkdirSync(path.join(fakePayloadRoot, 'injector'), { recursive: true });

  const resolved = resolveThemeSource('captains-cabin', fakePayloadRoot);
  assert.equal(resolved, ccskinPath);
});

test('build-windows-package: resolveCsc() finds a real, existing csc.exe on this machine', () => {
  const cscPath = resolveCsc();
  assert.ok(fs.existsSync(cscPath), `resolveCsc() returned "${cscPath}", which does not exist`);
  assert.match(path.basename(cscPath).toLowerCase(), /^csc\.exe$/);
});

// ---------------------------------------------------------------------
// Shortcut argument/target construction (Install.ps1)
// ---------------------------------------------------------------------

test('Install.ps1: the Start Menu and Desktop shortcuts both target bin\\Codexterity.exe under $InstallDir', () => {
  const install = readPackagingFile('Install.ps1');

  const exePathExpr = extractAssignment(install, 'ExePath');
  assert.ok(exePathExpr, 'Install.ps1 must assign $ExePath');
  assert.match(exePathExpr, /InstallDir/);
  assert.match(exePathExpr, /bin\\Codexterity\.exe/);

  // Both shortcut objects must point AT that same resolved variable, not
  // reconstruct their own path — one shortcut aimed somewhere else is
  // exactly the kind of drift a purely textual "it mentions Codexterity.exe
  // somewhere" check would miss.
  const startTargetMatches = install.match(/\$startShortcut\.TargetPath\s*=\s*(.+)/);
  const deskTargetMatches = install.match(/\$deskShortcut\.TargetPath\s*=\s*(.+)/);
  assert.ok(startTargetMatches, 'Install.ps1 must set $startShortcut.TargetPath');
  assert.ok(deskTargetMatches, 'Install.ps1 must set $deskShortcut.TargetPath');
  assert.equal(startTargetMatches[1].trim(), '$ExePath');
  assert.equal(deskTargetMatches[1].trim(), '$ExePath');
});

test('Install.ps1: both shortcuts set IconLocation to a path under $InstallDir\\bin', () => {
  const install = readPackagingFile('Install.ps1');

  const iconPathExpr = extractAssignment(install, 'IconPath');
  assert.ok(iconPathExpr, 'Install.ps1 must assign $IconPath');
  assert.match(iconPathExpr, /InstallDir/);
  assert.match(iconPathExpr, /bin\\\$IconFileName/);

  assert.match(install, /\$startShortcut\.IconLocation\s*=\s*\$IconPath/);
  assert.match(install, /\$deskShortcut\.IconLocation\s*=\s*\$IconPath/);
});

/**
 * Read the default value of a `[string]$Name = <default>` script parameter.
 * Returned verbatim, quotes included, so a comparison across two files is a
 * byte comparison rather than a comparison of two different parses.
 */
function shortcutNameDefault(source) {
  const m = source.match(/\[string\]\$ShortcutName\s*=\s*(.+?)\s*[,)\r\n]/);
  return m ? m[1].trim() : null;
}

test('Install.ps1: the shortcut name and icon file name are parameters with real, non-placeholder defaults', () => {
  const install = readPackagingFile('Install.ps1');
  const name = shortcutNameDefault(install);
  assert.ok(name, 'Install.ps1 must declare a [string]$ShortcutName parameter with a default');
  // Asserted as a PROPERTY, not as one blessed string: the owner picks the
  // name from a render, so pinning the literal here would make a legitimate
  // rename look like a test failure. What must hold is that the default is a
  // real, quoted, non-empty value — never a placeholder.
  assert.match(name, /^(['"]).+\1$/, `$ShortcutName's default must be a quoted literal, got: ${name}`);
  assert.ok(name.length > 2, '$ShortcutName must not default to an empty string');

  assert.match(install, /\[string\]\$IconFileName\s*=\s*'Codexterity\.ico'/);
  // No leftover placeholder markers anywhere in the installer.
  assert.doesNotMatch(install, /\bTODO\b|\bFIXME\b/);
});

test('Install.ps1 and Uninstall.ps1 default $ShortcutName to the IDENTICAL string', () => {
  // This is a separate check from the path-expression test below, and it has
  // to be. Both scripts build their shortcut paths from the expression
  // "$ShortcutName.lnk", so those expressions stay byte-identical even when
  // the two DEFAULTS have drifted apart. The result of such a drift is
  // silent and bad: Uninstall.ps1 deletes a filename that was never created,
  // then its own verification pass reports PASS for a shortcut still sitting
  // in the user's Start Menu — a clean bill of health over real residue,
  // which is precisely what D-0001-3's "nothing residual" promise forbids.
  const installName = shortcutNameDefault(readPackagingFile('Install.ps1'));
  const uninstallName = shortcutNameDefault(readPackagingFile('Uninstall.ps1'));
  assert.ok(installName, 'Install.ps1 must declare a $ShortcutName default');
  assert.ok(uninstallName, 'Uninstall.ps1 must declare a $ShortcutName default');
  assert.equal(
    uninstallName,
    installName,
    `Uninstall.ps1 must default $ShortcutName to exactly Install.ps1's value ` +
      `(install: ${installName}, uninstall: ${uninstallName}) — otherwise uninstall silently orphans the shortcut`
  );
});

test('Install.ps1: never elevates and never requires an admin-only directory', () => {
  const install = readPackagingFile('Install.ps1');
  // The install target must be per-user, never Program Files or a path
  // requiring elevation, and the script must not relaunch itself elevated.
  assert.match(extractAssignment(install, 'InstallDir'), /\$env:USERPROFILE/);
  assert.doesNotMatch(install, /Program Files/);
  assert.doesNotMatch(install, /RunAs/i);
  assert.doesNotMatch(install, /Start-Process[^\n]*-Verb\s+RunAs/i);
});

test('Install.ps1: the install root is NOT under %LOCALAPPDATA%/%APPDATA% — MSIX hides those from Codex (D-0001-29)', () => {
  // This test exists because the obvious, conventional choice is WRONG here
  // and fails in a way no unit test caught: the suite was fully green while
  // the installed product could not launch at all.
  //
  // Codex Desktop is a packaged MSIX app, and MSIX applies filesystem
  // redirection to %LOCALAPPDATA%/%APPDATA% — a packaged process reading
  // %LOCALAPPDATA%\X gets its own container's copy
  // (…\Packages\OpenAI.Codex_…\LocalCache\Local\X), never the real user
  // folder. Installed to %LOCALAPPDATA%\Codexterity, Codex exited 13 with
  // "Cannot find module '…/AppData/Local/Codexterity/injector/core/preload.js'"
  // while Test-Path on that exact file returned True from a normal process.
  // The same payload under %USERPROFILE% launched and the injector attached.
  //
  // Both scripts are checked: an install root and an uninstall root that
  // disagree would leave the whole tree behind.
  for (const script of ['Install.ps1', 'Uninstall.ps1']) {
    const expr = extractAssignment(readPackagingFile(script), 'InstallDir');
    assert.ok(expr, `${script} must assign $InstallDir`);
    assert.doesNotMatch(
      expr,
      /LOCALAPPDATA|\$env:APPDATA/,
      `${script}: $InstallDir must not sit under an MSIX-redirected AppData path (got: ${expr})`
    );
  }
});

// ---------------------------------------------------------------------
// Uninstall completeness — derived from the SAME source as Install.ps1,
// not a second hardcoded list (see extractAssignment()'s own comment).
// ---------------------------------------------------------------------

test('Install.ps1 and Uninstall.ps1 compute $InstallDir, $StartMenuShortcut and $DesktopShortcut identically', () => {
  const install = readPackagingFile('Install.ps1');
  const uninstall = readPackagingFile('Uninstall.ps1');

  for (const varName of ['InstallDir', 'StartMenuShortcut', 'DesktopShortcut']) {
    const installExpr = extractAssignment(install, varName);
    const uninstallExpr = extractAssignment(uninstall, varName);
    assert.ok(installExpr, `Install.ps1 must assign $${varName}`);
    assert.ok(uninstallExpr, `Uninstall.ps1 must assign $${varName}`);
    assert.equal(
      uninstallExpr,
      installExpr,
      `$${varName} must be computed by the IDENTICAL expression in both scripts (install: "${installExpr}", uninstall: "${uninstallExpr}")`
    );
  }
});

test('Uninstall.ps1 removes every path the install process creates: InstallDir, both shortcuts, and ~/.codexterity', () => {
  const uninstall = readPackagingFile('Uninstall.ps1');

  // ~/.codexterity is not created by Install.ps1 directly -- it is written
  // by "cdx apply" (injector/cli.js, D-0001-24) as a SIDE EFFECT of the
  // install process, via os.homedir() -- which on Windows resolves through
  // %USERPROFILE%. Uninstall.ps1 must still know to remove it.
  const codexterityHomeExpr = extractAssignment(uninstall, 'CodexterityHome');
  assert.ok(codexterityHomeExpr, 'Uninstall.ps1 must assign $CodexterityHome');
  assert.match(codexterityHomeExpr, /env:USERPROFILE/);
  assert.match(codexterityHomeExpr, /\.codexterity/);

  for (const varName of ['CodexterityHome', 'InstallDir', 'StartMenuShortcut', 'DesktopShortcut']) {
    assert.ok(
      removesVariable(uninstall, varName),
      `Uninstall.ps1 must Remove-Item referencing $${varName}`
    );
  }
});

test('Uninstall.ps1 Remove-Quietly really removes, and cannot abort the report it precedes', () => {
  const uninstall = readPackagingFile('Uninstall.ps1');

  const fn = uninstall.match(/function Remove-Quietly[\s\S]*?\n}/);
  assert.ok(fn, 'Uninstall.ps1 must define a Remove-Quietly function');
  const body = fn[0];

  // It must actually delete — otherwise removesVariable() above would be
  // satisfied by a wrapper that does nothing at all.
  assert.match(body, /Remove-Item[^\n]*-Force/, 'Remove-Quietly must call Remove-Item -Force');
  // And it must swallow the failure, which is the whole reason it exists:
  // one locked file must not stop the remaining removals or the PASS/FAIL
  // report. The report re-tests every path, so nothing is actually hidden.
  assert.match(body, /catch\s*\{/, 'Remove-Quietly must catch removal failures');

  // The report must come AFTER every removal, or a failure part-way through
  // would still leave the user without the summary.
  assert.ok(
    uninstall.indexOf('function Report') > uninstall.indexOf('function Remove-Quietly'),
    'the PASS/FAIL report must be defined after the removal helper it summarises'
  );
});

test('Uninstall.ps1 never constructs a path under ~/.codex (Codex\'s own credential store, D-0001-3)', () => {
  const uninstall = readPackagingFile('Uninstall.ps1');
  // The string ".codex" must only ever appear as part of ".codexterity" or
  // in a comment/message ABOUT ~/.codex, never as a literal path Uninstall
  // itself joins or removes. Every occurrence of a bare ".codex" token
  // (not immediately followed by "terity") must be inside prose, i.e. not
  // adjacent to Join-Path / Remove-Item on the same line.
  const lines = uninstall.split('\n');
  for (const line of lines) {
    if (/\.codex(?!terity)\b/.test(line)) {
      assert.doesNotMatch(
        line,
        /Join-Path|Remove-Item/,
        `Uninstall.ps1 must never Join-Path or Remove-Item a literal ~/.codex path: "${line.trim()}"`
      );
    }
  }
});

test('Uninstall.ps1 reports PASS/FAIL per removed item rather than a single "done" message', () => {
  const uninstall = readPackagingFile('Uninstall.ps1');
  assert.match(uninstall, /PASS/);
  assert.match(uninstall, /FAIL/);
  // Four things are verified: state dir, install dir, and both shortcuts.
  const reportCalls = uninstall.match(/Report\s+'/g) || [];
  assert.equal(reportCalls.length, 4, 'Uninstall.ps1 must report on exactly the 4 removed artifacts');
});

// ---------------------------------------------------------------------
// The .ico writer — real header/entry offsets, cross-checked against
// Node's own independent zlib.crc32 (the same "verify against an
// independent implementation" discipline D-0001-23 used against .NET's
// ZipFile) — and range-checked fields that THROW rather than truncate.
// ---------------------------------------------------------------------

test('writeUInt32Checked() writes a valid value and THROWS (not truncates) above 0xFFFFFFFF', () => {
  assert.doesNotThrow(() => writeUInt32Checked(0xffffffff));
  assert.doesNotThrow(() => writeUInt32Checked(0));
  assert.throws(() => writeUInt32Checked(0x100000000), RangeError);
  // The specific failure D-0001-23 records: `>>> 0` would SILENTLY mask
  // 0x100000000 down to 0, producing a structurally valid but WRONG
  // 4-byte field instead of failing. Prove the two behave differently, so
  // a future "simplify this back to >>> 0" change would be caught here.
  // eslint-disable-next-line no-bitwise
  assert.equal(0x100000000 >>> 0, 0, 'sanity: >>> 0 silently truncates this exact value to 0');
});

test('buildIco() produces a well-formed ICONDIR whose entries point at real PNG data, verified against an independent CRC-32', () => {
  const images = ICON_SIZES.map((size) => ({ size, png: encodePng(size, size, rasterise(size)) }));
  const icoBuffer = buildIco(images);

  assert.equal(icoBuffer.readUInt16LE(0), 0, 'reserved field must be 0');
  assert.equal(icoBuffer.readUInt16LE(2), 1, 'type field must be 1 (icon)');
  const count = icoBuffer.readUInt16LE(4);
  assert.equal(count, ICON_SIZES.length);

  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + i * 16;
    const width = icoBuffer[entryOffset];
    const height = icoBuffer[entryOffset + 1];
    const bytesInRes = icoBuffer.readUInt32LE(entryOffset + 8);
    const dataOffset = icoBuffer.readUInt32LE(entryOffset + 12);
    const expectedSize = ICON_SIZES[i];

    assert.equal(width, expectedSize === 256 ? 0 : expectedSize);
    assert.equal(height, expectedSize === 256 ? 0 : expectedSize);

    const pngSlice = icoBuffer.subarray(dataOffset, dataOffset + bytesInRes);
    assert.equal(
      pngSlice.subarray(0, 8).toString('hex'),
      '89504e470d0a1a0a',
      `entry ${i} (${expectedSize}px) data offset does not point at a PNG signature`
    );

    // Walk every chunk and cross-check its CRC-32 against Node's OWN
    // built-in zlib.crc32 -- an implementation this repo did not write,
    // verifying the one it did.
    let p = 8;
    let sawIend = false;
    while (p < pngSlice.length) {
      const len = pngSlice.readUInt32BE(p);
      const type = pngSlice.subarray(p + 4, p + 8).toString('ascii');
      const body = pngSlice.subarray(p + 4, p + 8 + len);
      const crc = pngSlice.readUInt32BE(p + 8 + len);
      assert.equal(crc, zlib.crc32(body), `entry ${i} chunk "${type}" CRC-32 disagrees with zlib.crc32`);
      p += 8 + len + 4;
      if (type === 'IEND') {
        sawIend = true;
        break;
      }
    }
    assert.ok(sawIend, `entry ${i} PNG never reached an IEND chunk`);
    assert.equal(p, pngSlice.length, `entry ${i} PNG has trailing bytes after IEND`);
  }
});

test('buildIco() range-checks rather than silently accepting an icon size over 256px', () => {
  const oversized = { size: 512, png: encodePng(16, 16, rasterise(16)) };
  assert.throws(() => buildIco([oversized]), RangeError);
});

test('rasterise() produces an opaque size*size*4 RGBA buffer for every declared icon size', () => {
  for (const size of ICON_SIZES) {
    const buffer = rasterise(size);
    assert.equal(buffer.length, size * size * 4);
    // Every pixel is fully opaque -- this is a flat-background placeholder
    // icon (D-0001-6's "surfaces are flat token colour" spirit applied to
    // the shortcut icon too), never a transparency hole.
    for (let i = 3; i < buffer.length; i += 4) {
      assert.equal(buffer[i], 255);
    }
  }
});

test('makeIco() writes a real .ico file to a caller-supplied path', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-ico-'));
  const outputPath = path.join(tmpDir, 'test-icon.ico');
  const result = makeIco(outputPath);

  assert.equal(result.outputPath, outputPath);
  assert.ok(fs.existsSync(outputPath));
  const onDisk = fs.statSync(outputPath).size;
  assert.equal(onDisk, result.bytes);
  assert.deepEqual(result.sizes, ICON_SIZES);
});

// ---------------------------------------------------------------------
// The PNG decoder (tools/png-decode.mjs) — round-tripped against the
// generator's OWN encodePng() (exercises every filter path with no fixture
// needed), and proven to reject exactly what it claims to reject.
// ---------------------------------------------------------------------

test('decodePng() round-trips a real RGBA image through encodePng()', () => {
  const size = 6;
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = (i * 37) % 256;
    rgba[i * 4 + 1] = (i * 91) % 256;
    rgba[i * 4 + 2] = (i * 149) % 256;
    rgba[i * 4 + 3] = 255;
  }
  const png = encodePng(size, size, rgba);
  const decoded = decodePng(png);

  assert.equal(decoded.width, size);
  assert.equal(decoded.height, size);
  assert.deepEqual(Uint8Array.prototype.slice.call(decoded.rgba), Uint8Array.prototype.slice.call(rgba));
});

// Colour type 2 (RGB, no alpha) — added to the decoder in Plan 0003 M1 for the
// hero-image pipeline, which is the decoder's SECOND consumer alongside the
// icon builder. The tests live here with the rest of the decoder's coverage
// rather than beside the pipeline: the unit under test is png-decode.mjs, and
// splitting its cases across two files is how one half later goes unmaintained.
//
// The encoder helper below is local because make-ico.mjs's encodePng() writes
// colour type 6 only, and it should stay that way — the icon builder has no
// use for a type-2 path, and adding an unused branch to a shipped tool to make
// a test easier is the wrong trade.
function encodeRgbPng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 (RGB)
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return out;
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('decodePng() decodes a colour-type-2 (RGB) image and expands it to opaque RGBA', () => {
  const width = 5;
  const height = 4;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = (i * 37) % 256;
    rgb[i * 3 + 1] = (i * 91) % 256;
    rgb[i * 3 + 2] = (i * 149) % 256;
  }

  const decoded = decodePng(encodeRgbPng(width, height, rgb));

  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  // The decoder's contract is that it ALWAYS returns RGBA, whichever colour
  // type came in, so neither the icon builder nor hero-scrim.mjs has to branch.
  assert.equal(decoded.rgba.length, width * height * 4);
  for (let i = 0; i < width * height; i++) {
    assert.deepEqual(
      [decoded.rgba[i * 4], decoded.rgba[i * 4 + 1], decoded.rgba[i * 4 + 2]],
      [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]],
      `pixel ${i} channel values`
    );
    assert.equal(decoded.rgba[i * 4 + 3], 255, `pixel ${i} alpha is opaque`);
  }
});

test('decodePng() applies the Sub/Paeth filters at a THREE-byte pixel stride on colour type 2', () => {
  // The trap this closes: PNG's Sub/Average/Paeth predictors reference "the
  // pixel to the left", which is bytes-per-pixel bytes back — 3 here, not 4.
  // A decoder that kept the RGBA constant would still produce a full-size
  // buffer of plausible-looking garbage rather than throwing, so the only way
  // to catch it is to decode filtered rows and compare actual values.
  const width = 6;
  const height = 4;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 53 + 11) % 256;

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  const filtersUsed = [1, 4, 2, 3]; // Sub, Paeth, Up, Average — one per row
  for (let y = 0; y < height; y++) {
    const filterType = filtersUsed[y];
    raw[y * (stride + 1)] = filterType;
    for (let x = 0; x < stride; x++) {
      const cur = rgb[y * stride + x];
      const a = x >= 3 ? rgb[y * stride + x - 3] : 0;
      const b = y > 0 ? rgb[(y - 1) * stride + x] : 0;
      const c = (x >= 3 && y > 0) ? rgb[(y - 1) * stride + x - 3] : 0;
      let predictor;
      switch (filterType) {
        case 1: predictor = a; break;
        case 2: predictor = b; break;
        case 3: predictor = Math.floor((a + b) / 2); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          predictor = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        default: predictor = 0;
      }
      raw[y * (stride + 1) + 1 + x] = (cur - predictor) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return out;
  };
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  const decoded = decodePng(png);
  for (let i = 0; i < width * height; i++) {
    assert.deepEqual(
      [decoded.rgba[i * 4], decoded.rgba[i * 4 + 1], decoded.rgba[i * 4 + 2]],
      [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]],
      `pixel ${i} survived filtered round-trip`
    );
  }
});

test('decodePng() reports the colour type it actually got when a type-2 stream is truncated', () => {
  const width = 4;
  const height = 3;
  const png = encodeRgbPng(width, height, Buffer.alloc(width * height * 3, 0x40));
  // Re-declare a larger height so the inflated data no longer matches the
  // expected size; the message must name RGB, not RGBA, or a future reader
  // debugging a hero image is sent looking for a channel the file never had.
  const mutated = Buffer.from(png);
  mutated.writeUInt32BE(height + 1, 8 + 8 + 4);
  const ihdrLen = mutated.readUInt32BE(8);
  mutated.writeUInt32BE(
    zlib.crc32(mutated.subarray(12, 12 + 4 + ihdrLen)),
    12 + 4 + ihdrLen
  );

  assert.throws(() => decodePng(mutated), /8-bit RGB image/);
});

test('decodePng() decodes correctly when the compressed data is split across MULTIPLE IDAT chunks', () => {
  // The real Codex asset carries its zlib stream split across two IDAT
  // chunks (8192 + 982 bytes) -- a decoder that inflates only the first
  // chunk produces a silently truncated image with no error. Reconstruct
  // that shape deliberately: encode a normal single-IDAT PNG, then rebuild
  // it with the same IDAT payload cut into two chunks.
  const size = 4;
  const rgba = Buffer.alloc(size * size * 4, 0);
  for (let i = 0; i < rgba.length; i++) rgba[i] = i % 256;
  const singleIdatPng = encodePng(size, size, rgba);

  // Walk the chunks, split the one IDAT payload in half, and re-serialise.
  function chunks(buf) {
    const list = [];
    let pos = 8;
    while (pos < buf.length) {
      const len = buf.readUInt32BE(pos);
      const type = buf.toString('ascii', pos + 4, pos + 8);
      const data = buf.subarray(pos + 8, pos + 8 + len);
      list.push({ type, data });
      pos += 8 + len + 4;
      if (type === 'IEND') break;
    }
    return list;
  }
  function writeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);
    const crc = zlib.crc32(body);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    return Buffer.concat([lenBuf, body, crcBuf]);
  }

  const parsed = chunks(singleIdatPng);
  const idat = parsed.find((c) => c.type === 'IDAT');
  const half = Math.floor(idat.data.length / 2);
  const parts = [idat.data.subarray(0, half), idat.data.subarray(half)];
  assert.ok(parts[0].length > 0 && parts[1].length > 0, 'test fixture must actually split the IDAT payload');

  const rebuilt = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...parsed
      .filter((c) => c.type !== 'IDAT')
      .flatMap((c) => (c.type === 'IHDR' ? [writeChunk('IHDR', c.data)] : []))
      .concat(parts.map((p) => writeChunk('IDAT', p)))
      .concat([writeChunk('IEND', Buffer.alloc(0))]),
  ];
  const multiIdatPng = Buffer.concat(rebuilt);

  const decoded = decodePng(multiIdatPng);
  assert.equal(decoded.width, size);
  assert.equal(decoded.height, size);
  assert.deepEqual(Uint8Array.prototype.slice.call(decoded.rgba), Uint8Array.prototype.slice.call(rgba));
});

test('decodePng() throws BY NAME on an unsupported bit depth', () => {
  const size = 2;
  const png = encodePng(size, size, Buffer.alloc(size * size * 4, 0x80));
  // Flip IHDR's bit-depth byte (offset 8 within IHDR's data, which starts
  // right after the 8-byte signature + 8-byte chunk header).
  const mutated = Buffer.from(png);
  const ihdrDataStart = 8 + 8;
  mutated[ihdrDataStart + 8] = 16; // bit depth 16, not 8
  // Recompute IHDR's CRC so the mutation is caught by the bit-depth check,
  // not masked by the (unrelated) CRC check running first.
  const ihdrLen = mutated.readUInt32BE(8);
  const body = mutated.subarray(12, 12 + 4 + ihdrLen);
  const crc = zlib.crc32(body);
  mutated.writeUInt32BE(crc, 12 + 4 + ihdrLen);

  assert.throws(() => decodePng(mutated), /bit depth/);
});

test('decodePng() throws BY NAME on an unsupported colour type', () => {
  const size = 2;
  const png = encodePng(size, size, Buffer.alloc(size * size * 4, 0x80));
  const mutated = Buffer.from(png);
  const ihdrDataStart = 8 + 8;
  // Colour type 3 (palette). This test used to mutate to colour type 2, but
  // type 2 (RGB, no alpha) became SUPPORTED in Plan 0003 M1 — hero photographs
  // are exported without an alpha channel. Palette is still refused, and this
  // test is re-aimed at it rather than deleted: the claim being proved is that
  // an unsupported colour type fails BY NAME, and that claim still needs a
  // genuinely unsupported type to prove it against.
  mutated[ihdrDataStart + 9] = 3;
  const ihdrLen = mutated.readUInt32BE(8);
  const body = mutated.subarray(12, 12 + 4 + ihdrLen);
  const crc = zlib.crc32(body);
  mutated.writeUInt32BE(crc, 12 + 4 + ihdrLen);

  assert.throws(() => decodePng(mutated), /colour type/);
});

test('decodePng() throws BY NAME on an unsupported interlace method', () => {
  const size = 2;
  const png = encodePng(size, size, Buffer.alloc(size * size * 4, 0x80));
  const mutated = Buffer.from(png);
  const ihdrDataStart = 8 + 8;
  mutated[ihdrDataStart + 12] = 1; // Adam7 interlacing, not 0
  const ihdrLen = mutated.readUInt32BE(8);
  const body = mutated.subarray(12, 12 + 4 + ihdrLen);
  const crc = zlib.crc32(body);
  mutated.writeUInt32BE(crc, 12 + 4 + ihdrLen);

  assert.throws(() => decodePng(mutated), /interlace/);
});

test('decodePng() throws BY NAME (not a generic parse error) on a non-PNG buffer', () => {
  assert.throws(() => decodePng(Buffer.from('not a png at all, just text')), /signature/);
});

// ---------------------------------------------------------------------
// The R5 rasteriser — proving the ARTWORK is actually there, not just a
// buffer of the right length. The Codex knot mark has a genuine hole at its
// exact geometric centre (measured against the real decoded asset), so the
// "is the knot painted" check below scans a small region around the centre
// rather than asserting one single pixel, which would be fragile against
// exactly the kind of shape this asset has.
// ---------------------------------------------------------------------

function isGroundPixel(buffer, size, x, y) {
  const off = (y * size + x) * 4;
  const [gr, gg, gb] = NEUTRAL_GROUND_RGB();
  return buffer[off] === gr && buffer[off + 1] === gg && buffer[off + 2] === gb && buffer[off + 3] === 255;
}

function NEUTRAL_GROUND_RGB() {
  const n = parseInt(NEUTRAL_GROUND.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

test('rasterise(): far corners are pure NEUTRAL_GROUND and a knot-coloured pixel exists near the centre', () => {
  for (const size of ICON_SIZES) {
    const buffer = rasterise(size);
    assert.equal(buffer.length, size * size * 4, `size ${size}: buffer must be size*size*4`);
    for (let i = 3; i < buffer.length; i += 4) {
      assert.equal(buffer[i], 255, `size ${size}: every pixel must be fully opaque`);
    }

    // Far corners sit well outside the 64%-scaled, centred knot box for
    // every declared size, so they must be untouched, exact NEUTRAL_GROUND.
    assert.ok(isGroundPixel(buffer, size, 0, 0), `size ${size}: top-left corner must be NEUTRAL_GROUND`);
    assert.ok(
      isGroundPixel(buffer, size, size - 1, size - 1),
      `size ${size}: bottom-right corner must be NEUTRAL_GROUND`
    );

    // Somewhere in a box around the tile's centre, the knot must actually be
    // painted -- i.e. this is not a buffer that came back the right length
    // and size but is secretly all ground.
    const cx = Math.floor(size / 2);
    const half = Math.max(1, Math.round(size * 0.3));
    let paintedFound = false;
    for (let y = Math.max(0, cx - half); y <= Math.min(size - 1, cx + half) && !paintedFound; y++) {
      for (let x = Math.max(0, cx - half); x <= Math.min(size - 1, cx + half); x++) {
        if (!isGroundPixel(buffer, size, x, y)) {
          paintedFound = true;
          break;
        }
      }
    }
    assert.ok(paintedFound, `size ${size}: expected at least one knot-coloured pixel near the tile's centre`);
  }
});

test('NEUTRAL_GROUND matches oklchToHex({L:0.19,C:0,H:0}) exactly -- a palette-engine change cannot silently desync the icon', () => {
  assert.equal(NEUTRAL_GROUND, oklchToHex({ L: 0.19, C: 0, H: 0 }));
});

// ---------------------------------------------------------------------
// cmdLaunch passes -LogFile iff CDX_LAUNCHER_LOG is set (D-0001-27) —
// never a new CLI flag, and never touching the real spawnSync/home dir.
// ---------------------------------------------------------------------

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-win-cli-home-'));
}

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-win-cli-repo-'));
}

function writeMinimalThemeDir(dir) {
  const manifest = {
    formatVersion: 1,
    id: 'good-theme',
    name: 'Good Theme',
    version: '0.1.0',
    author: 'test',
    license: 'MIT',
    description: 'A fixture theme.',
    targetApp: 'openai-codex-desktop',
    targetVersionRange: { min: '26.727', max: '27' },
    verifiedAgainst: '26.727.6591.0',
    files: { css: 'theme.css', syntax: 'syntax.json' },
    landmarks: [],
    assets: [],
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'theme.css'), '.a { color: red; }');
  fs.writeFileSync(path.join(dir, 'syntax.json'), '{"keyword":"#000"}');
}

function makeCtx(overrides) {
  return Object.assign(
    {
      stdout: () => {},
      stderr: () => {},
      now: () => '2026-08-03T00:00:00.000Z',
      spawnSync: () => {
        throw new Error('test attempted a REAL spawn — pass a fake spawnSync');
      },
    },
    overrides
  );
}

test('cmdLaunch passes -LogFile when CDX_LAUNCHER_LOG is set in ctx.env', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  writeMinimalThemeDir(path.join(repoRoot, 'themes', 'good-theme'));
  main(['apply', 'good-theme'], makeCtx({ home, repoRoot }));

  let capturedArgs = null;
  const fakeSpawnSync = (command, args) => {
    capturedArgs = args;
    return { status: 0, error: null };
  };

  const code = main(
    ['launch'],
    makeCtx({
      home,
      repoRoot,
      platform: 'win32',
      env: { CDX_LAUNCHER_LOG: 'C:\\Users\\fixture\\logs\\launcher.log' },
      spawnSync: fakeSpawnSync,
    })
  );

  assert.equal(code, 0);
  assert.ok(capturedArgs.includes('-LogFile'));
  assert.equal(capturedArgs[capturedArgs.indexOf('-LogFile') + 1], 'C:\\Users\\fixture\\logs\\launcher.log');
});

test('cmdLaunch does NOT pass -LogFile when CDX_LAUNCHER_LOG is unset', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  writeMinimalThemeDir(path.join(repoRoot, 'themes', 'good-theme'));
  main(['apply', 'good-theme'], makeCtx({ home, repoRoot }));

  let capturedArgs = null;
  const fakeSpawnSync = (command, args) => {
    capturedArgs = args;
    return { status: 0, error: null };
  };

  const code = main(
    ['launch'],
    makeCtx({
      home,
      repoRoot,
      platform: 'win32',
      env: {},
      spawnSync: fakeSpawnSync,
    })
  );

  assert.equal(code, 0);
  assert.ok(!capturedArgs.includes('-LogFile'));
});

test('cmdLaunch does not require ctx.env at all — a caller that omits it still launches (defaults to no -LogFile via process.env unless CDX_LAUNCHER_LOG is genuinely set there)', () => {
  const home = tempHome();
  const repoRoot = tempRepo();
  writeMinimalThemeDir(path.join(repoRoot, 'themes', 'good-theme'));
  main(['apply', 'good-theme'], makeCtx({ home, repoRoot }));

  let capturedArgs = null;
  const fakeSpawnSync = (command, args) => {
    capturedArgs = args;
    return { status: 0, error: null };
  };

  // No `env` override at all -- buildContext() falls back to the real
  // process.env, which this test suite's own environment does not set
  // CDX_LAUNCHER_LOG in.
  const code = main(['launch'], makeCtx({ home, repoRoot, platform: 'win32', spawnSync: fakeSpawnSync }));

  assert.equal(code, 0);
  assert.ok(!process.env.CDX_LAUNCHER_LOG, 'test environment must not have CDX_LAUNCHER_LOG set for this assertion to be meaningful');
  assert.ok(!capturedArgs.includes('-LogFile'));
});

// ---------------------------------------------------------------------
// launch.ps1's -LogFile parameter — default-unset behaviour is untouched
// ---------------------------------------------------------------------

test('launch.ps1 declares -LogFile as an optional string parameter, defaulting to unset', () => {
  const launchPs1 = fs.readFileSync(
    path.join(REPO_ROOT, 'launcher', 'windows', 'launch.ps1'),
    'utf8'
  );
  assert.match(launchPs1, /\[string\]\$LogFile\s*\)/);
  // Write-Log must no-op when $LogFile is empty, never throw or alter the
  // console-only behaviour that predates this milestone.
  assert.match(launchPs1, /function Write-Log/);
  assert.match(launchPs1, /IsNullOrWhiteSpace\(\s*\$LogFile\s*\)/);
});
