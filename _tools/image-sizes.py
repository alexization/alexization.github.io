"""글 그림의 원본 크기를 _data/images.yml에 적음. 이미 적힌 그림은 건너뜀.

화면(_includes/blog/img-attrs.html)이 이 목록으로
  - 본문 그림에 width·height를 붙여서 그림이 늦게 와도 글이 밀리지 않게 하고
  - 원본보다 큰 버전을 고르지 않게 크기별 주소(srcset)를 만듦
목록에 없는 그림은 지금처럼 원본 주소 그대로 나옴. 새 글을 올린 뒤 한 번 돌리면 추가됨.

크기별 주소가 없는 호스트(imgur 말고)의 1MB 넘는 그림은 사이트에 WebP 사본을 만듦
  assets/images/posts/<파일 이름>-<가로>.webp  (가로 640·1024·1600 중 원본보다 작은 것)

준비: python3 -m venv .venv && .venv/bin/pip install fonttools brotli pillow
실행: .venv/bin/python _tools/image-sizes.py
"""

import glob
import io
import os
import re
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "_data", "images.yml")
COPY_DIR = os.path.join(ROOT, "assets", "images", "posts")
COPY_WIDTHS = (640, 1024, 1600)
COPY_OVER = 1024 * 1024
RESIZABLE_HOSTS = ("i.imgur.com",)

LINE = re.compile(r'^"(?P<url>[^"]+)": \{ w: (?P<w>\d+), h: (?P<h>\d+)(?:, copy: \[(?P<copy>[\d, ]+)\])? \}$')
MD_IMAGE = re.compile(r"!\[[^\]]*\]\((https?://[^)\s]+)")
FRONT_IMAGE = re.compile(r'^\s*(?:og_image|image|overlay_image|teaser):\s*"?(https?://[^"\s]+)', re.M)
CODE_FENCE = re.compile(r"^(```|~~~).*?^\1", re.M | re.S)


def post_image_urls():
    urls = set()
    for path in glob.glob(os.path.join(ROOT, "_posts", "*.md")):
        text = open(path, encoding="utf-8").read()
        urls.update(FRONT_IMAGE.findall(text))
        urls.update(MD_IMAGE.findall(CODE_FENCE.sub("", text)))
    return urls


def load():
    entries = {}
    if os.path.exists(DATA):
        for line in open(DATA, encoding="utf-8"):
            m = LINE.match(line.strip())
            if m:
                copy = [int(x) for x in m["copy"].split(",")] if m["copy"] else None
                entries[m["url"]] = (int(m["w"]), int(m["h"]), copy)
    return entries


def make_copies(url, image):
    stem = os.path.splitext(os.path.basename(url.split("?")[0]))[0]
    widths = [w for w in COPY_WIDTHS if w < image.width] or [image.width]
    os.makedirs(COPY_DIR, exist_ok=True)
    image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    for width in widths:
        height = round(image.height * width / image.width)
        out = os.path.join(COPY_DIR, f"{stem}-{width}.webp")
        image.resize((width, height), Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
        print(f"  사본 {os.path.relpath(out, ROOT)} {os.path.getsize(out) / 1024:.0f}KB")
    return widths


def main():
    entries = load()
    for url in sorted(post_image_urls() - entries.keys()):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            data = urllib.request.urlopen(request, timeout=60).read()
            image = Image.open(io.BytesIO(data))
            image.load()
        except Exception as error:
            print(f"건너뜀 {url}: {error}")
            continue
        copy = None
        if not url.startswith(tuple(f"https://{h}/" for h in RESIZABLE_HOSTS)) and len(data) > COPY_OVER:
            copy = make_copies(url, image)
        entries[url] = (image.width, image.height, copy)
        print(f"추가 {url} {image.width}x{image.height}")

    with open(DATA, "w", encoding="utf-8") as f:
        f.write("# 글 그림의 원본 크기(가로 w, 세로 h). _tools/image-sizes.py가 만듦\n")
        f.write("# copy: 사이트에 둔 WebP 사본의 가로들(assets/images/posts/<파일 이름>-<가로>.webp)\n")
        for url in sorted(entries):
            w, h, copy = entries[url]
            extra = f", copy: [{', '.join(map(str, copy))}]" if copy else ""
            f.write(f'"{url}": {{ w: {w}, h: {h}{extra} }}\n')
    print(f"{len(entries)}개 → {os.path.relpath(DATA, ROOT)}")


if __name__ == "__main__":
    main()
