/**
 * Codexterity — `.ico` generator (Phase 4 M4)
 * -----------------------------------------------------------
 * Zero-dependency (D-0001-20 binds the whole repo, not just injector/theme-
 * loader/): rasterises the APPROVED shortcut icon (candidate R5 of
 * `tools/mockup/build-icon-comparison.mjs` — the owner's render, chosen
 * 2026-08-03) into a real multi-size `.ico` (16/32/48/256) with no image
 * library, matching the hand-rolled binary-writing house style of
 * injector/theme-loader/zip-write.js.
 *
 * ESM, not CJS — every other palette-consuming tool in this repo already is
 * (emit-theme.mjs, audit.mjs, palette-engine.mjs, tools/mockup/*.mjs); this
 * file was the anomaly. The reason it has to be: the spectrum below must be
 * the EXACT numbers the owner approved, which means importing the real
 * `oklchToHex` from `tools/palette/palette-engine.mjs` (ESM) rather than
 * re-deriving or eyeballing a colour conversion — see D-0001-23's sibling
 * rule about never re-deriving a value another module already owns.
 *
 * D-0001-23's rule applies here too, verbatim: 32-bit fields are RANGE-
 * CHECKED, never masked with `>>> 0` — masking turned a loud
 * `writeUInt32LE` throw into silent corruption once already in this repo
 * (see zip-write.js's header). `writeUInt32Checked` below relies on
 * `Buffer.prototype.writeUInt32LE` already throwing a RangeError above
 * 0xFFFFFFFF; nothing here pre-masks a value before handing it that call.
 *
 * THE ARTWORK — candidate R5, approved by the owner from
 * docs/mockups/0004-shortcut-icon-comparison.html:
 *   - Silhouette: Codex's own knot mark, read from the ALPHA channel of
 *     Codex's white-on-transparent tile asset
 *     (<install>\assets\Square44x44Logo.targetsize-256_altform-unplated.png),
 *     decoded with tools/png-decode.mjs.
 *   - Fill: a conic-gradient spectrum, `from 210deg`, sweeping the full hue
 *     circle at constant OKLCH lightness/chroma — matches RAINBOW_CONIC.
 *   - NO glow (the reason R5 beat the other four rainbow candidates: glow
 *     turns to mush at 16px).
 *   - Ground: the theme-NEUTRAL near-black NEUTRAL_GROUND, not any one
 *     theme's palette — one shortcut serves every future theme (D-0001-24).
 *   - Knot scale: 64% of the tile, centred (knotFill's default `scale`).
 *
 * Each size is emitted as a modern PNG-compressed ICO frame (Windows Vista+
 * reads these directly) rather than a legacy BMP+AND-mask frame — that's
 * what lets a single small PNG encoder cover every size without also
 * writing a DIB encoder.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

import { oklchToHex } from './palette/palette-engine.mjs';
import { decodePng } from './png-decode.mjs';

// injector/theme-loader/zip.js is CJS. A plain `import { crc32 } from
// '...zip.js'` does not reliably surface named exports of a CJS module from
// ESM (Node's CJS/ESM interop only statically detects a fixed set of
// `module.exports` shapes via cjs-module-lexer, and this file assigns
// `module.exports = { readZip, crc32, MAX_ZIP_ENTRIES }` as a single object
// literal at the end of the file — verified by trying the named import
// first and finding it undefined). `createRequire` sidesteps that entirely:
// it is the documented Node mechanism for consuming a CJS module from ESM
// with the exact same `module.exports` object CommonJS callers get, so
// there is no risk of silently binding to `undefined`.
const require = createRequire(import.meta.url);
const { crc32 } = require('../injector/theme-loader/zip.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

const ICON_SIZES = [16, 32, 48, 256];

// The icon is BUILD OUTPUT, not source, so it is written under dist/ —
// which this repo already gitignores deliberately, alongside the .ccskin and
// the compiled stub. It is fully derived (Codex's own mark plus a spectrum
// solved from tools/palette), so committing it would put a second, silently
// driftable copy of the artwork in the tree.
const DEFAULT_OUTPUT_PATH = path.resolve(REPO_ROOT, 'dist', 'Codexterity.ico');

// ---------------------------------------------------------------------
// The approved artwork's constants — carried here as named values rather
// than inlined, with a comment pointing at the approved source, so the two
// cannot drift silently (per the owner's explicit instruction for this
// milestone).
//
// NEON_L / NEON_C / the 210deg sweep origin are copied VERBATIM from
// tools/mockup/build-icon-comparison.mjs's NEON_L, NEON_C and
// `RAINBOW_CONIC = conic-gradient(from 210deg, ...)`. If that mockup's
// constants ever change, these must change with them — they are not
// independently "close enough" values.
// ---------------------------------------------------------------------
const NEON_L = 0.86;
const NEON_C = 0.17;
const CONIC_FROM_DEG = 210;
const HUE_STEPS = 360;

// A theme-NEUTRAL ground (C = 0), matching build-icon-comparison.mjs's
// NEUTRAL_GROUND exactly (same oklchToHex call, same L/C/H). D-0001-24: one
// shortcut serves every future theme, so the icon must carry no single
// theme's palette — this is why it is NOT Captain's Cabin's navy.
const NEUTRAL_GROUND = oklchToHex({ L: 0.19, C: 0, H: 0 });

function hexToRgbTriplet(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const NEUTRAL_GROUND_RGB = hexToRgbTriplet(NEUTRAL_GROUND);

// Precomputed once at module load (this is what the ESM conversion buys —
// the CJS version could only have built this lazily inside rasterise()
// itself, or paid the palette-engine cost on every call). One entry per
// integer hue degree; the earlier CSS-mockup version blended only 12
// discrete stops in sRGB, but this generator is asked to compute the exact
// OKLCH colour PER PIXEL instead, which a continuous per-degree LUT gives at
// negligible cost.
const HUE_LUT_RGB = Array.from({ length: HUE_STEPS }, (_, h) => hexToRgbTriplet(oklchToHex({ L: NEON_L, C: NEON_C, H: h })));

// The knot occupies 64% of the tile, centred — knotFill()'s default `scale`
// in build-icon-comparison.mjs.
const KNOT_SCALE = 0.64;

// ---------------------------------------------------------------------
// Codex install resolution — Get-AppxPackage, never a hardcoded
// WindowsApps path, because the Store rewrites the install directory on
// every update. Mirrors build-icon-comparison.mjs's own resolution and
// launcher/windows/launch.ps1's approach.
// ---------------------------------------------------------------------

function resolveCodexInstallLocation() {
  let stdout;
  try {
    stdout = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', "(Get-AppxPackage -Name 'OpenAI.Codex').InstallLocation"],
      { encoding: 'utf8' }
    ).trim();
  } catch (err) {
    throw new Error(
      `make-ico: failed to query Get-AppxPackage for OpenAI.Codex: ${err.message}`
    );
  }
  if (!stdout) {
    throw new Error(
      'make-ico: Codex Desktop (package OpenAI.Codex) is not installed for this user, so the ' +
        'approved icon artwork cannot be rasterised. Install Codex, or run this on a machine that has it.'
    );
  }
  return stdout;
}

/**
 * Resolve the path to Codex's white-on-transparent tile asset, whose alpha
 * channel is the knot silhouette this icon paints. Fails loudly, by name, if
 * Codex is not installed or the expected asset is missing.
 */
