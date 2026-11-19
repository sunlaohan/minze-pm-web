"""Migrate the captured layout to independent HTML/CSS/JavaScript interactions.

The CSS and responsive variants remain the visual source of truth. This step is
idempotent and also runs after refreshing the reference, so the old router,
hydration, pointer replay, and navigation interception cannot return unnoticed.
"""
from pathlib import Path
import json
import re
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
METRICS = {'Years of Experience': (10, '+'), 'Completed Projects': (50, '+'), 'Clients on Worldwide': (200, 'W+')}
FAQ_PREFIXES = [
    'I specialize in UI/UX design,', 'My process begins with discovery and planning,',
    'The timeline depends on the scope of the project.', 'Typically, I’ll need information about your business,',
    'Yes, revisions are part of my process', 'Simply reach out through my contact page',
]
# Match only the captured button's dedicated responsive wrapper. Keeping the
# replacement textual preserves unrelated image attributes and source ordering.
LOAD_MORE_WRAPPER = re.compile(
    r'<div\b(?=[^>]*\bclass="[^"]*\bssr-variant\b)[^>]*>\s*'
    r'<div\b[^>]*>\s*'
    r'<button\b(?=[^>]*\bclass="[^"]*\bframer-5HJhH\b)[^>]*>'
    r'[\s\S]*?</button>\s*</div>\s*</div>'
)


def transform(value):
    parts = []
    if value.get('transformPerspective'): parts.append(f"perspective({value['transformPerspective']}px)")
    for key in ['x', 'y']:
        if value.get(key): parts.append(f"translate{key.upper()}({value[key]}px)")
    for key in ['rotate', 'rotateX', 'rotateY', 'skewX', 'skewY']:
        if value.get(key): parts.append(f'{key}({value[key]}deg)')
    if value.get('scale', 1) != 1: parts.append(f"scale({value['scale']})")
    return ' '.join(parts) or 'none'


