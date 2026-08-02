'use strict';

/**
 * D-0001-20 — .ccskin zip I/O is implemented in-repo on node:zlib; no
 * third-party dependency, ever.
 * -----------------------------------------------------------------------
 * This is the writer half of D-0001-20; `zip.js` is the reader. M1 shipped
 * read-only because there was nothing yet to pack; M2 is the `.ccskin`
 * packer, and a packer needs a writer that produces bytes `readZip` itself
 * accepts — so this module mirrors zip.js's structural knowledge (the same
 * three record shapes, the same signatures) rather than re-deriving it from
 * the zip spec independently.
 *
 * The load-bearing property this file exists to guarantee is
 * REPRODUCIBILITY: packing the same theme directory twice, on any OS, must
 * produce byte-identical output. That is what makes a `.ccskin` diffable,
 * cacheable, and verifiable (a build can assert "this archive's bytes
 * match what CI produced" instead of "an archive of some shape exists").
 * Ordinary zip writers do not promise this — they timestamp entries with
 * the wall clock and tag the archive with the producing OS — so getting it
 * requires pinning every field a writer is normally free to vary. See the
 * comments at each pinned field below for what and why.
 *
 * D-0001-23 — every varying field is pinned deliberately, and 32-bit size/offset fields are checked, never masked.
 */

const zlib = require('zlib');
const { ThemeLoadError } = require('./errors.js');
const { isSafeRelativePath } = require('./path-safety.js');
const { crc32, MAX_ZIP_ENTRIES } = require('./zip.js');

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const LOCAL_FILE_HEADER_SIZE = 30;
const CENTRAL_DIR_HEADER_SIZE = 46;
const EOCD_SIZE = 22;

const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

const VERSION_NEEDED_TO_EXTRACT = 20;

// "Version made by": low byte is the spec version (20, same as "needed to
// extract" above); high byte is the source filesystem. 0 = MS-DOS. Paired
// below with external file attributes = 0, this is what makes the archive
// OS-independent — see the comment on EXTERNAL_FILE_ATTRIBUTES for why that
// pairing specifically, rather than "made by" alone, is what matters.
const VERSION_MADE_BY = (0 << 8) | VERSION_NEEDED_TO_EXTRACT;

// The upper 16 bits of a central-directory entry's external file attributes
// mean two different things depending on who made the archive (see zip.js's
// own comment on this exact field, read the other direction). On a DOS-made
// entry they are DOS file attributes; on a Unix-made entry they are a
// `st_mode`. A writer that sets VERSION_MADE_BY to DOS but then writes a
// Unix st_mode into external attributes anyway produces an archive that
// misclassifies itself — e.g. mode 0755 is 0x81ED, and 0x81ED & 0x10 (the
// DOS "directory" bit) is non-zero, so a DOS-faithful reader would treat an
// ordinary executable file as a directory and skip it. Writing a fixed 0
// here, matched with the DOS "made by" byte above, means both halves of the
// field agree with each other and produce the same bytes regardless of
// which OS ran the packer.
const EXTERNAL_FILE_ATTRIBUTES = 0x00000000;

// DOS date/time epoch: 1980-01-01 00:00:00, the earliest date the DOS
// date/time format can represent (it stores years as an offset from 1980).
// Pinning every entry's mtime to this exact value — rather than to
// `Date.now()`, as a normal zip writer would — is what makes the archive a
// pure function of its entries: two runs of the packer, on two machines, at
// two different times, must produce identical bytes.
//
// DOS time (16 bits): bits 15-11 hour, bits 10-5 minute, bits 4-0 second/2.
//   0 => 00:00:00.
// DOS date (16 bits): bits 15-9 year-1980, bits 8-5 month (1-12), bits 4-0
//   day (1-31).
//   (0 << 9) | (1 << 5) | 1 = 0x0021 => year 1980, month 1, day 1.
const DOS_EPOCH_TIME = 0x0000;
const DOS_EPOCH_DATE = 0x0021;

// The general-purpose flag bit that marks a name as UTF-8 rather than the
// original zip spec's CP437. Only pure-ASCII names are common across every
// unzip tool without it; setting it unconditionally would make trivial
// ASCII-named archives byte-different from what most other writers produce
// for the exact same names, which is its own small reproducibility loss.
// So: set it only when the name actually contains a byte a plain ASCII
// name could not.
const UTF8_NAME_FLAG = 0x0800;

// The largest value a 32-bit zip size/offset field can hold. Beyond it the
// format requires Zip64, which zip.js REFUSES to read by name rather than
// risk misreading a truncated value — so the writer must refuse to reach it
// rather than emit an archive our own reader is guaranteed to reject.
// Checked explicitly, and NOT masked with `>>> 0`: masking a 33-bit offset
// down to 32 bits would produce a structurally valid archive pointing at
// the wrong bytes, which is the silent-corruption failure this project's
// "fail loudly" rule exists to prevent.
const MAX_UINT32 = 0xffffffff;

function hasNonAsciiByte(nameBuffer) {
  for (let i = 0; i < nameBuffer.length; i++) {
    if (nameBuffer[i] > 0x7f) return true;
  }
  return false;
}

