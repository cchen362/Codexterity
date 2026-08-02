'use strict';

/**
 * D-0001-20 — .ccskin zip I/O is implemented in-repo on node:zlib; no
 * third-party dependency, ever.
 * -----------------------------------------------------------------------
 * This module is loaded into Codex's OWN Electron main process (D-0001-1).
 * A dependency here is third-party code shipped into someone else's
 * application process, inside a project whose central promise (D-0001-3) is
 * that it is non-destructive BY CONSTRUCTION. Keeping the audited surface
 * small is the point, not a preference.
 *
 * A zip of stored/deflated entries is directly readable with Node's built-in
 * `zlib.inflateRawSync` — no zip library needed for the decompression half.
 * Writing the container parser ourselves is what lets us enforce the
 * defences a general-purpose unzip library does not know this project
 * needs: rejecting path traversal and absolute entry names, rejecting
 * entries that are not plain files, capping entry count, and enforcing the
 * 32 MiB size cap (D-0001-4) DURING decompression rather than after it —
 * zip-bomb resistance a library's "extract everything, then check" API
 * cannot give us.
 *
 * Read-only. There is no .ccskin WRITER in M1 (that lands in M2).
 *
 * Structural approach: parse the End Of Central Directory record, then the
 * central directory it points to. The CENTRAL DIRECTORY IS AUTHORITATIVE for
 * entry sizes and CRCs — local file headers are only consulted to locate
 * where an entry's compressed data begins, never trusted for sizes, per
 * this milestone's spec.
 */

const zlib = require('zlib');
const { ThemeLoadError } = require('./errors.js');
const { isSafeRelativePath } = require('./path-safety.js');

// A reasonable, commented cap on the number of central-directory entries a
// package may declare, independent of the byte-size cap: a package of a
// million tiny (or zero-byte) entries should fail fast rather than spend
// time walking a huge central directory.
const MAX_ZIP_ENTRIES = 4096;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const CENTRAL_DIR_HEADER_SIZE = 46;
const LOCAL_FILE_HEADER_SIZE = 30;

const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

// ---------------------------------------------------------------------
// CRC-32 (table-driven, the standard zip/PNG polynomial). Node has no
// built-in CRC-32, so this is the ~15 lines D-0001-20 accounts for.
// ---------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fail(message) {
  throw new ThemeLoadError('ZIP_MALFORMED', message);
}

function failSize(message) {
  throw new ThemeLoadError('SIZE_EXCEEDED', message);
}

/**
 * Find the End Of Central Directory record. It sits at the very end of the
 * file, optionally followed by a variable-length comment (0-65535 bytes),
 * so we scan backward from the end for its signature rather than assuming
 * a fixed offset.
 */
