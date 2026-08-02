'use strict';

/**
 * Codexterity — safe-CSS scanner (Phase 4 M1, D-0001-4)
 * -----------------------------------------------------------
 * This is the heart of the theme package format's safety guarantee: CSS
 * shipped inside a `.ccskin` runs inside Codex's own Electron MAIN process
 * (D-0001-1), so it must not be able to reach the network, the filesystem,
 * or any resource outside the package it arrived in.
 *
 * This is a REAL SCANNER, not a regex. A regex is wrong in both directions
 * here: `@import` sitting inside a string literal is not an at-rule, and
 * `url(http://x)` sitting inside a `/* comment *\/` is not a live reference
 * — a regex over the raw text would flag the harmless case and, just as
 * easily, could be fooled into missing a real one by a differently-shaped
 * comment or string. So this walks the CSS once, byte by byte, tracking
 * exactly three lexical contexts a real CSS tokenizer also tracks for this
 * purpose: comments, quoted strings, and `url(...)` tokens (both quoted and
 * unquoted forms) — and nothing else. This module's job is SAFETY, not
 * correctness: it does not validate CSS syntax generally, and it never
 * rewrites the CSS it scans. The loader hands the CSS through byte-for-byte
 * if the scan reports no violations.
 *
 * Scanning operates on raw BYTES, not decoded characters, so that reported
 * offsets are true byte offsets (the spec's requirement) without a second
 * encode/decode pass. This is safe because every byte value this scanner
 * compares against (quotes, parens, '@', '/', '*', backslash, whitespace,
 * newline) is ASCII and therefore single-byte in UTF-8; UTF-8 continuation
 * bytes for any multi-byte character are all >= 0x80 and can never collide
 * with one of these ASCII comparisons, so multi-byte text inside a string,
 * comment, or identifier is skipped over correctly without ever being
 * decoded.
 */

// At-rules Codex-hosted CSS is permitted to use. Anything else — most
// pointedly `@import`, the headline prohibition — is rejected by name, not
// silently ignored, so a new remote-fetching at-rule a future CSS spec
// invents fails closed rather than sliding through unrecognised.
const ALLOWED_AT_RULES = Object.freeze([
  'font-face',
  'media',
  'supports',
  'layer',
  'keyframes',
  'charset',
  'property',
  'page',
]);
const ALLOWED_AT_RULE_SET = new Set(ALLOWED_AT_RULES);

const CH = {
  TAB: 0x09,
  LF: 0x0a,
  FF: 0x0c,
  CR: 0x0d,
  SPACE: 0x20,
  DOUBLE_QUOTE: 0x22,
  SINGLE_QUOTE: 0x27,
  OPEN_PAREN: 0x28,
  CLOSE_PAREN: 0x29,
  STAR: 0x2a,
  SLASH: 0x2f,
  COLON: 0x3a,
  AT: 0x40,
  BACKSLASH: 0x5c,
};

function isWhitespaceByte(b) {
  return b === CH.SPACE || b === CH.TAB || b === CH.LF || b === CH.CR || b === CH.FF;
}

function isAsciiLetter(b) {
  return (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a);
}

function isAsciiDigit(b) {
  return b >= 0x30 && b <= 0x39;
}

// Characters that can appear inside a CSS identifier (ident-token), for our
// purposes: letters, digits, hyphen, underscore. Used only to find the
// boundaries of an at-rule keyword or a `url(`-like token, not to fully
// tokenize CSS.
function isIdentByte(b) {
  return isAsciiLetter(b) || isAsciiDigit(b) || b === 0x2d /* - */ || b === 0x5f /* _ */;
}

function isHexDigitByte(b) {
  return isAsciiDigit(b) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66);
}

/**
 * A tiny cursor over a Buffer that tracks the 1-based line number as it
 * advances, so every violation can report both a byte offset and a line
 * number without a second pass over the buffer.
 */
class Cursor {
  constructor(buf) {
    this.buf = buf;
    this.i = 0;
    this.line = 1;
  }
  get length() {
    return this.buf.length;
  }
  peek(offset = 0) {
    return this.buf[this.i + offset];
  }
  advance(n = 1) {
    for (let k = 0; k < n; k++) {
      if (this.i >= this.buf.length) return;
      if (this.buf[this.i] === CH.LF) this.line++;
      this.i++;
    }
  }
}

