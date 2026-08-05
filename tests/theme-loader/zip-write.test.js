'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const { writeZip, DOS_EPOCH_DATE, DOS_EPOCH_TIME } = require(
  path.join('..', '..', 'injector', 'theme-loader', 'zip-write.js')
);
const { readZip, MAX_ZIP_ENTRIES } = require(path.join('..', '..', 'injector', 'theme-loader', 'zip.js'));
const { ThemeLoadError } = require(path.join('..', '..', 'injector', 'theme-loader', 'errors.js'));

const CAP = 33554432;

// --- field offsets, mirroring the constants in zip-write.js itself (not
// imported — the point is to check the emitted bytes independently of the
// module's own arithmetic) ---
const LOCAL_FILE_HEADER_SIZE = 30;
const CENTRAL_DIR_HEADER_SIZE = 46;

/**
 * Walk the central directory of a buffer writeZip() produced and return one
 * record per entry, in file order, with the fields the reproducibility and
 * OS-independence tests need to inspect directly (rather than through
 * readZip(), which discards them once a file round-trips cleanly).
 */
function readCentralDirectory(buf) {
  // EOCD is the last 22 bytes for an archive with no comment, which is all
  // this writer ever produces.
  const eocdOffset = buf.length - 22;
  assert.equal(buf.readUInt32LE(eocdOffset), 0x06054b50);
  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  const records = [];
  let pos = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    const versionMadeBy = buf.readUInt16LE(pos + 4);
    const compressionMethod = buf.readUInt16LE(pos + 10);
    const modTime = buf.readUInt16LE(pos + 12);
    const modDate = buf.readUInt16LE(pos + 14);
    const fileNameLength = buf.readUInt16LE(pos + 28);
    const externalAttrs = buf.readUInt32LE(pos + 38);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + CENTRAL_DIR_HEADER_SIZE, pos + CENTRAL_DIR_HEADER_SIZE + fileNameLength);
    records.push({
      name,
      versionMadeBy,
      compressionMethod,
      modTime,
      modDate,
      externalAttrs,
      localHeaderOffset,
    });
    pos += CENTRAL_DIR_HEADER_SIZE + fileNameLength;
  }
  return records;
}

test('writeZip() output round-trips through readZip() for a single entry', () => {
  const zip = writeZip([{ name: 'manifest.json', content: '{"id":"t"}' }]);
  const { files } = readZip(zip, { maxTotalBytes: CAP });
  assert.equal(files.size, 1);
  assert.equal(files.get('manifest.json').toString('utf8'), '{"id":"t"}');
});

test('writeZip() output round-trips through readZip() for multiple entries', () => {
  const zip = writeZip([
    { name: 'manifest.json', content: '{"id":"t"}' },
    { name: 'theme.css', content: '.a { color: red; }'.repeat(50) },
    { name: 'assets/fonts/x.woff2', content: Buffer.from([1, 2, 3, 4, 5]) },
  ]);
  const { files } = readZip(zip, { maxTotalBytes: CAP });
  assert.equal(files.size, 3);
  assert.equal(files.get('manifest.json').toString('utf8'), '{"id":"t"}');
  assert.equal(files.get('theme.css').toString('utf8'), '.a { color: red; }'.repeat(50));
  assert.ok(files.get('assets/fonts/x.woff2').equals(Buffer.from([1, 2, 3, 4, 5])));
});

// Guards against any accidental string coercion along the write path (e.g.
// `content.toString()` somewhere before the buffer reaches zlib) — a Buffer
// containing every byte value, including ones that are not valid UTF-8 on
// their own, would be silently mangled by such a coercion but pass any test
// built only from ASCII text.
test('binary content survives a full write/read round-trip byte-for-byte', () => {
  const allBytes = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) allBytes[i] = i;
  const binary = Buffer.concat([allBytes, allBytes, allBytes]);

  const zip = writeZip([{ name: 'assets/binary.bin', content: binary }]);
  const { files } = readZip(zip, { maxTotalBytes: CAP });
  assert.ok(files.get('assets/binary.bin').equals(binary));
});

// A stored-vs-deflate choice made by comparing two lengths must still
// produce an archive readZip() accepts on the *stored* path specifically —
// that is a different branch in readZip() than the deflate path every other
// test here exercises, so it needs its own coverage rather than relying on
// the round-trip tests above to happen to hit it.
test('incompressible content falls back to STORED and readZip() accepts it on that path', () => {
  const random = crypto.randomBytes(4096); // deflate cannot shrink random bytes
  const zip = writeZip([{ name: 'assets/random.bin', content: random }]);

  const { files } = readZip(zip, { maxTotalBytes: CAP });
  assert.ok(files.get('assets/random.bin').equals(random));

  const [record] = readCentralDirectory(zip);
  assert.equal(record.compressionMethod, 0); // COMPRESSION_STORED
});

// The load-bearing property this module exists to guarantee. A "packed
// twice is identical" check alone would still pass a writer that stamps
// Date.now() with 1-second resolution, as long as both packs land in the
// same wall-clock second — so the DOS time/date fields are asserted
// directly against the exported epoch constants, which is what actually
// proves no wall-clock time reached the bytes.
test('writeZip() is reproducible: identical input produces byte-identical output', () => {
  const entries = [
    { name: 'manifest.json', content: '{"id":"t"}' },
    { name: 'theme.css', content: '.a { color: red; }'.repeat(20) },
  ];
  const first = writeZip(entries);
  const second = writeZip(entries);
  assert.ok(first.equals(second));

  assert.equal(DOS_EPOCH_TIME, 0x0000);
  assert.equal(DOS_EPOCH_DATE, 0x0021);

  for (const record of readCentralDirectory(first)) {
    assert.equal(record.modTime, DOS_EPOCH_TIME);
    assert.equal(record.modDate, DOS_EPOCH_DATE);
  }
  // Local headers carry the same fields at fixed offsets 10 (time) and 12
  // (date); check the first entry's local header directly rather than only
  // the central directory's copy, since the two are written independently.
  assert.equal(first.readUInt16LE(10), DOS_EPOCH_TIME);
  assert.equal(first.readUInt16LE(12), DOS_EPOCH_DATE);
});

