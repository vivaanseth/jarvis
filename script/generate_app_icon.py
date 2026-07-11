#!/usr/bin/env python3
from pathlib import Path
import math
import sys
from PIL import Image, ImageDraw, ImageFilter

output = Path(sys.argv[1] if len(sys.argv) > 1 else "icon_1024.png")
scale = 4
size = 1024
canvas = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

def box(values):
    return tuple(int(value * scale) for value in values)

# Quiet charcoal tile with a slight indigo lift.
draw.rounded_rectangle(box((32, 32, 992, 992)), radius=220 * scale, fill=(24, 26, 40, 255))
for index in range(180):
    inset = 50 + index
    alpha = max(0, 2 - index // 80)
    draw.rounded_rectangle(box((inset, inset, 1024 - inset, 1024 - inset)), radius=max(20, (210 - index)) * scale, outline=(71, 74, 125, alpha))

# Restrained halo rendered on a separate layer.
halo = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
halo_draw = ImageDraw.Draw(halo)
halo_draw.ellipse(box((255, 255, 769, 769)), fill=(111, 118, 242, 175))
halo = halo.filter(ImageFilter.GaussianBlur(55 * scale))
canvas.alpha_composite(halo)
draw = ImageDraw.Draw(canvas)
draw.ellipse(box((284, 284, 740, 740)), fill=(110, 116, 235, 255))

# Four-point assistant spark.
points = []
cx = cy = 512
for i in range(16):
    angle = -math.pi / 2 + i * math.pi / 8
    radius = (150 if i % 4 == 0 else 52 if i % 2 == 0 else 25) * scale
    points.append((cx * scale + math.cos(angle) * radius, cy * scale + math.sin(angle) * radius))
draw.polygon(points, fill=(247, 248, 255, 242))

canvas.resize((size, size), Image.Resampling.LANCZOS).save(output)

