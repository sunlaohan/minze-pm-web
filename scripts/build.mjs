import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(root, 'reference-manifest.json'), 'utf8'));
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist'), { recursive: true });
await cp(resolve(root, 'public'), resolve(root, 'dist'), { recursive: true });
await cp(resolve(root, 'src/styles'), resolve(root, 'dist/styles'), { recursive: true });
await cp(resolve(root, 'src/scripts'), resolve(root, 'dist/scripts'), { recursive: true });
for (const route of manifest.routes) {
  const directory = resolve(root, 'dist', '.' + route.path);
  await mkdir(directory, { recursive: true });
  await cp(resolve(root, route.source), resolve(directory, 'index.html'));
}
await writeFile(resolve(root, 'dist/_headers'), "/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'\n  Referrer-Policy: strict-origin-when-cross-origin\n");
console.log(`Built ${manifest.routes.length} pages and ${manifest.assets.length} local dependencies into dist/.`);
