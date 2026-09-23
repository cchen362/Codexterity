'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Script } = require('node:vm');

const {
  buildProbeScript,
  parseCss,
  splitTopLevel,
  stripComments,
  summarizeColorDefinitions,
  indexColorTokens,
} = require(path.join('..', '..', 'injector', 'core', 'probe.js'));

// ---------------------------------------------------------------------
// stripComments
// ---------------------------------------------------------------------

test('stripComments removes /* ... */ including multi-line comments', () => {
  const css = 'a { color: red; } /* comment\nspanning lines */ b { color: blue; }';
  const out = stripComments(css);
  assert.ok(!out.includes('comment'));
  assert.ok(out.includes('a { color: red; }'));
  assert.ok(out.includes('b { color: blue; }'));
});

// ---------------------------------------------------------------------
// splitTopLevel
// ---------------------------------------------------------------------

test('splitTopLevel does not split commas inside parens', () => {
  const out = splitTopLevel('rgba(1, 2, 3), red', ',');
  assert.deepEqual(out, ['rgba(1, 2, 3)', 'red']);
});

test('splitTopLevel does not split commas inside :where(a, b)', () => {
  const out = splitTopLevel(':where(a, b), .c', ',');
  assert.deepEqual(out, [':where(a, b)', '.c']);
});

test('splitTopLevel does not split on a separator inside a quoted string', () => {
  const out = splitTopLevel('content: "a, b"; color: red', ';');
  assert.deepEqual(out, ['content: "a, b"', 'color: red']);
});

test('splitTopLevel honours a backslash-escaped quote inside a selector', () => {
  // Tailwind emits selectors like .\[container-name\:home-main-content\] whose
  // escaped colon must not be treated as a delimiter, and the parser must not
  // enter a phantom "quote" state on stray escaped characters.
  const out = splitTopLevel('.\\[container-name\\:home-main-content\\], .b', ',');
  assert.deepEqual(out, ['.\\[container-name\\:home-main-content\\]', '.b']);
});

// ---------------------------------------------------------------------
// parseCss
// ---------------------------------------------------------------------

function parse(css) {
  const rules = [];
  const atProperties = [];
  parseCss(stripComments(css), rules, atProperties, null);
  return rules;
}

test('parseCss reads a plain rule', () => {
  const rules = parse('.foo { color: red; --x: 1px; }');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].selector, '.foo');
  assert.equal(rules[0].condition, null);
  assert.deepEqual(rules[0].decls, [['color', 'red'], ['--x', '1px']]);
});

test('parseCss hoists an @layer-wrapped :where(...) rule and records the condition', () => {
  const rules = parse('@layer theme { :where(:root, [data-theme]) { --color-x: red } }');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].selector, ':where(:root, [data-theme])');
  assert.ok(rules[0].condition.includes('@layer theme'));
});

test('parseCss combines a nested @media condition inside an @layer', () => {
  const rules = parse('@layer theme { @media (prefers-color-scheme: dark) { .a { --x: 1 } } }');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].selector, '.a');
  assert.ok(rules[0].condition.includes('@layer theme'));
  assert.ok(rules[0].condition.includes('@media (prefers-color-scheme: dark)'));
  // The outer condition comes first — condition composes outside-in.
  assert.ok(rules[0].condition.indexOf('@layer theme') < rules[0].condition.indexOf('@media'));
});

test('parseCss survives a backslash-escaped class name without losing the block', () => {
  const rules = parse('.\\[container-name\\:home-main-content\\] { color: red; }');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].selector, '.\\[container-name\\:home-main-content\\]');
  assert.deepEqual(rules[0].decls, [['color', 'red']]);
});

test('parseCss splits a selector list into separate rule entries', () => {
  const rules = parse('.a, .b, .c { color: red; }');
  assert.equal(rules.length, 3);
  assert.deepEqual(rules.map((r) => r.selector), ['.a', '.b', '.c']);
  for (const r of rules) assert.deepEqual(r.decls, [['color', 'red']]);
});

// ---------------------------------------------------------------------
// summarizeColorDefinitions
// ---------------------------------------------------------------------

test('summarizeColorDefinitions counts layered vs unlayered --color-* definitions', () => {
  const rules = [
    { selector: '.a', condition: '@layer theme', decls: [['--color-x', 'red'], ['--color-y', 'blue']], origin: 'inline<style>' },
    { selector: '.b', condition: null, decls: [['--color-z', 'green']], origin: 'inline<style>' },
    { selector: '.c', condition: null, decls: [['color', 'red']], origin: 'inline<style>' }, // not --color-*, ignored
  ];
  const summary = summarizeColorDefinitions(rules);
  assert.equal(summary.totals.layered, 2);
  assert.equal(summary.totals.unlayered, 1);
});

