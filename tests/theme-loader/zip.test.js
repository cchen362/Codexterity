'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');

const { readZip, crc32 } = require(path.join('..', '..', 'injector', 'theme-loader', 'zip.js'));
const { ThemeLoadError } = require(path.join('..', '..', 'injector', 'theme-loader', 'errors.js'));

/**
 * Minimal in-memory zip builder, built here rather than committed as a
 * binary fixture, per this milestone's instructions. Supports stored (0)
 * and deflate (8) entries only, no Zip64 — everything readZip() itself is
 * expected to handle.
 */
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressed = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content || '', 'utf8');
    const method = entry.method === undefined ? 8 : entry.method;
    let data;
    if (method === 0) {
      data = uncompressed;
    } else if (method === 8) {
      data = zlib.deflateRawSync(uncompressed);
    } else {
      data = uncompressed; // for "unsupported method" tests, content is irrelevant
    }
    const crc = entry.crcOverride !== undefined ? entry.crcOverride : crc32(uncompressed);

    const localHeaderOffset = offset;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, data);
    offset += localHeader.length + nameBuf.length + data.length;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    // Low byte = spec version, HIGH byte = source filesystem (3 = Unix). Only a
    // Unix-made zip carries an st_mode in the upper external attributes, which
    // is what the symlink test below needs.
    centralHeader.writeUInt16LE(20 | ((entry.madeByUnix ? 3 : 0) << 8), 4);
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    // External attributes. The upper word means DIFFERENT THINGS depending on
    // the maker: DOS file attributes (0x10 = directory) for a DOS/NTFS zip, a
    // Unix st_mode for a Unix one. Both shapes are producible here so the
    // reader can be tested against each.
    //   0xA1FF = S_IFLNK | 0777    0x81ED = S_IFREG | 0755    0x41ED = S_IFDIR | 0755
    let upperWord = 0;
    if (entry.unixMode !== undefined) upperWord = entry.unixMode;
    else if (entry.isSymlink) upperWord = 0xa1ff;
    else if (entry.isDirectory) upperWord = 0x10;
    // >>> 0 because JS's << is a SIGNED 32-bit shift: 0xA1FF << 16 is negative.
    centralHeader.writeUInt32LE((upperWord << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(localHeaderOffset, 42);

    centralParts.push(centralHeader, nameBuf);
  }

  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);
  const centralDirOffset = localSection.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localSection, centralSection, eocd]);
}

const CAP = 33554432;

test('round-trips a stored entry', () => {
  const zip = buildZip([{ name: 'theme.css', content: '.a { color: red; }', method: 0 }]);
  const files = readZip(zip, { maxTotalBytes: CAP });
  assert.equal(files.get('theme.css').toString('utf8'), '.a { color: red; }');
});

test('round-trips a deflated entry', () => {
  const content = '.a { color: red; }'.repeat(100);
  const zip = buildZip([{ name: 'theme.css', content, method: 8 }]);
  const files = readZip(zip, { maxTotalBytes: CAP });
  assert.equal(files.get('theme.css').toString('utf8'), content);
});

test('round-trips multiple entries, skipping a directory entry', () => {
  const zip = buildZip([
    { name: 'assets/', content: '', method: 0, isDirectory: true },
    { name: 'manifest.json', content: '{"a":1}', method: 0 },
    { name: 'theme.css', content: '.a{color:red}'.repeat(50), method: 8 },
  ]);
  const files = readZip(zip, { maxTotalBytes: CAP });
  assert.equal(files.size, 2);
  assert.equal(files.has('assets/'), false);
  assert.equal(files.get('manifest.json').toString('utf8'), '{"a":1}');
});

test('rejects a CRC mismatch', () => {
  const zip = buildZip([{ name: 'theme.css', content: 'hello world', method: 0, crcOverride: 0xdeadbeef }]);
  assert.throws(() => readZip(zip, { maxTotalBytes: CAP }), (err) => {
    assert.ok(err instanceof ThemeLoadError);
    assert.equal(err.code, 'ZIP_MALFORMED');
    assert.match(err.message, /CRC-32 mismatch/);
    return true;
  });
});

test('rejects a path-traversal entry name', () => {
  const zip = buildZip([{ name: '../../evil.txt', content: 'x', method: 0 }]);
  assert.throws(() => readZip(zip, { maxTotalBytes: CAP }), (err) => {
    assert.equal(err.code, 'ZIP_MALFORMED');
    assert.match(err.message, /safe relative path/);
    return true;
  });
});

test('rejects an absolute entry name', () => {
  const zip = buildZip([{ name: '/etc/passwd', content: 'x', method: 0 }]);
  assert.throws(() => readZip(zip, { maxTotalBytes: CAP }), (err) => {
    assert.equal(err.code, 'ZIP_MALFORMED');
    return true;
  });
});

test('rejects an unsupported compression method', () => {
  const zip = buildZip([{ name: 'theme.css', content: 'x', method: 12 }]);
  assert.throws(() => readZip(zip, { maxTotalBytes: CAP }), (err) => {
    assert.equal(err.code, 'ZIP_MALFORMED');
    assert.match(err.message, /unsupported compression method/);
    return true;
  });
});

