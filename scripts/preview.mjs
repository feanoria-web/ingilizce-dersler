import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8' };
const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/ingilizce-dersler') pathname += '/';
    if (pathname.startsWith('/ingilizce-dersler/')) pathname = pathname.slice('/ingilizce-dersler'.length);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('invalid path');
    const stat = fs.statSync(target);
    if (!stat.isFile()) throw new Error('not a file');
    response.writeHead(200, { 'Content-Type':types[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'Content-Length':stat.size });
    if (request.method === 'HEAD') response.end(); else fs.createReadStream(target).pipe(response);
  } catch { response.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); response.end('Sayfa bulunamadı'); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`Local: http://127.0.0.1:${port}/ingilizce-dersler/\n`));
