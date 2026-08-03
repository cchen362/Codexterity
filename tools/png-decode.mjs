/**
 * Codexterity — minimal PNG decoder (Phase 4 M4)
 * -----------------------------------------------------------
 * Zero-dependency (D-0001-20 binds the whole repo, not just injector/theme-
 * loader/): `node:zlib` only, no image library. Written to decode exactly
 * ONE real input — Codex's own `Square44x44Logo.targetsize-256_altform-
 * unplated.png` tile asset, verified by hand against this file:
 * 256x256, 8-bit depth, colour type 6 (RGBA), non-interlaced, filter
 * method 0, split across TWO `IDAT` chunks (8192 + 982 bytes).
 *
 * Every other combination is REJECTED BY NAME rather than guessed at —
 * this is not a general-purpose PNG decoder, and pretending otherwise by
 * silently reading whatever bytes show up is exactly the kind of guess
 * docs/ENGINEERING.md's "fail loudly" rule forbids.
 *
 * The two correctness traps a partial decoder usually falls into, both
 * handled explicitly here:
 *   1. Concatenate ALL `IDAT` chunks before inflating. The real asset has
 *      two; a decoder that inflates only the first produces a silently
 *      truncated image (the zlib stream simply ends early with no error).
 *   2. The Paeth predictor (filter type 4) is the one PNG filter that is
 *      usually implemented wrong. It is not "average and round" — it picks
 *      the raw neighbour whose value is closest to `a + b - c`.
 */

import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const COLOR_TYPE_RGBA = 6;
const BIT_DEPTH_8 = 8;
const BYTES_PER_PIXEL_RGBA8 = 4;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function parseIhdr(data) {
  if (data.length !== 13) {
    throw new Error(`png-decode: IHDR chunk must be 13 bytes, got ${data.length}`);
  }
  return {
    width: data.readUInt32BE(0),
    height: data.readUInt32BE(4),
    bitDepth: data.readUInt8(8),
    colorType: data.readUInt8(9),
    compressionMethod: data.readUInt8(10),
    filterMethod: data.readUInt8(11),
    interlaceMethod: data.readUInt8(12),
  };
}

/**
 * Decode an 8-bit, colour-type-6 (RGBA), non-interlaced, filter-method-0 PNG
 * into `{ width, height, rgba }`, where `rgba` is a `width*height*4` Buffer.
 * Anything outside that exact shape throws by name rather than being
 * approximated.
 */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('png-decode: not a PNG file (bad 8-byte signature)');
  }

  let ihdr = null;
  const idatChunks = [];
  let pos = 8;
  let sawIend = false;

  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const dataStart = pos + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > buf.length) {
      throw new Error(`png-decode: chunk "${type}" runs past end of file`);
    }
    const data = buf.subarray(dataStart, dataEnd);
    const expectedCrc = buf.readUInt32BE(dataEnd);
    const actualCrc = zlib.crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    if (actualCrc !== expectedCrc) {
      throw new Error(`png-decode: chunk "${type}" fails its CRC-32 check (corrupt file)`);
    }

    if (type === 'IHDR') {
      ihdr = parseIhdr(data);
    } else if (type === 'IDAT') {
      // Concatenate every IDAT chunk before inflating — one zlib stream can
      // legally span several chunks, and the real Codex asset does.
      idatChunks.push(data);
    } else if (type === 'IEND') {
      sawIend = true;
      pos = crcEnd;
      break;
    }
    pos = crcEnd;
  }

  if (!ihdr) {
    throw new Error('png-decode: file has no IHDR chunk');
  }
  if (!sawIend) {
    throw new Error('png-decode: file never reached an IEND chunk');
  }
  if (idatChunks.length === 0) {
    throw new Error('png-decode: file has no IDAT chunks');
  }
  if (ihdr.bitDepth !== BIT_DEPTH_8) {
    throw new Error(`png-decode: unsupported bit depth ${ihdr.bitDepth} (only 8-bit is supported)`);
  }
  if (ihdr.colorType !== COLOR_TYPE_RGBA) {
    throw new Error(`png-decode: unsupported colour type ${ihdr.colorType} (only colour type 6 / RGBA is supported)`);
  }
  if (ihdr.compressionMethod !== 0) {
    throw new Error(`png-decode: unsupported compression method ${ihdr.compressionMethod} (only method 0 / deflate is supported)`);
  }
  if (ihdr.filterMethod !== 0) {
    throw new Error(`png-decode: unsupported filter method ${ihdr.filterMethod} (only filter method 0 is supported)`);
  }
  if (ihdr.interlaceMethod !== 0) {
    throw new Error(`png-decode: unsupported interlace method ${ihdr.interlaceMethod} (only non-interlaced is supported)`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));

  const { width, height } = ihdr;
  const stride = width * BYTES_PER_PIXEL_RGBA8;
  const expectedRawLength = (stride + 1) * height;
  if (raw.length !== expectedRawLength) {
    throw new Error(
      `png-decode: decompressed size ${raw.length} does not match the expected ${expectedRawLength} ` +
        `for a ${width}x${height} 8-bit RGBA image (corrupt or truncated file)`
    );
  }

  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const srcStart = y * (stride + 1) + 1;
    const rowStart = y * stride;
    const prevRowStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[srcStart + x];
      const a = x >= BYTES_PER_PIXEL_RGBA8 ? rgba[rowStart + x - BYTES_PER_PIXEL_RGBA8] : 0;
      const b = y > 0 ? rgba[prevRowStart + x] : 0;
      const c = (x >= BYTES_PER_PIXEL_RGBA8 && y > 0) ? rgba[prevRowStart + x - BYTES_PER_PIXEL_RGBA8] : 0;
      let value;
      switch (filterType) {
        case 0: // None
          value = rawByte;
          break;
        case 1: // Sub
          value = (rawByte + a) & 0xff;
          break;
        case 2: // Up
          value = (rawByte + b) & 0xff;
          break;
        case 3: // Average
          value = (rawByte + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4: // Paeth
          value = (rawByte + paeth(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`png-decode: row ${y} declares unsupported filter type ${filterType}`);
      }
      rgba[rowStart + x] = value;
    }
  }

  return { width, height, rgba };
}
