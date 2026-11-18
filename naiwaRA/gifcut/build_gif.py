"""把抠好的 RGBA 帧序列合成 GIF"""
import os, sys, glob
import numpy as np
from PIL import Image

SRC = r"D:\gr\naiwaRA\gifcut\rgba"
STEP = 2                 # 30fps -> 15fps
START, END = 20, 130      # 无缝循环区间（实测 20 与 130 姿态最接近）
DELAY = 70               # 每帧 70ms
TRANS = (255, 0, 255)    # 透明占位色


def load_frames():
    files = sorted(glob.glob(os.path.join(SRC, "*.png")))
    return [Image.open(f).convert("RGBA") for f in files[::STEP][START:END]]


def build_palette(frames, colors=255):
    """从所有帧的不透明像素里取样，生成全局调色板"""
    samples = []
    for f in frames[::8]:
        a = np.asarray(f, dtype=np.uint8)
        al = a[:, :, 3]
        rgb = a[:, :, :3][al > 200]
        if len(rgb):
            samples.append(rgb[::3])
    px = np.concatenate(samples, 0)
    strip = Image.fromarray(px.reshape(1, -1, 3), "RGB")
    pal = strip.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)
    return pal


def build_gif(frames, pal, out_path, bg=None, colors_check=False):
    base = pal.getpalette()[:256 * 3] + [0] * (768 - len(pal.getpalette())) \
        if len(pal.getpalette()) < 768 else pal.getpalette()[:768]
    base = list(base)
    # 第 255 号索引留给透明
    base[255 * 3:255 * 3 + 3] = list(TRANS)
    pal_img = Image.new("P", (1, 1))
    pal_img.putpalette(base)

    out = []
    maxidx = 0
    for f in frames:
        alpha = np.asarray(f, dtype=np.uint8)[:, :, 3]
        if bg is not None:
            flat = Image.new("RGB", f.size, bg)
            flat.paste(f, (0, 0), f)
            rgb, alpha = flat, None
        else:
            rgb = f.convert("RGB")          # 保留反解后的真实颜色，不做黑底预乘
        p = rgb.quantize(palette=pal_img, dither=Image.NONE)
        arr = np.asarray(p, dtype=np.uint8).copy()
        if alpha is not None:
            arr[alpha < 140] = 255          # 二值透明，阈值略高以削掉毛边
        maxidx = max(maxidx, int(arr.max()))
        q = Image.fromarray(arr, "P")
        q.putpalette(base)
        out.append(q)
    if colors_check:
        print("max palette index used:", maxidx)
    out[0].save(out_path, save_all=True, append_images=out[1:], duration=DELAY,
                loop=0, transparency=255, disposal=2, optimize=True)
    kb = os.path.getsize(out_path) / 1024
    print("%s  %.1f KB  %d frames  %s" % (os.path.basename(out_path), kb, len(out), out[0].size))


if __name__ == "__main__":
    frames = load_frames()
    print("frames", len(frames), frames[0].size)
    pal = build_palette(frames)
    build_gif(frames, pal, r"D:\gr\naiwaRA\gifcut\out_transparent.gif", bg=None, colors_check=True)
    build_gif(frames, pal, r"D:\gr\naiwaRA\gifcut\out_white.gif", bg=(255, 255, 255))