/**
 * Skip a `/* ... *\/` comment. Cursor must be positioned at the leading '/'.
 * Advances past the closing `*​/`, or to EOF if the comment is unterminated
 * (an unterminated comment is a CSS syntax error, but syntax correctness is
 * out of scope here — nothing after it can be mis-scanned since there is
 * nothing after it).
 */
function skipComment(cur) {
  cur.advance(2); // '/*'
  while (cur.i < cur.length) {
    if (cur.peek() === CH.STAR && cur.peek(1) === CH.SLASH) {
      cur.advance(2);
      return;
    }
    cur.advance(1);
  }
}

/**
 * Skip a quoted string. Cursor must be positioned at the opening quote
 * byte. Handles backslash escapes (the escaped byte is always consumed as
 * part of the string, whatever it is) and stops at the matching unescaped
 * quote, an unescaped raw newline (CSS treats this as an unterminated
 * "bad string" and ends the string there), or EOF.
 */
function skipString(cur) {
  const quote = cur.peek();
  cur.advance(1);
  while (cur.i < cur.length) {
    const b = cur.peek();
    if (b === CH.BACKSLASH) {
      cur.advance(2); // consume the backslash AND the escaped byte together
      continue;
    }
    if (b === quote) {
      cur.advance(1);
      return;
    }
    if (b === CH.LF) {
      // Unescaped newline: bad-string recovery, per the CSS spec. Do not
      // consume it — let the main loop's line tracking see it normally.
      return;
    }
    cur.advance(1);
  }
}

/**
 * Read raw bytes into a string, starting at the cursor's current position,
 * until (and not including) the given predicate matches on the next byte,
 * an escape is hit (consumed as its literal byte for the purposes of the
 * returned text — good enough for scheme-sniffing, since no legitimate
 * scheme name needs an escape), or EOF. Returns the collected text.
 */
function readUntil(cur, stopPredicate) {
  const start = cur.i;
  const bytes = [];
  while (cur.i < cur.length) {
    const b = cur.peek();
    if (b === CH.BACKSLASH && cur.i + 1 < cur.length) {
      bytes.push(cur.peek(1));
      cur.advance(2);
      continue;
    }
    if (stopPredicate(b)) break;
    bytes.push(b);
    cur.advance(1);
  }
  return { text: Buffer.from(bytes).toString('latin1'), start };
}

const SAFE_URL_SCHEME = 'data:';
const KNOWN_UNSAFE_SCHEMES = ['http:', 'https:', 'file:', 'blob:', '//'];

function classifyUrlValue(rawValue) {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return 'CSS url() has no value (empty url())';
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith(SAFE_URL_SCHEME)) {
    return null; // safe
  }
  for (const scheme of KNOWN_UNSAFE_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return `CSS url() must be a data: URI; found scheme "${scheme}"`;
    }
  }
  return 'CSS url() must be a data: URI (no other scheme, and no relative path, is permitted)';
}

/**
 * Parse a `url(...)` call. Cursor must be positioned exactly at the '('
 * (the caller has already consumed and identified the preceding "url"
 * ident, decoding any escapes it contained). Returns
 * { rawValue, endedProperly }. `endedProperly` is false if EOF was hit
 * before a closing ')' — treated as a violation by the caller, since an
 * unterminated url() cannot be proven safe.
 */
function parseUrlCall(cur) {
  cur.advance(1); // '('
  while (cur.i < cur.length && isWhitespaceByte(cur.peek())) cur.advance(1);

  let rawValue;
  if (cur.peek() === CH.DOUBLE_QUOTE || cur.peek() === CH.SINGLE_QUOTE) {
    const quote = cur.peek();
    cur.advance(1);
    const collected = [];
    while (cur.i < cur.length) {
      const b = cur.peek();
      if (b === CH.BACKSLASH && cur.i + 1 < cur.length) {
        collected.push(cur.peek(1));
        cur.advance(2);
        continue;
      }
      if (b === quote) {
        cur.advance(1);
        break;
      }
      if (b === CH.LF) break; // bad string
      collected.push(b);
      cur.advance(1);
    }
    rawValue = Buffer.from(collected).toString('latin1');
  } else {
    const { text } = readUntil(cur, (b) => b === CH.CLOSE_PAREN || isWhitespaceByte(b));
    rawValue = text;
  }

  while (cur.i < cur.length && isWhitespaceByte(cur.peek())) cur.advance(1);
  let endedProperly = false;
  if (cur.peek() === CH.CLOSE_PAREN) {
    cur.advance(1);
    endedProperly = true;
  }
  return { rawValue, endedProperly };
}

