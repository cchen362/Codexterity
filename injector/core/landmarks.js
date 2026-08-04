'use strict';

/**
 * Codexterity — landmark degradation reporting (Plan 0002 M4b)
 * -----------------------------------------------------------------
 * Extracted verbatim from injector/core/inject.js's reportLandmarks(). The
 * logic itself is unchanged; what moved is WHERE it lives. Before this
 * extraction the landmark probe-and-verdict logic was reachable only from a
 * live Electron webContents and closed over inject.js's module-private
 * `activeTheme` slot, which made it untestable in isolation — the exact
 * degradation path this project needs to prove (a future Codex update
 * breaking a landmark selector) could only be exercised by launching the
 * real app. This module takes the manifest's landmarks and a webContents-shaped
 * object as explicit arguments instead of closing over anything, so it runs
 * under node:test with no Electron and no module state.
 */

const { URL } = require('url');

/**
 * Probe the live DOM for a theme's declared landmarks. Read-only
 * querySelector checks only — no mutation, no data extraction beyond boolean
 * presence and a match count (D-0001-3: the injector's reach is styling only).
 *
 * D-0001-25 / Phase 4 M3 — the selector list comes from
 * activeTheme.manifest.landmarks[], not a constant compiled into this file.
 * Before M3 this read a hardcoded DECLARED_LANDMARKS array frozen at Gate 0
 * (4 selectors) that had silently drifted from the real manifest (6, each
 * carrying a build-time `probe` asserted against the emitted stylesheet —
 * D-0001-21). A hardcoded list rots without anyone noticing; a list read from
 * the manifest fails the BUILD the moment a rule is renamed, and it keeps a
 * theme-specific fact (which selectors this theme cares about) out of the
 * theme-agnostic injector core, per the layer rule in docs/ENGINEERING.md.
 */
function buildLandmarkProbeScript(landmarks) {
  const selectors = landmarks.map((l) => l.selector);
  return `
    (() => {
      const selectors = ${JSON.stringify(selectors)};
      return selectors.map((sel) => {
        let count = 0;
        try {
          count = document.querySelectorAll(sel).length;
        } catch (err) {
          count = -1;
        }
        return { selector: sel, count };
      });
    })();
  `;
}

/**
 * D-0001-33 — a required landmark's MISSING verdict is gated on the URL of
 * the webContents being adjudicated, not on the manifest alone. F2 (Plan
 * 0002 M3): Codex opens a second window for `?initialRoute=%2Favatar-overlay`
 * (an overlay, not the app shell) — the theme applies there correctly, but
 * that window can never contain `.app-shell-left-panel`, so treating its
 * absence as a defect logged a false "REQUIRED and absent" alarm on every
 * healthy launch. Measured on two independent launches: the MAIN window is
 * `app://-/index.html` with no query string; every secondary window carries
 * an `initialRoute` query parameter.
 *
 * The gate is on the URL, not on the DOM (e.g. "only judge windows that
 * contain some `.app-shell*` ancestor"), deliberately:
 *   - A DOM-based gate is near-circular, because `.app-shell-left-panel` IS
 *     the landmark. If Codex renamed that whole family, a DOM gate would
 *     silently stop adjudicating and the alarm would go quiet exactly when
 *     it was needed — the same silent-success failure that killed the four
 *     pre-Gate-0 landmarks.
 *   - The URL gate fails in the NOISY direction instead: if Codex changes
 *     its routing scheme, the false alarm of today returns — visible and
 *     recoverable, never a silent miss. That asymmetry is the whole reason
 *     for the choice.
 *
 * A URL that fails to parse is treated as PRIMARY (still adjudicated) —
 * deliberately the opposite failure mode from a missing query param, since
 * an unparseable URL must never silently switch off the required-landmark
 * alarm.
 */
function isSecondaryWindowUrl(url) {
  try {
    return new URL(url).searchParams.has('initialRoute');
  } catch {
    return false; // unparseable URL => adjudicate as primary
  }
}

/**
 * Produce the exact log-line text for one landmark's verdict, given the
 * probed count and the context reportLandmarkVerdicts() has already worked
 * out (settled-ness, which window, that window's URL). Pure and synchronous
 * so the five cases can each be asserted directly.
 */
