/* Presentation effects only. Links, focus and history remain browser-owned.
   No effect may synthesize input, intercept routing, or cover interactive UI. */
(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.min(1, Math.max(0, value));
  const running = new WeakMap();

  function animateDisclosure(card, expanded) {
    const toggle = card.querySelector('[data-disclosure-toggle]');
    const panel = card.querySelector('[data-disclosure-panel]');
    const height = panel.getBoundingClientRect().height;
    running.get(panel)?.cancel();
    card.toggleAttribute('data-open', expanded);
    card.classList.toggle(card.dataset.disclosure === 'faq' ? 'framer-v-19yrgmz' : 'framer-v-ooe55w', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    panel.setAttribute('aria-hidden', String(!expanded));
    panel.inert = !expanded;
    const nextHeight = expanded ? panel.scrollHeight : 1;
    if (reducedMotion.matches) return;
    const animation = panel.animate([{ height: `${height}px` }, { height: `${nextHeight}px` }], {
      duration: 400, easing: 'cubic-bezier(.22,.75,.25,1)',
    });
    running.set(panel, animation);
    animation.finished.catch(() => {}).finally(() => {
      if (running.get(panel) === animation) running.delete(panel);
    });
  }

  function disclosures() {
    document.querySelectorAll('[data-disclosure]').forEach(card => {
      const toggle = card.querySelector('[data-disclosure-toggle]');
      card.querySelector('[data-disclosure-panel]').inert = true;
      const activate = () => {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        const group = card.closest('.framer-FNjt9, .framer-OV4kG');
        if (card.dataset.disclosure === 'service') {
          group?.querySelectorAll('[data-disclosure][data-open]').forEach(other => {
            if (other !== card) animateDisclosure(other, false);
          });
        }
        animateDisclosure(card, expanded);
      };
      toggle.addEventListener('click', activate);
      toggle.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate();
      });
    });
  }

  function counters() {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(({ target, isIntersecting }) => {
        const heading = target.querySelector('h3:last-of-type');
        const end = Number(target.dataset.counter);
        const suffix = target.dataset.counterSuffix;
        cancelAnimationFrame(running.get(target));
        if (reducedMotion.matches) { heading.textContent = end + suffix; return; }
        if (!isIntersecting) { heading.textContent = '0' + suffix; return; }
        const start = performance.now();
        const update = time => {
          const progress = clamp((time - start) / 1000);
          const value = progress === 1 ? end : Math.round(end * (1 - (1 + 8 * progress) * Math.exp(-8 * progress)));
          const text = value + suffix;
          if (heading.textContent !== text) heading.textContent = text;
          if (progress < 1) running.set(target, requestAnimationFrame(update));
        };
        running.set(target, requestAnimationFrame(update));
      });
    }, { threshold: .1 });
    document.querySelectorAll('[data-counter]').forEach(el => observer.observe(el));
  }

  function entrances() {
    const config = JSON.parse(document.getElementById('page-motion')?.textContent || '{}');
    if (reducedMotion.matches) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        observer.unobserve(target);
        const effect = config[target.dataset.framerAppearId];
        const initial = effect.initial;
        const final = effect.animate;
        const transition = final.transition || {};
        const from = [];
        if (initial.transformPerspective) from.push(`perspective(${initial.transformPerspective}px)`);
        if (initial.x) from.push(`translateX(${initial.x}px)`);
        if (initial.y) from.push(`translateY(${initial.y}px)`);
        for (const key of ['rotate', 'rotateX', 'rotateY', 'skewX', 'skewY']) {
          if (initial[key]) from.push(`${key}(${initial[key]}deg)`);
        }
        if (initial.scale !== undefined) from.push(`scale(${initial.scale})`);
        target.animate([
          { opacity: initial.opacity ?? 1, transform: from.join(' ') || 'none' },
          { opacity: final.opacity ?? 1, transform: target.style.transform || 'none' },
        ], { duration: (transition.duration ?? 1) * 1000, delay: (transition.delay ?? 0) * 1000,
          easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
      });
    }, { threshold: 0 });
    document.querySelectorAll('[data-framer-appear-id]').forEach(el => {
      if (config[el.dataset.framerAppearId]) observer.observe(el);
    });
  }

  function scrollEffects() {
    const portraits = [...document.querySelectorAll('.framer-OzlK9 [data-framer-name="Avatar Wrap"]')];
    const projects = [...document.querySelectorAll('.framer-OzlK9 [data-framer-name^="Featured Project -"]')];
    if (!portraits.length && !projects.length) return;
    let frame = 0, dirty = true, height = 0, desktop = false, mobile = false;
    let portraitEffects = [], projectEffects = [];
    const transforms = new WeakMap();
    const write = (el, transform) => {
      if (transforms.get(el) === transform) return;
      el.style.transform = transform;
      transforms.set(el, transform);
    };

    // Measure only when layout changes. Scroll frames use cached document
    // positions, never alternating geometry reads with transform writes.
    const measure = () => {
      dirty = false;
      const y = scrollY;
      height = innerHeight;
      desktop = innerWidth >= 1200;
      mobile = innerWidth < 810;
      portraitEffects = portraits.filter(el => el.offsetWidth).map(el => {
        const page = el.closest('.framer-OzlK9');
        return { el,
          serviceTop: page.querySelector('#service').getBoundingClientRect().top + y,
          aboutTop: page.querySelector('#about').getBoundingClientRect().top + y };
      });
      const groups = new Map();
      projects.filter(el => el.offsetWidth).forEach(el => {
        const container = el.closest('.framer-lyues5');
        if (!groups.has(container)) groups.set(container, []);
        groups.get(container).push(el);
      });
      projectEffects = [];
      for (const [container, cards] of groups) {
        const style = getComputedStyle(container);
        const gap = parseFloat(style.rowGap) || 0;
        let top = container.getBoundingClientRect().top + y + (parseFloat(style.paddingTop) || 0);
        const positions = cards.map(el => {
          const box = getComputedStyle(el);
          let size = parseFloat(box.height);
          if (box.boxSizing !== 'border-box') {
            size += ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
              .reduce((total, key) => total + (parseFloat(box[key]) || 0), 0);
          }
          const position = top;
          top += size + gap;
          return position;
        });
        cards.forEach((el, index) => projectEffects.push({ el, nextTop: positions[index + 1] }));
      }
    };
    const update = () => {
      frame = 0;
      if (dirty) measure();
      const y = scrollY;
      const staticMotion = mobile || reducedMotion.matches;
      portraitEffects.forEach(({ el, serviceTop, aboutTop }) => {
        if (staticMotion) { write(el, 'perspective(1200px)'); return; }
        const first = clamp((height + y - serviceTop) / height);
        const second = clamp((height + y - aboutTop) / height);
        const x = first * (desktop ? 340 : 200);
        const rotateY = 150 * first + 190 * second;
        const rotate = 10 * first - 5 * second;
        const scale = 1 - (desktop ? .1 : .15) * first + (desktop ? .1 : .05) * second;
        write(el, `perspective(1200px) translateX(${x}px) rotate(${rotate}deg) rotateY(${rotateY}deg) scale(${scale})`);
      });
      projectEffects.forEach(({ el, nextTop }) => {
        if (staticMotion || nextTop === undefined) { write(el, 'none'); return; }
        // The next card's normal flow position is stable while its sticky box
        // and scale move. Using the transformed box here creates feedback.
        const progress = clamp((height + y - nextTop) / (height - 80));
        write(el, `scale(${1 - .2 * progress})`);
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const invalidate = () => { dirty = true; schedule(); };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', invalidate, { passive: true });
    addEventListener('pageshow', invalidate);
    reducedMotion.addEventListener('change', invalidate);
    const observer = new ResizeObserver(invalidate);
    // Disclosure and font/language changes can move the sections without a
    // window resize. Transforms do not change these observed layout sizes.
    [document.body, ...document.querySelectorAll('.framer-OzlK9 #service, .framer-OzlK9 #about, .framer-lyues5')]
      .forEach(el => observer.observe(el));
    document.fonts?.ready.then(invalidate);
    schedule();
  }

  function cursor() {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches || reducedMotion.matches) return;
    const dot = document.createElement('div');
    dot.className = 'presentation-cursor';
    dot.setAttribute('aria-hidden', 'true');
    document.body.append(dot);
    let x = 0, y = 0, frame = 0;
    const update = () => { frame = 0; dot.style.transform = `translate3d(${x}px,${y}px,0)`; };
    document.addEventListener('pointermove', event => {
      x = event.clientX; y = event.clientY;
      const outside = event.target.closest('#site-navigation,input,textarea,select');
      dot.toggleAttribute('data-visible', !outside);
      dot.toggleAttribute('data-large', !outside && Boolean(event.target.closest('a,[data-framer-cursor]')));
      if (!frame) frame = requestAnimationFrame(update);
    }, { passive: true });
    document.addEventListener('mouseleave', () => dot.removeAttribute('data-visible'));
    addEventListener('blur', () => dot.removeAttribute('data-visible'));
  }

  function cardInteractions() {
    // The captured CSS encodes component hover geometry with the .hover class.
    document.querySelectorAll('a,[data-highlight]').forEach(el => {
      el.addEventListener('mouseenter', () => el.classList.add('hover'));
      el.addEventListener('mouseleave', () => el.classList.remove('hover'));
    });
    document.querySelectorAll('[data-framer-name="Avatar Card Flip"]').forEach(card => {
      card.addEventListener('click', () => card.toggleAttribute('data-flipped'));
    });
    document.querySelectorAll('[data-framer-name="About Cards Wrap"]').forEach(wrap => {
      const cards = [...wrap.children];
      const gallery = JSON.parse(wrap.dataset.gallery || '[]');
      const count = Math.max(cards.length, gallery.length);
      if (count < 2) return;
      let index = 0;
      wrap.setAttribute('role', 'button');
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('aria-label', document.documentElement.lang === 'zh-CN' ? '切换照片' : 'Next photo');
      const next = () => {
        index = (index + 1) % count;
        if (cards.length === 1) {
          const image = wrap.querySelector('img');
          Object.entries(gallery[index]).forEach(([name, value]) => image.setAttribute(name, value));
          if (!reducedMotion.matches) image.animate([{ opacity: .3 }, { opacity: 1 }], { duration: 400 });
        } else {
          wrap.style.transform = `translateX(-50%) perspective(1200px) translateY(${-cards[index].offsetTop}px)`;
        }
      };
      wrap.addEventListener('click', next);
      wrap.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); next(); }
      });
    });
  }

  function forms() {
    document.querySelectorAll('form').forEach(form => form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      let status = form.querySelector('[role="status"]');
      if (!status) { status = document.createElement('p'); status.setAttribute('role', 'status'); form.append(status); }
      status.textContent = document.documentElement.lang === 'zh-CN' ? '当前暂未接入订阅服务。' : 'The subscription service is not connected yet.';
    }));
  }

  const init = () => { disclosures(); counters(); entrances(); scrollEffects(); cursor(); cardInteractions(); forms(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
