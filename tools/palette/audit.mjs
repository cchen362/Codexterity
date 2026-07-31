import { buildDark, buildLight, buildSyntax, ratio, GROUNDS } from './palette-engine.mjs';

export const CHECKS = [
  ['Body text on app ground', 'text-primary', 'background-surface', 4.5],
  ['Body text on panel', 'text-primary', 'background-elevated-primary', 4.5],
  ['Body text on popover', 'text-primary', 'background-elevated-secondary', 4.5],
  ['Body text on inset field', 'text-primary', 'token-bg-tertiary', 4.5],
  ['Body text on code surface', 'text-primary', 'token-diff-surface', 4.5],
  ['Supporting text on ground', 'text-secondary', 'background-surface', 4.5],
  ['Supporting text on popover', 'text-secondary', 'background-elevated-secondary', 4.5],
  ['Meta text on ground', 'text-tertiary', 'background-surface', 4.5],
  ['Meta text on popover', 'text-tertiary', 'background-elevated-secondary', 4.5],
  ['Placeholder on ground', 'text-quaternary', 'background-surface', 3.0],
  ['Button label on brass', 'text-on-accent', 'background-button-primary', 4.5],
  ['Button label on brass (hover)', 'text-on-accent', 'background-button-primary-hover', 4.5],
  ['Button label on brass (pressed)', 'text-on-accent', 'background-button-primary-active', 4.5],
  ['Body text on secondary button', 'text-primary', 'background-button-secondary', 4.5],
  ['Success ink on ground', 'text-success', 'background-surface', 4.5],
  ['Warning ink on ground', 'text-warning', 'background-surface', 4.5],
  ['Error ink on ground', 'text-error', 'background-surface', 4.5],
  ['Success ink on popover', 'text-success', 'background-elevated-secondary', 4.5],
  ['Body text on success ground', 'text-primary', 'background-status-success', 4.5],
  ['Body text on danger ground', 'text-primary', 'background-danger-active', 4.5],
  ['Body text on diff added', 'text-primary', 'editor-added', 4.5],
  ['Body text on diff removed', 'text-primary', 'editor-deleted', 4.5],
  ['Primary icon on ground', 'icon-primary', 'background-surface', 4.5],
  ['Secondary icon on ground', 'icon-secondary', 'background-surface', 4.5],
  ['Secondary icon on popover', 'icon-secondary', 'background-elevated-secondary', 4.5],
  ['Disabled icon on ground', 'icon-tertiary', 'background-surface', 3.0],
  ['Control edge on ground', 'border-heavy', 'background-surface', 3.0],
  ['Focus ring on ground', 'border-focus', 'background-surface', 3.0],
  ['Focus ring on popover', 'border-focus', 'background-elevated-secondary', 3.0],
  ['Brass button on ground', 'background-button-primary', 'background-surface', 3.0],
];

export function run(p) {
  return CHECKS.map(([label, fg, bg, min]) => {
    const r = ratio(p[fg], p[bg]);
    return { label, fg, bg, min, r, pass: r >= min };
  });
}
export function runSyntax(s) {
  return Object.entries(s).filter(([k]) => k !== '_surface').map(([role, hex]) => {
    const r = ratio(hex, s._surface);
    return { label: role, r, min: 4.5, pass: r >= 4.5 };
  });
}

if (process.argv[1]?.endsWith('audit.mjs')) {
  let total = 0, failed = 0;
  for (const [key, meta] of Object.entries(GROUNDS)) {
    for (const mode of ['dark', 'light']) {
      const p = mode === 'dark' ? buildDark(meta.ground) : buildLight(meta.ground);
      const rows = [...run(p), ...runSyntax(buildSyntax(p, mode))];
      const bad = rows.filter((x) => !x.pass);
      total += rows.length; failed += bad.length;
      console.log(`${key}/${mode}: ${rows.length - bad.length}/${rows.length} pass`);
      for (const b of bad) console.log(`   FAIL ${b.r.toFixed(2)} (min ${b.min})  ${b.label}`);
    }
  }
  console.log(`\nTOTAL ${total - failed}/${total} pass`);
  if (failed) process.exitCode = 1;
}
