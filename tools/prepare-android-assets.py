#!/usr/bin/env python3
"""Create native Android resources from the existing app artwork (Pillow)."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android/app/src/main/res"
icon = Image.open(ROOT / "www/icons/icon-512.png").convert("RGB")
maskable = Image.open(ROOT / "www/icons/icon-512-maskable.png").convert("RGB")

for density, scale in {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}.items():
    directory = RES / f"mipmap-{density}"
    directory.mkdir(parents=True, exist_ok=True)
    for name in ["ic_launcher", "ic_launcher_round"]:
        icon.resize((int(48 * scale),) * 2, Image.Resampling.LANCZOS).save(directory / f"{name}.png")
    maskable.resize((int(108 * scale),) * 2, Image.Resampling.LANCZOS).save(directory / "ic_launcher_foreground.png")

for image_path in RES.glob("drawable*/splash.png"):
    with Image.open(image_path) as original:
        canvas = Image.new("RGB", original.size, "#F4F3F8")
    side = max(64, min(canvas.size) // 4)
    logo = icon.resize((side, side), Image.Resampling.LANCZOS)
    canvas.paste(logo, ((canvas.width - side) // 2, (canvas.height - side) // 2))
    canvas.save(image_path, optimize=True)

print("Android icons and launch resources prepared from existing artwork.")
