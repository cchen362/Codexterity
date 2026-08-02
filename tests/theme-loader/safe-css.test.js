'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { findCssViolations, ALLOWED_AT_RULES } = require(
  path.join('..', '..', 'injector', 'theme-loader', 'safe-css.js')
);

test('accepts url(data:...) unquoted', () => {
  const violations = findCssViolations('.x { background: url(data:image/png;base64,AAAA); }');
  assert.deepEqual(violations, []);
});

test('accepts url(data:...) quoted (double and single)', () => {
  const dq = findCssViolations('.x { background: url("data:image/png;base64,AAAA"); }');
  const sq = findCssViolations(".x { background: url('data:image/png;base64,AAAA'); }");
  assert.deepEqual(dq, []);
  assert.deepEqual(sq, []);
});

test('rejects url(https://...)', () => {
  const violations = findCssViolations('.x { background: url(https://evil.example/x.png); }');
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /data: URI/);
});

test('rejects url(//...) protocol-relative', () => {
  const violations = findCssViolations('.x { background: url(//evil.example/x.png); }');
  assert.equal(violations.length, 1);
});

test('rejects url(foo.woff2) relative path', () => {
  const violations = findCssViolations('@font-face { src: url(foo.woff2); }');
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /data: URI/);
});

test('rejects url() empty', () => {
  const violations = findCssViolations('.x { background: url(); }');
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /no value/);
});

test('rejects @import', () => {
  const violations = findCssViolations('@import url("https://evil.example/x.css");');
  assert.ok(violations.length >= 1);
  assert.ok(violations.some((v) => /@import is not permitted/.test(v.message)));
});

test('an @import token inside a string is accepted (it is not an at-rule)', () => {
  const violations = findCssViolations('.x::before { content: "@import example"; }');
  assert.deepEqual(violations, []);
});

test('a remote url() inside a comment is accepted (it is not a live reference)', () => {
  const violations = findCssViolations('/* url(http://evil.example/x.png) */\n.x { color: red; }');
  assert.deepEqual(violations, []);
});

test('rejects an unknown at-rule', () => {
  const violations = findCssViolations('@totally-made-up { color: red; }');
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /not an allowed at-rule/);
});

test('every allowed at-rule is accepted', () => {
  for (const name of ALLOWED_AT_RULES) {
    const css = name === 'charset' ? `@charset "UTF-8";` : `@${name} { }`;
    const violations = findCssViolations(css);
    assert.deepEqual(violations, [], `@${name} should be allowed`);
  }
});

test('reports correct line numbers', () => {
  const css = ['.a { color: red; }', '.b { background: url(http://evil.example/x.png); }', '.c { color: blue; }'].join(
    '\n'
  );
  const violations = findCssViolations(css);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
});

test('reports byte offset', () => {
  const css = '.a { color: red; }\nurl(http://evil.example/x.png);';
  const violations = findCssViolations(css);
  assert.equal(violations.length, 1);
  const offset = violations[0].offset;
  assert.equal(css.slice(offset, offset + 3), 'url');
});

test('reports multiple violations from a single run', () => {
  const css = [
    '@import url("https://evil.example/a.css");',
    '.a { background: url(https://evil.example/b.png); }',
    '@bogus-rule { }',
  ].join('\n');
  const violations = findCssViolations(css);
  // @import itself, the http:// url inside it, the second http:// url, and
  // the unknown at-rule — at least 3 distinct problems reported.
  assert.ok(violations.length >= 3, `expected several violations, got ${violations.length}`);
});

test('does not flag "custom-url(" as a url() token', () => {
  const violations = findCssViolations('.x { --custom-url(): 1; }');
  assert.deepEqual(violations, []);
});

test('rejects an unterminated url()', () => {
  const violations = findCssViolations('.x { background: url(data:image/png;base64,AAAA');
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /unterminated/);
});

test('url() scheme match is case-insensitive for data:', () => {
  const violations = findCssViolations('.x { background: url(DATA:image/png;base64,AAAA); }');
  assert.deepEqual(violations, []);
});

// --- D-0001-22: escape-aware ident matching ---
// The three cases below are the exact strings measured live in Chromium
// (real getComputedStyle/cssRules) that a raw-byte comparison let through.
// See the doc comment on readIdentEscaped in safe-css.js.

test('D-0001-22: rejects a fully hex-escaped url( — \\75\\72\\6C(...)', () => {
  const violations = findCssViolations('#b { background-image: \\75\\72\\6C("https://example.com/b.png"); }');
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /data: URI/);
});

test('D-0001-22: rejects a partially hex-escaped url( with a whitespace-terminated escape — \\75 rl(...)', () => {
  const violations = findCssViolations('#c { background-image: \\75 rl("https://example.com/c.png"); }');
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /data: URI/);
});

test('D-0001-22: rejects @\\69 mport and reports it as the decoded name "@import"', () => {
  const violations = findCssViolations('@\\69 mport url("https://example.com/d.css");');
  assert.ok(violations.some((v) => /@import is not permitted/.test(v.message)));
});

test('D-0001-22: an escape inside a real selector is still accepted (not a blanket backslash ban)', () => {
  const css = '.\\[container-name\\:home-main-content\\]:has(.heading-xl) { color: red; }';
  const violations = findCssViolations(css);
  assert.deepEqual(violations, []);
});

test('D-0001-22: a hex escape with a trailing whitespace byte is consumed as part of the escape', () => {
  // "\6d edia" is the textbook CSS-escape example: "\6d" decodes to "m",
  // and the space right after the hex digits is CONSUMED AS PART OF THE
  // ESCAPE (CSS Syntax §4.3.7's "at most one whitespace" rule) rather than
  // treated as a token separator — so this is the single identifier
  // "media", not "m edia". If @media is recognised (no violation), the
  // trailing whitespace was consumed correctly; if it were mishandled as a
  // separator, this would misparse and could report a spurious violation.
  const violations = findCssViolations('@\\6d edia { }');
  assert.deepEqual(violations, []);
});
