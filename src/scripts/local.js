/* Local navigation, appearance, and bilingual presentation for all routes. */
(() => {
  const html = document.documentElement;
  const profile = window.PORTAVIA_PROFILE_COPY || { entries: {}, scopes: [], contact: {}, projects: {} };
  const profileEntries = new Map(Object.entries(profile.entries).map(([key, value]) => [normalize(key), value]));
  const profileScopes = profile.scopes.map(scope => ({ ...scope, entries: new Map(Object.entries(scope.entries).map(([key, value]) => [normalize(key), value])) }));
  const dictionary = new Map(Object.entries(window.PORTAVIA_TRANSLATIONS || {}).map(([key, value]) => [normalize(key), value]));
  const phrases = [...dictionary].filter(([key]) => key.length > 35).sort((a, b) => b[0].length - a[0].length);
  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  const headingLines = new Map([
    ['summer vibes festival campaign', '夏日氛围音乐节\n视觉企划'],
    ['how to streamline your design workflow', '如何优化你的\n设计工作流'],
    ['the power of typography in web design', '字体排版如何塑造\n网页设计'],
    ['the role of color psychology in branding', '色彩心理学\n在品牌中的作用'],
    ['mastering ui/ux design: key principles for success', '掌握 UI/UX：\n优秀设计的关键原则'],
    ['balancing creativity and functionality in design', '在设计中平衡\n创意与功能'],
    ['intenza brand boutique e-gift card design', 'Intenza 精品品牌\n电子礼卡'],
    ['innovatetech identity rollout', 'InnovateTech\n品牌形象焕新'],
  ]);
  const englishCorrection = new Map([[
    'Simply reach out through my contact page or email me directly. We’ll schedule a consultation to discuss your project, goals, and timeline. From there, I’ll provide a proposal to get things moving.',
    'Email me directly. We’ll schedule a consultation to discuss your project, goals, and timeline. From there, I’ll provide a proposal to get things moving.',
  ]]);
  let locale = readStorage('localStorage', 'portavia-language') === 'en' ? 'en' : 'zh';
  let theme = readStorage('sessionStorage', 'currentToggleState') === 'dark' ? 'dark' : 'light';
  let navigation;

  function readStorage(kind, key) {
    try { return window[kind].getItem(key); } catch { return null; }
  }
  function writeStorage(kind, key, value) {
    try { window[kind].setItem(key, value); } catch { /* Preferences still work without storage. */ }
  }
  function normalize(value) {
    return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
  }
  function profileEntry(value, element) {
    const key = normalize(value);
    if (element) {
      for (const scope of profileScopes) {
        if ((!scope.route || scope.route === location.pathname) && scope.entries.has(key) && element.closest(scope.selector)) return scope.entries.get(key);
      }
      // Related-project cards in the captured template reuse a blog excerpt.
      if (key === normalize('Explore the top design trends for 2024 that will influence web, UI/UX, and branding projects, helping you stay ahead of the curve.')) {
        const href = element.closest('a[href]')?.getAttribute('href');
        const slug = href && new URL(href, location.href).pathname.match(/^\/projects\/([^/]+)/)?.[1];
        if (profile.projects[slug]) return profile.projects[slug];
      }
    }
    return profileEntries.get(key);
  }
  function withSpacing(source, value) {
    return (source.match(/^\s*/)?.[0] || '') + value + (source.match(/\s*$/)?.[0] || '');
  }
  function translate(value, element) {
    const personal = profileEntry(value, element);
    if (personal) return withSpacing(value, personal[locale]);
    const title = value.match(/^(.*?)\s+-\s+DigiPorto$/i);
    if (title) {
      const page = profileEntry(title[1]);
      if (page) return `${page[locale]}${locale === 'zh' ? ' · 孙铭泽' : ' | Sun Mingze'}`;
    }
    if (locale === 'en') return englishCorrection.get(value) || value;
    const key = normalize(value);
    let translated = dictionary.get(key);
    if (!translated && key.endsWith(' - digiporto')) {
      const title = key.slice(0, -12);
      translated = dictionary.has(title) ? `${dictionary.get(title)} - DigiPorto` : undefined;
    }
    if (!translated && value.length > 100) {
      let combined = value.replace(/\s+/g, ' ').trim();
      for (const [source, target] of phrases) {
        const index = combined.toLocaleLowerCase('en').indexOf(source);
        if (index !== -1) combined = combined.slice(0, index) + target + combined.slice(index + source.length);
      }
      if (combined !== value.replace(/\s+/g, ' ').trim()) translated = combined;
    }
    if (!translated) return value;
    return (value.match(/^\s*/)?.[0] || '') + translated + (value.match(/\s*$/)?.[0] || '');
  }
  function isEnglishHero(element) {
    // Keep the home name, role, and portrait greeting in English.
    const region = element.closest('.framer-OzlK9 #hero, .framer-OzlK9 [data-framer-name="Sticky Wrap"]');
    if (region && region.lang !== 'en') region.lang = 'en';
    return Boolean(region);
  }
  function localizeText(node) {
    if (!node.parentElement || node.parentElement.closest('script,style,noscript,#site-navigation,svg')) return;
    const current = node.nodeValue;
    if (!current.trim()) return;
    const previous = textSources.get(node);
    const source = previous && previous.rendered === current ? previous.source : current;
    const personal = profileEntry(source, node.parentElement);
    const englishHero = isEnglishHero(node.parentElement) && !personal?.localizeInHero;
    const heading = node.parentElement.closest('h1');
    const rendered = englishHero ? source : personal ? withSpacing(source, locale === 'zh' && heading ? personal.headingZh || personal.zh : personal[locale]) : locale === 'zh' && heading && headingLines.has(normalize(source)) ? headingLines.get(normalize(source)) : translate(source, node.parentElement);
    textSources.set(node, { source, rendered });
    if (current !== rendered) node.nodeValue = rendered;
    const paragraph = node.parentElement.closest('h1,h2,h3,h4,h5,h6,p');
    if (paragraph) paragraph.classList.toggle('local-cjk', !englishHero && locale === 'zh' && /[\u3400-\u9fff]/.test(paragraph.textContent));
    if (paragraph && personal?.localizeInHero) paragraph.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }
  function localizeAttributes(element) {
    if (element.closest('#site-navigation')) return;
    const englishHero = isEnglishHero(element);
    let originals = attributeSources.get(element);
    if (!originals) { originals = {}; attributeSources.set(element, originals); }
    for (const name of ['alt', 'placeholder', 'aria-label', ...(element.matches('meta') ? ['content'] : []), ...(element.matches('a[href^="mailto:"],a[href^="tel:"]') ? ['href'] : [])]) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      const previous = originals[name];
      const source = previous && previous.rendered === current ? previous.source : current;
      const rendered = name === 'href' ? (/^mailto:/i.test(source) ? `mailto:${profile.contact.email}` : `tel:${profile.contact.phone}`) : englishHero ? source : translate(source, element);
      originals[name] = { source, rendered };
      if (current !== rendered) element.setAttribute(name, rendered);
    }
  }
  function localizeTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { localizeText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest('script,style,#site-navigation')) return;
    localizeAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) localizeText(walker.currentNode);
    root.querySelectorAll('[alt],[placeholder],[aria-label],meta[content],a[href^="mailto:"],a[href^="tel:"]').forEach(localizeAttributes);
  }
  function synchronizeDocument() {
    html.lang = locale === 'zh' ? 'zh-CN' : 'en';
    html.dataset.locale = locale;
    html.dataset.theme = theme;
  }
  function setLocale(next) {
    locale = next;
    writeStorage('localStorage', 'portavia-language', locale);
    synchronizeDocument();
    localizeTree(document.body);
    localizeTree(document.head);
    renderNavigation();
  }
  function setTheme(next) {
    theme = next;
    writeStorage('sessionStorage', 'currentToggleState', theme);
    synchronizeDocument();
    window.dispatchEvent(new CustomEvent('themeChange', { detail: theme }));
    renderNavigation();
  }
  function renderNavigation() {
    if (!navigation) return;
    const chinese = locale === 'zh';
    navigation.setAttribute('aria-label', chinese ? '主导航' : 'Main navigation');
    navigation.querySelector('[data-home]').setAttribute('aria-label', chinese ? '返回首页' : 'Home');
    navigation.querySelectorAll('[data-route]').forEach(link => {
      const path = link.getAttribute('href');
      const current = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
      if (current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const language = navigation.querySelector('[data-language]');
    language.setAttribute('aria-label', chinese ? '切换为英文' : 'Switch to Chinese');
    language.title = chinese ? '切换为英文' : 'Switch to Chinese';
    language.querySelector('[data-zh]').classList.toggle('is-active', chinese);
    language.querySelector('[data-en]').classList.toggle('is-active', !chinese);
    navigation.querySelector('[data-appearance]').setAttribute('aria-label', chinese ? '外观模式' : 'Appearance');
    navigation.querySelectorAll('[data-theme-choice]').forEach(button => {
      const light = button.dataset.themeChoice === 'light';
      const label = chinese ? (light ? '浅色模式' : '深色模式') : (light ? 'Light mode' : 'Dark mode');
      button.setAttribute('aria-label', label);
      button.title = label;
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    });
    navigation.querySelector('[data-menu]').setAttribute('aria-label', chinese ? '切换导航菜单' : 'Toggle navigation menu');
  }

  synchronizeDocument();
  writeStorage('sessionStorage', 'currentToggleState', theme);
  if (location.hash === '#contact') {
    history.replaceState(history.state, '', location.pathname + location.search);
    window.addEventListener('load', () => window.scrollTo(0, 0), { once: true });
  }
  document.addEventListener('DOMContentLoaded', () => {
    navigation = document.getElementById('site-navigation');
    navigation.querySelector('[data-language]').addEventListener('click', () => setLocale(locale === 'zh' ? 'en' : 'zh'));
    navigation.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => setTheme(button.dataset.themeChoice)));
    const menu = navigation.querySelector('[data-menu]');
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      navigation.classList.toggle('is-open', open);
    });
    navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      menu.setAttribute('aria-expanded', 'false');
      navigation.classList.remove('is-open');
    }));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && navigation.classList.contains('is-open')) {
        menu.setAttribute('aria-expanded', 'false');
        navigation.classList.remove('is-open');
        menu.focus();
      }
    });
    document.addEventListener('click', event => {
      if (!navigation.contains(event.target)) {
        menu.setAttribute('aria-expanded', 'false');
        navigation.classList.remove('is-open');
      }
    });
    localizeTree(document.body);
    localizeTree(document.head);
    renderNavigation();
    html.dataset.localReady = 'true';
    // Change text values, preserving React-owned elements and their hierarchy.
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') localizeText(record.target);
        else if (record.type === 'attributes') localizeTree(record.target);
        else record.addedNodes.forEach(localizeTree);
      }
      renderNavigation();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href'] });
    new MutationObserver(() => localizeTree(document.head)).observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });
    // Only the article newsletter forms remain, with no connected backend.
    document.addEventListener('submit', event => {
      if (!(event.target instanceof HTMLFormElement)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.target.reportValidity()) return;
      let status = event.target.querySelector('.local-form-status');
      if (!status) {
        status = document.createElement('p');
        status.className = 'local-form-status';
        status.setAttribute('role', 'status');
        event.target.append(status);
      }
      status.textContent = locale === 'zh' ? '当前为本地预览，暂未接入订阅服务。' : 'This local preview is not connected to a subscription service yet.';
    }, true);
  });
})();
