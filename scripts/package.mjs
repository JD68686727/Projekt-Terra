// Creates the upload package for the hosting platform from dist/:
//   release/<slug>-<version>.zip  (index.html at the zip root)
// and validates the build: entry point present, only relative asset URLs,
// no external CDN references, size within the provisional budget.
// Pure Node (zlib) — no external zip tool required.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';

const DIST = 'dist';
const meta = readFileSync('src/config/meta.ts', 'utf8');
const version = /GAME_VERSION = '([^']+)'/.exec(meta)?.[1] ?? '0.0.0';
const title = /GAME_TITLE = '([^']+)'/.exec(meta)?.[1] ?? 'game';
const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(DIST);

const problems = [];
if (!files.some((f) => relative(DIST, f) === 'index.html')) problems.push('dist/index.html missing (run npm run build)');
const html = files.find((f) => f.endsWith('index.html'));
if (html) {
  const t = readFileSync(html, 'utf8');
  if (/(src|href)="\/(?!\/)/.test(t)) problems.push('index.html contains root-absolute asset URLs');
  if (/(src|href)="https?:\/\//.test(t)) problems.push('index.html references an external URL (CDN)');
}
for (const f of files.filter((f) => f.endsWith('.js') || f.endsWith('.css'))) {
  const t = readFileSync(f, 'utf8');
  if (/https?:\/\/(cdn|unpkg|fonts\.googleapis)/.test(t)) problems.push(`${f} references an external CDN`);
}

// Minimal ZIP writer (deflate).
const local = [];
const central = [];
let offset = 0;
let rawTotal = 0;
for (const f of files.sort()) {
  const name = relative(DIST, f).split(sep).join('/');
  const data = readFileSync(f);
  rawTotal += data.length;
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data) >>> 0;
  const nameBuf = Buffer.from(name, 'utf8');
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0x0800, 6); // UTF-8 names
  lh.writeUInt16LE(8, 8); // deflate
  lh.writeUInt32LE(0x00210000, 10); // fixed DOS time/date (reproducible)
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  local.push(lh, nameBuf, comp);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(8, 10);
  ch.writeUInt32LE(0x00210000, 12);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt32LE(offset, 42);
  central.push(ch, nameBuf);
  offset += 30 + nameBuf.length + comp.length;
}
const cdSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdSize, 12);
end.writeUInt32LE(offset, 16);
mkdirSync('release', { recursive: true });
const out = join('release', `${slug}-${version}.zip`);
const zip = Buffer.concat([...local, ...central, end]);
writeFileSync(out, zip);

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`files: ${files.length}  raw: ${mb(rawTotal)}  zip: ${mb(zip.length)}  → ${out}`);
if (rawTotal > 20 * 1048576) problems.push(`initial download ${mb(rawTotal)} exceeds 20 MB target`);
if (problems.length) {
  console.error('PACKAGE CHECK FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('package check: OK (index.html at root, relative URLs, no CDN, within budget)');
