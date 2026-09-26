'use strict';

/**
 * Codexterity — the shared debug-log sink (Plan 0005 M1)
 * ---------------------------------------------------------
 * Factored out of injector/core/inject.js's private `log()`/`debugLogPath`
 * pair so injector/attach-cdp.js can log identically without copying the
 * function (docs/ENGINEERING.md: "adding a theme adds a folder... never
 * copies" — the same "one shared module, never a duplicate" principle
 * applies here to the injector core's own plumbing).
 *
 * `createLogger()` returns a fresh `log(message)` function reading
 * `CDX_DEBUG_LOG_PATH` at call time (not cached at module load), which
 * matters for tests: a test can set the env var, create a logger, and read
 * the file back without module-cache staleness from an earlier test's value.
 * Behaviour is unchanged from inject.js's original: every line goes to
 * stdout (best-effort — a write failure there is swallowed, not thrown) and,
 * when the env var is set, is ALSO appended to that file with an ISO
 * timestamp. Never throws out of the logger itself.
 */
function createLogger(prefix = '[codexterity]') {
  return function log(message) {
    const line = `${prefix} ${message}`;
    try {
      process.stdout.write(`${line}\n`);
    } catch (err) {
      // stdout may not be writable in this process context; the file sink
      // below is the fallback, not a substitute we silently prefer.
    }
    const debugLogPath = (() => {
      try {
        return process.env.CDX_DEBUG_LOG_PATH || null;
      } catch (err) {
        return null;
      }
    })();
    if (debugLogPath) {
      try {
        const fs = require('fs');
        fs.appendFileSync(debugLogPath, `${new Date().toISOString()} ${line}\n`);
      } catch (err) {
        // Nothing further we can do to report a logging failure from inside
        // the logger itself; this must never throw out into caller code.
      }
    }
  };
}

module.exports = { createLogger };