function resolveKnotAssetPath() {
  const install = resolveCodexInstallLocation();
  const assetPath = path.join(install, 'assets', 'Square44x44Logo.targetsize-256_altform-unplated.png');
  if (!fs.existsSync(assetPath)) {
    throw new Error(`make-ico: expected the Codex knot asset at "${assetPath}" but it does not exist`);
  }
  return assetPath;
}

/**
 * Decode Codex's knot tile asset and return its ALPHA channel as a flat
 * `Float64Array` of length `width*height` (one entry per pixel, 0-255).
 * Only the alpha channel is used — the RGB channels of a "white-on-
 * transparent" tile are not part of the approved artwork's fill.
 */
function loadKnotAlpha(assetPath) {
  const { width, height, rgba } = decodePng(fs.readFileSync(assetPath));
  const alpha = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = rgba[i * 4 + 3];
  }
  return { width, height, alpha };
}

/**
 * Box-filter downsample a `srcSize x srcSize` alpha channel to
 * `dstSize x dstSize`, averaging every source pixel each destination pixel
 * covers. Nearest-neighbour aliases the knot's thin strokes badly at 16px —
 * this is the whole reason the owner rejected the glow variants for being
 * mushy at small sizes, so the sampler must not reintroduce the same
 * failure through aliasing instead.
 */
