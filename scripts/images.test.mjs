import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'image-manifest.json')));
const routes = JSON.parse(readFileSync(resolve(root, 'reference-manifest.json'))).routes;
const photos = JSON.parse(readFileSync(resolve(root, 'assets-source/unsplash/credits.json'))).entries;
const allVariants = new Map(Object.values(manifest.assets).flatMap(asset => asset.variants.map(v => [v.src, v])));

test('responsive candidates have independent files, accurate descriptors, and compressed bytes', () => {
  for (const asset of Object.values(manifest.assets)) {
    const urls = new Set();
    for (const variant of asset.variants) {
      assert(!urls.has(variant.src), `Fake duplicate srcset: ${variant.src}`);
      urls.add(variant.src);
      assert.equal(statSync(resolve(root, 'public', '.' + variant.src)).size, variant.bytes);
      assert(variant.width <= asset.width, 'Images must not upscale');
    }
  }
  assert(manifest.totals.reduction > .5);
});

test('all page photos are local optimized images with loading states and valid srcset', () => {
  for (const route of routes) {
    const html = readFileSync(resolve(root, route.source), 'utf8');
    for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
      assert(tag.includes('data-media-image'), `Unmanaged image on ${route.path}`);
      assert(tag.includes('decoding="async"'));
      const src = tag.match(/\ssrc="([^"]+)"/)?.[1];
      assert(src?.startsWith('/assets/images/') || src?.endsWith('.svg'), `Original/remote image still loaded: ${src}`);
      if (!src.endsWith('.svg')) {
        assert(allVariants.has(src), `Missing image manifest entry: ${src}`);
        for (const candidate of tag.match(/\ssrcset="([^"]+)"/)[1].split(', ')) {
          const [url, width] = candidate.split(' ');
          assert.equal(allVariants.get(url)?.width, parseInt(width));
        }
      }
    }
    if (/^\/(?:projects|blogs)\//.test(route.path)) {
      for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
        if (!tag.includes('avatar')) assert(tag.includes('data-photo-key'), `Unreplaced editorial photo on ${route.path}`);
      }
    }
  }
});

test('project and note cover photos use the same Unsplash asset on listing and detail pages', () => {
  for (const photo of photos) {
    const listing = readFileSync(resolve(root, photo.route.startsWith('/projects') ? 'src/pages/projects.html' : 'src/pages/blogs.html'), 'utf8');
    const detail = readFileSync(resolve(root, 'src/pages', '.' + photo.route + '.html'), 'utf8');
    const expected = manifest.assets[photo.source].variants.find(v => v.width === 960).src;
    for (const html of [listing, detail]) {
      const image = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]).find(tag => tag.includes(`data-photo-key="${photo.key}"`));
      assert(image?.includes(`src="${expected}"`), `Inconsistent cover ${photo.key}`);
    }
    assert(photo.photoPage.startsWith('https://unsplash.com/photos/'));
    assert(photo.author && photo.licenseUrl && photo.freePhotoVerified);
  }
});
