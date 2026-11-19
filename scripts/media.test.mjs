import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/scripts/media.js', import.meta.url), 'utf8');

function fixture({ complete = false, width = 0, decode = () => Promise.resolve() } = {}) {
  const root = { dataset: { localReady: 'true' }, lang: 'zh-CN' };
  const listeners = {}, observers = [];
  const frame = {
    dataset: {}, button: null, setAttribute() {},
    querySelector() { return this.button; },
    append(button) { this.button = button; },
  };
  const attributes = { src: '/assets/images/photo-960.webp', srcset: '/assets/images/photo-320.webp 320w, /assets/images/photo-960.webp 960w' };
  const image = {
    dataset: { altZh: '现场工程师', altEn: 'Field engineer' },
    complete, naturalWidth: width, decode,
    closest: () => frame,
    matches: () => true,
    getAttribute: name => attributes[name],
    removeAttribute(name) { delete attributes[name]; this.complete = false; },
    setAttribute(name, value) { attributes[name] = value; this.complete = false; },
  };
  const document = {
    documentElement: root, body: {}, readyState: 'loading',
    querySelectorAll: selector => selector === '.media-retry' ? [frame.button].filter(Boolean) : [image],
    addEventListener: (name, callback) => { listeners[name] = callback; },
    createElement() {
      return {
        addEventListener(name, callback) { this[name] = callback; },
        remove() { frame.button = null; },
      };
    },
  };
  let failSafe;
  runInNewContext(source, {
    document, setTimeout: callback => { failSafe = callback; return 1; },
    clearTimeout: () => {}, addEventListener: (name, callback) => { listeners[name] = callback; },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
  });
  return { root, image, frame, attributes, observers, failSafe, init: listeners.DOMContentLoaded, listeners };
}

test('content skeleton clears without waiting for lazy images', () => {
  const f = fixture();
  assert.equal(f.root.dataset.contentState, 'loading');
  f.init();
  assert.equal(f.root.dataset.contentState, 'ready');
  assert.equal(f.frame.dataset.mediaState, 'pending');
  f.root.dataset.contentState = 'loading';
  f.listeners.pageshow();
  assert.equal(f.root.dataset.contentState, 'ready');
});

test('cached images reveal only after decode and stale gallery decodes cannot reveal a new photo', async () => {
  let decoded;
  const f = fixture({ complete: true, width: 960, decode: () => new Promise(resolve => { decoded = resolve; }) });
  f.init();
  assert.equal(f.frame.dataset.mediaState, 'pending');
  f.image.complete = false;
  f.observers[0].callback([{ target: f.image }]);
  decoded();
  await Promise.resolve();
  assert.equal(f.frame.dataset.mediaState, 'pending');
  f.image.complete = true;
  f.image.naturalWidth = 640;
  const loaded = f.image.onload();
  decoded();
  await loaded;
  assert.equal(f.frame.dataset.mediaState, 'ready');
});

test('a failed image stops shimmering and offers a localized retry with responsive candidates intact', async () => {
  const f = fixture({ complete: true });
  f.init();
  assert.equal(f.frame.dataset.mediaState, 'error');
  assert.match(f.frame.button.textContent, /点击重试/);
  f.root.lang = 'en';
  f.observers[1].callback();
  assert.equal(f.image.alt, 'Field engineer');
  assert.match(f.frame.button.textContent, /Retry/);
  let stopped = false;
  f.frame.button.click({ stopPropagation() { stopped = true; }, preventDefault() {} });
  assert(stopped);
  assert.equal(f.frame.dataset.mediaState, 'pending');
  assert.equal(f.frame.button, null);
  assert.match(f.attributes.srcset, /320w/);
  assert.match(f.attributes.src, /960/);
  f.image.complete = true;
  f.image.naturalWidth = 960;
  await f.image.onload();
  assert.equal(f.frame.dataset.mediaState, 'ready');
});

test('content remains available if initialization cannot finish', () => {
  const f = fixture();
  f.failSafe();
  assert.equal(f.root.dataset.contentState, 'ready');
});

test('content placeholders follow actual deferred localization readiness', () => {
  const f = fixture();
  f.root.dataset.localReady = 'false';
  f.init();
  assert.equal(f.root.dataset.contentState, 'loading');
  f.root.dataset.localReady = 'true';
  f.observers[2].callback();
  assert.equal(f.root.dataset.contentState, 'ready');
  assert(f.observers[2].disconnected);
});