function boxDownsampleAlpha(srcAlpha, srcSize, dstSize) {
  if (dstSize >= srcSize) {
    // No downsampling needed (e.g. the 256px frame, or a knot box exactly
    // matching the source) — still resample so callers get a `dstSize`
    // array, but a 1:1 (or upscaling) box degenerates to a direct copy.
    const out = new Float64Array(dstSize * dstSize);
    for (let y = 0; y < dstSize; y++) {
      const sy = Math.min(srcSize - 1, Math.floor((y * srcSize) / dstSize));
      for (let x = 0; x < dstSize; x++) {
        const sx = Math.min(srcSize - 1, Math.floor((x * srcSize) / dstSize));
        out[y * dstSize + x] = srcAlpha[sy * srcSize + sx];
      }
    }
    return out;
  }

  const scale = srcSize / dstSize;
  const out = new Float64Array(dstSize * dstSize);
  for (let oy = 0; oy < dstSize; oy++) {
    const y0 = Math.floor(oy * scale);
    const y1 = Math.max(y0 + 1, Math.min(srcSize, Math.floor((oy + 1) * scale)));
    for (let ox = 0; ox < dstSize; ox++) {
      const x0 = Math.floor(ox * scale);
      const x1 = Math.max(x0 + 1, Math.min(srcSize, Math.floor((ox + 1) * scale)));
      let sum = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          sum += srcAlpha[sy * srcSize + sx];
          count++;
        }
      }
      out[oy * dstSize + ox] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

// The real asset, decoded once at module load — this is exactly the cost
// the ESM conversion is meant to move out of rasterise() and off the
// per-call path, matching how HUE_LUT_RGB above is also built once.
const KNOT_ASSET_PATH = resolveKnotAssetPath();
const KNOT_SOURCE = loadKnotAlpha(KNOT_ASSET_PATH);

/**
 * Rasterise the approved R5 artwork into a `size x size` RGBA buffer:
 * Codex's knot silhouette, filled with a conic-gradient spectrum swept from
 * 210deg, centred at 64% of the tile, composited opaque over
 * NEUTRAL_GROUND.
 */
function rasterise(size) {
  const buffer = Buffer.alloc(size * size * 4);
  // Fill the whole tile with the neutral ground first — this is also what
  // makes every untouched pixel (including the far corners) exactly
  // NEUTRAL_GROUND, never an approximation of it.
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4] = NEUTRAL_GROUND_RGB[0];
    buffer[i * 4 + 1] = NEUTRAL_GROUND_RGB[1];
    buffer[i * 4 + 2] = NEUTRAL_GROUND_RGB[2];
    buffer[i * 4 + 3] = 255;
  }

  const knotSize = Math.max(1, Math.round(size * KNOT_SCALE));
  const offset = Math.floor((size - knotSize) / 2);
  const knotAlpha = boxDownsampleAlpha(KNOT_SOURCE.alpha, KNOT_SOURCE.width, knotSize);

  // Hue angle is measured about the TILE's centre (not the knot box's),
  // matching a CSS conic-gradient painted on the full tile behind a
  // centred, scaled-down mask — which is exactly what knotFill() does.
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;

  for (let ky = 0; ky < knotSize; ky++) {
    const y = ky + offset;
    if (y < 0 || y >= size) continue;
    for (let kx = 0; kx < knotSize; kx++) {
      const x = kx + offset;
      if (x < 0 || x >= size) continue;
      const a = knotAlpha[ky * knotSize + kx] / 255;
      if (a <= 0) continue;

      // CSS conic-gradient angle: 0deg points up (12 o'clock), increasing
      // CLOCKWISE. atan2(dx, -dy) gives exactly that convention (standard
      // math atan2 is counter-clockwise from the +x axis; swapping the
      // arguments and negating dy rotates and mirrors it into "clockwise
      // from up").
      const dx = x - cx;
      const dy = y - cy;
      let cssAngle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (cssAngle < 0) cssAngle += 360;

      // `from 210deg` shifts the gradient's own 0-position to CSS angle
      // 210deg, and the spectrum's hue at gradient position P is H = P*360
      // (SPECTRUM_STOPS steps H linearly with position) — so the hue at a
      // given CSS angle is simply that angle minus the 210deg offset.
      let hue = cssAngle - CONIC_FROM_DEG;
      hue = ((hue % 360) + 360) % 360;
      const [r, g, b] = HUE_LUT_RGB[Math.round(hue) % HUE_STEPS];

      const off = (y * size + x) * 4;
      buffer[off] = Math.round(buffer[off] * (1 - a) + r * a);
      buffer[off + 1] = Math.round(buffer[off + 1] * (1 - a) + g * a);
      buffer[off + 2] = Math.round(buffer[off + 2] * (1 - a) + b * a);
      buffer[off + 3] = 255;
    }
  }

  return buffer;
}

