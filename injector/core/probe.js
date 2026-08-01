'use strict';

/**
 * Codexterity — live-DOM / live-CSSOM inventory probe (Phase 3, task A)
 * ---------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT IS NOT THE PROBE GATE 0 SHIPPED
 *
 * Gate 0's token-gap probe read getComputedStyle(document.documentElement)
 * AFTER our own stylesheet was injected, then reported how many root custom
 * properties the theme "covered". That number is meaningless: the computed
 * style is the resolved cascade and is anonymous about provenance, so most of
 * the properties it counted as covered were ones WE had just placed on the
 * root. It could not distinguish Codex's vocabulary from our own, and it is
 * recorded as an invalid measurement in docs/research/gate0-findings.md §4.3.
 *
 * This probe answers the question that one could not, three different ways:
 *
 *   1. BEFORE injection. It runs with the theme deliberately NOT applied
 *      (CDX_PROBE=1 suppresses injection entirely), so every custom property
 *      it sees on the root is Codex's.
 *   2. From stylesheet TEXT, not computed values. Reading the app's own CSS
 *      source tells us not only which custom properties Codex *defines* but
 *      which ones it *reads* — a `var(--x)` reference is the only real
 *      evidence that overriding `--x` will repaint anything. A defined-but-
 *      never-read token is not a styling hook.
 *   3. Per-element, by matching the app's real rules against real elements.
 *      For each probed region (header, sidebar, composer, empty state, cards)
 *      it reports the ancestor chain with the actual declarations that apply,
 *      so "what paints the sidebar" is answered with a selector and a
 *      declaration rather than a guess.
 *
 * Every stylesheet's retrieval METHOD is reported alongside its result, so a
 * zero is distinguishable from a failure. Gate 0's notes record a CSSOM walk
 * that "returned zero properties" while the same tokens demonstrably
 * resolved — a negative result whose control flow was never checked.
 *
 * D-0001-3 — non-destructive by construction. This module reads only: the
 * live DOM of windows Codex created, stylesheet text fetched from the app's
 * own origin, and computed styles. It mutates nothing in the page, touches no
 * file in the Codex install directory, and never reads or writes
 * ~/.codex/auth.json, ~/.codex/.credentials.json, or any key or token. Its
 * one write is the JSON report, to a path WE choose via CDX_PROBE_OUT.
 */

const fs = require('fs');
const path = require('path');

/* ---------------------------------------------------------------------------
 * The CSS parser.
 *
 * These four functions are pure — no DOM, no closure over anything — and are
 * defined here as REAL JavaScript rather than inside the in-page template
 * string, then serialised into the page with Function.prototype.toString().
 * The same source therefore runs in the renderer and can be required, checked
 * and unit-tested in Node. That is not a stylistic preference: the first
 * version of this parser lived inside the template string, where node --check
 * sees only opaque text, and it silently dropped a 38 KB `.app-theme` rule
 * carrying 732 of Codex's most important custom properties. A parser you
 * cannot test against a captured corpus is a parser that lies quietly.
 *
 * They flatten CSS to { selector, decls, condition }, hoisting conditional
 * groups (@media/@supports/@layer/@container/@scope) and carrying their
 * condition along. Nothing here needs to round-trip.
 * ------------------------------------------------------------------------- */

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Split on `sep`, ignoring separators inside quotes, parens or brackets. */
function splitTopLevel(str, sep) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '\\') { i++; continue; }          // CSS escape, e.g. Tailwind's .\[foo\]
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === sep && depth === 0) { out.push(str.slice(start, i)); start = i + 1; }
  }
  out.push(str.slice(start));
  return out.map(function (s) { return s.trim(); }).filter(Boolean);
}

/**
 * Scan `css`, calling handleBlock for each top-level `prelude { body }`.
 *
 * Escapes are honoured OUTSIDE quotes as well as inside, and that single line
 * is why this parser sees the whole stylesheet. Tailwind v4 emits selectors
 * containing escaped punctuation — `.\[contain\:content\]`, and crucially
 * `\'` (20 occurrences in the shipped Codex bundle). A scanner that does not
 * skip the character after a backslash reads that `'` as the START of a
 * string, and then swallows every brace until the next apostrophe. Measured
 * against the captured corpus: without this, the scan ends at depth 1 having
 * seen 659 top-level blocks; with it, depth 0 and 1044 blocks. The rules lost
 * in that phantom string included the 38 KB `.app-theme` rule that defines
 * 733 of Codex's custom properties — i.e. most of the app's theming surface.
 */
