#!/usr/bin/env python3
"""从 mammoth-logo.png 生成桌面/Web/Ground 所需多尺寸资源。"""
from __future__ import annotations
import base64, io, os, shutil, struct, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(__file__).resolve().parent / 'mammoth-logo.png'
OUT = Path(__file__).resolve().parent / 'generated'
OUT.mkdir(parents=True, exist_ok=True)

src = Image.open(SRC).convert('RGBA')

def resize(size: int) -> Image.Image:
    return src.resize((size, size), Image.Resampling.LANCZOS)

def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format='PNG', optimize=True)
    print('wrote', path.relative_to(ROOT), img.size)

def png_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii')

def pack_ico(sizes: list[int]) -> bytes:
    entries = []
    for s in sizes:
        buf = io.BytesIO(); resize(s).save(buf, format='PNG', optimize=True)
        entries.append((s, buf.getvalue()))
    header = bytearray(6 + 16 * len(entries))
    struct.pack_into('<HHH', header, 0, 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    blobs = []
    for i, (s, png) in enumerate(entries):
        at = 6 + 16 * i
        header[at] = 0 if s == 256 else s
        header[at + 1] = 0 if s == 256 else s
        struct.pack_into('<HHII', header, at + 4, 1, 32, len(png), offset)
        offset += len(png)
        blobs.append(png)
    return bytes(header) + b''.join(blobs)

for name, size in [
    ('icon-1104.png', 1104), ('icon-1024.png', 1024), ('icon-512.png', 512),
    ('icon-192.png', 192), ('icon-180.png', 180), ('icon-128.png', 128),
    ('icon-64.png', 64), ('icon-48.png', 48), ('icon-32.png', 32),
    ('mark-24.png', 24), ('mark-34.png', 34), ('icon-maskable-512.png', 512),
    ('mammoth-mark-128.png', 128),
]:
    save_png(resize(size), OUT / name)

(OUT / 'tray-windows.ico').write_bytes(pack_ico([16, 20, 24, 32, 40, 48, 64]))
(OUT / 'favicon.ico').write_bytes(pack_ico([16, 32, 48]))
print('wrote icos')

iconset = OUT / 'AppIcon.iconset'
if iconset.exists():
    shutil.rmtree(iconset)
iconset.mkdir()
mapping = {
    16: ['icon_16x16.png'], 32: ['icon_16x16@2x.png', 'icon_32x32.png'],
    64: ['icon_32x32@2x.png'], 128: ['icon_128x128.png'],
    256: ['icon_128x128@2x.png', 'icon_256x256.png'],
    512: ['icon_256x256@2x.png', 'icon_512x512.png'], 1024: ['icon_512x512@2x.png'],
}
for size, names in mapping.items():
    im = resize(size)
    for n in names:
        im.save(iconset / n, format='PNG')
subprocess.check_call(['iconutil', '-c', 'icns', str(iconset), '-o', str(OUT / 'icon.icns')])
print('wrote icon.icns')

b64_1024 = png_b64(resize(1024))
b64_64 = png_b64(resize(64))
b64_mark36 = png_b64(resize(36))
(OUT / 'mammoth-mark-24.b64.txt').write_text(png_b64(resize(48)))

def tile_svg(width: int, height: int, *, tray: bool, inset: bool) -> str:
    glyph = '<g id="tray-glyph" filter="url(#filter1_ddi_1637_371)">' if tray else '<g filter="url(#filter1_ddi_1637_371)">'
    if inset:
        body = f'''<g filter="url(#filter0_d_1637_371)">
{glyph}
<image x="40" y="32" width="1024" height="1024" href="data:image/png;base64,{b64_1024}" xlink:href="data:image/png;base64,{b64_1024}" preserveAspectRatio="xMidYMid meet"/>
<path d="M40 32h1024v1024H40z" fill="none"/>
</g>
</g>'''
    else:
        body = f'''<g transform="translate(32 32) scale(0.9375) translate(-40 -32)"><g filter="url(#filter0_d_1637_371)">
{glyph}
<image x="40" y="32" width="1024" height="1024" href="data:image/png;base64,{b64_1024}" xlink:href="data:image/png;base64,{b64_1024}" preserveAspectRatio="xMidYMid meet"/>
<path d="M40 32h1024v1024H40z" fill="none"/>
</g>
</g></g>'''
    return f'''<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
{body}
<defs>
<filter id="filter0_d_1637_371" x="-8" y="-16" width="1120" height="1120" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
</filter>
<filter id="filter1_ddi_1637_371" x="40" y="32" width="1024" height="1024" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
</filter>
</defs>
</svg>
'''

(OUT / 'icon.svg').write_text(tile_svg(1104, 1104, tray=False, inset=True))
(OUT / 'icon-macos.svg').write_text(tile_svg(1024, 1024, tray=False, inset=False))
(OUT / 'icon-windows.svg').write_text(tile_svg(1024, 1024, tray=True, inset=False))
fav = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64" viewBox="0 0 64 64">
<image width="64" height="64" href="data:image/png;base64,{b64_64}" xlink:href="data:image/png;base64,{b64_64}"/>
</svg>
'''
(OUT / 'favicon.svg').write_text(fav)
(OUT / 'favicon-dark.svg').write_text(fav)
(OUT / 'welcome-brand.svg').write_text(f'''<svg width="472" height="40" viewBox="0 0 472 40" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<style>
  :root {{ --mm-label: #0f1115; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --mm-label: #f9fafb; }} }}
</style>
<image x="0" y="2" width="36" height="36" href="data:image/png;base64,{b64_mark36}" xlink:href="data:image/png;base64,{b64_mark36}"/>
<text x="48" y="28" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif" font-size="26" font-weight="600" fill="var(--mm-label)">猛犸智能体</text>
</svg>
''')
print('wrote svgs')
shutil.rmtree(iconset)
print('OK — 输出位于 branding/generated；不会自动替换项目内资源。')
