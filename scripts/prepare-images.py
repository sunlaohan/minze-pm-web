#!/usr/bin/env python3
"""Build real responsive WebP assets and update native pages without reformatting them.

Run with Python 3 + Pillow. Originals stay available for provenance/rebuilds;
the production build only ships referenced optimized assets.
"""
from pathlib import Path
from html import escape
from html.parser import HTMLParser
from hashlib import sha256
import json
import re

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/images'
RASTER = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'}
WIDTHS = (96, 320, 640, 960, 1280, 1600)
# Processing settings participate in the URL hash, so a future quality/codec
# change cannot reuse an immutable browser cache entry from an older build.
ENCODING_SIGNATURE = b'webp-q78-method6-small-lossless-native-webp-v2'
CREDITS = json.loads((ROOT / 'assets-source/unsplash/credits.json').read_text())
PHOTOS = {entry['key']: entry for entry in CREDITS['entries']}
ROUTES = {entry['route']: entry for entry in CREDITS['entries']}
PRACTICE_IMAGES = {
    '/assets/media/xPotMb4VrNT5rTGtXQvpYqXunU.jpg': 'ai-service-reporting',
    '/assets/media/hleE21gbHw2Y29KULoer3tF8.jpg': 'maintenance-agent',
    '/assets/media/RTNUbNmEH3Lg1VzA3NOYHdp3bHQ.jpg': 'compose-ai',
    '/assets/media/ZbUvwGb7xhhwmovo3t9YO4bAIGs.jpg': 'component-skill-toolkit',
}
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())


def url(path):
    return '/' + str(path.relative_to(ROOT / 'public'))


def make_variants(path):
    raw = path.read_bytes()
    digest = sha256(raw + ENCODING_SIGNATURE).hexdigest()[:10]
    with Image.open(path) as image:
        animated = getattr(image, 'n_frames', 1) > 1
        base = ImageOps.exif_transpose(image).copy()
        width, height = base.size
        maximum = min(width, 1600, round(2400 * width / height))
        widths = sorted({value for value in WIDTHS if value < maximum} | {maximum})
        if width <= 128:
            widths = [width]
        variants = []
        for target in widths:
            output = OUT / f'{path.stem}.{digest}-{target}.webp'
            size = (target, max(1, round(height * target / width)))
            if not output.exists():
                frame = base.resize(size, Image.Resampling.LANCZOS)
                if frame.mode not in ('RGB', 'RGBA'):
                    frame = frame.convert('RGBA' if 'transparency' in image.info else 'RGB')
                options = dict(format='WEBP', quality=78, method=6)
                if width <= 256 and not animated:
                    options = dict(format='WEBP', lossless=True, method=6)
                if animated:
                    frames, durations = [], []
                    for index in range(image.n_frames):
                        image.seek(index)
                        frames.append(image.convert('RGBA').resize(size, Image.Resampling.LANCZOS))
                        durations.append(image.info.get('duration', 100))
                    frame = frames[0]
                    options.update(save_all=True, append_images=frames[1:], duration=durations,
                                   loop=image.info.get('loop', 0))
                if path.suffix.lower() == '.webp' and size == base.size and not animated:
                    # Existing optimized avatars must not expand after another
                    # lossy/lossless transcode; keep the original encoded bytes.
                    output.write_bytes(raw)
                else:
                    frame.save(output, **options)
            variants.append(dict(src=url(output), width=target, height=size[1], bytes=output.stat().st_size))
        return dict(source=str(path.relative_to(ROOT)), originalBytes=len(raw),
                    width=width, height=height, frames=getattr(image, 'n_frames', 1), variants=variants)


def image_attrs(asset, sizes):
    variants = asset['variants']
    default = min(variants, key=lambda v: abs(v['width'] - 960))
    return dict(src=default['src'], srcset=', '.join(f"{v['src']} {v['width']}w" for v in variants),
                sizes=sizes, width=str(asset['width']), height=str(asset['height']))