function parseCss(css, sink, atProperties, condition) {
  let i = 0;
  let depth = 0;
  let quote = null;
  let blockStart = -1;
  let preludeStart = 0;
  while (i < css.length) {
    const c = css[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i++; continue;
    }
    if (c === '\\') { i += 2; continue; }
    if (c === '"' || c === "'") { quote = c; i++; continue; }
    if (c === '{') {
      if (depth === 0) blockStart = i;
      depth++; i++; continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        handleBlock(
          css.slice(preludeStart, blockStart).trim(),
          css.slice(blockStart + 1, i),
          sink, atProperties, condition
        );
        preludeStart = i + 1;
      } else if (depth < 0) {
        // Unbalanced input: resynchronise rather than run the rest of the
        // sheet at a negative depth, where no block would ever be emitted.
        depth = 0;
        preludeStart = i + 1;
      }
      i++; continue;
    }
    if (c === ';' && depth === 0) { preludeStart = i + 1; i++; continue; }
    i++;
  }
}

function handleBlock(prelude, body, sink, atProperties, condition) {
  const CONDITIONAL_AT = /^@(media|supports|layer|container|scope)\b/;
  const SKIP_AT = /^@(keyframes|-webkit-keyframes|font-face|import|charset|namespace|counter-style|font-feature-values|page|view-transition)\b/;
  if (!prelude) return;
  if (prelude.charAt(0) === '@') {
    if (CONDITIONAL_AT.test(prelude)) {
      parseCss(body, sink, atProperties, condition ? condition + ' && ' + prelude : prelude);
      return;
    }
    // `@property --x { syntax; inherits; initial-value }` is a first-class
    // declaration of a token's contract — captured separately.
    const propMatch = /^@property\s+(--[\w-]+)/.exec(prelude);
    if (propMatch) {
      const decls = {};
      const parts = splitTopLevel(body, ';');
      for (let i = 0; i < parts.length; i++) {
        const idx = parts[i].indexOf(':');
        if (idx > 0) decls[parts[i].slice(0, idx).trim()] = parts[i].slice(idx + 1).trim();
      }
      decls.name = propMatch[1];
      atProperties.push(decls);
      return;
    }
    if (SKIP_AT.test(prelude)) return;
    return;
  }
  const decls = [];
  const parts = splitTopLevel(body, ';');
  for (let i = 0; i < parts.length; i++) {
    const idx = parts[i].indexOf(':');
    if (idx > 0) decls.push([parts[i].slice(0, idx).trim(), parts[i].slice(idx + 1).trim()]);
  }
  if (!decls.length) return;
  const selectors = splitTopLevel(prelude, ',');
  for (let i = 0; i < selectors.length; i++) {
    sink.push({ selector: selectors[i], decls: decls, condition: condition || null });
  }
}

/** Source for the parser, injected verbatim into the in-page script. */
const PARSER_SOURCE = [stripComments, splitTopLevel, parseCss, handleBlock]
  .map(function (fn) { return fn.toString(); })
  .join('\n\n');

/**
 * The in-page half of the probe. Built as a source string because it is
 * executed via webContents.executeJavaScript in the renderer, which has no
 * shared scope with this process.
 *
 * Returns a Promise (executeJavaScript resolves it), because stylesheet text
 * for cross-origin/opaque sheets can only be recovered by fetching the href.
 */