test('entry order is preserved and is the caller’s to set', () => {
  const a = { name: 'a.txt', content: 'aaa' };
  const b = { name: 'b.txt', content: 'bbb' };

  const forward = writeZip([a, b]);
  const backward = writeZip([b, a]);

  assert.equal(forward.equals(backward), false);

  const { files: forwardFiles } = readZip(forward, { maxTotalBytes: CAP });
  const { files: backwardFiles } = readZip(backward, { maxTotalBytes: CAP });
  assert.equal(forwardFiles.get('a.txt').toString('utf8'), 'aaa');
  assert.equal(forwardFiles.get('b.txt').toString('utf8'), 'bbb');
  assert.equal(backwardFiles.get('a.txt').toString('utf8'), 'aaa');
  assert.equal(backwardFiles.get('b.txt').toString('utf8'), 'bbb');
});

// D-0001-20's documented landmine: a Unix st_mode (e.g. 0755 = 0x81ED)
// written into external attributes sets the bit a DOS-faithful reader tests
// for "directory" (0x10), silently dropping the entry. Pinning "version made
// by" to MS-DOS (high byte 0) and external attributes to 0 together is what
// makes the archive's own two halves agree with each other regardless of
// which OS ran the packer.
test('version made by and external attributes are OS-independent (DOS/zero), not the producing OS’s', () => {
  const zip = writeZip([{ name: 'theme.css', content: 'a{color:red}' }]);
  const [record] = readCentralDirectory(zip);
  assert.equal(record.versionMadeBy >>> 8, 0); // high byte: 0 = MS-DOS
  assert.equal(record.externalAttrs, 0x00000000);
});

test('writeZip() rejects an empty entries array', () => {
  assert.throws(() => writeZip([]), (err) => {
    assert.ok(err instanceof ThemeLoadError);
    assert.equal(err.code, 'PACKAGE_INVALID');
    return true;
  });
});

test('writeZip() rejects a ".." traversal entry name', () => {
  assert.throws(() => writeZip([{ name: '../evil.txt', content: 'x' }]), (err) => {
    assert.ok(err instanceof ThemeLoadError);
    assert.equal(err.code, 'PACKAGE_INVALID');
    return true;
  });
});

test('writeZip() rejects an absolute entry name', () => {
  assert.throws(() => writeZip([{ name: '/etc/passwd', content: 'x' }]), (err) => {
    assert.ok(err instanceof ThemeLoadError);
    assert.equal(err.code, 'PACKAGE_INVALID');
    return true;
  });
});

test('writeZip() rejects a backslash-containing entry name', () => {
  assert.throws(() => writeZip([{ name: 'assets\\evil.txt', content: 'x' }]), (err) => {
    assert.ok(err instanceof ThemeLoadError);
    assert.equal(err.code, 'PACKAGE_INVALID');
    return true;
  });
});

test('writeZip() rejects an entry name ending in "/"', () => {
  assert.throws(() => writeZip([{ name: 'assets/', content: '' }]), (err) => {
    assert.ok(err instanceof ThemeLoadError);
    assert.equal(err.code, 'PACKAGE_INVALID');
    return true;
  });
});

test('writeZip() rejects a duplicate entry name', () => {
  assert.throws(
    () =>
      writeZip([
        { name: 'manifest.json', content: '{"a":1}' },
        { name: 'manifest.json', content: '{"b":2}' },
      ]),
    (err) => {
      assert.ok(err instanceof ThemeLoadError);
      assert.equal(err.code, 'PACKAGE_INVALID');
      return true;
    }
  );
});

test('writeZip() rejects more than MAX_ZIP_ENTRIES entries', () => {
  const entries = [];
  for (let i = 0; i < MAX_ZIP_ENTRIES + 1; i++) {
    entries.push({ name: `f${i}.txt`, content: 'x' });
  }
  assert.throws(() => writeZip(entries), (err) => {
    assert.ok(err instanceof ThemeLoadError);
    assert.equal(err.code, 'PACKAGE_INVALID');
    return true;
  });
});

test('writeZip() throws a TypeError for a non-Buffer, non-string content', () => {
  assert.throws(() => writeZip([{ name: 'x.txt', content: 42 }]), TypeError);
});

// readZip() REFUSES a duplicate-name archive rather than resolving it
// last-one-wins (zip.test.js, "rejects a duplicate entry name instead of
// last-one-wins"). This writer cannot actually produce such an archive to
// prove the reader-side refusal end-to-end (the duplicate-name rejection
// above stops it at the source) — so what is checked here is the contract
// implied by that source-side rejection: the writer's own refusal message
// names the duplicated path, so a caller debugging a PACKAGE_INVALID error
// is pointed at which entry collided rather than left to guess.
test('the duplicate-name rejection names the duplicated path', () => {
  assert.throws(() => writeZip([{ name: 'theme.css', content: 'a' }, { name: 'theme.css', content: 'b' }]), (err) => {
    assert.match(err.message, /theme\.css/);
    return true;
  });
});