function findEndOfCentralDirectory(buf) {
  const maxCommentLength = 0xffff;
  const searchStart = Math.max(0, buf.length - EOCD_MIN_SIZE - maxCommentLength);
  for (let i = buf.length - EOCD_MIN_SIZE; i >= searchStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  fail('not a valid zip file: End Of Central Directory record not found');
}

/**
 * Parse a .ccskin (zip) buffer into a Map<entryName, Buffer> of file
 * contents. Directory entries are silently skipped (not extracted, not an
 * error). `maxTotalBytes` bounds the cumulative UNCOMPRESSED size across all
 * entries combined with `bytesConsumedSoFar` (the caller may already have
 * charged the compressed .ccskin's own on-disk size against the same cap).
 */
function readZip(buf, options = {}) {
  const maxTotalBytes = options.maxTotalBytes;
  if (typeof maxTotalBytes !== 'number') {
    throw new TypeError('readZip requires options.maxTotalBytes');
  }

  const eocdOffset = findEndOfCentralDirectory(buf);
  const diskEntryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  // Zip64 sentinels: any of these fields pinned to 0xFFFF/0xFFFFFFFF means
  // the real value lives in a Zip64 EOCD locator/record this parser does
  // not implement. Reject explicitly rather than silently misreading a
  // truncated 32-bit value — nothing legitimate for this project approaches
  // the 4 GiB where Zip64 becomes necessary (D-0001-4 caps packages at 32
  // MiB), so refusing it is a correctness guard, not a real limitation.
  if (diskEntryCount === 0xffff || centralDirSize === 0xffffffff || centralDirOffset === 0xffffffff) {
    fail('Zip64 archives are not supported (D-0001-4 caps packages at 32 MiB; nothing legitimate needs Zip64)');
  }

  if (diskEntryCount > MAX_ZIP_ENTRIES) {
    failSize(`zip declares ${diskEntryCount} entries, exceeding the ${MAX_ZIP_ENTRIES}-entry cap`);
  }

  const entries = [];
  let pos = centralDirOffset;
  for (let i = 0; i < diskEntryCount; i++) {
    if (pos + CENTRAL_DIR_HEADER_SIZE > buf.length) {
      fail('central directory is truncated or corrupt');
    }
    const signature = buf.readUInt32LE(pos);
    if (signature !== CENTRAL_DIR_SIGNATURE) {
      fail(`central directory entry ${i} has a bad signature (corrupt or truncated archive)`);
    }
    // High byte of "version made by" identifies the source filesystem; 3 = Unix,
    // and only a Unix-made zip stores a st_mode in the upper half of the external
    // attributes. Needed to read the symlink bit correctly below.
    const madeByUnix = buf.readUInt8(pos + 5) === 3;
    const compressionMethod = buf.readUInt16LE(pos + 10);
    const crc32Expected = buf.readUInt32LE(pos + 16);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const fileNameLength = buf.readUInt16LE(pos + 28);
    const extraLength = buf.readUInt16LE(pos + 30);
    const commentLength = buf.readUInt16LE(pos + 32);
    const externalAttrs = buf.readUInt32LE(pos + 38);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      fail('Zip64 archives are not supported (per-entry 0xFFFFFFFF size sentinel)');
    }

    const nameStart = pos + CENTRAL_DIR_HEADER_SIZE;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > buf.length) {
      fail(`central directory entry ${i} name field runs past end of file`);
    }
    const name = buf.toString('utf8', nameStart, nameEnd);

    entries.push({
      name,
      compressionMethod,
      crc32Expected,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      // Directory-ness, read differently depending on who made the archive —
      // because the upper 16 bits of the external attributes mean two entirely
      // different things.
      //
      // On a DOS/NTFS-made zip they are DOS file attributes, where 0x10 is the
      // directory bit. On a UNIX-made zip they are a `st_mode`, where 0x10 is
      // simply the "group execute" permission bit. Testing 0x10 unconditionally
      // therefore misreads any Unix zip entry whose mode has that bit set —
      // mode 0755, the ordinary mode for an executable, is 0x81ED, and
      // 0x81ED & 0x10 is non-zero, so the entry would be classified a directory
      // and SILENTLY SKIPPED. That failure has no error and no symptom until a
      // later step reports a manifest-declared file mysteriously absent, and it
      // would land the first time a `.ccskin` was built on macOS or Linux
      // rather than here.
      //
      // So: S_IFDIR for Unix, the DOS bit for DOS, and the trailing '/' — the
      // one convention every writer shares — for both.
      isDirectory:
        name.endsWith('/') ||
        (madeByUnix
          ? ((externalAttrs >>> 16) & 0xf000) === 0x4000
          : ((externalAttrs >>> 16) & 0x10) !== 0),
      // D-0001-3 — a zip SYMLINK entry (Unix st_mode S_IFLNK, 0xA000) is
      // refused rather than read. Nothing in M1 writes entries to disk, so this
      // is defence for the milestones that will: the moment M3's `apply`
      // materialises a package anywhere, an unrefused symlink entry becomes a
      // write-through-a-link primitive pointed wherever its target string says.
      // Refusing it at the parser means no later consumer has to remember to.
      isSymlink: madeByUnix && ((externalAttrs >>> 16) & 0xf000) === 0xa000,
    });

    pos = nameEnd + extraLength + commentLength;
  }

  const files = new Map();
  let totalUncompressed = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    if (entry.isSymlink) {
      fail(`zip entry "${entry.name}" is a symbolic link; Codexterity packages contain only regular files (D-0001-3)`);
    }

    if (!isSafeRelativePath(entry.name)) {
      fail(`zip entry "${entry.name}" is not a safe relative path (absolute path or ".." segment)`);
    }

    // Duplicate names are REFUSED, not last-one-wins. A zip may legally carry
    // two entries with the same name, and every tool that reads one resolves it
    // differently — so an archive with two `manifest.json` entries can show the
    // validator a clean manifest and a later consumer a different one. There is
    // no legitimate reason for a theme package to contain the same path twice,
    // so ambiguity is rejected rather than resolved by a rule someone else's
    // tool might not share.
    if (files.has(entry.name)) {
      fail(`zip entry "${entry.name}" appears more than once; a theme package must not declare the same path twice`);
    }

    if (entry.compressionMethod !== COMPRESSION_STORED && entry.compressionMethod !== COMPRESSION_DEFLATE) {
      fail(`zip entry "${entry.name}" uses unsupported compression method ${entry.compressionMethod} (only stored=0 and deflate=8 are supported)`);
    }

    // Locate the actual compressed-data offset via the LOCAL header — but
    // only to skip its (possibly different) name/extra field lengths. Its
    // size fields are never read; the central directory already gave us
    // the authoritative sizes.
    const lh = entry.localHeaderOffset;
    if (lh + LOCAL_FILE_HEADER_SIZE > buf.length || buf.readUInt32LE(lh) !== LOCAL_FILE_HEADER_SIGNATURE) {
      fail(`zip entry "${entry.name}": local file header is missing or corrupt`);
    }
    const localNameLength = buf.readUInt16LE(lh + 26);
    const localExtraLength = buf.readUInt16LE(lh + 28);
    const dataStart = lh + LOCAL_FILE_HEADER_SIZE + localNameLength + localExtraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > buf.length) {
      fail(`zip entry "${entry.name}": compressed data runs past end of file`);
    }
    const compressedData = buf.subarray(dataStart, dataEnd);

    const remainingBudget = maxTotalBytes - totalUncompressed;
    if (remainingBudget <= 0) {
      failSize(`zip contents exceed the ${maxTotalBytes}-byte package cap while decompressing "${entry.name}"`);
    }

    let content;
    if (entry.compressionMethod === COMPRESSION_STORED) {
      if (compressedData.length > remainingBudget) {
        failSize(`zip contents exceed the ${maxTotalBytes}-byte package cap while reading "${entry.name}"`);
      }
      content = Buffer.from(compressedData);
    } else {
      try {
        // maxOutputLength makes zlib itself abort ONCE its expanding output
        // buffer would cross this size, DURING inflation — not merely a
        // check performed on the fully-materialized result. This is what
        // gives zip-bomb resistance: a deflate stream that would expand to
        // gigabytes never gets the chance to finish allocating.
        content = zlib.inflateRawSync(compressedData, { maxOutputLength: remainingBudget });
      } catch (err) {
        // Node's zlib enforces maxOutputLength by throwing this specific
        // RangeError once the growing output buffer would exceed it —
        // exactly the "checked as you inflate" behaviour D-0001-4 requires.
        if (err && err.code === 'ERR_BUFFER_TOO_LARGE') {
          failSize(`zip entry "${entry.name}" exceeds the ${maxTotalBytes}-byte package cap when decompressed`);
        }
        fail(`zip entry "${entry.name}" failed to decompress: ${err.message}`);
      }
    }

    if (content.length !== entry.uncompressedSize) {
      fail(
        `zip entry "${entry.name}": decompressed size ${content.length} does not match the size ` +
          `${entry.uncompressedSize} declared in the central directory`
      );
    }

    const actualCrc = crc32(content);
    if (actualCrc !== entry.crc32Expected) {
      fail(
        `zip entry "${entry.name}": CRC-32 mismatch (expected ${entry.crc32Expected.toString(16)}, ` +
          `got ${actualCrc.toString(16)}) — the archive is corrupt`
      );
    }

    totalUncompressed += content.length;
    files.set(entry.name, content);
  }

  return files;
}

module.exports = { readZip, crc32, MAX_ZIP_ENTRIES };
