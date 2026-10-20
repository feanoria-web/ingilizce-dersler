"""Render the portal's existing book mark for Android and the web manifest."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
output = root / 'assets' / 'icons'
output.mkdir(parents=True, exist_ok=True)

def icon(size, maskable=False):
    scale = 4
    canvas = Image.new('RGB', (size * scale, size * scale), '#164e45')
    draw = ImageDraw.Draw(canvas)
    # Keep the book inside Android's circular mask safe area.
    factor = size * scale / 64
    points = [(17, 20), (22, 18.5), (27, 20), (32, 23), (37, 20),
              (42, 18.5), (47, 20), (47, 43), (42, 41.5), (37, 43),
              (32, 46), (27, 43), (22, 41.5), (17, 43), (17, 20)]
    points = [(round(x * factor), round(y * factor)) for x, y in points]
    stroke = max(1, round(2 * factor))
    draw.line(points, fill='#f9f5ed', width=stroke, joint='curve')
    draw.line([(round(32 * factor), round(23 * factor)),
               (round(32 * factor), round(46 * factor))], fill='#f9f5ed', width=stroke)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)

for size in (192, 512):
    icon(size).save(output / f'icon-{size}.png', optimize=True)
icon(512, True).save(output / 'maskable-512.png', optimize=True)
print('App icons generated from the existing book mark.')
