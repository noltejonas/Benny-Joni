#!/usr/bin/env python3
"""Compose faithful App Store artwork around existing, unmodified UI captures.

Requires Pillow. Output is a 6.9-inch store canvas, not a claim that the
embedded capture was recorded on a different device. All source pixels are
uniformly resized; no app UI or data is reconstructed or cropped.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/launch/screenshots"
WIDTH, HEIGHT = 1320, 2868
REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
COPY = {
    "de": {
        "01": ("Dein Ziel.", "Deine Leute."),
        "02": ("Jeder Satz zählt.",),
        "04": ("Fortschritt im Blick.",),
        "05": ("Euer Einsatz.", "Eure Regeln."),
        "footer": "Fitness-Challenges mit Freunden",
    },
    "en": {
        "01": ("Your goal.", "Your people."),
        "02": ("Every set counts.",),
        "04": ("Progress you can see.",),
        "05": ("Your stakes.", "Your rules."),
        "footer": "Fitness challenges with friends",
    },
}


def render_play_assets(lang):
    destination = ROOT / "ios/App/fastlane/play-metadata" / ("de-DE" if lang == "de" else "en-GB") / "images"
    destination.mkdir(parents=True, exist_ok=True)
    with Image.open(ROOT / "www/icons/icon-512.png") as original:
        icon = original.convert("RGBA")
        if icon.size != (512, 512):
            raise ValueError("The existing brand icon must be 512 × 512")
        icon.save(destination / "icon.png", optimize=True)
        feature_icon = icon.convert("RGB").resize((300, 300), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (1024, 500), "#24174F")
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((580, -260, 1260, 420), fill="#372168")
    draw.ellipse((810, -80, 1210, 320), fill="#493079")
    draw.text((52, 51), "BENNY & JONI", font=font(25, True), fill="#D9CDFC")
    lines = COPY[lang]["01"]
    for i, line in enumerate(lines):
        draw.text((48, 137 + i * 75), line, font=font(64, True), fill="#FFFFFF")
    subtitle = "Fitness-Challenges mit Freunden" if lang == "de" else "Fitness challenges with friends"
    draw.text((52, 355), subtitle, font=font(27), fill="#E5DFF4")
    draw.rounded_rectangle((651, 87, 971, 407), radius=24, fill="#FFFFFF")
    # Existing icon only: no reconstructed UI and no claim of an Android capture.
    canvas.paste(feature_icon, (661, 97))
    canvas.save(destination / "featureGraphic.png", optimize=True)
    print((destination / "featureGraphic.png").relative_to(ROOT))


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else REGULAR, size)


def render(source, lang):
    canvas = Image.new("RGB", (WIDTH, HEIGHT), "#F1EFF9")
    draw = ImageDraw.Draw(canvas)
    # Quiet brand accents sit entirely outside the embedded app capture.
    draw.ellipse((940, -320, 1660, 400), fill="#E5DFFC")
    draw.ellipse((1120, -150, 1500, 230), fill="#DAD2FA")
    draw.text((100, 70), "BENNY & JONI", font=font(32, True), fill="#5540CE", spacing=3)
    lines = COPY[lang][source.name[:2]]
    title_font = font(78, True)
    # Keep both language variants inside the same fixed header region.
    while max(draw.textlength(line, font=title_font) for line in lines) > 1120:
        title_font = font(title_font.size - 2, True)
    top = 150 if len(lines) == 2 else 192
    for n, line in enumerate(lines):
        draw.text((100, top + n * 88), line, font=title_font, fill="#1B182B")

    with Image.open(source) as original:
        original = original.convert("RGB")
        target_width = 1080
        target_height = round(original.height * target_width / original.width)
        capture = original.resize((target_width, target_height), Image.Resampling.LANCZOS)
    x, y = (WIDTH - capture.width) // 2, 390
    frame = (x - 12, y - 12, x + capture.width + 12, y + capture.height + 12)
    shadow = Image.new("RGBA", (WIDTH, HEIGHT))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (frame[0], frame[1] + 22, frame[2], frame[3] + 22), radius=64, fill=(36, 22, 89, 35)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(frame, radius=64, fill="#FFFFFF", outline="#D6D0EC", width=3)
    # Deliberately preserve the whole rectangle, including status bar and app
    # navigation. The surrounding frame adds decoration without masking UI.
    canvas.paste(capture, (x, y))
    caption = COPY[lang]["footer"]
    draw.text((WIDTH / 2, 2804), caption, font=font(29), anchor="mm", fill="#746C8A")
    destination = BASE / f"iphone-6.9-{lang}" / source.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, "JPEG", quality=96, subsampling=0, optimize=True)
    print(destination.relative_to(ROOT))


for language in COPY:
    for source_file in sorted((BASE / f"iphone-6.3-{language}").glob("*.jpg")):
        # The old Feed capture contains historical Work entries and is not
        # part of the sports-only launch set. A fresh Feed can be added later.
        if source_file.name[:2] in COPY[language]:
            render(source_file, language)
    render_play_assets(language)
