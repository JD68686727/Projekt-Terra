// Minimal static server that hosts dist/ under a nested path (default /games/terra/),
// mirroring a sub-directory deployment on the hosting platform. No dependencies.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4173);
const prefix = process.argv[4] ?? '/games/terra/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; } // parent harness only
  if (url.pathname === '/embed.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>Embed</title><body style="margin:0;background:#222;height:2000px"><iframe id="g" src="${prefix}index.html" style="width:960px;height:540px;border:0" allow="autoplay; fullscreen"></iframe></body>`);
    return;
  }
  if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end('not found'); return; }
  let rel = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
  const file = normalize(join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    const s = await stat(file);
    const f = s.isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}${prefix}`));
