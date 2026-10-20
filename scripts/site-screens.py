"""Copies the app's screenshots from CI into the website (public/site/app/*.webp).

The overview's phones show the app's own screens (CLAUDE.md): English, light mode, the sample day. CI takes
them in "iOS native app" (ios-native.yml) into the Aurin-screens artifact: site/ holds the tabs and a few
screens one tap deeper, smoke/ the website walk of SmokeTests.test4WebsiteScenes, named 4-NN-<name>.png.
Download the artifact from a run on main (Actions → iOS native app → the run → Artifacts), unpack it
and run:

    python3 scripts/site-screens.py <unpacked artifact> public/site/app [preview dir]

Each site file below names where it comes from. A file whose source is missing in the artifact is left as
it is, and the script says so. With a preview dir it also writes every screenshot of the walk there, small,
so the pictures can be looked through when a mapping needs changing.
"""
import re
import sys
from pathlib import Path

from PIL import Image

# Site file -> where it comes from: "site/<name>" or "smoke/<name>" (the step's name, without its number).
SOURCES = {
    'today': 'site/today',
    'sleep': 'smoke/spanek',
    'sleep-need': 'smoke/spanek-3',
    'bedtime': 'smoke/planovac',
    'bedtime-goal': 'smoke/planovac-2',
    'readiness-parts': 'smoke/pripravenost',
    'journal-impact': 'smoke/co-pusobi',
    'strain-target': 'site/strain',
    'training': 'site/training',
    'builder': 'smoke/sestavit',
    'gym-day': 'smoke/posilovna',
    'training-mode': 'smoke/rezim-zacatek',
    'training-set': 'smoke/dalsi-serie',
    'training-rest': 'smoke/odpocinek',
    'training-done': 'smoke/souhrn',
    'food-day': 'smoke/jidlo',
    'food-add': 'smoke/pridat',
    'coach-ask': 'smoke/kouc',
}
WIDTH = 600  # the size the page asks for (<img width="600" height="1305">)


def find(root: Path, source: str):
    kind, name = source.split('/', 1)
    if kind == 'site':
        hits = list(root.rglob(f'site/{name}.png'))
    else:
        pattern = re.compile(rf'^\d+-\d+-{re.escape(name)}\.png$')
        hits = [p for p in root.rglob('smoke/*.png') if pattern.match(p.name)]
    return sorted(hits)[-1] if hits else None


def save(src: Path, dest: Path, width: int, quality: int):
    with Image.open(src) as im:
        im = im.convert('RGB')
        height = round(im.height * width / im.width)
        im.resize((width, height), Image.LANCZOS).save(dest, 'WEBP', quality=quality, method=6)


def main():
    root, out = Path(sys.argv[1]), Path(sys.argv[2])
    preview = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    missing = []
    for site, source in SOURCES.items():
        src = find(root, source)
        if not src:
            missing.append(f'{site} ({source})')
            continue
        save(src, out / f'{site}.webp', WIDTH, 82)
        print(f'{site}.webp <- {src.relative_to(root)}')
    if preview:
        preview.mkdir(parents=True, exist_ok=True)
        for src in sorted(root.rglob('site/*.png')) + sorted(root.rglob('smoke/4-*.png')):
            save(src, preview / f'{src.parent.name}-{src.stem}.webp', 300, 70)
    if missing:
        print('Not in the artifact, left as they were: ' + ', '.join(missing))


if __name__ == '__main__':
    main()
