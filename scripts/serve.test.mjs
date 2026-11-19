import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';

let child, base;
before(async () => {
  child = spawn(process.execPath, ['scripts/serve.mjs', '--port', '0'], { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    let log = '';
    child.stdout.on('data', chunk => {
      log += chunk;
      const url = log.match(/Local: (http:\/\/localhost:\d+)/)?.[1];
      if (url) resolve(url);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Preview exited: ${code}`)));
  });
});
after(async () => {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
});

function request(path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = get(base + path, { headers, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}

test('compressed HTML preserves content, negotiates encoding, and supports conditional requests', async () => {
  const plain = await request('/projects');
  assert.equal(plain.status, 200);
  for (const [encoding, decode] of [['gzip', gunzipSync], ['br', brotliDecompressSync]]) {
    const compressed = await request('/projects', { 'Accept-Encoding': encoding });
    assert.equal(compressed.headers['content-encoding'], encoding);
    assert(compressed.body.length < plain.body.length / 4);
    assert.deepEqual(decode(compressed.body), plain.body);
    assert.equal(compressed.headers.vary, 'Accept-Encoding');
  }
  const cached = await request('/projects', { 'If-None-Match': plain.headers.etag });
  assert.equal(cached.status, 304);
  assert.equal(cached.body.length, 0);
  const refused = await request('/projects', { 'Accept-Encoding': 'br;q=0,gzip;q=0' });
  assert.equal(refused.headers['content-encoding'], undefined);
});

test('range and HEAD responses retain correct lengths while hashed photos are cacheable', async () => {
  const range = await request('/projects', { Range: 'bytes=10-26', 'Accept-Encoding': 'br' });
  assert.equal(range.status, 206);
  assert.equal(range.body.length, 17);
  assert.equal(range.headers['content-encoding'], undefined);
  const head = await request('/projects', { 'Accept-Encoding': 'gzip' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert(Number(head.headers['content-length']) > 0);
  const manifest = JSON.parse(readFileSync(new URL('../image-manifest.json', import.meta.url)));
  const image = Object.values(manifest.assets)[0].variants[0].src;
  const photo = await request(image);
  assert.equal(photo.status, 200);
  assert.match(photo.headers['cache-control'], /immutable/);
  assert.equal(photo.headers['content-encoding'], undefined);
});