/**
 * D-0001-22 — the scanner decodes CSS escapes while reading identifiers,
 * because the CSS engine does, and matching raw bytes instead is a
 * VERIFIED bypass of BOTH of D-0001-4's headline prohibitions. Measured in
 * a real Chromium engine (real page, real getComputedStyle/cssRules), not
 * from the spec:
 *
 *   #b { background-image: \75\72\6C("https://example.com/b.png"); }
 *     -> computed backgroundImage = url("https://example.com/b.png")   LIVE FETCH
 *   #c { background-image: \75 rl("https://example.com/c.png"); }
 *     -> computed backgroundImage = url("https://example.com/c.png")   LIVE FETCH
 *   <style>@\69 mport url("https://example.com/d.css");</style>
 *     -> sheet.cssRules[0] is a real CSSImportRule
 *
 * Per CSS Syntax §4.3.7 ("consume an escaped code point"), the tokenizer
 * resolves `\` + 1-6 hex digits (+ at most one trailing whitespace byte) to
 * a code point, and `\` + any other single byte to that byte literally,
 * WHILE consuming an ident-like token — only the decoded result is ever
 * compared to "url" or "import". A scanner that compares raw bytes instead
 * agrees with the engine on every escape-free theme and disagrees on every
 * one of the three cases above, which is exactly the kind of gap this
 * scanner exists to not have. If you are simplifying this back to a byte
 * comparison "for clarity", you are reopening this hole — re-run
 * tests/theme-loader/safe-css.test.js's D-0001-22 cases first.
 *
 * This is why escapes are decoded ONLY here (and in the `@`/`url(`
 * detection that calls this), never turned into a blanket
 * "reject any backslash" rule: this theme's own hero landmark selector,
 * `.\[container-name\:home-main-content\]:has(.heading-xl)`, legitimately
 * escapes CSS-special characters inside an ordinary selector, and rejecting
 * all backslashes would reject that theme along with every future one that
 * escapes a Tailwind-style class name.
 */
function readEscapedCodePoint(buf, i) {
  // buf[i] is the backslash. A lone trailing backslash at EOF has no
  // following byte to escape; per spec this is invalid, but there is
  // nothing unsafe about it either way, so it is treated as a literal
  // backslash consuming only itself.
  if (i + 1 >= buf.length) {
    return { char: '\\', length: 1 };
  }
  const next = buf[i + 1];
  if (isHexDigitByte(next)) {
    let hexDigits = '';
    let k = i + 1;
    while (k < buf.length && hexDigits.length < 6 && isHexDigitByte(buf[k])) {
      hexDigits += String.fromCharCode(buf[k]);
      k++;
    }
    // "consumed if the next input code point is whitespace" — CSS Syntax
    // §4.3.7. This single optional byte is why `\75 rl(...)` (case c
    // above) decodes to `url(` rather than `u rl(`.
    if (k < buf.length && isWhitespaceByte(buf[k])) {
      k++;
    }
    let codePoint = parseInt(hexDigits, 16);
    // Zero, surrogates, and out-of-range values are replaced per spec;
    // none of those can ever spell "url" or "import" anyway, so this only
    // matters for not crashing on String.fromCodePoint.
    if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      codePoint = 0xfffd;
    }
    return { char: String.fromCodePoint(codePoint), length: k - i };
  }
  // `\` + any other single byte: that byte, literally — this is the
  // general escape used for e.g. `\[`, `\:`, `\]` in the real hero
  // selector, and is why decoding cannot be limited to hex escapes alone.
  return { char: String.fromCharCode(next), length: 2 };
}

