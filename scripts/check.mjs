import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(root, 'reference-manifest.json'), 'utf8'));
const routes = new Set(manifest.routes.map(route => route.path));
let refs = 0;
async function exists(file) {
  assert(await stat(file).then(s => s.isFile()).catch(() => false), `Missing local dependency: ${file}`);
}
for (const route of manifest.routes) {
  const html = await readFile(resolve(root, route.source), 'utf8');
  assert(html.includes('/styles/local.css'), `Custom styles missing on ${route.path}`);
  assert(html.includes('/scripts/local.js'), `Theme initialization missing on ${route.path}`);
  assert(html.includes('/scripts/translations.js'), `Translations missing on ${route.path}`);
  assert(html.includes('/scripts/profile-copy.js'), `Resume content missing on ${route.path}`);
  assert.equal((html.match(/id="site-navigation"/g) || []).length, 1, `Shared navigation missing or duplicated on ${route.path}`);
  assert(!/id="contact"|data-framer-name="Contact"/.test(html), `Removed contact section remains on ${route.path}`);
  assert(!/href="[^"\s]*#contact"/.test(html), `Link to removed contact section on ${route.path}`);
  assert(html.includes('lang="zh-CN"'), `Chinese default missing on ${route.path}`);
  assert(!html.includes('src="https://events.framer.com'), `Remote tracking script on ${route.path}`);
  for (const match of html.matchAll(/(?:src|href)="(\/(?:assets|styles|scripts)\/[^"?#]+)(?:[?#][^"]*)?"/g)) {
    await exists(resolve(root, match[1].startsWith('/assets/') ? 'public' : 'src', '.' + match[1]));
    refs++;
  }
  for (const match of html.matchAll(/<a\b[^>]*href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
    assert(routes.has(match[1]), `Uncaptured route ${match[1]} on ${route.path}`);
  }
}
for (const asset of manifest.assets) {
  const file = resolve(root, 'public', '.' + asset.local);
  await exists(file);
  if (['.mjs', '.js'].includes(extname(file))) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `Invalid module ${file}: ${result.stderr}`);
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/["'`](\.\/[^"'`\s]+\.mjs)["'`]/g)) {
      await exists(resolve(dirname(file), match[1]));
      refs++;
    }
    for (const match of source.matchAll(/["'`](\/assets\/(?:media|fonts|data)\/[^"'`\s?]+)["'`]/g)) {
      await exists(resolve(root, 'public', '.' + match[1]));
      refs++;
    }
    if (extname(file) === '.mjs' && source.includes('.framercms')) {
      assert(!/new URL\([^)]*,`\/assets\//.test(source), `Relative URL used as CMS base in ${file}`);
      assert(source.includes('__localCMSFiles'), `Hosted CMS range protocol remains in ${file}`);
    }
  }
}
for (const name of ['local.js', 'translations.js', 'profile-copy.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, 'src/scripts', name)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `Invalid local script ${name}: ${result.stderr}`);
}
assert(routes.has('/projects') && routes.has('/about') && routes.has('/blogs') && routes.has('/'), 'Main routes missing');
console.log(`Verified ${routes.size} routes, ${manifest.assets.length} assets, ${refs} local references, and all runtime module syntax.`);
