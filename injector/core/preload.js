'use strict';

/**
 * Codexterity — main-process preload entry point (Gate 0)
 * ---------------------------------------------------------
 * This is the file the launcher points NODE_OPTIONS=--require at. It is
 * required by Node *inside Codex's own Electron main process* before Codex's
 * own code runs, per D-0001-1 (primary injection mechanism, no debug port).
 *
 * Kept to a single require + start() call so the audited surface here is
 * trivially small; all real logic lives in injector/core/inject.js.
 */

require('./inject.js').start();