function describeLandmarkVerdict({ declared, count, phase, settled, isSecondaryWindow, windowUrl }) {
  const governedBy = declared.governedBy ? `  [${declared.governedBy}]` : '';
  if (count > 0) {
    return `  landmark PRESENT: ${declared.name}  (${count} match${count === 1 ? '' : 'es'})${governedBy}`;
  } else if (count === 0) {
    // D-0001-21: only `sidebar-panel` is required:true (D-0001-13) — the
    // other five are optional because they only exist on certain screens
    // (a terminal, a code block, the home hero). A zero count for an
    // optional landmark on a screen that never has one is NOT a defect —
    // "a negative result must name its query" is a repeated, hard-won
    // lesson in this project (docs/DECISIONS.md), and a log line that
    // reads MISSING for both cases would relitigate it. A missing
    // required landmark must be louder: it names its own severity so the
    // owner does not have to cross-reference the manifest to know whether
    // to worry.
    if (declared.required && settled && isSecondaryWindow) {
      // D-0001-33 — this webContents carries an `initialRoute` query
      // param, so it is a secondary/overlay window, not the app shell,
      // and can never contain the sidebar. Informational only; naming
      // the window's own URL is what lets the reader confirm the gate
      // fired for the right reason instead of trusting the label.
      return (
        `  landmark absent (secondary window, not the app shell): ${declared.name}  ` +
        `(selector "${declared.selector}" matched nothing at ${phase}; this window is ${windowUrl} ` +
        `and has no app shell — not a defect)${governedBy}`
      );
    } else if (declared.required) {
      // A required landmark absent at dom-ready is EXPECTED, not a
      // finding — Codex has not built its shell yet. Only the settled
      // reading can convict it, so the early one says so in the line
      // itself rather than leaving the reader to know it.
      return (
        `  landmark ${settled ? 'MISSING (REQUIRED)' : 'not yet present'}: ${declared.name}  ` +
        `(selector "${declared.selector}" matched nothing at ${phase})${governedBy}` +
        (settled
          ? ' — REQUIRED and absent on a settled DOM. This is a real defect.'
          : ' — the shell is not built this early; the settled check (CDX_VERIFY_AT) is what convicts it')
      );
    } else {
      return `  landmark absent (optional, screen-dependent): ${declared.name}  (selector "${declared.selector}" matched nothing at ${phase} — not necessarily a defect)${governedBy}`;
    }
  } else {
    return `  landmark PROBE ERROR: ${declared.name}  (invalid selector "${declared.selector}" at ${phase})${governedBy}`;
  }
}

/**
 * @param {string} phase - where in the lifecycle this reading was taken.
 *   It is printed on every line because the two call sites are NOT equally
 *   authoritative: `dom-ready` fires before Codex has built its shell, so a
 *   zero there is a fact about WHEN we looked, while a zero at a settled
 *   offset is a fact about the SCREEN. Reporting both without saying which is
 *   which is precisely the collapse "a negative result must name its query"
 *   exists to prevent.
 */
async function reportLandmarkVerdicts({ webContents, landmarks, phase, log }) {
  // Only a settled reading can convict a required landmark. Tested on the
  // caller's intent rather than by matching one phase STRING, so adding a
  // third call site later cannot silently inherit the authoritative verdict
  // just by being named something the check did not anticipate.
  const settled = phase.startsWith('settled');

  const windowUrl = webContents.getURL();
  const isSecondaryWindow = isSecondaryWindowUrl(windowUrl);

  try {
    const results = await webContents.executeJavaScript(buildLandmarkProbeScript(landmarks), true);
    results.forEach((result, i) => {
      const declared = landmarks[i];
      log(
        describeLandmarkVerdict({
          declared,
          count: result.count,
          phase,
          settled,
          isSecondaryWindow,
          windowUrl,
        })
      );
    });
  } catch (err) {
    log(`  landmark probe FAILED at ${phase}: ${err.message}`);
  }
}

module.exports = {
  buildLandmarkProbeScript,
  isSecondaryWindowUrl,
  describeLandmarkVerdict,
  reportLandmarkVerdicts,
};
