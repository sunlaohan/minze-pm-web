/* Image loading is independent of native navigation and page presentation. */
(() => {
  const root = document.documentElement;
  root.dataset.mediaEnabled = 'true';
  root.dataset.contentState = 'loading';
  try {
    root.dataset.theme = sessionStorage.getItem('currentToggleState') === 'dark' ? 'dark' : 'light';
  } catch { root.dataset.theme = 'light'; }
  // A failed or unavailable localization script must never leave text concealed.
  const reveal = () => { root.dataset.contentState = 'ready'; };
  const failSafe = setTimeout(reveal, 2500);

  function init() {
    const images = [...document.querySelectorAll('img[data-media-image]')];
    const versions = new WeakMap();
    const isChinese = () => root.lang.startsWith('zh');
    function localize(image) {
      if (image.dataset.altZh) image.alt = isChinese() ? image.dataset.altZh : image.dataset.altEn;
    }
    function state(image, value) {
      image.dataset.mediaState = value;
      const frame = image.closest('[data-media-frame]');
      if (!frame) return;
      frame.dataset.mediaState = value;
      frame.setAttribute('aria-busy', String(value === 'pending'));
      frame.querySelector('.media-retry')?.remove();
      if (value !== 'error') return;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'media-retry';
      retry.textContent = isChinese() ? '图片加载失败 · 点击重试' : 'Image unavailable · Retry';
      retry.addEventListener('click', event => {
        event.stopPropagation();
        event.preventDefault();
        state(image, 'pending');
        // Reset both responsive candidates and fallback so retry issues a fresh
        // native image request while preserving the page's link/flip behavior.
        const src = image.getAttribute('src');
        const srcset = image.getAttribute('srcset');
        image.removeAttribute('srcset');
        image.removeAttribute('src');
        if (srcset) image.setAttribute('srcset', srcset);
        image.setAttribute('src', src);
        watch(image);
      });
      frame.append(retry);
    }
    function watch(image) {
      const version = (versions.get(image) || 0) + 1;
      versions.set(image, version);
      localize(image);
      state(image, 'pending');
      const loaded = async () => {
        if (!image.complete) return;
        if (!image.naturalWidth) {
          if (versions.get(image) === version) state(image, 'error');
          return;
        }
        try { await image.decode?.(); } catch { /* A decoded fallback can still be displayed. */ }
        if (versions.get(image) === version && image.complete && image.naturalWidth) state(image, 'ready');
      };
      image.onload = loaded;
      image.onerror = () => { if (versions.get(image) === version) state(image, 'error'); };
      if (image.complete) loaded();
    }
    images.forEach(watch);
    new MutationObserver(records => {
      const changed = new Set();
      records.forEach(record => {
        if (record.target.matches('img[data-media-image]')) changed.add(record.target);
      });
      changed.forEach(watch);
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
    new MutationObserver(() => {
      images.forEach(localize);
      document.querySelectorAll('.media-retry').forEach(button => {
        button.textContent = isChinese() ? '图片加载失败 · 点击重试' : 'Image unavailable · Retry';
      });
    }).observe(root, { attributes: true, attributeFilter: ['lang'] });
    // Deferred localization downloads alongside the HTML. Show the reserved
    // text placeholders only until that real work finishes, never until all
    // below-fold images arrive and never for an artificial minimum duration.
    const copyReady = () => {
      if (root.dataset.localReady !== 'true') return false;
      clearTimeout(failSafe);
      reveal();
      return true;
    };
    if (!copyReady()) {
      const copyObserver = new MutationObserver(() => {
        if (copyReady()) copyObserver.disconnect();
      });
      copyObserver.observe(root, { attributes: true, attributeFilter: ['data-local-ready'] });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  addEventListener('pageshow', reveal);
})();
