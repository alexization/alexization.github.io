"""Pretendard Variable을 이 블로그에 맞게 줄여서 두 조각으로 나눔.

  A  assets/fonts/blog-sans-a.woff2  지금 사이트에 쓰인 글자 + 영문·숫자·문장 부호.
                                     모든 페이지가 미리 받음(head의 preload)
  B  assets/fonts/blog-sans-b.woff2  상용 한글(KS X 1001 2,350자)·자모·기호 중 A에 없는 것.
                                     unicode-range에 든 글자가 페이지에 있을 때만 받음

새 글에 A에 없는 글자가 나와도 B가 받아 주니 꼭 다시 돌릴 필요는 없음.
가끔 돌리면 새 글자가 A로 옮겨 가서 B를 받는 페이지가 줄어듦.

Pretendard는 SIL OFL이고 예약 이름(Reserved Font Name)이 "Pretendard"라서,
줄인 파일은 글꼴 이름을 "Blog Sans"로 바꿈. 모양은 그대로. 라이선스: assets/fonts/OFL-Pretendard.txt

준비: python3 -m venv .venv && .venv/bin/pip install fonttools brotli pillow
실행: JEKYLL_ENV=production bundle exec jekyll build && .venv/bin/python _tools/subset-fonts.py [빌드 폴더]
"""

import glob
import html
import io
import os
import re
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 빌드 결과 폴더. 다른 곳에 빌드했으면 첫 인자로 넘김
SITE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "_site")
OUT_DIR = os.path.join(ROOT, "assets", "fonts")
SCSS = os.path.join(ROOT, "_sass", "blog", "_font-subset.scss")

SOURCE = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2"
FAMILY = "Blog Sans"
# 블로그에서 쓰는 굵기(400·500·600·700)만 남김
WEIGHT_MIN, WEIGHT_MAX = 400, 700
# 기본 기능 + tnum(글 수 칩의 tabular-nums)
FEATURES_EXTRA = ["tnum"]


def cps(*ranges):
    return {c for a, b in ranges for c in range(a, b + 1)}


# A에 늘 넣는 글자: 영문·숫자·라틴 기호, 문장 부호, 2·3단계 목록 점(◦ ▪, HTML에 없고 브라우저가 그림)
A_FIXED = cps((0x20, 0x7E), (0xA0, 0xFF), (0x2010, 0x205E), (0x25E6, 0x25E6), (0x25AA, 0x25AA))
# B 후보: 상용 한글 + 한글 자모 + 자주 쓰는 기호 묶음
KSX1001 = {
    ord(bytes([hi, lo]).decode("euc-kr"))
    for hi in range(0xB0, 0xC9)
    for lo in range(0xA1, 0xFF)
}
B_POOL = KSX1001 | cps(
    (0x3131, 0x318E),  # 한글 자모
    (0x2190, 0x21FF),  # 화살표
    (0x2200, 0x22FF),  # 수학 기호
    (0x2460, 0x24FF),  # 원 숫자
    (0x2500, 0x257F),  # 상자 선
    (0x25A0, 0x25FF),  # 도형
    (0x3000, 0x303F),  # 한중일 문장 부호
)


