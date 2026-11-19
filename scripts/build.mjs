import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(root, 'reference-manifest.json'), 'utf8'));
const imageReferences = new Set();
for (const route of manifest.routes) {
  const html = await readFile(resolve(root, route.source), 'utf8');
  for (const match of html.matchAll(/\/assets\/(?:images|media)\/[^\s"'<>;&]+/g)) {
    // data-image-original is provenance for rebuilds, not a browser request.
    // All rendered rasters now live under images/; only SVGs/favicon stay in media/.
    if (match[0].startsWith('/assets/images/') || /\.(?:svg|ico)$/.test(match[0]) || match[0].endsWith('favicon.png')) imageReferences.add(match[0]);
  }
}
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist'), { recursive: true });
// Keep the captured reference modules in source for provenance. The shipped
// site runs only the readable native controllers and needs no template runtime.
await cp(resolve(root, 'public'), resolve(root, 'dist'), {
  recursive: true,
  filter: path => {
    if (['runtime', 'data'].some(name => path === resolve(root, 'public/assets', name))) return false;
    // Retain source originals locally, but don't ship unused photos or every
    // generated size. Gallery candidates and srcset URLs are included above.
    if (/\.(?:png|jpe?g|gif|webp|avif)$/i.test(path)) {
      return imageReferences.has(path.slice(resolve(root, 'public').length));
    }
    return true;
  },
});
await cp(resolve(root, 'src/styles'), resolve(root, 'dist/styles'), { recursive: true });
await cp(resolve(root, 'src/scripts'), resolve(root, 'dist/scripts'), { recursive: true });
for (const route of manifest.routes) {
  const directory = resolve(root, 'dist', '.' + route.path);
  await mkdir(directory, { recursive: true });
  await cp(resolve(root, route.source), resolve(directory, 'index.html'));
}
// Static hosts use /404.html for unknown paths. Keep the rendered error page
// instead of letting the template router mount its home-page fallback there.
const notFound = await readFile(resolve(root, 'dist/404/index.html'), 'utf8');
await writeFile(resolve(root, 'dist/404.html'), notFound.replace(/<script\b(?=[^>]*\bdata-framer-bundle="main")[^>]*>[\s\S]*?<\/script>/g, ''));
await writeFile(resolve(root, 'dist/_headers'), "/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'\n  Referrer-Policy: strict-origin-when-cross-origin\n");
console.log(`Built ${manifest.routes.length} native pages and ${imageReferences.size} referenced image assets into dist/ (without source photos or the legacy template runtime).`);