def updated_tag(raw, attrs, remove=()):
    """Only edit named attributes, leaving all unrelated template markup intact."""
    for name in set(remove) | set(attrs):
        raw = re.sub(r'\s+' + re.escape(name) + r'(?:\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+))?(?=[\s/>])', '', raw, flags=re.I)
    end = '/>' if raw.endswith('/>') else '>'
    return raw[:-len(end)].rstrip() + ''.join(f' {name}="{escape(str(value), quote=True)}"' for name, value in attrs.items()) + end


class PageImages(HTMLParser):
    def __init__(self, text, route, assets):
        super().__init__(convert_charrefs=False)
        self.text, self.route, self.assets = text, route, assets
        self.stack, self.edits = [], []
        self.line_offsets = [0]
        self.line_offsets.extend(match.end() for match in re.finditer('\n', text))

    def tag_offset(self):
        line, column = self.getpos()
        return self.line_offsets[line - 1] + column

    def replace(self, raw, value):
        if raw != value:
            self.edits.append((self.tag_offset(), len(raw), value))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        raw = self.get_starttag_text()
        context = self.stack + [(tag, attributes)]
        names = [item.get('data-framer-name', '') for _, item in context]
        ids = [item.get('id', '') for _, item in context]
        changes = {}
        if 'data-framer-background-image-wrapper' in attributes:
            changes.update({'data-media-frame': '', 'data-media-state': 'pending'})
        if tag == 'img':
            original = attributes.get('data-image-original', attributes.get('src', ''))
            source = original
            card_route = next((item['href'].split('#')[0] for _, item in reversed(context[:-1])
                               if item.get('href', '').split('#')[0] in ROUTES), None)
            photo = ROUTES.get(card_route)
            if self.route == '/' and 'Testimonials' in names and original in PRACTICE_IMAGES:
                photo = PHOTOS[PRACTICE_IMAGES[original]]
            in_content = 'Project Content' in names or 'Blog Content' in names
            current = ROUTES.get(self.route)
            if not photo and current and in_content:
                # A detail route uses a matching cover and related business scenes
                # for its existing editorial image slots, without changing geometry.
                slot = next((name for name in reversed(names) if re.match(r'Image - \d+', name)), '')
                number = int(slot.rsplit(' ', 1)[1]) if slot else 0
                photo = PHOTOS[current['bodyImages'][(number - 1) % len(current['bodyImages'])]] if number else current
            if photo:
                source = photo['source']
                changes.update({'data-photo-key': photo['key'], 'alt': photo['altZh'],
                                'data-alt-zh': photo['altZh'], 'data-alt-en': photo['altEn']})
                style = attributes.get('style', '')
                style = re.sub(r'object-position\s*:[^;]*', 'object-position:' + photo['recommendedObjectPosition'], style)
                changes['style'] = style
            # Use the original high quality Shiba for responsive variants; keep
            # the separately cropped navigation avatar exactly as supplied.
            if original == '/assets/media/office-shiba-800.webp':
                source = '/assets/media/office-shiba.png'
            asset = self.assets.get(source)
            if asset:
                nav = 'site-navigation' in ids
                featured = any('Featured Project' in name for name in names)
                sizes = '40px' if nav else '(max-width: 809px) calc(100vw - 40px), 600px' if card_route and not featured else '(max-width: 809px) 80vw, 34vw' if any('Avatar Card' in n for n in names) else '(max-width: 809px) calc(100vw - 40px), (max-width: 1199px) 90vw, 1200px'
                changes.update(image_attrs(asset, sizes))
                if nav:
                    # A 40px avatar doesn't need a 1254px image or a large slot.
                    changes.update(width='40', height='40')
                changes.update({'data-image-original': original, 'decoding': 'async',
                                'loading': 'eager' if nav else 'lazy', 'data-media-image': ''})
                if nav or current and in_content and not any(re.match(r'Image - \d+', n) for n in names):
                    changes['fetchpriority'] = 'high'
                else:
                    changes['fetchpriority'] = 'auto'
            elif source.endswith('.svg'):
                # Vectors stay lossless and also participate in loading states.
                changes.update({'data-media-image': '', 'loading': 'lazy', 'decoding': 'async'})
        if 'data-gallery' in attributes:
            gallery = json.loads(attributes['data-gallery'])
            for item in gallery:
                original = item.get('data-image-original', item.get('src'))
                source = '/assets/media/office-shiba.png' if original == '/assets/media/office-shiba-800.webp' else original
                if source in self.assets:
                    item.update(image_attrs(self.assets[source], '(max-width: 809px) 80vw, 34vw'))
                    item['data-image-original'] = original
            changes['data-gallery'] = json.dumps(gallery, ensure_ascii=False, separators=(',', ':'))
        if tag == 'meta' and (attributes.get('property') == 'og:image' or attributes.get('name') == 'twitter:image'):
            source = ROUTES[self.route]['source'] if self.route in ROUTES else '/assets/media/office-shiba.png'
            changes['content'] = self.assets[source]['variants'][-1]['src']
        # Mark text blocks only within page content, excluding navigation/footer.
        # This prevents a flash of untranslated copy while localization initializes.
        if tag in {'h1', 'h2', 'h3', 'h4', 'p'} and 'body' in [t for t, _ in context] and not any(t in {'nav', 'footer'} for t, _ in context):
            changes['data-content-placeholder'] = ''
        if changes:
            self.replace(raw, updated_tag(raw, changes))
        if tag not in VOID:
            self.stack.append((tag, attributes))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                return

    def result(self):
        text = self.text
        for offset, length, value in reversed(self.edits):
            text = text[:offset] + value + text[offset + length:]
        text = re.sub(r'<link\b[^>]*href="/styles/media.css"[^>]*>\s*', '', text)
        text = re.sub(r'<script\b[^>]*src="/scripts/media.js"[^>]*></script>\s*', '', text)
        # Fetch copy controllers in parallel without blocking HTML parsing. A
        # small early controller can display real skeletons while they arrive.
        for name in ('translations', 'profile-copy', 'local'):
            text = re.sub(r'<script\b[^>]*src="/scripts/' + name + r'\.js"[^>]*>',
                          '<script defer src="/scripts/' + name + '.js">', text)
        text = text.replace('<script defer src="/scripts/translations.js">',
                            '<link rel="stylesheet" href="/styles/media.css"/>\n<script src="/scripts/media.js"></script>\n<script defer src="/scripts/translations.js">')
        return text


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    previous_manifest = ROOT / 'image-manifest.json'
    previous_files = set()
    if previous_manifest.exists():
        for asset in json.loads(previous_manifest.read_text())['assets'].values():
            previous_files.update(variant['src'] for variant in asset['variants'])
    sources = sorted(path for path in (ROOT / 'public/assets/media').rglob('*') if path.suffix.lower() in RASTER)
    sources += sorted((ROOT / 'assets-source/unsplash').glob('*.jpg'))
    assets = {}
    for path in sources:
        # Favicon remains PNG for broad browser compatibility (already only 9KB).
        if path.name.endswith('favicon.png'):
            continue
        key = url(path) if path.is_relative_to(ROOT / 'public') else str(path.relative_to(ROOT))
        assets[key] = make_variants(path)
    routes = json.loads((ROOT / 'reference-manifest.json').read_text())['routes']
    for route in routes:
        path = ROOT / route['source']
        text = path.read_text()
        parser = PageImages(text, route['path'], assets)
        parser.feed(text)
        result = parser.result()
        if result != text:
            path.write_text(result)
    largest_before = sum(asset['originalBytes'] for asset in assets.values())
    largest_after = sum(asset['variants'][-1]['bytes'] for asset in assets.values())
    manifest = dict(format='WebP', quality=78, assets=assets,
                    totals=dict(originalBytes=largest_before, optimizedLargestBytes=largest_after,
                                reduction=round(1 - largest_after / largest_before, 4)))
    (ROOT / 'image-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    current_files = {variant['src'] for asset in assets.values() for variant in asset['variants']}
    # Only prune files registered by our previous generated manifest, never
    # source media or unrelated assets created by another task.
    for obsolete in previous_files - current_files:
        (ROOT / 'public' / obsolete.lstrip('/')).unlink(missing_ok=True)
    print(f'Prepared {len(assets)} images. Largest variants: {largest_before:,} → {largest_after:,} bytes ({manifest["totals"]["reduction"]:.1%} smaller).')


if __name__ == '__main__':
    main()
