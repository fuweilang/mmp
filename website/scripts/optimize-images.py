#!/usr/bin/env python3
"""Write the public images the site actually ships.

Sources live in assets/. public/ only receives resized WebP (and a small favicon),
so the static export does not copy the original PNGs.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
PUBLIC = ROOT / "public"


def resized(image: Image.Image, width: int) -> Image.Image:
    if image.width <= width:
        return image.copy()
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def save_webp(image: Image.Image, dest: Path, width: int | None, quality: int) -> None:
    output = image if width is None else resized(image, width)
    if output.mode not in ("RGB", "RGBA"):
        output = output.convert("RGBA" if "A" in output.getbands() else "RGB")
    dest.parent.mkdir(parents=True, exist_ok=True)
    output.save(dest, "WEBP", quality=quality, method=6)


def main() -> None:
    for folder in (PUBLIC / "shots", PUBLIC / "experts"):
        if folder.exists():
            for old in folder.iterdir():
                if old.is_file():
                    old.unlink()
    for stale in (PUBLIC / "logo.png", PUBLIC / "logo.webp", PUBLIC / "favicon.png"):
        if stale.exists():
            stale.unlink()

    logo = Image.open(ASSETS / "logo.png")
    save_webp(logo, PUBLIC / "logo.webp", 192, 82)
    favicon = resized(logo.convert("RGBA"), 48)
    favicon.save(PUBLIC / "favicon.png", "PNG", optimize=True)

    for name in ("gallery", "chat"):
        shot = Image.open(ASSETS / "shots" / f"{name}.png")
        save_webp(shot, PUBLIC / "shots" / f"{name}.webp", 1440, 74)
        save_webp(shot, PUBLIC / "shots" / f"{name}-800.webp", 800, 74)

    for source in sorted((ASSETS / "experts").glob("*.jpg")):
        avatar = Image.open(source)
        save_webp(avatar, PUBLIC / "experts" / f"{source.stem}.webp", 128, 78)

    shipped = [path for path in PUBLIC.rglob("*") if path.is_file()]
    total = sum(path.stat().st_size for path in shipped)
    print(f"public images: {len(shipped)} files, {total / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
