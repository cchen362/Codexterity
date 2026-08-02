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

  // ── Chrome layer (added with the measured token expansion, 2026-08-01) ──────
  // Every surface the theme newly claims has to carry the same ink it did before,
  // and every accent that is now brass has to stay legible AS TEXT — the accent
  // trace in docs/research/phase3-inventory-findings.md shows these tokens
  // painting link text and icons, not just fills.
  ['Body text on sidebar', 'text-primary', 'background-surface-under', 4.5],
  ['Supporting text on sidebar', 'text-secondary', 'background-surface-under', 4.5],
  ['Meta text on sidebar', 'text-tertiary', 'background-surface-under', 4.5],
  ['Body text on editor surface', 'text-primary', 'background-editor-opaque', 4.5],
  ['Body text on menu bar', 'text-primary', 'background-application-menu', 4.5],
  ['Menu label on menu bar', 'foreground-application-menu', 'background-application-menu', 4.5],
  ['Body text on control field', 'text-primary', 'background-control', 4.5],
  ['Body text on panel', 'text-primary', 'background-panel', 4.5],

  ['Accent text on ground', 'text-accent', 'background-surface', 4.5],
  ['Accent text on popover', 'text-accent', 'background-elevated-secondary', 4.5],
  ['Accent text on sidebar', 'text-accent', 'background-surface-under', 4.5],
  ['Accent icon on ground', 'icon-accent', 'background-surface', 4.5],
  // The two decorative hues are brass now; check them under their own names so a
  // future edit that un-collapses them cannot quietly ship an unreadable link.
  ['Link hue on ground', 'accent-blue', 'background-surface', 4.5],
  ['Discovery hue on ground', 'accent-purple', 'background-surface', 4.5],
  ['Success hue on ground', 'accent-green', 'background-surface', 4.5],
  ['Error hue on ground', 'accent-red', 'background-surface', 4.5],
  ['Warning hue on ground', 'accent-orange', 'background-surface', 4.5],

  ['Body text on accent surface', 'text-primary', 'background-accent', 4.5],
  ['Body text on accent surface (active)', 'text-primary', 'background-accent-active', 4.5],
  ['Body text on hovered row', 'text-primary', 'background-button-secondary-hover', 4.5],
  ['Body text on pressed row', 'text-primary', 'background-button-secondary-active', 4.5],
  ['Meta text on hovered row', 'text-tertiary', 'background-button-secondary-hover', 4.5],
  // The pressed row is a step further from the sidebar than hover (D-0001-17), so
  // it is a distinct surface and the hover check does not cover it. Added when the
  // row states were re-anchored, because that change is what made the two differ
  // by enough to matter.
  ['Meta text on pressed row', 'text-tertiary', 'background-button-secondary-active', 4.5],
  ['Supporting text on hovered row', 'text-secondary', 'background-button-secondary-hover', 4.5],
  ['Body text on warning ground', 'text-primary', 'background-status-warning', 4.5],
  ['Body text on error ground', 'text-primary', 'background-status-error', 4.5],
  ['Error edge on ground', 'border-error', 'background-surface', 3.0],
  ['Warning edge on ground', 'border-warning', 'background-surface', 3.0],
  ['Modified decoration on ground', 'decoration-modified', 'background-surface', 4.5],
  ['Unchanged decoration on ground', 'decoration-unchanged', 'background-surface', 3.0],
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
