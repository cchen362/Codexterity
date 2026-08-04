'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { loadTheme } = require(path.join('..', '..', 'injector', 'theme-loader', 'index.js'));
const {
  buildLandmarkProbeScript,
  isSecondaryWindowUrl,
  describeLandmarkVerdict,
  reportLandmarkVerdicts,
} = require(path.join('..', '..', 'injector', 'core', 'landmarks.js'));

// ---------------------------------------------------------------------
// Fixture: a real, loadable theme package whose landmark selectors cannot
// match anything in any DOM — the "Codex renamed its markup" simulation
// M4(b) exists to prove. One required:true landmark plus several optional
// ones, so both classes of the manifest are covered.
// ---------------------------------------------------------------------

const BROKEN_LANDMARKS = [
  { name: 'sidebar-panel', selector: '.cdx-no-such-landmark-a', required: true, governedBy: 'D-0001-13' },
  { name: 'title-bar', selector: '.cdx-no-such-landmark-b' },
  { name: 'empty-state-hero', selector: '.cdx-no-such-landmark-c' },
  { name: 'code-surface', selector: '.cdx-no-such-landmark-d' },
];

function makeBrokenThemeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-landmarks-test-'));
  const manifest = {
    formatVersion: 1,
    id: 'broken-landmarks-fixture',
    name: 'Broken Landmarks Fixture',
    version: '0.1.0',
    author: 'test',
    license: 'MIT',
    description: 'A theme whose landmarks have rotted, for M4(b).',
    targetApp: 'openai-codex-desktop',
    targetVersionRange: { min: '26.727', max: '27' },
    verifiedAgainst: '26.727.6591.0',
    files: { css: 'theme.css', syntax: 'syntax.json' },
    landmarks: BROKEN_LANDMARKS,
    assets: [],
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'theme.css'), '.electron-dark { --color-background-surface: #0E141F; }');
  fs.writeFileSync(path.join(dir, 'syntax.json'), '{"keyword":"#000"}');
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- 1. the loader accepts a theme whose landmarks are rotted ---

test('a theme with landmark selectors matching nothing still loads successfully', () => {
  const dir = makeBrokenThemeDir();
  try {
    const theme = loadTheme(dir);
    assert.equal(theme.id, 'broken-landmarks-fixture');
    assert.equal(theme.manifest.landmarks.length, BROKEN_LANDMARKS.length);
    assert.equal(theme.manifest.landmarks[0].required, true);
    // The point: broken landmarks are a DEGRADATION case, not a load
    // failure. The loader validates SHAPE (manifest.js does not parse
    // `selector` as CSS at all), never whether a selector matches anything.
  } finally {
    cleanup(dir);
  }
});

// --- 2. the generated probe script is real, evaluable JavaScript ---

function evaluateProbeScript(script, stubDocument) {
  // Electron's webContents.executeJavaScript resolves to the script's
  // COMPLETION VALUE (like eval), not to an explicit `return` — so this
  // mirrors that rather than wrapping the script in a `function(){ return
  // ... }` shell. That distinction is load-bearing here: prefixing with a
  // literal "return" followed by the script's own leading newline triggers
  // automatic semicolon insertion and silently evaluates to undefined,
  // which is exactly the kind of "parses fine, throws/misbehaves when run"
  // gap this project has been burned by before.
  function evaluate(document) {
    return eval(script);
  }
  return evaluate(stubDocument);
}

test('buildLandmarkProbeScript() evaluates to {selector, count: 0} for every landmark against an empty DOM', () => {
  const stubDocument = {
    querySelectorAll(sel) {
      return [];
    },
  };
  const script = buildLandmarkProbeScript(BROKEN_LANDMARKS);
  const results = evaluateProbeScript(script, stubDocument);
  assert.equal(results.length, BROKEN_LANDMARKS.length);
  results.forEach((r, i) => {
    assert.equal(r.selector, BROKEN_LANDMARKS[i].selector);
    assert.equal(r.count, 0);
  });
});

test('buildLandmarkProbeScript() reports count -1 for a selector the DOM throws on', () => {
  const throwingSelector = ':has(:not(';
  const landmarks = [{ name: 'bad-selector', selector: throwingSelector }];
  const stubDocument = {
    querySelectorAll(sel) {
      if (sel === throwingSelector) throw new Error('invalid selector');
      return [];
    },
  };
  const script = buildLandmarkProbeScript(landmarks);
  const results = evaluateProbeScript(script, stubDocument);
  assert.equal(results.length, 1);
  assert.equal(results[0].selector, throwingSelector);
  assert.equal(results[0].count, -1);
});

test('buildLandmarkProbeScript() reports a positive count for a selector that matches', () => {
  const landmarks = [{ name: 'present-thing', selector: '.exists' }];
  const stubDocument = {
    querySelectorAll(sel) {
      return sel === '.exists' ? [1, 2, 3] : [];
    },
  };
  const script = buildLandmarkProbeScript(landmarks);
  const results = evaluateProbeScript(script, stubDocument);
  assert.equal(results[0].count, 3);
});

// --- 3. reportLandmarkVerdicts against a fake webContents ---

