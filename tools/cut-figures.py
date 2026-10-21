#!/usr/bin/env python3
"""Schneidet Benny und Joni aus einem freigestellten Pose-Bild (beide nebeneinander,
Benny links) und legt sie als WebP mit Maßen in www/figures/ ab.

    python3 tools/cut-figures.py <pose> <freigestellt.png> [<pose> <bild.png> ...]

Braucht Pillow (pip install pillow). Die Maße landen in www/figures/manifest.js:
Bildgröße, Fußmitte (axis), Kappenoberkante (top) und Boden (ground) in Pixeln.
PTOnboarding.figureLayout rechnet daraus die Darstellung, damit jede Pose gleich
groß auf derselben Linie steht, egal wie weit die Kamera beim Erzeugen weg war.
"""
import json
import os
import re
import sys

from PIL import Image, ImageChops, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'www', 'figures')
MANIFEST = os.path.join(OUT, 'manifest.js')
ALPHA = 40          # ab hier zählt ein Pixel zur Figur
PAD = 6             # Rand um den Zuschnitt
MAX_H = 900         # größere Bilder werden verkleinert (reicht für @3x)


def components(alpha, w, h):
    """Zusammenhängende Flächen (4er-Nachbarschaft) als Listen von Pixelindizes."""
    seen = bytearray(w * h)
    comps = []
    for i in range(w * h):
        if seen[i] or alpha[i] <= ALPHA:
            continue
        seen[i] = 1
        stack, pix = [i], []
        while stack:
            j = stack.pop()
            pix.append(j)
            x, y = j % w, j // w
            for k in (j - 1 if x else -1, j + 1 if x < w - 1 else -1, j - w if y else -1, j + w if y < h - 1 else -1):
                if k >= 0 and not seen[k] and alpha[k] > ALPHA:
                    seen[k] = 1
                    stack.append(k)
        comps.append(pix)
    return comps


def figures(alpha, w, h):
    """Zwei Pixelmengen, links Benny, rechts Joni. Kleine Splitter gehen an die
    nächste Figur. Berühren sich beide, wird an der dünnsten Spalte getrennt."""
    comps = sorted(components(alpha, w, h), key=len, reverse=True)
    if len(comps) >= 2 and len(comps[1]) > len(comps[0]) * 0.3:
        figs = [list(comps[0]), list(comps[1])]
        cx = [sum(i % w for i in f) / len(f) for f in figs]
        for c in comps[2:]:
            mx = sum(i % w for i in c) / len(c)
            figs[0 if abs(mx - cx[0]) < abs(mx - cx[1]) else 1].extend(c)
        figs.sort(key=lambda f: sum(i % w for i in f) / len(f))
        return figs
    cols = [0] * w
    for c in comps:
        for i in c:
            cols[i % w] += 1
    lo, hi = int(w * 0.3), int(w * 0.7)
    mid = min(range(lo, hi), key=lambda x: cols[x])
    every = [i for c in comps for i in c]
    return [[i for i in every if i % w < mid], [i for i in every if i % w >= mid]]


def measure(pix, w):
    xs = [i % w for i in pix]
    ys = [i // w for i in pix]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    hgt = y1 - y0
    # Fußmitte aus den untersten 4 % (Schuhe)
    low = y1 - max(4, hgt // 25)
    feet = [x for x, y in zip(xs, ys) if y >= low]
    axis = (min(feet) + max(feet)) / 2
    # Kappe: oberste Zeile im Band um die Körperachse (hochgestreckte Arme liegen außerhalb)
    band = max(6, int(hgt * 0.05))
    rows = {}
    for x, y in zip(xs, ys):
        if abs(x - axis) < band:
            rows[y] = rows.get(y, 0) + 1
    top = min(y for y, n in rows.items() if n > 3)
    return (x0, y0, x1, y1), axis, top, y1


def cut(pose, path, manifest):
    img = Image.open(path).convert('RGBA')
    w, h = img.size
    alpha = img.getchannel('A')
    for who, pix in zip(('benny', 'joni'), figures(alpha.tobytes(), w, h)):
        box, axis, top, ground = measure(pix, w)
        # Nur diese Figur behalten, 2 px Rand für weiche Kanten
        buf = bytearray(w * h)
        for i in pix:
            buf[i] = 255
        mask = Image.frombytes('L', (w, h), bytes(buf)).filter(ImageFilter.MaxFilter(5))
        one = img.copy()
        one.putalpha(ImageChops.multiply(alpha, mask))
        cx0, cy0 = max(0, box[0] - PAD), max(0, box[1] - PAD)
        cx1, cy1 = min(w, box[2] + PAD), min(h, box[3] + PAD)
        part = one.crop((cx0, cy0, cx1, cy1))
        k = min(1, MAX_H / part.height)
        if k < 1:
            part = part.resize((round(part.width * k), round(part.height * k)), Image.LANCZOS)
        name = f'{who}-{pose}.webp'
        part.save(os.path.join(OUT, name), 'WEBP', quality=86, method=6)
        manifest.setdefault(who, {})[pose] = {
            'src': f'figures/{name}',
            'w': part.width, 'h': part.height,
            'axis': round((axis - cx0) * k, 1),
            'top': round((top - cy0) * k, 1),
            'ground': round((ground - cy0) * k, 1),
        }
        print(f'{name}: {part.width}x{part.height}, Körper {round((ground - top) * k)} px')


def main(args):
    if len(args) < 2 or len(args) % 2:
        sys.exit(__doc__)
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    if os.path.exists(MANIFEST):
        m = re.search(r'=\s*(\{.*\});', open(MANIFEST, encoding='utf-8').read(), re.S)
        if m:
            manifest = json.loads(m.group(1))
    for pose, path in zip(args[::2], args[1::2]):
        cut(pose, path, manifest)
    body = json.dumps(manifest, indent=2, sort_keys=True)
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        f.write('// Erzeugt von tools/cut-figures.py — nicht von Hand ändern.\n')
        f.write(f'window.PTFigures = {body};\n')


if __name__ == '__main__':
    main(sys.argv[1:])
