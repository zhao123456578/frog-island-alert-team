"""把抠好的 RGBA 帧打包成纸片人用的精灵图集。

输出：
  assets/paperbot/sheet_0.png / sheet_1.png   图集（各 55 帧）
  assets/paperbot/meta.json                   图集元数据
  assets/paperbot/paperbot_sheet.js           内联 dataURL 版本（file:// 也能直接用）

图集布局：10 列 x 6 行，每格 165x479 + 4px 透明边，55 帧/张。
帧序列与 GIF 完全一致：rgba 帧 40..258 步长 2（15fps 的 110 帧无缝循环）。
"""
import base64
import glob
import json
import os

import numpy as np
from PIL import Image

ROOT = r"D:\gr\naiwaRA"
SRC = os.path.join(ROOT, "gifcut", "rgba")
OUT = os.path.join(ROOT, "assets", "paperbot")

CROP = (7, 7, 172, 486)     # 全片联合包围盒
PAD = 4
COLS, ROWS = 10, 6
PER_SHEET = COLS * ROWS
START, END, STEP = 40, 259, 2
FPS = 15.0


def bleed_edge(im, passes=6):
    """把边缘/透明像素的 RGB 换成最近实心像素的颜色。

    绿幕反解会在半透明边缘留下洋红/白边，线性过滤时又会把透明区的颜色
    带进轮廓。这里只改 RGB，不动 alpha，人物形状完全不变。
    """
    a = np.asarray(im, dtype=np.uint8).copy()
    rgb = a[:, :, :3].astype(np.int16)
    alpha = a[:, :, 3]
    solid = alpha >= 245
    filled = solid.copy()
    out = rgb.copy()
    h, w = alpha.shape
    for _ in range(passes):
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            src_filled = np.zeros_like(filled)
            src_rgb = np.zeros_like(out)
            dst_y = slice(max(0, -dy), h - max(0, dy))
            src_y = slice(max(0, dy), h - max(0, -dy))
            dst_x = slice(max(0, -dx), w - max(0, dx))
            src_x = slice(max(0, dx), w - max(0, -dx))
            src_filled[dst_y, dst_x] = filled[src_y, src_x]
            src_rgb[dst_y, dst_x] = out[src_y, src_x]
            mask = (~filled) & src_filled
            out[mask] = src_rgb[mask]
            filled |= mask
    a[:, :, :3] = np.clip(out, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(os.path.join(SRC, "*.png")))
    frames = [bleed_edge(Image.open(f).convert("RGBA").crop(CROP)) for f in files[START:END:STEP]]
    fw, fh = frames[0].size
    cw, ch = fw + PAD * 2, fh + PAD * 2
    print("frames", len(frames), "frame", (fw, fh))

    data_urls = []
    for si in range(0, len(frames), PER_SHEET):
        part = frames[si:si + PER_SHEET]
        sheet = Image.new("RGBA", (cw * COLS, ch * ROWS), (0, 0, 0, 0))
        for i, f in enumerate(part):
            x = (i % COLS) * cw + PAD
            y = (i // COLS) * ch + PAD
            sheet.paste(f, (x, y))
        path = os.path.join(OUT, "sheet_%d.png" % (si // PER_SHEET))
        sheet.save(path, optimize=True)
        print(path, "%.1f KB" % (os.path.getsize(path) / 1024), sheet.size)
        with open(path, "rb") as fp:
            data_urls.append("data:image/png;base64," + base64.b64encode(fp.read()).decode())

    meta = {
        "fw": fw, "fh": fh, "pad": PAD, "cols": COLS, "rows": ROWS,
        "count": len(frames), "perSheet": PER_SHEET, "fps": FPS,
        "cellW": cw, "cellH": ch,
    }
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=2)

    js = "/* 由 gifcut/build_paperbot.py 生成，勿手改 */\nwindow.PAPERBOT_ATLAS=" \
         + json.dumps(dict(meta, sheets=data_urls), ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(OUT, "paperbot_sheet.js"), "w", encoding="utf-8") as fp:
        fp.write(js)
    print("paperbot_sheet.js %.1f KB" % (os.path.getsize(os.path.join(OUT, "paperbot_sheet.js")) / 1024))


if __name__ == "__main__":
    main()
