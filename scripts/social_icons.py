"""Apply the locally saved iconfont social SVGs to all social icon slots."""
from hashlib import sha256
from pathlib import Path
from urllib.parse import quote
import json
import re
import xml.etree.ElementTree as ET

ICONS = [
    ('wechat', 'WeChat', '微信', '77156', 'XLogo', ('1blrhjt', 'p11f1k', '16ft3t1')),
    ('xiaohongshu', 'Xiaohongshu', '小红书', '40336764', 'InstagramLogo', ('1jvvc3y', 'yj3w9z', '5grdll')),
    ('douyin', 'Douyin', '抖音', '18166694', 'BehanceLogo', ('30cdzv', '1nl2v36', '1yo788g')),
    ('bilibili', 'Bilibili', '哔哩哔哩', '25039620', 'DribbbleLogo', ('1gzurvg', '1e8f6cw', '15j1vxj')),
]
OLD_URLS = ('https://x.com/', 'https://x.com/home', 'https://www.instagram.com/', 'https://www.behance.net/', 'https://dribbble.com/')
# Optical size and centering within the unchanged square icon slots. The
# tall music note needs less scale; the wider bubbles and TV need more.
OPTICAL = {
    'wechat': (1.06, 0.45, 1.3),
    'xiaohongshu': (1.0, 0.0, 0.0),
    'douyin': (0.85, 0.0, 0.0),
    'bilibili': (1.12, 0.45, 3.2),
}


def customize_social_icons(root):
    labels = {name: label for _, label, _, _, _, names in ICONS for name in names}
    classes = '|'.join(map(re.escape, labels))
    added_assets = []
    runtime_icons = root / 'public/assets/runtime/icons'

    for key, label, chinese, icon_id, alias, _ in ICONS:
        local_svg = f'/assets/media/social/{key}.svg'
        svg = ET.fromstring((root / 'public' / local_svg.lstrip('/')).read_text())
        assert svg.attrib['viewBox'] == '0 0 1024 1024'
        paths = []
        for child in svg:
            assert child.tag.endswith('}path') and 'd' in child.attrib
            attrs = { {'fill-rule': 'fillRule', 'clip-rule': 'clipRule'}.get(k, k): v for k, v in child.attrib.items() }
            paths.append('React.createElement("path",' + json.dumps(attrs) + ')')
        # The captured icon renderer uses a 256-unit outer SVG. Retain its
        # currentColor inheritance and scale the iconfont 1024-unit paths.
        scale, dx, dy = OPTICAL[key]
        transform = f'translate({128 + dx} {128 + dy}) scale({scale}) translate(-128 -128) scale(0.25)'
        module = f'''// {label}: iconfont icon {icon_id}. Source SVG: {local_svg}
let Component;
export default function Icon(React) {{
  if (!Component) Component = React.forwardRef(({{weight, ...props}}, ref) =>
    React.createElement("g", {{...props, ref, transform: "{transform}", fill: "currentColor"}}, {', '.join(paths)}));
  return Component;
}}
'''
        module_name = f'Social{label}.mjs'
        (runtime_icons / module_name).write_text(module)
        # Preserve the captured renderer's registered icon names as aliases.
        (runtime_icons / f'{alias}.mjs').write_text(f'// Compatibility alias for the local {label} SVG.\nexport {{ default }} from "./{module_name}";\n')
        reference = 'https://www.iconfont.cn/search/index?searchType=icon&q=' + quote(chinese)
        for local in (local_svg, '/assets/runtime/icons/' + module_name):
            added_assets.append({'reference': reference, 'local': local, 'note': f'iconfont icon {icon_id}; {label} solid monochrome SVG.'})

    def html_label(match):
        tag = match.group(0)
        name = re.search(r'\bframer-(' + classes + r')\b', tag)[1]
        tag = re.sub(r'\s(?:role|aria-label)="[^"]*"', '', tag)
        return tag[:-1] + f' role="img" aria-label="{labels[name]}">'

    for path in (root / 'src/pages').rglob('*.html'):
        source = path.read_text()
        output = source
        for url in OLD_URLS:
            # No account URLs are supplied for these platforms. Remove the
            # template's unrelated social destinations, matching the footer.
            def inert_icon(match):
                link = match[0]
                if not re.search(r'\bframer-(' + classes + r')\b', link):
                    return link
                link = re.sub(r'\s(?:href|target|rel)="[^"]*"', '', link)
                return re.sub(r'^<a\b', '<span', link).replace('</a>', '</span>')
            output = re.sub(r'<a\b[^>]*href="' + re.escape(url) + r'"[^>]*>.*?</a>', inert_icon, output, flags=re.S)
        output = re.sub(r'<span\b[^>]*class="[^"]*\bframer-(' + classes + r')\b[^>]*>', html_label, output)
        if output != source:
            path.write_text(output)

    for path in (root / 'public/assets/runtime').glob('*.mjs'):
        source = path.read_text()
        output = source
        for url in OLD_URLS:
            output = output.replace('href:`' + url + '`', 'href:void 0')
        output = re.sub(r'(\b\w+\(\w+)\.a(?=,\{className:`framer-(?:' + classes + r')\b)', r'\1.span', output)

        def runtime_label(match):
            label = labels[match[2]]
            return match[1] + f',role:`img`,"aria-label":`{label}`'

        output = re.sub(r'(className:`framer-(' + classes + r')\b[^`]*`)(?:,(?:"aria-label":`[^`]*`|role:`img`))*', runtime_label, output)
        if output != source:
            path.write_text(output)

    manifest_path = root / 'reference-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    for asset in added_assets:
        if not any(item['local'] == asset['local'] for item in manifest['assets']):
            manifest['assets'].append(asset)
    for asset in manifest['assets']:
        data = (root / 'public' / asset['local'].lstrip('/')).read_bytes()
        asset.update(bytes=len(data), sha256=sha256(data).hexdigest())
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print('Applied WeChat, Xiaohongshu, Douyin, and Bilibili solid SVGs to all social slots.')


if __name__ == '__main__':
    customize_social_icons(Path(__file__).resolve().parents[1])
