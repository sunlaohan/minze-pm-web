"""Preserve the reference site's published layouts and localize its dependencies.

Run only when deliberately updating the reference baseline. Normal development,
preview, and builds do not use the network or require Python dependencies.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from hashlib import sha256
from html import unescape
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import json
import re
import time
import runpy

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://portavia.framer.website"
SEEDS = ["/", "/projects", "/about", "/blogs", "/404"]
PHOSPHOR_ORIGIN = 'https://framer.com/m/phosphor-icons/'
PHOSPHOR_ICONS = ('XLogo', 'InstagramLogo', 'BehanceLogo', 'DribbbleLogo', 'Star', 'FramerLogo')
# This optional submit-spinner asset is already missing on the published site.
# Use a small local vector fallback; local forms do not enter its loading state.
FALLBACKS = {
    'https://framerusercontent.com/images/pGiXYozQ3mE4cilNOItfe2L2fUA.svg':
        b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="black" stroke-width="2" stroke-linecap="round" d="M12 3a9 9 0 1 1-9 9"/></svg>'
}
ASSET_RE = re.compile(
    r'https://(?:framerusercontent\.com|fonts\.gstatic\.com|fonts\.googleapis\.com)/'
    r'[A-Za-z0-9_./%~+\-]+\.(?:mjs|json|js|css|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|avif|mp4|webm)(?![A-Za-z0-9_.-])'
    r'(?:\?[^\s<>"\'`\\),]*)?'
)
MODULE_RE = re.compile(r'["\'`](\./[^"\'`\s]+\.mjs)["\'`]')
CMS_RE = re.compile(r'new URL\([`"\'](\./[^`"\']+\.framercms)[`"\'],[`"\'](https://[^`"\']+)[`"\']\)\.href\.replace\([`"\']/modules/[`"\'],[`"\']/cms/[`"\']\)')


def cms_url(match):
    return urljoin(match[2], match[1]).replace('/modules/', '/cms/')


def fetch(url):
    cache = Path('/tmp/portavia-mirror-cache') / sha256(url.encode()).hexdigest()
    if cache.exists():
        return cache.read_bytes()
    for attempt in range(4):
        try:
            with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=45) as response:
                content = response.read()
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_bytes(content)
                return content
        except HTTPError as error:
            if error.code == 404 and url in FALLBACKS:
                return FALLBACKS[url]
            if url == ORIGIN + '/404' and error.code == 404:
                content = error.read()
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_bytes(content)
                return content
            if attempt == 3:
                raise RuntimeError(f'Could not download {url}: {error}') from error
            time.sleep(attempt + 1)
        except Exception as error:
            if attempt == 3:
                raise RuntimeError(f'Could not download {url}: {error}') from error
            time.sleep(attempt + 1)


def canonical(url):
    return unescape(url).split("?")[0]


def local_path(url):
    parsed = urlsplit(canonical(url))
    name = Path(parsed.path).name
    if url.startswith(PHOSPHOR_ORIGIN):
        return '/assets/runtime/icons/' + name.split('.')[0] + '.mjs'
    suffix = Path(name).suffix
    if suffix in (".mjs", ".js"):
        return "/assets/runtime/" + name
    if suffix == '.framercms':
        return '/assets/data/' + name
    kind = "fonts" if suffix in (".woff", ".woff2", ".ttf", ".otf") else "media"
    return "/assets/" + kind + "/" + name


def download_batch(urls):
    results = {}
    with ThreadPoolExecutor(max_workers=8) as executor:
        jobs = {executor.submit(fetch, url): url for url in sorted(urls)}
        for job in as_completed(jobs):
            url = jobs[job]
            results[url] = job.result()
    return results


def clean_html(source, path):
    soup = BeautifulSoup(source, "html.parser")
    # Keep React's comment separators between adjacent dynamic text nodes.
    # Removing empty comments merges counters such as "0" and " +" in the
    # server HTML, which would trigger a hydration mismatch on the home page.
    for tag in soup.select('script[src*="events.framer.com"], meta[name="framer-search-index"], meta[name="framer-search-index-fallback"], meta[name="generator"]'):
        tag.decompose()
    for script in soup.find_all("script"):
        if "__framer_force_showing_editorbar_since" in script.text:
            script.decompose()
    for selector in ('[data-framer-name="Get Template ( you can delete )"]', '[data-framer-name="New Release ( you can delete )"]'):
        for promotion in soup.select(selector):
            promotion.clear()
    for service in soup.select('#service [data-framer-cursor]'):
        service['data-framer-cursor'] = '17ph7dh'
    badge = soup.select_one("#__framer-badge-container")
    if badge:
        badge.clear()
    for link in soup.find_all("a", href=True):
        href = link["href"]
        if href.startswith(("./", "../")):
            link["href"] = urlsplit(urljoin(ORIGIN + path, href)).path + ("#" + href.split("#", 1)[1] if "#" in href else "")
    for base in soup.find_all("base"):
        base.decompose()
    css = soup.new_tag("link", rel="stylesheet", href="/styles/local.css")
    soup.head.append(css)
    script = soup.new_tag("script", src="/scripts/local.js")
    soup.head.append(script)
    # Match the original fallback for JavaScript navigation to unknown routes.
    return str(soup)


def main():
    pages, pending = {}, set(SEEDS)
    while pending:
        batch = download_batch({ORIGIN + path for path in pending})
        pending = set()
        for url, content in batch.items():
            path = urlsplit(url).path
            text = content.decode()
            pages[path] = text
            soup = BeautifulSoup(text, "html.parser")
            for link in soup.find_all("a", href=True):
                href = link["href"]
                if href.startswith(("./", "../")):
                    target = urlsplit(urljoin(url, href)).path
                    if target not in pages and target not in [urlsplit(u).path for u in batch]:
                        pending.add(target)
        print(f"Captured {len(pages)} pages", flush=True)

    # Phosphor resolves these imports dynamically, outside the static URL graph.
    assets, queue = {}, {PHOSPHOR_ORIGIN + name + '.js@0.0.57' for name in PHOSPHOR_ICONS}
    for source in pages.values():
        queue.update(canonical(match.group()) for match in ASSET_RE.finditer(source))
    while queue:
        batch = download_batch(queue)
        queue = set()
        assets.update(batch)
        for url, content in batch.items():
            if url.startswith(PHOSPHOR_ORIGIN) or Path(urlsplit(url).path).suffix in (".mjs", ".js", ".css", ".json", ".svg", ".framercms"):
                text = content.decode('latin1') if url.endswith('.framercms') else content.decode()
                found = {canonical(match.group()) for match in ASSET_RE.finditer(text)}
                if url.endswith((".mjs", ".js")):
                    found.update(urljoin(url, module) for module in MODULE_RE.findall(text))
                    found.update(cms_url(match) for match in CMS_RE.finditer(text))
                queue.update(found - assets.keys())
        print(f"Saved {len(assets)} dependencies; {len(queue)} remaining", flush=True)

    def localize(text):
        text = CMS_RE.sub(lambda match: 'new URL(`' + local_path(cms_url(match)) + '`,location.origin).href', text)
        return ASSET_RE.sub(lambda match: local_path(match.group()) if canonical(match.group()) in assets else match.group(), text)

    for url, content in assets.items():
        target = ROOT / "public" / local_path(url).lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.suffix in (".mjs", ".js", ".css", ".json", ".svg"):
            text = localize(content.decode())
            # Published CMS requests use Framer's ?range= CDN protocol. Local
            # files are small; cache each full file and slice it in the browser,
            # keeping static builds independent of that proprietary endpoint.
            text = re.sub(
                r'async function h\(e,t\)\{let n=Be\(t\).*?return t\.map\(e=>u\.read\(e\.from,e\.to-e\.from\)\)\}',
                'var __localCMSFiles=new Map;async function h(e,t){let n=__localCMSFiles.get(e);if(!n){n=fetch(e).then(async r=>{if(!r.ok)throw Error(`Local CMS request failed: ${r.status}`);return new Uint8Array(await r.arrayBuffer())});__localCMSFiles.set(e,n)}let r=await n;return t.map(e=>r.slice(e.from,e.to))}',
                text,
            )
            # The four service-specific cursor variants contain floating photos.
            # Reuse the site's ordinary dot cursor instead of mounting those.
            for cursor in ('m5u3ny', '12j85ib', 'l38x1i', '16q859'):
                text = text.replace('`' + cursor + '`', '`17ph7dh`')
            if target.name.startswith("script_main."):
                # Remove optional hosted editor, both promotional widgets, and badge.
                text = re.sub(r'EditorBar:u===void 0\?void 0:\(\(\)=>\{.*?\}\)\(\),adaptLayoutToTextDirection:', 'EditorBar:void 0,adaptLayoutToTextDirection:', text)
                text = re.sub(r'children:m\((?:Gn|zr),\{[^{}]*\}\)', 'children:null', text)
                text = text.replace('(function(){Ei&&D(()=>{T(document.getElementById(`__framer-badge-container`)', '(function(){false&&D(()=>{T(document.getElementById(`__framer-badge-container`)')
                text = text.replace('siteCanonicalURL:`https://portavia.framer.website`', 'siteCanonicalURL:location.origin')
            # Debug source maps are not needed to run the local site.
            text = re.sub(r'\n?//# sourceMappingURL=.*', '', text)
            content = text.encode()
        elif target.suffix == '.framercms':
            # CMS indexes use byte offsets into these files. Replace image URLs
            # with equally long local URLs so their binary offsets stay valid.
            def preserve_offsets(match):
                original = match.group()
                if canonical(original) not in assets:
                    return original
                replacement = local_path(original)
                if len(replacement) < len(original):
                    replacement += '?' + 'x' * (len(original) - len(replacement) - 1)
                if len(replacement) != len(original):
                    raise ValueError('CMS URL replacement must preserve byte length: ' + original)
                return replacement
            content = ASSET_RE.sub(preserve_offsets, content.decode('latin1')).encode('latin1')
        target.write_bytes(content)

    manifest = {"reference": ORIGIN, "routes": [], "assets": []}
    for path, source in sorted(pages.items()):
        slug = "index" if path == "/" else path.lstrip("/")
        target = ROOT / "src/pages" / (slug + ".html")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(localize(clean_html(source, path)))
        manifest["routes"].append({"path": path, "source": str(target.relative_to(ROOT))})
    for url in sorted(assets):
        file = ROOT / "public" / local_path(url).lstrip("/")
        entry = {"reference": url, "local": local_path(url), "bytes": file.stat().st_size, "sha256": sha256(file.read_bytes()).hexdigest()}
        if url in FALLBACKS:
            entry['note'] = 'Local vector fallback for an unavailable optional form spinner.'
        manifest["assets"].append(entry)
    (ROOT / "reference-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    runpy.run_path(str(ROOT / 'scripts/customize-reference.py'), run_name='__main__')
    print(f"Complete: {len(pages)} routes, {len(assets)} local dependencies", flush=True)


if __name__ == "__main__":
    main()
