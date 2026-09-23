// Codexterity — which of Codex's colour tokens did a theme NOT reach?
// -------------------------------------------------------------------
// Compares two runs of tools/inventory/run-inventory.mjs: a stock run (no
// --theme) and a themed run (--theme <path>). A root colour token whose computed
// value is IDENTICAL in both is one the theme did not move — either because the
// theme never names it, or because Codex sets it to a literal the theme's
// overrides never feed. Each is classified by the strongest evidence the themed
// run holds for it:
//
//   PAINT  the token's value is what an element on a sampled screen actually
//          painted (probe.js's paint-coverage census). A PAINT row is a stock
//          colour visible on a themed screen — unless the value is a pure
//          constant (#fff / #000) that several unrelated tokens share, which
//          the census cannot tell apart; trace those by their samples.
//   read   some stylesheet reads it via var(), but nothing on a sampled screen
//          painted it. It may paint on a screen the run did not open.
//
// Why this exists (Plan 0004 M2): M1's map (map-tokens.mjs) starts from the
// names a theme already overrides, so it cannot see a component token that
// never derived from any of them. This census starts from Codex's side instead.
// It found the Chat/Work mode toggle and the composer utility bar still stock on
// a themed run whose every overridden token was correct.
//
// Usage:
//   node tools/inventory/unmoved-tokens.mjs <stock-run-dir> <themed-run-dir>

import fs from 'node:fs';
import path from 'node:path';

const [stockDir, themedDir] = process.argv.slice(2);
if (!stockDir || !themedDir) {
  console.error('usage: node tools/inventory/unmoved-tokens.mjs <stock-run-dir> <themed-run-dir>');
  process.exit(2);
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const asText = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

// Codex's raw palette scales (--color-gray-500, --color-blue-200 …) are
// constants by design; a theme reaches them only through the semantic tokens
// that read them, so they are not a finding.
const SCALE = /^--color-(white|black|gray|red|blue|green|orange|yellow|purple|pink)(-|$)/;
const COLOURISH = /#|rgb|color-mix|oklab|oklch|hsl/;

const found = new Map();
let compared = 0;
for (const file of fs.readdirSync(themedDir)) {
  const m = /^probe-(.+)\.json$/.exec(file);
  if (!m) continue;
  const stockPath = path.join(stockDir, file);
  if (!fs.existsSync(stockPath)) continue;
  compared++;
  const stock = readJson(stockPath);
  const themed = readJson(path.join(themedDir, file));
  const painted = new Set(themed.paintCoverage.paints.flatMap((p) => p.tokens));
  const reads = new Set(Object.keys(themed.varReads || {}));
  for (const [name, value] of Object.entries(themed.rootTokens)) {
    if (!/^--(app-)?color-/.test(name) || SCALE.test(name)) continue;
    if (!(name in stock.rootTokens)) continue;
    const v = asText(value);
    if (v !== asText(stock.rootTokens[name]) || !COLOURISH.test(v)) continue;
    const e = found.get(name) ?? { values: {}, painted: false, read: false, screens: new Set() };
    e.values[m[1]] = v;
    e.painted ||= painted.has(name);
    e.read ||= reads.has(name);
    e.screens.add(m[1]);
    found.set(name, e);
  }
}

if (compared === 0) {
  console.error(`no probe-*.json report exists in both ${stockDir} and ${themedDir}`);
  process.exit(1);
}

const rows = [...found].sort(([a, x], [b, y]) =>
  (y.painted - x.painted) || (y.read - x.read) || a.localeCompare(b));
console.log(`${compared} screen(s) compared; ${rows.length} unmoved colour token(s): ` +
  `${rows.filter(([, e]) => e.painted).length} painted, ${rows.filter(([, e]) => e.read).length} read`);
for (const [name, e] of rows) {
  const tag = e.painted ? 'PAINT' : e.read ? 'read ' : '     ';
  const sample = Object.entries(e.values).slice(0, 2).map(([s, v]) => `${s}=${v.slice(0, 36)}`).join('  ');
  console.log(`${tag} ${name.padEnd(52)} ${sample}`);
}
