# -*- coding: utf-8 -*-
"""把各素材包预览图拼成一张总览图集（深色主题）。"""
import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.join(BASE, "extracted")

# (标题, 图片路径)
items = [
    ("PS1 Trees (森林主树 ×8)", os.path.join(BASE, "ps1_trees", "preview.png")),
    ("Retro Urban Kit (PS1废土城镇 ×372)", os.path.join(EXT, "retro_urban", "Preview.png")),
    ("Winter Tree (雪针叶树, 贴图)", os.path.join(EXT, "winter_tree", "tree.png")),
]

CELL_W, CELL_H = 640, 400
TITLE_H = 40
PAD = 16
COLS = 2
rows = (len(items) + COLS - 1) // COLS
W = COLS * (CELL_W + PAD) + PAD
H = rows * (CELL_H + TITLE_H + PAD) + PAD

canvas = Image.new("RGB", (W, H), (24, 24, 28))
draw = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 22)
except Exception:
    font = ImageFont.load_default()

for i, (title, path) in enumerate(items):
    col, row = i % COLS, i // COLS
    x = PAD + col * (CELL_W + PAD)
    y = PAD + row * (CELL_H + TITLE_H + PAD)
    draw.text((x + 4, y), title, fill=(230, 230, 235), font=font)
    ty = y + TITLE_H
    if os.path.exists(path):
        try:
            im = Image.open(path).convert("RGB")
            im.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
            px = x + (CELL_W - im.width) // 2
            py = ty + (CELL_H - im.height) // 2
            canvas.paste(im, (px, py))
        except Exception as e:
            draw.text((x + 8, ty + 20), f"[img error] {e}", fill=(200, 100, 100), font=font)
    else:
        draw.text((x + 8, ty + 20), "[no preview]", fill=(200, 100, 100), font=font)
    draw.rectangle([x, ty, x + CELL_W, ty + CELL_H], outline=(70, 70, 80), width=1)

out = os.path.join(BASE, "素材总览.png")
canvas.save(out, quality=90)
print("saved:", out, canvas.size)