test('summarizeColorDefinitions counts a selector wrapped entirely in :where(...)', () => {
  const rules = [
    { selector: ':where(:root, [data-theme])', condition: '@layer theme', decls: [['--color-a', '1'], ['--color-b', '2']], origin: 'x' },
    { selector: '.plain', condition: null, decls: [['--color-c', '3']], origin: 'x' },
    // A selector that merely CONTAINS :where() partway through is not counted
    // as wrapped.
    { selector: '.outer :where(.inner)', condition: null, decls: [['--color-d', '4']], origin: 'x' },
    // Nor is one that STARTS with :where(...) but continues past it — Codex's
    // real descendant form, whose trailing attribute selector carries (0,1,0).
    { selector: ':where(:root:not([data-codex-window-type="extension"])) [data-theme="light"]', condition: '@layer theme', decls: [['--color-e', '5']], origin: 'x' },
  ];
  const summary = summarizeColorDefinitions(rules);
  assert.equal(summary.totals.whereWrapped, 2);
  assert.equal(summary.totals.notWhereWrapped, 3);
});

test('summarizeColorDefinitions groups by (selector, condition, origin) and sorts by count descending', () => {
  const rules = [
    { selector: '.a', condition: null, decls: [['--color-1', '1']], origin: 'x' },
    { selector: '.a', condition: null, decls: [['--color-2', '2']], origin: 'x' }, // same group as above
    { selector: '.a', condition: '@layer theme', decls: [['--color-3', '3']], origin: 'x' }, // different condition -> different group
    { selector: '.b', condition: null, decls: [['--color-4', '4']], origin: 'y' }, // different origin -> different group
  ];
  const summary = summarizeColorDefinitions(rules);
  assert.equal(summary.groups.length, 3);
  // The (.a, null, x) group defines 2 distinct names and must sort first.
  assert.equal(summary.groups[0].selector, '.a');
  assert.equal(summary.groups[0].condition, null);
  assert.equal(summary.groups[0].colorPropCount, 2);
});

test('summarizeColorDefinitions ignores non --color-* custom properties', () => {
  const rules = [
    { selector: '.a', condition: null, decls: [['--radius-sm', '4px'], ['--shadow-1', '0 0 1px']], origin: 'x' },
  ];
  const summary = summarizeColorDefinitions(rules);
  assert.equal(summary.groups.length, 0);
  assert.equal(summary.totals.layered, 0);
  assert.equal(summary.totals.unlayered, 0);
});

// ---------------------------------------------------------------------
// indexColorTokens
// ---------------------------------------------------------------------

test('indexColorTokens maps a canonical value to every token name that resolves to it', () => {
  const index = indexColorTokens([
    ['--color-a', 'rgba(1, 2, 3, 1)'],
    ['--color-b', 'rgba(1, 2, 3, 1)'],
    ['--color-c', 'rgba(4, 5, 6, 1)'],
  ]);
  assert.deepEqual(index['rgba(1, 2, 3, 1)'], ['--color-a', '--color-b']);
  assert.deepEqual(index['rgba(4, 5, 6, 1)'], ['--color-c']);
});

test('indexColorTokens skips pairs with no resolvable value', () => {
  const index = indexColorTokens([
    ['--color-a', null],
    ['--color-b', undefined],
    ['--color-c', 'rgba(1, 2, 3, 1)'],
  ]);
  assert.deepEqual(Object.keys(index), ['rgba(1, 2, 3, 1)']);
});

// ---------------------------------------------------------------------
// The generated in-page script must actually PARSE. Memory's own lesson
// ("node --check passes on a runtime string that throws") is exactly why
// this compiles the template-literal output rather than trusting that
// probe.js's own node --check covers it — the in-page script lives inside a
// string this repo's own node --check cannot see into.
// ---------------------------------------------------------------------

test('buildProbeScript() returns a string that compiles as valid JavaScript', () => {
  const script = buildProbeScript({ maxRulesPerElement: 40, maxClassNames: 250, dumpCss: false });
  assert.equal(typeof script, 'string');
  assert.doesNotThrow(() => new Script(script));
});

test('buildProbeScript() output embeds the new pure functions by name', () => {
  const script = buildProbeScript({ maxRulesPerElement: 40, maxClassNames: 250, dumpCss: false });
  assert.ok(script.includes('function summarizeColorDefinitions'), 'expected summarizeColorDefinitions to be serialised into the page script');
  assert.ok(script.includes('function indexColorTokens'), 'expected indexColorTokens to be serialised into the page script');
  assert.ok(script.includes('themeScopeCensus'), 'expected the theme-scope census to be present');
  assert.ok(script.includes('home-mode-toggle'), 'expected the new home-mode-toggle paint-trace target');
  assert.ok(script.includes('paintCoverageCensus'), 'expected the paint-coverage census to be present');
});