def migrate():
    icons = json.loads((ROOT / 'src/partials/icons.json').read_text())
    profile_source = (ROOT / 'src/scripts/profile-copy.js').read_text()
    profile = json.loads(profile_source[profile_source.index('{'):profile_source.rfind('}') + 1])
    faq_answers = [next(key for key in profile['entries'] if key.startswith(prefix)) for prefix in FAQ_PREFIXES]
    total = 0
    removed_pagination = 0
    for path in (ROOT / 'src/pages').rglob('*.html'):
        source = path.read_text()
        # These captured CMS controls have no native pagination data or action.
        # Remove their responsive wrappers too, so no empty grid row remains.
        cleaned, removed = LOAD_MORE_WRAPPER.subn('', source)
        if re.search(r'<button\b[^>]*\bframer-5HJhH\b', cleaned):
            raise ValueError(f'Unrecognized pagination wrapper: {path}')
        removed_pagination += removed
        soup = BeautifulSoup(cleaned, 'html.parser')
        native = soup.html.get('data-native-page') == 'true'
        if native:
            if cleaned != source: path.write_text(cleaned)
            continue
        appear = soup.select_one('#__framer__appearAnimationsContent')
        motion = json.loads(appear.string) if appear else {}
        motion_config = {}
        for el in soup.select('[data-framer-appear-id]'):
            key = el['data-framer-appear-id']
            config = motion.get(key, {}).get('default')
            if not config: continue
            motion_config[key] = config
            style = re.sub(r'(?:^|;)\s*(?:opacity|transform|will-change)\s*:[^;]*', '', el.get('style', ''))
            el['style'] = style.strip(';') + ';opacity:1;transform:' + transform(config['animate'])
        for script in list(soup.select('script')):
            if script.get('src') not in ['/scripts/local.js', '/scripts/profile-copy.js', '/scripts/translations.js']:
                script.decompose()
        for link in list(soup.select('link[rel="modulepreload"],link[href^="/assets/runtime/"]')): link.decompose()
        for cls, markup in icons.items():
            for container in soup.select('.' + cls):
                if not container.select_one('svg'):
                    container.clear()
                    container.append(BeautifulSoup(markup, 'html.parser'))
        # About's social containers differ from Home; reuse exactly the same SVG.
        social = {}
        for span in soup.select('[role="img"][aria-label]'):
            svg = span.select_one('svg')
            if svg: social[span['aria-label']] = str(svg)
        for span in soup.select('[role="img"][aria-label]'):
            if span.select_one('svg'): continue
            label = span['aria-label']
            if label in social:
                holder = span.select_one('[class$="-container"]')
                if holder:
                    holder.clear()
                    markup = social[label]
                    if not span.find_parent('footer'):
                        markup = re.sub(r'var\(--token-861b2ae9-dee3-4143-a255-6faa9a39d943,\s*rgb\(255,\s*255,\s*255\)\)', 'var(--token-a9f688eb-778b-4a71-929e-ebf8a014b4cf, rgb(48, 48, 48))', markup)
                    holder.append(BeautifulSoup(markup, 'html.parser'))
        for badge in soup.select('.framer-DCBRB'):
            hand = soup.new_tag('span', attrs={'class': 'native-hand', 'aria-hidden': 'true'})
            hand.append(BeautifulSoup(icons['framer-1rl3kp7-container'], 'html.parser'))
            badge.append(hand)
        gallery = []
        for image in soup.select('[data-framer-name="About Cards Wrap"] img'):
            if not any(item['src'] == image['src'] for item in gallery):
                gallery.append({name: image[name] for name in ['src', 'srcset', 'alt'] if name in image.attrs})
        for wrap in soup.select('[data-framer-name="About Cards Wrap"]'):
            wrap['data-gallery'] = json.dumps(gallery, separators=(',', ':'))
        for index, card in enumerate(soup.select('.framer-2k6sY')):
            top, bottom = card.select_one('[data-framer-name="Top"]'), card.select_one('[data-framer-name="Bottom"]')
            if not top or not bottom: continue
            heading = top.select('h4')[-1].get_text(strip=True)
            question_index = int(top.select('h4')[0].get_text(strip=True).rstrip('.')) - 1
            card['data-disclosure'] = 'faq'
            top['data-disclosure-toggle'] = ''
            top['role'] = 'button'
            top['aria-expanded'] = 'false'
            top['aria-controls'] = bottom['id'] = 'faq-answer-' + str(index)
            bottom['data-disclosure-panel'] = ''
            bottom['aria-hidden'] = 'true'
            rich = soup.new_tag('div', attrs={'class': 'framer-114yip9', 'data-framer-component-type': 'RichTextContainer'})
            p = soup.new_tag('p', attrs={'class': 'framer-text framer-styles-preset-17cdd8a', 'data-styles-preset': 'UezruUh9E', 'style': '--framer-text-alignment:left'})
            p.string = faq_answers[question_index]
            rich.append(p); bottom.append(rich)
        for index, card in enumerate(soup.select('.framer-Oq4zO')):
            top, bottom = card.select_one('[data-framer-name="Top"]'), card.select_one('[data-framer-name="Bottom"]')
            if not top or not bottom: continue
            card.attrs.pop('tabindex', None)
            card['data-disclosure'] = 'service'
            top['data-disclosure-toggle'] = ''; top['role'] = 'button'; top['tabindex'] = '0'
            top['aria-expanded'] = 'false'; top['aria-controls'] = bottom['id'] = 'service-panel-' + str(index)
            bottom['data-disclosure-panel'] = ''; bottom['aria-hidden'] = 'true'
        for card in soup.select('.framer-bsCWJ'):
            p = card.select_one('p')
            metric = METRICS.get(p.get_text(strip=True)) if p else None
            if metric: annotate_counter(card.select_one('.framer-zfw4zw-container'), *metric)
        for card in soup.select('[data-framer-name="Achieve Number"]'):
            label = card.get_text(' ', strip=True)
            annotate_counter(card.select_one('[class$="-container"]'), 80 if 'Satisfaction Rate' in label else 90, '%')
        # Empty overlay/React portals are not part of the presentation.
        for el in list(soup.select('#overlay,#template-overlay,#__framer-badge-container,#svg-templates')): el.decompose()
        if motion_config:
            script = soup.new_tag('script', attrs={'id': 'page-motion', 'type': 'application/json'})
            script.string = json.dumps(motion_config, separators=(',', ':'))
            soup.body.append(script)
        script = soup.new_tag('script', src='/scripts/interactions.js', defer='')
        soup.head.append(script)
        link = soup.new_tag('link', rel='stylesheet', href='/styles/interactions.css')
        soup.head.append(link)
        soup.html['data-native-page'] = 'true'
        path.write_text(str(soup))
        total += 1
    print(f'Migrated {total} pages to native navigation and interactions.')
    print(f'Removed {removed_pagination} inactive pagination controls.')


def annotate_counter(container, end, suffix):
    if not container: return
    headings = container.select('h3')
    if not headings: return
    container['data-counter'] = str(end)
    container['data-counter-suffix'] = suffix
    for index, heading in enumerate(headings):
        heading.clear(); heading.append(str(end) + suffix)
        if index == 0: heading['aria-hidden'] = 'true'


if __name__ == '__main__': migrate()
