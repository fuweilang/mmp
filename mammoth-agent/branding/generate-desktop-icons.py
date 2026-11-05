#!/usr/bin/env python3
"""Generate rounded-corner Mammoth AI logo assets and desktop app icons."""
import os
import shutil
import subprocess
from PIL import Image, ImageDraw

from pathlib import Path
import argparse

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true', help='显式替换桌面端资源；默认仅预览生成')
args = parser.parse_args()
SRC = str(HERE / 'desktop-logo-source.png')
OUT = str(HERE / 'generated' / 'desktop')
RES = str(HERE.parent / 'apps' / 'desktop' / 'resources') if args.apply else str(HERE / 'generated' / 'desktop' / 'resources')
os.makedirs(RES, exist_ok=True)

RADIUS_RATIO = 0.125  # 12.5% 圆角，轻微但可见

os.makedirs(OUT, exist_ok=True)
logo = Image.open(SRC).convert("RGBA")
assert logo.size == (2048, 2048), logo.size


def rounded(img: Image.Image, radius: int) -> Image.Image:
    # 4x supersample mask for smooth corners
    scale = 4
    mask = Image.new("L", (img.width * scale, img.height * scale), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, img.width * scale - 1, img.height * scale - 1],
                        radius=radius * scale, fill=255)
    mask = mask.resize(img.size, Image.LANCZOS)
    out = img.copy()
    out.putalpha(mask)
    return out


def resize(img, size):
    return img.resize((size, size), Image.LANCZOS)


# 1) 圆角 logo 主资产（透明圆角）
master = rounded(logo, int(2048 * RADIUS_RATIO))  # 256px @2048
for size in (2048, 1024, 512, 256, 128, 64):
    resize(master, size).save(f"{OUT}/mammoth-logo-rounded-{size}.png")
# 也保留直角原图缩放版，方便对比/备用
for size in (1024, 512):
    resize(logo, size).save(f"{OUT}/mammoth-logo-square-{size}.png")

# 2) 桌面端图标
win1024 = resize(master, 1024)
# Windows 安装器/窗口图标
win1024 = resize(master, 1024)
win1024.save(f"{RES}/icon-windows.png")

# icon.png: 1104 画布 + 1024 圆角 logo 居中（沿用原来的留白布局）
padded = Image.new("RGBA", (1104, 1104), (0, 0, 0, 0))
padded.paste(win1024, (40, 40), win1024)
padded.save(f"{RES}/icon.png")

# macOS: 系统会自己套圆角遮罩，给直角满版 1024（图标内容占满，OS 裁切）
resize(logo, 1024).save(f"{RES}/icon-macos.png")

# 3) icon.icns：iconset + iconutil
iconset = str(Path(OUT) / "AppIcon.iconset")
shutil.rmtree(iconset, ignore_errors=True)
os.makedirs(iconset)
macsrc = resize(logo, 1024)
for name, px in {
    "icon_16x16.png": 16, "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32, "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128, "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256, "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512, "icon_512x512@2x.png": 1024,
}.items():
    resize(macsrc, px).save(f"{iconset}/{name}")
subprocess.run(["iconutil", "--convert", "icns", iconset,
                "--output", f"{RES}/icon.icns"], check=True)

# 4) Windows 托盘 ico：多尺寸
tray_sizes = [(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (256, 256)]
win1024.save(f"{RES}/tray-windows.ico", sizes=tray_sizes)

shutil.rmtree(iconset)
print("done")
for f in sorted(os.listdir(OUT)):
    print(" ", f)
