"""Apply local structural changes to the captured reference, without downloads."""
from pathlib import Path
from hashlib import sha256
import json
import re
import runpy

from bs4 import BeautifulSoup
from social_icons import customize_social_icons

ROOT = Path(__file__).resolve().parents[1]
AVATAR_IMAGE = '/assets/media/office-shiba.png'
AVATAR_ALT = 'Shiba Inu working at a laptop'
HERO_FACES = {
    'Front': {'src': AVATAR_IMAGE, 'srcset': AVATAR_IMAGE + ' 1254w', 'alt': AVATAR_ALT, 'width': 1254, 'height': 1254},
    'Back': {'src': '/assets/media/VRQgkdWsjawSg1qpCm45HfSY1I.jpeg', 'srcset': '/assets/media/VRQgkdWsjawSg1qpCm45HfSY1I.jpeg 819w,/assets/media/VRQgkdWsjawSg1qpCm45HfSY1I.jpeg 960w', 'alt': 'Designer workspace with a computer', 'width': 960, 'height': 1200},
}
HERO_IMAGES = ('/assets/media/qrxY8NagVO40NBrdhFEGgFR3PYY.jpg', '/assets/media/VRQgkdWsjawSg1qpCm45HfSY1I.jpeg', AVATAR_IMAGE)
HOME_METRICS = {
    'Years of Experience': (10, '+'),
    'Completed Projects': (50, '+'),
    'Clients on Worldwide': (200, 'W+'),
}
SOCIAL_LABELS = {
    'https://x.com/': 'X',
    'https://www.instagram.com/': 'Instagram',
    'https://www.behance.net/': 'Behance',
    'https://dribbble.com/': 'Dribbble',
}
TOOLKIT_ICONS = {
    '/assets/media/Nf63tXddU52SRtJJgRHqk7zzD2g.png': {'src': '/assets/media/toolkit/codex.svg', 'alt': 'Codex logo', 'reference': 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/codex-color.svg'},
    '/assets/media/RaZetiUCiiVee9pYfau5kIm0k.jpg': {'src': '/assets/media/toolkit/prompt.svg', 'alt': 'Prompt icon', 'reference': 'https://lucide.dev/icons/message-square-code'},
    '/assets/media/KhZnIlAtOozB2Axd5yg9ALd7A.jpg': {'src': '/assets/media/toolkit/workflow.svg', 'alt': 'Workflow icon', 'reference': 'https://lucide.dev/icons/workflow'},
    '/assets/media/FigaBMy3WrTNL79MFKifsXxXE.jpg': {'src': '/assets/media/toolkit/components.svg', 'alt': 'Component library icon', 'reference': 'https://lucide.dev/icons/blocks'},
    '/assets/media/1jsryiRhbB5SoLHzyceqqF9tpo.jpg': {'src': '/assets/media/toolkit/skills.svg', 'alt': 'Skills icon', 'reference': 'https://lucide.dev/icons/book-open-check'},
}


def replace_hero_background(match, face='Front'):
    background = match[0]
    image = HERO_FACES[face]
    background = re.sub(r'alt:`[^`]*`', 'alt:`' + image['alt'] + '`', background)
    background = re.sub(r'pixelHeight:\d+', 'pixelHeight:' + str(image['height']), background)
    background = re.sub(r'pixelWidth:\d+', 'pixelWidth:' + str(image['width']), background)
    background = re.sub(r'src:`[^`]*`', 'src:`' + image['src'] + '`', background)
    return re.sub(r'srcSet:`[^`]*`', 'srcSet:`' + image['srcset'] + '`', background)


def remove_call(source, pattern):
    """Remove a JSX call, respecting nested calls and quoted JS values."""
    while True:
        match = re.search(pattern, source)
        if not match:
            return source
        start = match.start()
        opening = source.index('(', start)
        depth, quote, escaped = 0, None, False
        for end in range(opening, len(source)):
            char = source[end]
            if quote:
                if escaped:
                    escaped = False
                elif char == '\\':
                    escaped = True
                elif char == quote:
                    quote = None
                continue
            if char in ('"', "'", '`'):
                quote = char
            elif char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
                if depth == 0:
                    source = source[:start] + 'null' + source[end + 1:]
                    break
        else:
            raise ValueError('Unbalanced render call: ' + match.group())


def main():
    partial = (ROOT / 'src/partials/navigation.html').read_text()
    for path in (ROOT / 'src/pages').rglob('*.html'):
        soup = BeautifulSoup(path.read_text(), 'html.parser')
        for element in soup.select('#contact,[data-framer-name="Contact"],.framer-1eztli7-container,.framer-1978dwj-container,#site-navigation,footer.framer-d1zaK .framer-55e6gk,footer.framer-d1zaK .framer-10sozgv'):
            if element.parent:
                element.decompose()
        for link in soup.select('footer.framer-d1zaK a[href]'):
            if link['href'] in SOCIAL_LABELS:
                link['aria-label'] = SOCIAL_LABELS[link['href']]
        for face, attributes in HERO_FACES.items():
            for image in soup.select(f'[data-framer-name="Avatar Card / {face}"] img'):
                for name, value in attributes.items():
                    image[name] = str(value)
        for image in soup.select('[data-framer-name="About Card - 1"] img'):
            for name, value in HERO_FACES['Front'].items():
                image[name] = str(value)
        for image in soup.select('[data-framer-name="Tech Stack Card"] img'):
            icon = TOOLKIT_ICONS.get(image.get('src'))
            if icon:
                image['src'], image['alt'] = icon['src'], icon['alt']
        for card in soup.select('.framer-bsCWJ'):
            label = card.select_one('p')
            metric = HOME_METRICS.get(label.get_text(strip=True)) if label else None
            if metric:
                for heading in card.select('.framer-zfw4zw-container h3'):
                    heading.clear()
                    heading.append('0' + metric[1])
        soup.html['lang'] = 'zh-CN'
        soup.html['data-locale'] = 'zh'
        if not soup.select_one('script[src="/scripts/translations.js"]'):
            translations = soup.new_tag('script', src='/scripts/translations.js')
            soup.select_one('script[src="/scripts/local.js"]').insert_before(translations)
        if not soup.select_one('script[src="/scripts/profile-copy.js"]'):
            profile_copy = soup.new_tag('script', src='/scripts/profile-copy.js')
            soup.select_one('script[src="/scripts/local.js"]').insert_before(profile_copy)
        soup.body.insert(0, BeautifulSoup(partial, 'html.parser'))
        path.write_text(str(soup))
    modified = 0
    for path in (ROOT / 'public/assets/runtime').glob('*.mjs'):
        source = path.read_text()
        output = remove_call(source, r'\b\w+\(`section`,\{className:`[^`]+`,"data-framer-name":`Contact`')
        output = remove_call(output, r'\b\w+\(\w+,\{className:`framer-(?:1eztli7|1978dwj)-container`')
        output = remove_call(output, r'\b\w+\(\w+\.div,\{className:`framer-(?:55e6gk|10sozgv)`')
        for name, label in [('16ft3t1', 'X'), ('5grdll', 'Instagram'), ('1yo788g', 'Behance'), ('15j1vxj', 'Dribbble')]:
            pattern = f'className:`framer-{name} framer-1c9vvp2`'
            if pattern in output and f'{pattern},"aria-label":' not in output:
                output = output.replace(pattern, pattern + f',"aria-label":`{label}`')
        if path.name.startswith('Phosphor.'):
            output = output.replace('D=`https://framer.com/m/phosphor-icons/`', 'D=`/assets/runtime/icons/`')
            output = output.replace('import(`${D}${C}.js@0.0.57`)', 'import(`${D}${C}.mjs`)')
        if '"data-framer-name":`Avatar Card / Front`' in output:
            images = '|'.join(re.escape(image) for image in HERO_IMAGES)
            pattern = r'background:\{[^{}]*src:`(?:' + images + r')`[^{}]*\}'
            # Back-face breakpoint overrides precede its render marker; the
            # front-face overrides follow it. Keep their image sources distinct.
            back, marker, front = output.partition('"data-framer-name":`Avatar Card / Back`')
            if not marker:
                raise ValueError('Home avatar back face was not found')
            output = re.sub(pattern, lambda match: replace_hero_background(match, 'Back'), back) + marker + re.sub(pattern, replace_hero_background, front)
        if '"data-framer-name":`About Card - 1`' in output:
            images = '|'.join(re.escape(image) for image in (HERO_IMAGES[0], AVATAR_IMAGE))
            # Replace only the portrait slide; keep the other About photographs.
            output = re.sub(r'\{alt:`[^`]*`,pixelHeight:\d+,pixelWidth:\d+,src:`(?:' + images + r')`,srcSet:`[^`]*`\}', replace_hero_background, output)
        # Match toolkit images to the resume-based capability names.
        for old_source, icon in TOOLKIT_ICONS.items():
            output = output.replace(old_source, icon['src'])
            output = re.sub(r'(src:`' + re.escape(icon['src']) + r'`[^{}]*\},)`Tech Logo`', r'\g<1>`' + icon['alt'] + '`', output)
        output = output.replace('alt:``,src:`/assets/media/toolkit/codex.svg`', 'alt:`Codex logo`,src:`/assets/media/toolkit/codex.svg`')
        # Preserve animated counters while replacing template figures.
        for title, (end, suffix) in HOME_METRICS.items():
            prefix = r'(CSvrESaLr:`' + re.escape(title) + r'`,[^{}]*'
            output = re.sub(prefix + r'k4k7YmQcq:)\d+', lambda match: match[1] + str(end), output)
            output = re.sub(prefix + r'S0H9a8_hu:)`[^`]*`', lambda match: match[1] + '`' + suffix + '`', output)
        output = re.sub(r'end:\d+(?=,font:\{[^}]+\},height:`100%`,id:`nVs56LUpv`)', 'end:80', output)
        output = re.sub(r'end:\d+(?=,font:\{[^}]+\},height:`100%`,id:`tzEpp6_E7`)', 'end:90', output)
        # Use client mounting so localized text never conflicts with English SSR.
        output = output.replace('`framerHydrateV2`in e.dataset?xi(!0,e):xi(!1,e)', 'xi(!1,e)')
        if output != source:
            path.write_text(output)
            modified += 1
    customize_social_icons(ROOT)
    manifest_path = ROOT / 'reference-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    if not any(asset['local'] == AVATAR_IMAGE for asset in manifest['assets']):
        manifest['assets'].append({'reference': 'user-provided:office-shiba.png', 'local': AVATAR_IMAGE, 'note': 'User-provided portfolio portrait.'})
    for icon in TOOLKIT_ICONS.values():
        if not any(asset['local'] == icon['src'] for asset in manifest['assets']):
            manifest['assets'].append({'reference': icon['reference'], 'local': icon['src'], 'note': 'Resume toolkit icon; provenance and licenses in assets/media/toolkit/.'})
    for asset in manifest['assets']:
        file = ROOT / 'public' / asset['local'].lstrip('/')
        asset['bytes'] = file.stat().st_size
        asset['sha256'] = sha256(file.read_bytes()).hexdigest()
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    runpy.run_path(str(ROOT / 'scripts/native-pages.py'), run_name='__main__')
    print(f'Applied navigation, contact, footer, portrait, and local icon changes; updated {modified} runtime modules.')


if __name__ == '__main__':
    main()