function makeFakeWebContents({ url, probeResults, executeJavaScriptError }) {
  return {
    getURL() {
      return url;
    },
    async executeJavaScript(script, userGesture) {
      if (executeJavaScriptError) throw executeJavaScriptError;
      return probeResults;
    },
  };
}

function makeLogCollector() {
  const lines = [];
  return {
    log: (line) => lines.push(line),
    lines,
    text: () => lines.join('\n'),
  };
}

const MAIN_WINDOW_URL = 'app://-/index.html';
const SECONDARY_WINDOW_URL = 'app://-/index.html?initialRoute=%2Favatar-overlay';

// Every landmark in BROKEN_LANDMARKS matches nothing (count 0), matching the
// broken theme's real, loaded manifest order.
const ALL_ZERO_PROBE_RESULTS = BROKEN_LANDMARKS.map((l) => ({ selector: l.selector, count: 0 }));

// Driven off the landmarks the REAL loader returned, not off the constant the
// fixture was written from. The M4(b) claim is about a theme package that has
// been loaded, probed and reported end to end; asserting against the literal
// this test file authored would leave the loader out of the chain it claims to
// have exercised.
test('reportLandmarkVerdicts() names every landmark of a LOADED broken theme in its log output', async () => {
  const dir = makeBrokenThemeDir();
  try {
    const theme = loadTheme(dir);
    const landmarks = theme.manifest.landmarks;
    const wc = makeFakeWebContents({
      url: MAIN_WINDOW_URL,
      probeResults: landmarks.map((l) => ({ selector: l.selector, count: 0 })),
    });
    const { log, text } = makeLogCollector();
    await reportLandmarkVerdicts({ webContents: wc, landmarks, phase: 'settled +15000ms', log });
    for (const landmark of landmarks) {
      assert.ok(text().includes(landmark.name), `expected log output to name landmark "${landmark.name}"`);
    }
  } finally {
    cleanup(dir);
  }
});

// THIS ASSERTION IS THE POINT OF THE TEST (per the M4 task brief) — M3's F2
// fix gated the "not a defect" verdict on the window being SECONDARY. A
// broken required landmark on the MAIN window must still convict, or the
// fix could have bought silence instead of accuracy.
test('a broken required landmark on the MAIN window at a settled phase is reported as a real defect', async () => {
  const wc = makeFakeWebContents({ url: MAIN_WINDOW_URL, probeResults: ALL_ZERO_PROBE_RESULTS });
  const { log, lines } = makeLogCollector();
  await reportLandmarkVerdicts({ webContents: wc, landmarks: BROKEN_LANDMARKS, phase: 'settled +15000ms', log });
  const sidebarLine = lines.find((l) => l.includes('sidebar-panel'));
  assert.ok(sidebarLine, 'expected a log line naming sidebar-panel');
  assert.ok(sidebarLine.includes('MISSING (REQUIRED)'), `expected MISSING (REQUIRED), got: ${sidebarLine}`);
  assert.ok(sidebarLine.includes('This is a real defect'), `expected "This is a real defect", got: ${sidebarLine}`);
});

test('broken optional landmarks are reported differently from the required one — no REQUIRED or real-defect language', async () => {
  const wc = makeFakeWebContents({ url: MAIN_WINDOW_URL, probeResults: ALL_ZERO_PROBE_RESULTS });
  const { log, lines } = makeLogCollector();
  await reportLandmarkVerdicts({ webContents: wc, landmarks: BROKEN_LANDMARKS, phase: 'settled +15000ms', log });
  const optionalLandmarks = BROKEN_LANDMARKS.filter((l) => !l.required);
  assert.ok(optionalLandmarks.length > 0, 'fixture must include optional landmarks');
  for (const landmark of optionalLandmarks) {
    const line = lines.find((l) => l.includes(landmark.name));
    assert.ok(line, `expected a log line naming "${landmark.name}"`);
    assert.ok(line.includes('landmark absent (optional, screen-dependent)'), `unexpected phrasing: ${line}`);
    assert.ok(!line.includes('REQUIRED'), `optional landmark line must not say REQUIRED: ${line}`);
    assert.ok(!line.includes('real defect'), `optional landmark line must not say real defect: ${line}`);
  }
});

test('on the SECONDARY window, the broken required landmark names the URL and says "not a defect"', async () => {
  const wc = makeFakeWebContents({ url: SECONDARY_WINDOW_URL, probeResults: ALL_ZERO_PROBE_RESULTS });
  const { log, lines } = makeLogCollector();
  await reportLandmarkVerdicts({ webContents: wc, landmarks: BROKEN_LANDMARKS, phase: 'settled +15000ms', log });
  const sidebarLine = lines.find((l) => l.includes('sidebar-panel'));
  assert.ok(sidebarLine, 'expected a log line naming sidebar-panel');
  assert.ok(sidebarLine.includes('secondary window, not the app shell'), `expected secondary-window phrasing, got: ${sidebarLine}`);
  assert.ok(sidebarLine.includes(SECONDARY_WINDOW_URL), `expected the window's own URL to be named, got: ${sidebarLine}`);
  assert.ok(sidebarLine.includes('not a defect'), `expected "not a defect", got: ${sidebarLine}`);
});