// ---------------------------------------------------------------------
// PNG encoder — the minimum needed for an 8-bit RGBA image: signature,
// IHDR, one IDAT (zlib-compressed, NOT raw deflate — PNG's IDAT is the
// zlib format, complete with its own header and Adler-32, which is exactly
// what `zlib.deflateSync` produces, unlike `deflateRawSync`), IEND.
// ---------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function writeUInt32Checked(value) {
  // No `>>> 0` mask (D-0001-23). Buffer.writeUInt32LE already throws a
  // RangeError above 0xFFFFFFFF or below 0 — the point is to never launder
  // an out-of-range value through a mask before it reaches that check.
  // Little-endian: this is the ICO container's own byte order (Windows'
  // native order), used below for ICONDIRENTRY's size/offset fields.
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

function writeUInt32BEChecked(value) {
  // Same range-checked contract as writeUInt32Checked above, but big-
  // endian ("network byte order") — the PNG spec requires EVERY chunk's
  // length and CRC field to be big-endian regardless of platform. Mixing
  // this up with the ICO container's little-endian fields is exactly the
  // kind of silent-looking byte-order bug this file's own header warns
  // about: a `writeUInt32LE` here would produce a structurally-sized
  // buffer that every PNG reader parses as a wildly wrong chunk length,
  // which is precisely what was caught by cross-checking this file's
  // output against Node's own `zlib.crc32` before shipping it.
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return buf;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuffer, data]);
  const crc = crc32(body);
  return Buffer.concat([writeUInt32BEChecked(data.length), body, writeUInt32BEChecked(crc)]);
}

/**
 * Encode an RGBA buffer (`width * height * 4` bytes, no filtering applied
 * yet) as a PNG. Every scanline is prefixed with filter type 0 ("None") —
 * the simplest valid choice, and adequate here since these images are not
 * being optimised for size.
 */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // colour type: RGBA
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  const idatData = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', idatData),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------
// ICO container — ICONDIR + one ICONDIRENTRY per image + the raw PNG
// bytes themselves as each image's data (the "PNG-compressed ICO frame"
// format Windows Vista+ reads directly; no BMP/DIB or AND-mask needed).
// ---------------------------------------------------------------------

function buildIco(images) {
  if (images.length === 0 || images.length > 0xffff) {
    throw new RangeError(`buildIco(images): ${images.length} images is out of ICONDIR's 16-bit count range`);
  }

  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type: 1 = icon
  dir.writeUInt16LE(images.length, 4);

  const entries = [];
  const dataChunks = [];
  // Offsets start right after ICONDIR + all ICONDIRENTRYs (16 bytes each).
  let offset = 6 + images.length * 16;

  for (const { size, png } of images) {
    if (size > 256) {
      throw new RangeError(`buildIco(images): icon size ${size} exceeds the ICO format's 256px maximum`);
    }
    if (png.length > 0xffffffff || offset > 0xffffffff) {
      // Genuinely unreachable for this artwork, but this is exactly
      // the boundary D-0001-23 requires checking rather than assuming.
      throw new RangeError('buildIco(images): entry size/offset exceeds the 32-bit field this format uses');
    }

    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size; // width; 0 means 256 by convention
    entry[1] = size === 256 ? 0 : size; // height
    entry[2] = 0; // colour count (0 = "no palette", true for our 32bpp images)
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.set(writeUInt32Checked(png.length), 8); // bytes in resource
    entry.set(writeUInt32Checked(offset), 12); // offset from file start

    entries.push(entry);
    dataChunks.push(png);
    offset += png.length;
  }

  return Buffer.concat([dir, ...entries, ...dataChunks]);
}

/**
 * Generate the approved-artwork `.ico` and write it to `outputPath`.
 * @param {string} [outputPath]
 * @returns {{ outputPath: string, bytes: number, sizes: number[] }}
 */
function makeIco(outputPath = DEFAULT_OUTPUT_PATH) {
  const images = ICON_SIZES.map((size) => ({ size, png: encodePng(size, size, rasterise(size)) }));
  const icoBuffer = buildIco(images);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, icoBuffer);
  return { outputPath, bytes: icoBuffer.length, sizes: ICON_SIZES.slice() };
}

export {
  makeIco,
  rasterise,
  encodePng,
  buildIco,
  writeUInt32Checked,
  DEFAULT_OUTPUT_PATH,
  ICON_SIZES,
  NEUTRAL_GROUND,
  NEON_L,
  NEON_C,
  CONIC_FROM_DEG,
  resolveCodexInstallLocation,
  resolveKnotAssetPath,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputPath = process.argv[2] || DEFAULT_OUTPUT_PATH;
  const result = makeIco(outputPath);
  console.log(`Wrote: ${result.outputPath} (${result.bytes} bytes, sizes ${result.sizes.join('/')})`);
}