function invalid(message) {
  throw new ThemeLoadError('PACKAGE_INVALID', message);
}

/**
 * Validate the caller's `entries` array before a single byte is written.
 * Every failure here names the packer's own input, because by the time an
 * archive this writer produced fails in `readZip` the message can only name
 * the symptom, not the cause.
 */
function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    invalid('writeZip(entries): entries must be a non-empty array');
  }
  if (entries.length > MAX_ZIP_ENTRIES) {
    invalid(`writeZip(entries): ${entries.length} entries exceeds the ${MAX_ZIP_ENTRIES}-entry cap`);
  }

  const seenNames = new Set();
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      throw new TypeError('writeZip(entries): every entry must be an object with { name, content }');
    }
    const { name, content } = entry;
    if (!(typeof content === 'string' || Buffer.isBuffer(content))) {
      throw new TypeError(`writeZip(entries): entry "${name}" content must be a Buffer or string`);
    }
    if (!isSafeRelativePath(name)) {
      invalid(`writeZip(entries): entry name "${name}" is not a safe relative path (absolute path or ".." segment)`);
    }
    if (name.endsWith('/')) {
      invalid(`writeZip(entries): entry name "${name}" ends with "/" — this writer emits regular files only, no directory entries`);
    }
    if (seenNames.has(name)) {
      // readZip REFUSES duplicate names (zip.js, "Duplicate names are
      // REFUSED"). Emitting one here would hand our own reader an archive
      // it is guaranteed to reject, so catch it at the source where the
      // message can name the packer's input instead of a mystery archive.
      invalid(`writeZip(entries): entry name "${name}" appears more than once`);
    }
    seenNames.add(name);
  }
}

/**
 * Compress one entry's content, choosing stored vs. deflated by whichever
 * is actually smaller — a comparison of two lengths, so still a pure
 * function of the input bytes and therefore still reproducible.
 */
function compressEntry(contentBuffer) {
  // Level pinned to 9 (max compression) rather than left at zlib's default:
  // the default is a policy zlib itself could change between Node versions,
  // and this project's reproducibility promise is across MACHINES, not just
  // repeated runs on one — an implicit default is exactly the kind of value
  // that is stable today and silently different after a Node upgrade.
  // memLevel and strategy are pinned for exactly the same reason as level,
  // and pinning only one of the three would be an inconsistency rather than
  // a decision: all three change the emitted bytes, and all three otherwise
  // come from a Node/zlib default this repo does not control.
  const deflated = zlib.deflateRawSync(contentBuffer, {
    level: 9,
    memLevel: 8,
    strategy: zlib.constants.Z_DEFAULT_STRATEGY,
  });
  if (deflated.length < contentBuffer.length) {
    return { method: COMPRESSION_DEFLATE, data: deflated };
  }
  return { method: COMPRESSION_STORED, data: contentBuffer };
}

/**
 * Build a `.ccskin` (zip) archive from an ordered list of
 * `{ name, content }` entries. The caller owns ordering — this function
 * never sorts — because entry order is itself part of what makes the output
 * reproducible: two callers assembling the same entries in a different
 * order would otherwise get different bytes for the same theme.
 *
 * @param {{ name: string, content: Buffer|string }[]} entries
 * @returns {Buffer}
 */
function writeZip(entries) {
  validateEntries(entries);

  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const { name, content } of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const crc = crc32(contentBuffer);
    const { method, data } = compressEntry(contentBuffer);

    const flags = hasNonAsciiByte(nameBuffer) ? UTF8_NAME_FLAG : 0;

    if (contentBuffer.length > MAX_UINT32 || data.length > MAX_UINT32 || offset > MAX_UINT32) {
      invalid(
        `writeZip(entries): entry "${name}" would push the archive past the 32-bit size/offset limit, ` +
          'which requires Zip64 — a format zip.js deliberately refuses to read'
      );
    }

    const localHeader = Buffer.alloc(LOCAL_FILE_HEADER_SIZE);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(VERSION_NEEDED_TO_EXTRACT, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(DOS_EPOCH_TIME, 10);
    localHeader.writeUInt16LE(DOS_EPOCH_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // no extra field

    localChunks.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(CENTRAL_DIR_HEADER_SIZE);
    centralHeader.writeUInt32LE(CENTRAL_DIR_SIGNATURE, 0);
    centralHeader.writeUInt16LE(VERSION_MADE_BY, 4);
    centralHeader.writeUInt16LE(VERSION_NEEDED_TO_EXTRACT, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(DOS_EPOCH_TIME, 12);
    centralHeader.writeUInt16LE(DOS_EPOCH_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // no extra field
    centralHeader.writeUInt16LE(0, 32); // no comment
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(EXTERNAL_FILE_ATTRIBUTES, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const chunk of centralChunks) centralDirSize += chunk.length;

  const eocd = Buffer.alloc(EOCD_SIZE);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

module.exports = { writeZip, DOS_EPOCH_DATE, DOS_EPOCH_TIME };