test('size cap trips mid-inflate on a zip bomb', () => {
  const huge = Buffer.alloc(10 * 1024 * 1024, 0x41); // 10 MiB of 'A', compresses tiny
  const zip = buildZip([{ name: 'bomb.bin', content: huge, method: 8 }]);
  assert.throws(() => readZip(zip, { maxTotalBytes: 1024 * 1024 }), (err) => {
    assert.ok(err instanceof ThemeLoadError);
    assert.equal(err.code, 'SIZE_EXCEEDED');
    return true;
  });
});

test('cumulative size cap trips across multiple entries', () => {
  const chunk = Buffer.alloc(700 * 1024, 0x42);
  const zip = buildZip([
    { name: 'a.bin', content: chunk, method: 0 },
    { name: 'b.bin', content: chunk, method: 0 },
  ]);
  assert.throws(() => readZip(zip, { maxTotalBytes: 1024 * 1024 }), (err) => {
    assert.equal(err.code, 'SIZE_EXCEEDED');
    return true;
  });
});

test('rejects too many entries', () => {
  const entries = [];
  for (let i = 0; i < 5000; i++) {
    entries.push({ name: `f${i}.txt`, content: 'x', method: 0 });
  }
  const zip = buildZip(entries);
  assert.throws(() => readZip(zip, { maxTotalBytes: CAP }), (err) => {
    assert.equal(err.code, 'SIZE_EXCEEDED');
    assert.match(err.message, /entries/);
    return true;
  });
});

// --- D-0001-3: entries that are not plain files, and ambiguous archives ---

test('rejects a Unix symlink entry rather than reading its target string', () => {
  const zip = buildZip([
    { name: 'theme.css', content: 'a{color:red}', method: 0 },
    // A real zip symlink: content IS the link target. Nothing in M1 writes to
    // disk, but refusing it at the parser is what stops a later milestone's
    // `apply` from turning it into a write-through-a-link.
    { name: 'assets/evil.woff2', content: '../../../.codex/auth.json', method: 0,
      madeByUnix: true, isSymlink: true },
  ]);
  assert.throws(() => readZip(zip, { maxTotalBytes: CAP }), (err) => {
    assert.equal(err.code, 'ZIP_MALFORMED');
    assert.match(err.message, /symbolic link/);
    return true;
  });
});

test('the symlink mode bits are only read from a Unix-made zip', () => {
  // The S_IFLNK bit pattern (0xA000) in the upper word, but "version made by"
  // says DOS — where that word is not an st_mode at all and must not be read as
  // one. 0xA000 is chosen over the full 0xA1FF because as DOS attributes 0xA1FF
  // genuinely does set the directory bit, so it would be skipped for a correct
  // and unrelated reason and prove nothing about the symlink gate.
  const zip = buildZip([
    { name: 'theme.css', content: 'a{color:red}', method: 0, unixMode: 0xa000 },
  ]);
  const files = readZip(zip, { maxTotalBytes: CAP });
  assert.equal(files.get('theme.css').toString('utf8'), 'a{color:red}');
});

test('rejects a duplicate entry name instead of last-one-wins', () => {
  // Zip-confusion: two manifests, so a validator and a consumer that disagree
  // about which entry "manifest.json" means can be shown different files.
  const zip = buildZip([
    { name: 'manifest.json', content: '{"benign":true}', method: 0 },
    { name: 'manifest.json', content: '{"malicious":true}', method: 0 },
  ]);
  assert.throws(() => readZip(zip, { maxTotalBytes: CAP }), (err) => {
    assert.equal(err.code, 'ZIP_MALFORMED');
    assert.match(err.message, /more than once/);
    return true;
  });
});

test('a Unix-made entry with mode 0755 is a FILE, not a directory', () => {
  // Regression guard. 0o755 as a st_mode is 0x81ED, and 0x81ED & 0x10 is
  // non-zero — the DOS directory bit tested against a Unix mode. Reading it
  // that way silently DROPS every executable-mode entry, with no error, and
  // would first appear when a .ccskin was built on the collaborator's Mac.
  const zip = buildZip([
    { name: 'theme.css', content: 'a{color:red}', method: 0, madeByUnix: true, unixMode: 0o755 },
  ]);
  const files = readZip(zip, { maxTotalBytes: CAP });
  assert.equal(files.size, 1);
  assert.equal(files.get('theme.css').toString('utf8'), 'a{color:red}');
});

test('a Unix-made directory entry (S_IFDIR) is still skipped', () => {
  const zip = buildZip([
    { name: 'assets', content: '', method: 0, madeByUnix: true, unixMode: 0o40755 },
    { name: 'theme.css', content: 'a{color:red}', method: 0, madeByUnix: true, unixMode: 0o644 },
  ]);
  const files = readZip(zip, { maxTotalBytes: CAP });
  assert.equal(files.size, 1);
  assert.equal(files.has('assets'), false);
});