function buildProbeScript(options) {
  const config = JSON.stringify({
    maxRulesPerElement: options.maxRulesPerElement,
    maxClassNames: options.maxClassNames,
    dumpCss: !!options.dumpCss,
  });

  return `
(async () => {
  const CONFIG = ${config};

  // ---------------------------------------------------------------------
  // CSS text acquisition. Three routes, and we record which one produced
  // each sheet so an empty result can be told apart from a failed read.
  // ---------------------------------------------------------------------
  // RAW TEXT FIRST, CSSOM LAST — and that order is load-bearing, not a
  // preference. Chrome's CSSOM expands shorthands, and a var() inside a
  // shorthand becomes a "pending-substitution value" that serializes as
  // EMPTY in the expansion: 'background: var(--color-surface)' comes back
  // through cssText as 'background-color: ; background-image: ; ...'. The
  // token reference is gone. Measured on a controlled fixture before this
  // probe was ever pointed at Codex. Since 'which tokens does the app READ'
  // is the entire question, a CSSOM walk would systematically under-report
  // every shorthand read ('background', 'border', 'font'). Raw text has no
  // such loss, so cssRules is a fallback and is flagged as lossy when used.
  async function sheetText(sheet) {
    let cssomError = null;
    // Route 1: an inline <style> element — raw authored text, right there.
    const node = sheet.ownerNode;
    if (node && node.tagName === 'STYLE' && node.textContent) {
      return { method: 'ownerNode.textContent', text: node.textContent };
    }
    // Route 2: refetch the href. Served from the app's own origin, so this
    // hits the HTTP/memory cache rather than the network in practice.
    if (sheet.href) {
      try {
        const res = await fetch(sheet.href);
        if (res.ok) return { method: 'fetch(href)', text: await res.text() };
        cssomError = 'fetch status ' + res.status;
      } catch (err) {
        cssomError = 'fetch threw ' + String(err);
      }
    }
    // Route 3: the CSSOM. Lossy for shorthand var() reads — see above.
    try {
      const rules = sheet.cssRules;
      if (rules) {
        return {
          method: 'cssRules (LOSSY: shorthand var() reads are dropped)' +
            (cssomError ? ' after ' + cssomError : ''),
          text: Array.from(rules).map((r) => r.cssText).join('\\n'),
          lossy: true,
        };
      }
    } catch (err) {
      cssomError = (cssomError ? cssomError + '; ' : '') + (err && err.name ? err.name : String(err));
    }
    return { method: 'FAILED', text: '', error: cssomError || 'no ownerNode text, no href, no cssRules' };
  }

  // ---------------------------------------------------------------------
  // The CSS parser, injected verbatim from the module scope of probe.js so
  // that exactly the same source is unit-tested in Node and executed here.
  // ---------------------------------------------------------------------
  ${PARSER_SOURCE}


  // ---------------------------------------------------------------------
  // Read every sheet.
  // ---------------------------------------------------------------------
  const sheetReports = [];
  const rules = [];
  const atProperties = [];
  let allText = '';

  // document.styleSheets does NOT include constructable stylesheets attached
  // via adoptedStyleSheets. A first pass found 732 --vscode-* properties
  // resolving on the root that were in no <link>/<style> sheet and not inline
  // on <html> — adopted sheets are where they live, and missing them would
  // have left the single most important layer of the app invisible to this
  // inventory. They are tagged so the report can tell the two apart: an
  // adopted sheet is a normal AUTHOR stylesheet for cascade purposes (beatable
  // by an unlayered rule), whereas an inline style is not (needs !important).
  const adopted = Array.from(document.adoptedStyleSheets || []);
  const allSheets = Array.from(document.styleSheets).concat(adopted);

  for (const sheet of allSheets) {
    const isAdopted = adopted.indexOf(sheet) !== -1;
    const owner = sheet.ownerNode;
    const ownerId = owner && owner.id ? owner.id : (isAdopted ? '(adoptedStyleSheet)' : null);
    // Never parse our own injected sheet — provenance is the whole point.
    if (ownerId === 'codexterity-theme') {
      sheetReports.push({ href: sheet.href || '(inline)', ownerId, method: 'SKIPPED (ours)', bytes: 0 });
      continue;
    }
    const got = await sheetText(sheet);
    sheetReports.push({
      href: sheet.href || (isAdopted ? '(adopted)' : '(inline)'),
      adopted: isAdopted || undefined,
      ownerId,
      method: got.method,
      bytes: got.text.length,
      lossy: got.lossy || undefined,
      error: got.error || undefined,
    });
    if (!got.text) continue;
    allText += '\\n' + got.text;
    const clean = stripComments(got.text);
    const before = rules.length;
    try {
      parseCss(clean, rules, atProperties, null);
      // Tag provenance: which sheet a rule came from decides how hard it is
      // to override, so the report must not lose it.
      const origin = isAdopted ? 'adopted' : (sheet.href || 'inline<style>');
      for (let i = before; i < rules.length; i++) rules[i].origin = origin;
    } catch (err) {
      sheetReports[sheetReports.length - 1].parseError = String(err);
    }
  }

  // ---------------------------------------------------------------------
  // What Codex DEFINES vs what Codex READS.
  // ---------------------------------------------------------------------
  const definedProps = {};       // --name -> [{selector, value, condition}]
  for (const rule of rules) {
    for (const [prop, value] of rule.decls) {
      if (!prop.startsWith('--')) continue;
      (definedProps[prop] = definedProps[prop] || []).push({
        selector: rule.selector, value, condition: rule.condition, origin: rule.origin,
      });
    }
  }

  // A var() reference is the only real evidence that overriding a token
  // repaints anything. Record which CSS properties read each token.
  const varReads = {};           // --name -> { count, properties: {prop: n} }
  for (const rule of rules) {
    for (const [prop, value] of rule.decls) {
      const refs = value.match(/var\\(\\s*(--[\\w-]+)/g);
      if (!refs) continue;
      for (const raw of refs) {
        const name = raw.replace(/^var\\(\\s*/, '');
        const rec = varReads[name] = varReads[name] || { count: 0, properties: {} };
        rec.count++;
        rec.properties[prop] = (rec.properties[prop] || 0) + 1;
      }
    }
  }

  // ---------------------------------------------------------------------
  // The live root: every custom property Codex resolves on documentElement.
  // Uncontaminated, because this run does not inject.
  // ---------------------------------------------------------------------
  const rootCs = getComputedStyle(document.documentElement);
  const rootTokens = {};
  for (const name of Array.from(rootCs)) {
    if (name.startsWith('--')) rootTokens[name] = rootCs.getPropertyValue(name).trim();
  }

  // ---------------------------------------------------------------------
  // WHERE do the root tokens come from? This decides the override strategy,
  // so it is measured rather than inferred.
  //
  // A custom property set as an INLINE style on <html> cannot be beaten by a
  // normal author stylesheet at any specificity — only by !important. A
  // property defined in a stylesheet inside @layer, by contrast, loses to any
  // unlayered author rule automatically. Same-looking token, opposite override
  // requirements.
  // ---------------------------------------------------------------------
  const inlineStyle = document.documentElement.getAttribute('style') || '';
  const inlineTokens = {};
  const rootInline = document.documentElement.style;
  for (let i = 0; i < rootInline.length; i++) {
    const name = rootInline[i];
    if (name.startsWith('--')) inlineTokens[name] = rootInline.getPropertyValue(name).trim();
  }
  const tokenSources = {
    inlineStyleBytes: inlineStyle.length,
    inlineTokenCount: Object.keys(inlineTokens).length,
    inlineTokens,
    // Where a stylesheet defines it, and whether that definition is layered.
    // Sampled for the tokens the app reads most, which are the ones worth
    // overriding.
    sampledDefinitions: {},
  };
  {
    const hottest = Object.keys(varReads)
      .sort((a, b) => varReads[b].count - varReads[a].count)
      .slice(0, 40);
    for (const name of hottest) {
      tokenSources.sampledDefinitions[name] = {
        readCount: varReads[name].count,
        inline: Object.prototype.hasOwnProperty.call(inlineTokens, name),
        cssDefinitions: (definedProps[name] || []).map((d) => ({
          selector: d.selector, condition: d.condition, value: d.value, origin: d.origin,
        })),
      };
    }
  }

  // Provenance check for properties that resolve on the root but appear in
  // neither the parsed CSS nor the inline style. Rather than infer where they
  // come from, ask the two questions that separate the possibilities:
  // is the literal name present in the stylesheet text we fetched (i.e. our
  // PARSER missed it), and does the property survive on an element detached
  // from the document (i.e. it is a registered property with an initial
  // value, not an inherited declaration)? A guess here would pick the wrong
  // override strategy.
  {
    const accounted = new Set(Object.keys(definedProps).concat(Object.keys(inlineTokens)));
    const orphans = Object.keys(rootTokens).filter((n) => !accounted.has(n));
    const detached = document.createElement('div');
    const samples = orphans.slice(0, 6).map((name) => {
      const idx = allText.indexOf(name);
      return {
        name,
        rootValue: rootTokens[name],
        presentInFetchedCssText: idx !== -1,
        context: idx === -1 ? null : allText.slice(Math.max(0, idx - 90), idx + 90).replace(/\\s+/g, ' '),
        // A detached element inherits nothing from the document root, so a
        // value surviving here came from property registration, not cascade.
        resolvesOnDetachedElement: getComputedStyle(detached).getPropertyValue(name).trim() || '(empty)',
      };
    });
    tokenSources.orphanCount = orphans.length;
    tokenSources.orphanSamples = samples;
  }

  // ---------------------------------------------------------------------
  // Colour census — every non-greyscale colour the app actually paints,
  // across the whole tree. This is how the multi-accent violation gets
  // located: not by guessing which <svg> to look at, but by asking the
  // rendered page which hues exist and what element carries each one.
  // ---------------------------------------------------------------------
  function parseRgb(v) {
    const m = /^rgba?\\(([-\\d.]+),\\s*([-\\d.]+),\\s*([-\\d.]+)/.exec(v || '');
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  function isChromatic(v) {
    const rgb = parseRgb(v);
    if (!rgb) return false;
    const [r, g, b] = rgb;
    // Greyscale (and near-greyscale, which covers the app's tinted greys)
    // is not an accent. 12/255 is comfortably below "a colour you notice".
    return Math.max(r, g, b) - Math.min(r, g, b) > 12;
  }
  const all = document.querySelectorAll('*');
  const colourCensus = {};
  function noteColour(value, prop, el) {
    if (!isChromatic(value)) return;
    const rec = colourCensus[value] = colourCensus[value] || { count: 0, properties: {}, samples: [] };
    rec.count++;
    rec.properties[prop] = (rec.properties[prop] || 0) + 1;
    if (rec.samples.length < 4) {
      rec.samples.push({
        tag: el.tagName.toLowerCase(),
        classes: Array.from(el.classList).slice(0, 8),
        parentClasses: el.parentElement ? Array.from(el.parentElement.classList).slice(0, 8) : [],
        rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      });
    }
  }
  for (const el of all) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;   // not painted
    noteColour(cs.color, 'color', el);
    noteColour(cs.backgroundColor, 'background-color', el);
    noteColour(cs.borderTopColor, 'border-color', el);
    noteColour(cs.fill, 'fill', el);
    noteColour(cs.stroke, 'stroke', el);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      const grads = cs.backgroundImage.match(/rgba?\\([^)]*\\)/g) || [];
      for (const g of grads) noteColour(g, 'background-image', el);
    }
  }
  const colours = Object.entries(colourCensus)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40)
    .map(([value, rec]) => ({ value, ...rec }));

  // ---------------------------------------------------------------------
  // Live class-name census — candidate structural hooks, ranked.
  // ---------------------------------------------------------------------
  const classCounts = {};
  for (const el of all) {
    const cl = el.classList;
    for (let i = 0; i < cl.length; i++) {
      classCounts[cl[i]] = (classCounts[cl[i]] || 0) + 1;
    }
  }
  const topClasses = Object.entries(classCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, CONFIG.maxClassNames)
    .map(([name, count]) => ({ name, count }));

  // ---------------------------------------------------------------------
  // Per-element cascade: which of the app's OWN rules actually apply here.
  // This is what turns "the sidebar is stock" into "the sidebar is painted
  // by <selector> { background: <value> }".
  // ---------------------------------------------------------------------
  function matchedRules(el) {
    const out = [];
    for (const rule of rules) {
      let hit = false;
      try { hit = el.matches(rule.selector); } catch (err) { continue; }
      if (!hit) continue;
      out.push({
        selector: rule.selector,
        condition: rule.condition,
        decls: rule.decls.map(([p, v]) => p + ': ' + v),
      });
      if (out.length >= CONFIG.maxRulesPerElement) break;
    }
    return out;
  }

  function describe(el, withRules) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const ownTokens = {};
    // Element-scoped custom properties are how component libraries localise
    // theming; if the sidebar sets its own --color-*, a root override loses.
    for (const rule of (withRules ? matchedRules(el) : [])) {
      for (const d of rule.decls) if (d.startsWith('--')) ownTokens[d] = rule.selector;
    }
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.from(el.classList),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage,
      color: cs.color,
      borderColor: cs.borderTopColor,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      ownTokenDecls: Object.keys(ownTokens).length ? ownTokens : undefined,
      rules: withRules ? matchedRules(el) : undefined,
    };
  }

  function chainAt(label, x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return { label, point: [x, y], chain: [], note: 'no element at point' };
    const chain = [];
    let cur = el;
    while (cur && cur !== document.documentElement && chain.length < 12) {
      chain.push(describe(cur, true));
      cur = cur.parentElement;
    }
    return { label, point: [Math.round(x), Math.round(y)], chain };
  }

  // ---------------------------------------------------------------------
  // PAINT TRACE — which ancestor actually paints a region.
  //
  // WHY THIS EXISTS. chainAt() walks at most 12 ancestors from a point, and
  // for the sidebar the <aside class="app-shell-left-panel"> IS the 12th, so
  // <body> and <html> were never measured. That gap produced a wrong answer,
  // twice: the sidebar's own computed background-color is transparent, and the
  // stylesheet rule that would paint it
  //   [data-codex-window-type=electron]:not(...) .app-shell-left-panel
  // does NOT match this window, so the four-stage token chain it carries is
  // irrelevant to the pixel. A resolved token is not a painted pixel, and a
  // MATCHING RULE IS NOT A MATCHED RULE unless its ancestor guard holds.
  //
  // This walks to the document root without a cap and reports the first
  // ancestor with a non-transparent background — the element that actually
  // supplies the colour a user sees. It also reports every data-* attribute up
  // the chain, because the guards that decide whether Codex's own rules apply
  // are attribute-based, and guessing the window type is what went wrong.
  // ---------------------------------------------------------------------
  function dataAttrs(el) {
    const out = {};
    for (const a of Array.from(el.attributes || [])) {
      if (a.name.startsWith('data-') || a.name === 'style') {
        out[a.name] = a.name === 'style' ? '(' + a.value.length + ' bytes)' : a.value;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  // A background-color paints something unless it is fully transparent.
  // rgba(...,0) and the keyword 'transparent' are the only fully-clear forms
  // getComputedStyle returns; anything else contributes colour, including a
  // partial alpha, which is why the alpha is reported rather than thresholded.
  function alphaOf(bg) {
    const m = /^rgba?\\(([-\\d.]+),\\s*([-\\d.]+),\\s*([-\\d.]+)(?:,\\s*([-\\d.]+))?/.exec(bg || '');
    if (!m) return bg === 'transparent' ? 0 : null;
    return m[4] === undefined ? 1 : Number(m[4]);
  }

  function paintTrace(label, selector) {
    let el = null;
    try { el = document.querySelector(selector); } catch (err) { return { label, selector, error: String(err) }; }
    if (!el) return { label, selector, found: false };
    const layers = [];
    let firstPainted = null;
    let cur = el;
    while (cur) {
      const cs = getComputedStyle(cur);
      const bg = cs.backgroundColor;
      const a = alphaOf(bg);
      const layer = {
        tag: cur.tagName.toLowerCase(),
        id: cur.id || null,
        classes: Array.from(cur.classList).slice(0, 10),
        dataAttrs: dataAttrs(cur),
        backgroundColor: bg,
        alpha: a,
        backgroundImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 200),
        opacity: cs.opacity,
      };
      layers.push(layer);
      if (firstPainted === null && a !== null && a > 0) {
        firstPainted = { depth: layers.length - 1, tag: layer.tag, classes: layer.classes, backgroundColor: bg, alpha: a };
      }
      cur = cur.parentElement;
    }
    return { label, selector, found: true, firstPaintedAncestor: firstPainted, layers };
  }

  const paintTraces = [
    paintTrace('sidebar panel', '.app-shell-left-panel'),
    paintTrace('sidebar row', '.sidebar-item'),
    paintTrace('composer input', '.ProseMirror'),
    paintTrace('empty-state heading', '.heading-xl'),
  ];

  // ---------------------------------------------------------------------
  // CONTROL CENSUS — every interactive control, with what it actually paints.
  //
  // The "character pass" needs hooks for: the ACTIVE sidebar row, the
  // empty-state cards, and the composer send control. None of those can be
  // named from the stylesheet, because the state that distinguishes an active
  // row from an inactive one is applied on the ELEMENT (an attribute, or a
  // utility class), not in a rule we can grep for. Reporting every control with
  // its attributes and its painted colours lets the active one be found by
  // DIFFING it against its siblings, rather than by guessing a selector — which
  // is how three dead landmarks got declared before Gate 0.
  //
  // Build-hashed CSS-module classes are reported too, but tagged, so nothing
  // here can be mistaken for a usable landmark (see §4 of the findings).
  // ---------------------------------------------------------------------
  const HASHED = /^_.*_[a-z0-9]{5,6}_\\d+$/;
  function controlCensus() {
    const out = [];
    const els = document.querySelectorAll('button, a[href], [role=button], [role=tab], .sidebar-item');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(el);
      const classes = Array.from(el.classList);
      out.push({
        tag: el.tagName.toLowerCase(),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 48) || null,
        authoredClasses: classes.filter((c) => !HASHED.test(c)),
        hashedClasses: classes.filter((c) => HASHED.test(c)),
        dataAttrs: dataAttrs(el),
        ariaCurrent: el.getAttribute('aria-current'),
        ariaSelected: el.getAttribute('aria-selected'),
        backgroundColor: cs.backgroundColor,
        borderColor: cs.borderTopColor,
        borderWidth: cs.borderTopWidth,
        color: cs.color,
        hasSvg: !!el.querySelector('svg'),
      });
      if (out.length >= 120) break;
    }
    return out;
  }
  const controls = controlCensus();

  // Code surfaces, described rather than merely counted. Plan 0001 item 6 needs
  // to know what a code block actually IS in this app before anything
  // structural is written for it — the tag, whether our mono face reached it,
  // and what surface it sits on.
  function codeSurfaceDetail() {
    const out = [];
    const els = document.querySelectorAll('pre, code, kbd, samp, .cm-editor, [class*="markdown"]');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.push({
        tag: el.tagName.toLowerCase(),
        authoredClasses: Array.from(el.classList).filter((c) => !HASHED.test(c)),
        hashedClasses: Array.from(el.classList).filter((c) => HASHED.test(c)),
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
        fontFamily: cs.fontFamily,
        backgroundColor: cs.backgroundColor,
        color: cs.color,
      });
      if (out.length >= 30) break;
    }
    return out;
  }
  const codeSurfaceDetails = codeSurfaceDetail();

  // The window-type guards themselves, read rather than inferred. Codex gates a
  // large amount of its own styling on these, so a wrong assumption here makes
  // every downstream attribution wrong.
  const windowGuards = {
    documentElementAttrs: dataAttrs(document.documentElement) || {},
    bodyAttrs: document.body ? (dataAttrs(document.body) || {}) : null,
    windowTypeMatches: {},
  };
  for (const t of ['electron', 'browser', 'chrome-extension']) {
    windowGuards.windowTypeMatches['[data-codex-window-type=' + t + ']'] =
      document.querySelectorAll('[data-codex-window-type=' + t + ']').length;
  }
  windowGuards.appThemeElements = document.querySelectorAll('.app-theme').length;

  const W = window.innerWidth, H = window.innerHeight;
  const regions = [
    chainAt('title-bar / menu-bar (top-left)', 40, 8),
    chainAt('title-bar centre', W / 2, 8),
    chainAt('header strip', W / 2, 28),
    chainAt('sidebar top', 60, 90),
    chainAt('sidebar middle', 60, H / 2),
    chainAt('sidebar bottom', 60, H - 80),
    chainAt('main content centre', W / 2, H / 2),
    chainAt('composer', W / 2, H - 60),
    chainAt('bottom-right corner', W - 40, H - 24),
  ];

  // ---------------------------------------------------------------------
  // The multi-accent violation: what actually paints the card icons?
  // ---------------------------------------------------------------------
  const icons = Array.from(document.querySelectorAll('svg')).slice(0, 40).map((svg) => {
    const cs = getComputedStyle(svg);
    const r = svg.getBoundingClientRect();
    const painted = Array.from(svg.querySelectorAll('path, circle, rect, g, line, polygon'))
      .slice(0, 6)
      .map((p) => {
        const pcs = getComputedStyle(p);
        return {
          tag: p.tagName.toLowerCase(),
          attrFill: p.getAttribute('fill'),
          attrStroke: p.getAttribute('stroke'),
          computedFill: pcs.fill,
          computedStroke: pcs.stroke,
          classes: Array.from(p.classList),
        };
      });
    return {
      classes: Array.from(svg.classList),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      computedColor: cs.color,
      computedFill: cs.fill,
      computedStroke: cs.stroke,
      parentClasses: svg.parentElement ? Array.from(svg.parentElement.classList) : [],
      rules: matchedRules(svg),
      children: painted,
    };
  });

  // Code surfaces — expected absent on an empty state, which is why the
  // count is reported per-tag rather than as one boolean.
  const codeSurfaces = {};
  for (const sel of ['pre', 'code', 'kbd', 'samp', '.cm-editor', '[class*="markdown"]', '[class*="code"]']) {
    try { codeSurfaces[sel] = document.querySelectorAll(sel).length; }
    catch (err) { codeSurfaces[sel] = 'invalid selector'; }
  }

  // The four landmarks Gate 0 declared, re-checked here for continuity.
  const declaredLandmarks = {};
  for (const sel of ['.app-header-tint', '.popupContent', '.app-shell-main-content-top-fade', 'pre, code, kbd, samp']) {
    declaredLandmarks[sel] = document.querySelectorAll(sel).length;
  }

  return {
    meta: {
      url: location.href,
      title: document.title,
      viewport: { w: W, h: H },
      elementCount: all.length,
      rootClass: document.documentElement.className || '(none)',
      bodyClass: document.body ? document.body.className || '(none)' : '(no body)',
      ourStyleTagPresent: !!document.getElementById('codexterity-theme'),
      sheetCount: document.styleSheets.length,
      parsedRuleCount: rules.length,
      totalCssBytes: allText.length,
    },
    sheets: sheetReports,
    rootTokens,
    definedProps,
    varReads,
    atProperties,
    tokenSources,
    colours,
    topClasses,
    regions,
    paintTraces,
    windowGuards,
    controls,
    codeSurfaceDetails,
    icons,
    codeSurfaces,
    declaredLandmarks,
    // Codex's stylesheets are inside a packed bundle on disk, so the running
    // app is the only place to obtain them. Dumping the corpus once lets the
    // CSS parser be developed and corrected offline instead of costing a full
    // app relaunch per iteration.
    cssText: CONFIG.dumpCss ? allText : undefined,
  };
})();
`;
}