test('at a dom-ready phase on the MAIN window, the required landmark reads "not yet present" and is not called a defect', async () => {
  const wc = makeFakeWebContents({ url: MAIN_WINDOW_URL, probeResults: ALL_ZERO_PROBE_RESULTS });
  const { log, lines } = makeLogCollector();
  await reportLandmarkVerdicts({ webContents: wc, landmarks: BROKEN_LANDMARKS, phase: 'apply-time (dom-ready/navigate)', log });
  const sidebarLine = lines.find((l) => l.includes('sidebar-panel'));
  assert.ok(sidebarLine, 'expected a log line naming sidebar-panel');
  assert.ok(sidebarLine.includes('not yet present'), `expected "not yet present", got: ${sidebarLine}`);
  assert.ok(!sidebarLine.includes('real defect'), `dom-ready reading must not be called a defect: ${sidebarLine}`);
  assert.ok(!sidebarLine.includes('MISSING (REQUIRED)'), `dom-ready reading must not say MISSING (REQUIRED): ${sidebarLine}`);
});

test('an unparseable window URL is adjudicated as PRIMARY and still convicts a missing required landmark', async () => {
  const unparseable = 'not a valid url at all';
  const wc = makeFakeWebContents({ url: unparseable, probeResults: ALL_ZERO_PROBE_RESULTS });
  const { log, lines } = makeLogCollector();
  await reportLandmarkVerdicts({ webContents: wc, landmarks: BROKEN_LANDMARKS, phase: 'settled +15000ms', log });
  assert.equal(isSecondaryWindowUrl(unparseable), false, 'an unparseable URL must be adjudicated as primary');
  const sidebarLine = lines.find((l) => l.includes('sidebar-panel'));
  assert.ok(sidebarLine.includes('MISSING (REQUIRED)'), `expected the unparseable-URL window to still convict, got: ${sidebarLine}`);
  assert.ok(sidebarLine.includes('This is a real defect'), `expected "This is a real defect", got: ${sidebarLine}`);
});

test('when executeJavaScript rejects, reportLandmarkVerdicts resolves rather than throwing, and logs the failure', async () => {
  const wc = makeFakeWebContents({
    url: MAIN_WINDOW_URL,
    executeJavaScriptError: new Error('renderer process crashed'),
  });
  const { log, lines } = makeLogCollector();
  await assert.doesNotReject(
    reportLandmarkVerdicts({ webContents: wc, landmarks: BROKEN_LANDMARKS, phase: 'settled +15000ms', log })
  );
  const failLine = lines.find((l) => l.includes('landmark probe FAILED'));
  assert.ok(failLine, 'expected a "landmark probe FAILED" line');
  assert.ok(failLine.includes('renderer process crashed'), `expected the error message in the log, got: ${failLine}`);
});

// --- 4. the healthy path: a landmark that IS present still reports PRESENT ---

test('a landmark whose probe returns count > 0 reports "landmark PRESENT" (extraction did not break the healthy path)', async () => {
  const healthyLandmarks = [{ name: 'sidebar-panel', selector: '.app-shell-left-panel', required: true, governedBy: 'D-0001-13' }];
  const wc = makeFakeWebContents({
    url: MAIN_WINDOW_URL,
    probeResults: [{ selector: '.app-shell-left-panel', count: 2 }],
  });
  const { log, lines } = makeLogCollector();
  await reportLandmarkVerdicts({ webContents: wc, landmarks: healthyLandmarks, phase: 'settled +15000ms', log });
  const line = lines.find((l) => l.includes('sidebar-panel'));
  assert.ok(line, 'expected a log line naming sidebar-panel');
  assert.ok(line.includes('landmark PRESENT'), `expected "landmark PRESENT", got: ${line}`);
  assert.ok(line.includes('(2 matches)'), `expected the match count in the line, got: ${line}`);
  assert.ok(line.includes('[D-0001-13]'), `expected the governedBy suffix, got: ${line}`);
});

// --- describeLandmarkVerdict(), directly, for the singular/plural boundary ---

test('describeLandmarkVerdict() uses singular "match" for exactly one match', () => {
  const line = describeLandmarkVerdict({
    declared: { name: 'thing', selector: '.thing' },
    count: 1,
    phase: 'settled +15000ms',
    settled: true,
    isSecondaryWindow: false,
    windowUrl: MAIN_WINDOW_URL,
  });
  assert.ok(line.includes('(1 match)'), `expected singular "match", got: ${line}`);
});

test('describeLandmarkVerdict() reports a PROBE ERROR line for count === -1', () => {
  const line = describeLandmarkVerdict({
    declared: { name: 'bad', selector: ':has(:not(' },
    count: -1,
    phase: 'settled +15000ms',
    settled: true,
    isSecondaryWindow: false,
    windowUrl: MAIN_WINDOW_URL,
  });
  assert.ok(line.includes('landmark PROBE ERROR: bad'), `unexpected line: ${line}`);
  assert.ok(line.includes('invalid selector ":has(:not("'), `expected the selector to be named, got: ${line}`);
});
