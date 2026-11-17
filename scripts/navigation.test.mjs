import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/scripts/local.js', import.meta.url), 'utf8');

// A small DOM boundary executes the real controller, not a copied router.
// Navigation itself is deliberately left to anchors and the browser.
function fixture(path = '/') {
  class Element {
    constructor(attributes = {}, parent = null) {
      this.attributes = { ...attributes };
      this.parentElement = parent;
      this.listeners = new Map();
      this.dataset = {};
      const classes = new Set(['is-open']);
      this.classList = {
        remove: value => classes.delete(value), contains: value => classes.has(value),
        toggle: (value, force) => { if (force ?? !classes.has(value)) classes.add(value); else classes.delete(value); },
      };
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; }
    get href() { return new URL(this.attributes.href, location).href; }
    closest() { return this.attributes.href ? this : this.parentElement?.closest(); }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
  }
  const location = new URL(path, 'http://localhost:5173');
  const nav = new Element();
  const links = ['/', '/about', '/projects', '/blogs'].map(href => new Element({ href }, nav));
  const menu = new Element();
  const language = new Element();
  language.querySelector = () => new Element();
  const appearance = new Element();
  const choices = ['light', 'dark'].map(theme => {
    const button = new Element(); button.dataset.themeChoice = theme; return button;
  });
  const controls = { '[data-home]': links[0], '[data-menu]': menu, '[data-language]': language, '[data-appearance]': appearance };
  nav.querySelector = selector => controls[selector];
  nav.querySelectorAll = selector => selector === '[data-route]' ? links : choices;
  const documentListeners = new Map();
  const windowListeners = new Map();
  const html = { dataset: {} };
  const document = {
    documentElement: html, body: {}, head: {}, getElementById: () => nav,
    addEventListener(type, callback) { documentListeners.set(type, callback); },
  };
  const window = { addEventListener(type, callback) { windowListeners.set(type, callback); } };
  runInNewContext(source, { window, document, location, Element, URL, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } });
  documentListeners.get('DOMContentLoaded')();
  function click(link, properties = {}) {
    const event = { target: link, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
    nav.listeners.get('click')(event);
    return event;
  }
  return { links, nav, menu, click, windowListeners, documentListeners, location };
}

test('first click after scrolling remains a native anchor activation', () => {
  const f = fixture('/projects/summer-vibes-festival-campaign');
  assert.equal(f.click(f.links[0]).defaultPrevented, false);
  assert.equal(f.menu.getAttribute('aria-expanded'), 'false');
  assert.equal(f.nav.classList.contains('is-open'), false);
});

test('repeat clicks and later navigation cannot be blocked by a pending lock', () => {
  const f = fixture('/projects/summer-vibes-festival-campaign');
  for (let i = 0; i < 30; i++) assert.equal(f.click(f.links[i % 4]).defaultPrevented, false);
});

test('clicking the exact current URL does not reload or block the next link', () => {
  const f = fixture('/projects');
  assert.equal(f.click(f.links[2]).defaultPrevented, true);
  assert.equal(f.click(f.links[0]).defaultPrevented, false);
});

