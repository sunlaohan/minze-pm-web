import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const production = process.argv.includes('--dist');
const portFlag = process.argv.indexOf('--port');
const port = Number(portFlag === -1 ? process.env.PORT || 5173 : process.argv[portFlag + 1]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm' };

const server = http.createServer(async (request, response) => {
  try {
    const requestURL = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(requestURL.pathname);
    if (pathname.includes('\0') || pathname.split('/').includes('..')) {
      response.writeHead(400).end('Bad request');
      return;
    }
    if (pathname.length > 1 && pathname.endsWith('/') && !pathname.startsWith('/assets/')) {
      response.writeHead(308, { Location: pathname.replace(/\/+$/, '') + requestURL.search }).end();
      return;
    }
    let candidates;
    if (production) {
      candidates = [resolve(root, 'dist', '.' + pathname), resolve(root, 'dist', '.' + pathname, 'index.html')];
    } else if (pathname.startsWith('/styles/') || pathname.startsWith('/scripts/')) {
      candidates = [resolve(root, 'src', '.' + pathname)];
    } else if (pathname.startsWith('/assets/')) {
      candidates = [resolve(root, 'public', '.' + pathname)];
    } else {
      const route = pathname.replace(/\/$/, '') || '/index';
      candidates = [resolve(root, 'src/pages', '.' + route + '.html')];
    }
    let file;
    for (const candidate of candidates) {
      if (!candidate.startsWith(root + sep)) continue;
      if (await stat(candidate).then(s => s.isFile()).catch(() => false)) { file = candidate; break; }
    }
    const status = file ? 200 : 404;
    if (!file) {
      if (extname(pathname)) { response.writeHead(404).end('Not found'); return; }
      file = resolve(root, production ? 'dist/404/index.html' : 'src/pages/404.html');
    }
    const metadata = await stat(file);
    const contentType = types[extname(file)] || 'application/octet-stream';
    const etag = `W/"${metadata.size.toString(16)}-${Math.trunc(metadata.mtimeMs).toString(16)}"`;
    const hashedImage = /^\/assets\/images\/[^/]+\.[a-f\d]{10}-\d+\.webp$/.test(pathname);
    const cacheControl = hashedImage || production && pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    const sharedHeaders = { ETag: etag, 'Cache-Control': cacheControl, Vary: 'Accept-Encoding' };
    if (request.headers['if-none-match'] === etag && !request.headers.range) {
      response.writeHead(304, sharedHeaders).end();
      return;
    }
    const content = await readFile(file);
    let body = content;
    let responseStatus = status;
    const rangeHeaders = {};
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    if (range && status === 200) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : content.length - 1, content.length - 1);
      if (start > end || start >= content.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${content.length}` }).end();
        return;
      }
      body = content.subarray(start, end + 1);
      responseStatus = 206;
      rangeHeaders['Content-Range'] = `bytes ${start}-${end}/${content.length}`;
    }
    let contentEncoding;
    if (!range && content.length > 1024 && /^(?:text\/|application\/json|image\/svg\+xml)/.test(contentType)) {
      const accepted = new Map(String(request.headers['accept-encoding'] || '').split(',').map(entry => {
        const [name, ...options] = entry.trim().split(';');
        const quality = options.find(option => option.trim().startsWith('q='));
        return [name, quality ? Number(quality.trim().slice(2)) : 1];
      }));
      if (accepted.get('br') > 0) {
        body = brotliCompressSync(content, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } });
        contentEncoding = 'br';
      } else if (accepted.get('gzip') > 0) {
        body = gzipSync(content);
        contentEncoding = 'gzip';
      }
    }
    response.writeHead(responseStatus, {
      'Content-Type': contentType,
      'Content-Length': body.length,
      'Accept-Ranges': 'bytes',
      ...rangeHeaders,
      ...sharedHeaders,
      ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
      // Runtime, fonts, images, route data, and requests all stay local.
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error.message);
    response.writeHead(500).end('Unable to load the local page');
  }
});
server.listen(port, '0.0.0.0', () => {
  const actualPort = server.address().port;
  console.log(`\n  Portavia local preview\n  Local: http://localhost:${actualPort}\n  Projects: http://localhost:${actualPort}/projects\n`);
});