def site_chars():
    """빌드된 HTML의 글자(태그·스크립트 빼고) + blog.js가 화면에 넣는 글자 + 검색 데이터 글자."""
    found = set()
    for path in glob.glob(os.path.join(SITE, "**", "*.html"), recursive=True):
        text = open(path, encoding="utf-8").read()
        text = re.sub(r"<script\b.*?</script>|<style\b.*?</style>", " ", text, flags=re.S)
        attrs = " ".join(re.findall(r'(?:alt|aria-label|placeholder|title)="([^"]*)"', text))
        text = re.sub(r"<[^>]+>", " ", text) + " " + attrs
        found.update(ord(c) for c in html.unescape(text))
    # "(새 탭)", "복사됨" 같은 글자. 빠지면 그 한 글자 때문에 모든 페이지가 B를 받음
    script = open(os.path.join(SITE, "assets", "js", "blog.js"), encoding="utf-8").read()
    for literal in re.findall(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`[^`]*`", script):
        found.update(ord(c) for c in literal)
    store = os.path.join(SITE, "assets", "js", "lunr", "lunr-store.js")
    found.update(ord(c) for c in open(store, encoding="utf-8").read())
    return {c for c in found if c >= 0x20}


def make(source, unicodes, out_path):
    font = TTFont(io.BytesIO(source))
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features += FEATURES_EXTRA
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font = instancer.instantiateVariableFont(font, {"wght": (WEIGHT_MIN, WEIGHT_MAX)})
    rename(font)
    font.flavor = "woff2"
    font.save(out_path)
    return set(font.getBestCmap())


def rename(font):
    """OFL 예약 이름 규칙: 고친 글꼴은 "Pretendard" 이름을 못 씀. 저작권·상표·라이선스 줄은 그대로 둠."""
    keep = {0, 7, 8, 9, 10, 11, 12, 13, 14}
    for record in font["name"].names:
        if record.nameID in keep:
            continue
        text = record.toUnicode()
        renamed = (
            text.replace("Pretendard Variable", FAMILY)
            .replace("PretendardVariable", FAMILY.replace(" ", ""))
            .replace("Pretendard", FAMILY)
        )
        if renamed != text:
            record.string = renamed


def unicode_range(codepoints):
    runs, start = [], None
    for c in sorted(codepoints):
        if start is None:
            start = prev = c
        elif c == prev + 1:
            prev = c
        else:
            runs.append((start, prev))
            start = prev = c
    runs.append((start, prev))
    return ", ".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in runs)


def main():
    source = urllib.request.urlopen(SOURCE).read()
    available = set(TTFont(io.BytesIO(source)).getBestCmap())

    a_wanted = (site_chars() | A_FIXED) & available
    b_wanted = (B_POOL - a_wanted) & available

    os.makedirs(OUT_DIR, exist_ok=True)
    a_path = os.path.join(OUT_DIR, "blog-sans-a.woff2")
    b_path = os.path.join(OUT_DIR, "blog-sans-b.woff2")
    make(source, a_wanted, a_path)
    b_cmap = make(source, b_wanted, b_path)

    with open(SCSS, "w", encoding="utf-8") as f:
        f.write(
            "// _tools/subset-fonts.py가 만든 파일. 직접 고치지 말고 스크립트를 다시 돌릴 것\n"
            "// Blog Sans = Pretendard Variable을 줄인 글꼴(OFL 예약 이름 규칙 때문에 이름만 다름)\n"
            "// A는 unicode-range 없이 모든 글자를 맡고, B는 A에 없는 글자만 맡아서 그 글자가 있을 때만 받음\n\n"
            "@font-face {\n"
            f'  font-family: "{FAMILY}";\n'
            f"  font-weight: {WEIGHT_MIN} {WEIGHT_MAX};\n"
            "  font-display: swap;\n"
            '  src: url("/assets/fonts/blog-sans-a.woff2") format("woff2");\n'
            "}\n\n"
            "@font-face {\n"
            f'  font-family: "{FAMILY}";\n'
            f"  font-weight: {WEIGHT_MIN} {WEIGHT_MAX};\n"
            "  font-display: swap;\n"
            '  src: url("/assets/fonts/blog-sans-b.woff2") format("woff2");\n'
            f"  unicode-range: {unicode_range(b_cmap)};\n"
            "}\n"
        )

    hangul = lambda s: sum(1 for c in s if 0xAC00 <= c <= 0xD7A3)
    for label, path, chars in (("A", a_path, a_wanted), ("B", b_path, b_wanted)):
        print(f"{label}: {len(chars)}자(한글 {hangul(chars)}) {os.path.getsize(path) / 1024:.1f}KB  {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