/**
 * Run the probe against one webContents and write the JSON report.
 *
 * @param {object} webContents  the window to probe (read-only)
 * @param {(msg: string) => void} log
 * @param {string} outDir       directory for report files (ours, never Codex's)
 * @param {string} tag          filename discriminator, e.g. 'wc3-t6000'
 */
async function runProbe(webContents, log, outDir, tag) {
  const script = buildProbeScript({
    maxRulesPerElement: 40,
    maxClassNames: 250,
    dumpCss: !!process.env.CDX_PROBE_DUMP_CSS,
  });
  let report;
  try {
    report = await webContents.executeJavaScript(script, true);
  } catch (err) {
    log(`  PROBE FAILED (${tag}): ${err.message}\n${err.stack}`);
    return null;
  }

  const outPath = path.join(outDir, `probe-${tag}.json`);
  try {
    fs.mkdirSync(outDir, { recursive: true });
    if (report.cssText) {
      const cssPath = path.join(outDir, `corpus-${tag}.css`);
      fs.writeFileSync(cssPath, report.cssText, 'utf8');
      log(`  PROBE CSS corpus -> ${cssPath} (${report.cssText.length} chars)`);
      delete report.cssText;
    }
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  } catch (err) {
    log(`  PROBE could not write ${outPath}: ${err.message}`);
    return report;
  }

  const m = report.meta;
  log(`  PROBE ${tag} -> ${outPath}`);
  log(`    url=${m.url} elements=${m.elementCount} sheets=${m.sheetCount} ` +
      `parsedRules=${m.parsedRuleCount} cssBytes=${m.totalCssBytes} ourStyleTag=${m.ourStyleTagPresent}`);
  for (const s of report.sheets) {
    log(`    sheet ${s.method} ${s.bytes}B ${s.href}${s.error ? ' ERROR=' + s.error : ''}`);
  }
  log(`    Codex defines ${Object.keys(report.definedProps).length} custom properties in CSS; ` +
      `reads ${Object.keys(report.varReads).length} distinct tokens via var(); ` +
      `root resolves ${Object.keys(report.rootTokens).length}`);
  log(`    root inline style: ${report.tokenSources.inlineStyleBytes} bytes, ` +
      `${report.tokenSources.inlineTokenCount} custom properties set inline on <html>`);
  log(`    chromatic colours painted: ${report.colours.length} distinct`);
  log(`    window guards: ${JSON.stringify(report.windowGuards.windowTypeMatches)} ` +
      `.app-theme=${report.windowGuards.appThemeElements} ` +
      `htmlAttrs=${JSON.stringify(report.windowGuards.documentElementAttrs)}`);
  log(`    controls: ${report.controls.length} interactive; ` +
      `code surfaces described: ${report.codeSurfaceDetails.length}`);
  for (const c of report.codeSurfaceDetails.slice(0, 6)) {
    log(`      <${c.tag}> ${c.rect.w}x${c.rect.h} font=${c.fontFamily.slice(0, 40)} bg=${c.backgroundColor}`);
  }
  for (const t of report.paintTraces) {
    if (!t.found) { log(`    paint-trace ${t.label}: NOT PRESENT on this screen`); continue; }
    const f = t.firstPaintedAncestor;
    log(`    paint-trace ${t.label}: ${t.layers.length} ancestors; ` +
        (f ? `painted by <${f.tag}${f.classes.length ? '.' + f.classes[0] : ''}> ` +
             `${f.backgroundColor} (alpha ${f.alpha}) at depth ${f.depth}`
           : 'NOTHING in the ancestor chain paints — the window backdrop shows through'));
  }
  return report;
}

// buildProbeScript is exported so the in-page half — a template string that
// node --check cannot see into — can be syntax-checked and unit-tested outside
// a running Codex. It is not part of the injector's runtime surface.
// The parser is exported alongside so it can be exercised against a captured
// CSS corpus in Node — the check that would have caught the dropped
// `.app-theme` rule the first time round.
module.exports = { runProbe, buildProbeScript, parseCss, splitTopLevel, stripComments };