/**
 * Read a full CSS identifier — decoding every escape it contains via
 * `readEscapedCodePoint` — starting at the cursor's current position.
 * Returns the DECODED text and the RAW byte length consumed (these differ
 * whenever an escape is present), without advancing the cursor — the
 * caller decides how far to consume based on what the identifier turns out
 * to be (an at-rule name, "url", or an ordinary identifier to skip past).
 */
function readIdentEscaped(cur) {
  const buf = cur.buf;
  let i = cur.i;
  let text = '';
  while (i < buf.length) {
    const b = buf[i];
    if (b === CH.BACKSLASH) {
      const { char, length } = readEscapedCodePoint(buf, i);
      text += char;
      i += length;
      continue;
    }
    if (isIdentByte(b)) {
      text += String.fromCharCode(b);
      i += 1;
      continue;
    }
    break;
  }
  return { text, length: i - cur.i };
}

/**
 * Scan CSS text (or a Buffer) for D-0001-4 safety violations. Returns an
 * array (possibly empty) of `{ offset, line, message }` — ALL violations
 * found, not just the first, so a theme author gets a complete report from
 * one run.
 */
function findCssViolations(css) {
  const buf = Buffer.isBuffer(css) ? css : Buffer.from(css, 'utf8');
  const cur = new Cursor(buf);
  const violations = [];

  const report = (offset, line, message) => {
    violations.push({ offset, line, message });
  };

  while (cur.i < cur.length) {
    const b = cur.peek();

    if (b === CH.SLASH && cur.peek(1) === CH.STAR) {
      skipComment(cur);
      continue;
    }

    if (b === CH.DOUBLE_QUOTE || b === CH.SINGLE_QUOTE) {
      skipString(cur);
      continue;
    }

    if (b === CH.AT) {
      const startOffset = cur.i;
      const startLine = cur.line;
      cur.advance(1);
      // D-0001-22: decode escapes while reading the at-rule name, exactly
      // as the engine does — see readIdentEscaped's doc comment. This is
      // what turns `@\69 mport` into the decoded name "import" instead of
      // the unrecognised literal name "\69 mport".
      const { text: name, length } = readIdentEscaped(cur);
      cur.advance(length);
      const lowerName = name.toLowerCase();
      if (!ALLOWED_AT_RULE_SET.has(lowerName)) {
        if (lowerName === 'import') {
          report(startOffset, startLine, '@import is not permitted in a Codexterity theme (D-0001-4): remote/local stylesheet loading cannot be verified safe');
        } else {
          report(startOffset, startLine, `@${name || ''} is not an allowed at-rule (D-0001-4); allowed: ${ALLOWED_AT_RULES.map((n) => '@' + n).join(', ')}`);
        }
      }
      continue;
    }

    // The start of an identifier-like run: a letter, digit, hyphen,
    // underscore, or an escape. D-0001-22 requires this to be decoded, not
    // byte-compared, before deciding whether it spells "url" — see the doc
    // comment on readIdentEscaped for the three measured bypasses this
    // closes. Skipped when the byte immediately before is itself an ident
    // byte, since that means we are already inside an ident this same loop
    // fully consumed on a prior iteration (idents are always consumed in
    // full below, so this can only be reached at a genuine start).
    if (isIdentByte(b) || b === CH.BACKSLASH) {
      const precedingByte = cur.i > 0 ? cur.buf[cur.i - 1] : undefined;
      const precededByIdent = precedingByte !== undefined && isIdentByte(precedingByte);
      if (!precededByIdent) {
        const startOffset = cur.i;
        const startLine = cur.line;
        const { text: identText, length: identLength } = readIdentEscaped(cur);
        const isUrlCall = identText.toLowerCase() === 'url' && cur.peek(identLength) === CH.OPEN_PAREN;
        cur.advance(identLength);
        if (isUrlCall) {
          const { rawValue, endedProperly } = parseUrlCall(cur);
          if (!endedProperly) {
            report(startOffset, startLine, `unterminated url(${rawValue}) — reached end of file before a closing ")"`);
          } else {
            const problem = classifyUrlValue(rawValue);
            if (problem) {
              report(startOffset, startLine, `${problem} (found url(${rawValue}))`);
            }
          }
        }
        continue;
      }
    }

    cur.advance(1);
  }

  return violations;
}

module.exports = {
  findCssViolations,
  ALLOWED_AT_RULES,
};