test('keyboard generated clicks and modifier clicks retain native behavior', () => {
  const f = fixture();
  for (const properties of [{ detail: 0 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    assert.equal(f.click(f.links[1], properties).defaultPrevented, false);
  }
});

test('navigation does not install global input, scroll, or history interception', () => {
  const f = fixture();
  for (const type of ['click', 'pointerdown', 'pointerup', 'scroll', 'popstate', 'navigate']) {
    assert.equal(f.windowListeners.has(type), false, type);
  }
});

test('all nineteen routes ship without the former template router', () => {
  const manifest = JSON.parse(readFileSync(new URL('../reference-manifest.json', import.meta.url), 'utf8'));
  for (const route of manifest.routes) {
    const html = readFileSync(new URL('../' + route.source, import.meta.url), 'utf8');
    assert(html.includes('data-native-page="true"'), route.path);
    assert(html.includes('/scripts/interactions.js'), route.path);
    assert(!html.includes('/assets/runtime/'), route.path);
    assert(!html.includes('data-framer-bundle'), route.path);
  }
});

test('presentation code cannot replay pointer input or take over navigation', () => {
  const effects = readFileSync(new URL('../src/scripts/interactions.js', import.meta.url), 'utf8');
  assert(!/dispatchEvent|new PointerEvent|new MouseEvent|pushState|replaceState|location\.assign|\.intercept\(/.test(effects));
});

function presentationFixture({ mouse = false } = {}) {
  const listeners = new Map(), documentListeners = new Map(), frames = new Map(), resizes = [];
  let nextFrame = 0, reads = 0, writes = 0;
  const section = top => ({ getBoundingClientRect() { reads++; return { top: top - context.scrollY }; } });
  const service = section(900), about = section(1800), container = section(3000);
  const element = () => ({
    offsetWidth: 340,
    style: { set transform(value) { this.value = value; writes++; }, get transform() { return this.value; } },
  });
  const portrait = element();
  const dot = element();
  const attributes = new Set();
  dot.setAttribute = name => attributes.add(name);
  dot.removeAttribute = name => attributes.delete(name);
  dot.hasAttribute = name => attributes.has(name);
  dot.toggleAttribute = (name, enabled) => enabled ? attributes.add(name) : attributes.delete(name);
  portrait.closest = () => ({ querySelector: selector => selector === '#service' ? service : about });
  const cards = [element(), element()];
  cards.forEach(el => {
    el.closest = () => container;
    // Sticky/transformed boxes must not drive the next card's scroll effect.
    el.getBoundingClientRect = () => { throw new Error('measured an animated card'); };
  });
  const document = {
    readyState: 'complete', body: { append() {} }, getElementById: () => null,
    createElement: () => dot,
    querySelectorAll(selector) {
      if (selector.endsWith('[data-framer-name="Avatar Wrap"]')) return [portrait];
      if (selector.endsWith('[data-framer-name^="Featured Project -"]')) return cards;
      if (selector.includes('#service,')) return [service, about, container];
      return [];
    },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
  };
  const context = {
    document, innerHeight: 900, innerWidth: 1280, scrollY: 0,
    matchMedia: query => ({ matches: mouse && query.includes('hover: hover'), addEventListener() {} }),
    IntersectionObserver: class { observe() {} },
    ResizeObserver: class { constructor(callback) { resizes.push(callback); } observe() {} },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    getComputedStyle(el) { reads++; return el === container ? { rowGap: '120px', paddingTop: '0px' } : { height: '600px', boxSizing: 'border-box' }; },
  };
  const effects = readFileSync(new URL('../src/scripts/interactions.js', import.meta.url), 'utf8');
  runInNewContext(effects, context);
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  return { context, listeners, documentListeners, resizes, frames, portrait, cards, dot, flush,
    get reads() { return reads; }, get writes() { return writes; } };
}

test('presentation leaves wheel and touch scrolling entirely browser-owned', () => {
  const f = presentationFixture();
  for (const type of ['wheel', 'touchstart', 'touchmove', 'pointerdown']) {
    assert.equal(f.documentListeners.has(type), false, type);
    assert.equal(f.listeners.has(type), false, type);
  }
  f.flush();
});

test('project hover restores the arrow while page defaults and controls keep their cursor behavior', () => {
  const f = presentationFixture({ mouse: true });
  f.flush();
  const move = (variant, control = false) => f.documentListeners.get('pointermove')({
    clientX: 400, clientY: 300,
    target: { closest: selector => selector.includes('data-framer-cursor')
      ? { dataset: { framerCursor: variant } } : control ? {} : null },
  });
  move('1bde3zh'); f.flush();
  assert(f.dot.innerHTML.includes('<svg'));
  assert(f.dot.hasAttribute('data-visible'));
  assert(f.dot.hasAttribute('data-large'));
  assert.equal(f.dot.style.transform, 'translate3d(400px,300px,0)');
  for (const variant of ['17ph7dh', '1hyjosv', undefined]) {
    move(variant); f.flush();
    assert(!f.dot.hasAttribute('data-large'), 'ordinary page areas must stay small');
  }
  move('1bde3zh', true); f.flush();
  assert(!f.dot.hasAttribute('data-visible'));
  assert(!f.dot.hasAttribute('data-large'));
});

test('scroll frames reuse layout positions and coalesce updates until the next frame', () => {
  const f = presentationFixture();
  f.flush();
  const reads = f.reads;
  f.context.scrollY = 3100;
  for (let i = 0; i < 5; i++) f.listeners.get('scroll')();
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.reads, reads, 'scrolling must not force layout measurements');
  assert.equal(f.cards[0].style.transform, `scale(${1 - .2 * (900 + 3100 - 3720) / 820})`);
  const writes = f.writes;
  f.listeners.get('scroll')(); f.flush();
  assert.equal(f.writes, writes, 'unchanged effects must not write styles again');
  f.resizes[0](); f.flush();
  assert(f.reads > reads, 'layout changes must refresh cached positions');
});
