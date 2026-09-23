// Codexterity — map a theme's overridden tokens onto Codex's CURRENT names
// -----------------------------------------------------------------------
// Reads one run of tools/inventory/run-inventory.mjs (its probe-codex-home-*.json
// reports) and a theme's emitted theme.css, and prints a markdown table: for
// every --color-* token the theme overrides, which token carries that role in
// the measured Codex build, how widely it is read, and its stock value in both
// modes. This is the evidence table behind docs/research/owl-token-inventory.md
// (Plan 0004 M1), kept as a tool so the table can be regenerated against the
// next Codex update instead of being re-derived by hand.
//
// The classification, in order:
//   - "renamed"         the old name is gone and `--app-` + the old name (minus
//                        its leading `--`) is defined — Codex's OWL-era move of
//                        its primitive layer under an --app- prefix;
//   - "same name"       still defined at root level under the old name;
//   - "component-only"  still defined, but ONLY inside build-hashed component
//                        classes (`._name_hash_n`) — overriding it at the root
//                        cannot reach inside those components, because a value
//                        declared on a closer ancestor wins (D-0001-18's shape);
//   - "gone"            neither.
//
// Usage:
//   node tools/inventory/map-tokens.mjs <run-dir> [themes/<id>/theme.css]

import fs from 'node:fs';
import path from 'node:path';

const [runDir, themeCssArg] = process.argv.slice(2);
if (!runDir) {
  console.error('usage: node tools/inventory/map-tokens.mjs <run-dir> [themes/<id>/theme.css]');
  process.exit(2);
}
const themeCss = themeCssArg || path.join('themes', 'captains-cabin', 'theme.css');

const readReport = (name) => JSON.parse(fs.readFileSync(path.join(runDir, name), 'utf8'));
const dark = readReport('probe-codex-home-dark.json');
const light = readReport('probe-codex-home-light.json');

const isDefined = (name) => Boolean(dark.definedProps[name]) || dark.rootTokens[name] !== undefined;
const readCount = (name) => (dark.varReads[name] || {}).count || 0;
const stock = (report, name) => {
  const value = report.rootTokens[name];
  return value === undefined ? '—' : String(value).replace(/\|/g, '/').slice(0, 34);
};
// A build-hashed CSS-module class: `._MainContentSurface_1wfx1_2`.
const HASHED_COMPONENT = /^\._[A-Za-z][\w-]*_[a-z0-9]{5}_\d+/;

const css = fs.readFileSync(themeCss, 'utf8');
// Both spellings: since Plan 0004 M2 a theme writes most primitives under Codex's
// OWL-era --app-color-* names, and the rest under --color-*.
const overridden = [...new Set([...css.matchAll(/(--(?:app-)?color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))];

const rows = [];
const tally = { renamed: 0, 'same name': 0, 'component-only': 0, gone: 0 };
for (const name of overridden) {
  const prefixed = '--app-' + name.slice(2);
  let target;
  let kind;
  if (!isDefined(name) && isDefined(prefixed)) {
    target = prefixed;
    kind = 'renamed';
  } else if (isDefined(name)) {
    const selectors = [...new Set((dark.definedProps[name] || []).map((d) => d.selector))];
    const componentOnly = selectors.length > 0 && selectors.every((s) => HASHED_COMPONENT.test(s));
    if (componentOnly && isDefined(prefixed)) {
      // The old name survives only as a component-local re-definition (e.g.
      // the composer re-points --color-text-accent for its own subtree); the
      // app-wide role moved under --app- like the rest of the primitives.
      target = prefixed;
      kind = 'renamed';
    } else {
      target = name;
      kind = componentOnly ? 'component-only' : 'same name';
    }
  } else {
    target = null;
    kind = 'gone';
  }
  tally[kind]++;
  rows.push(
    `| \`${name}\` | ${target ? '`' + target + '`' : '—'} | ${kind} | ${target ? readCount(target) : 0} | ` +
      `${target ? stock(dark, target) : '—'} | ${target ? stock(light, target) : '—'} |`
  );
}

console.log('| Theme overrides | Carried now by | Status | Reads | Stock dark | Stock light |');
console.log('|---|---|---|---|---|---|');
for (const row of rows) console.log(row);
console.log('');
console.log(
  `${overridden.length} tokens: ${tally.renamed} renamed, ${tally['same name']} same name, ` +
    `${tally['component-only']} component-only, ${tally.gone} gone.`
);
