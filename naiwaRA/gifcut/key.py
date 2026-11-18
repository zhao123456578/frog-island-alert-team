"""绿幕抠像 -> 透明背景帧序列（流式处理，避免爆内存）"""
import os, glob
import numpy as np
from PIL import Image, ImageFilter

SRC = r"D:\gr\naiwaRA\gifcut\full"
OUT = r"D:\gr\naiwaRA\gifcut\rgba"
CROP_X = (80, 1416)          # 去掉左右黑边
ALPHA_FULL = 55.0            # greenness 低于此值 -> 完全不透明
ALPHA_ZERO = 130.0           # greenness 高于此值 -> 完全透明
TARGET_H = 480               # 人物高度（像素）
PAD = 6                      # 边缘留白

os.makedirs(OUT, exist_ok=True)
files = sorted(glob.glob(os.path.join(SRC, "*.png")))


def load_rgb(path):
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    return a[:, CROP_X[0]:CROP_X[1], :]


BG = np.array([14.0, 215.0, 0.0], np.float32)     # 实测绿幕底色


def key(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx = np.maximum(r, b)
    gr = g - mx                                   # 绿色主导度
    alpha = np.clip((ALPHA_ZERO - gr) / (ALPHA_ZERO - ALPHA_FULL), 0.0, 1.0)
    alpha = alpha * alpha * (3 - 2 * alpha)       # smoothstep
    # 向内收 1px，去掉视频压缩产生的灰边
    am = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))
    alpha = np.asarray(am, np.float32) / 255.0
    # 反解真实颜色：C = a*F + (1-a)*BG  =>  F = (C-(1-a)BG)/a
    aa = np.clip(alpha, 0.30, 1.0)[:, :, None]
    F = np.clip((a - (1.0 - aa) * BG) / aa, 0, 255)
    F[:, :, 1] = np.minimum(F[:, :, 1], np.maximum(F[:, :, 0], F[:, :, 2]))   # 去绿溢
    return np.dstack([F, alpha * 255.0])


# ---- pass 1 : 计算全片人物包围盒 ----
x0 = y0 = 10 ** 9
x1 = y1 = -1
h_full = w_full = 0
for i, f in enumerate(files):
    if i % 4:            # 抽样足够算包围盒
        continue
    a = load_rgb(f)
    h_full, w_full = a.shape[0], a.shape[1]
    m = key(a)[:, :, 3] > 24
    ys, xs = np.where(m)
    if len(ys) == 0:
        continue
    y0 = min(y0, ys.min()); y1 = max(y1, ys.max())
    x0 = min(x0, xs.min()); x1 = max(x1, xs.max())
y0 = max(0, y0 - 2); x0 = max(0, x0 - 2)
y1 = min(h_full - 1, y1 + 2); x1 = min(w_full - 1, x1 + 2)
print("bbox", x0, x1, y0, y1, "->", x1 - x0 + 1, "x", y1 - y0 + 1, flush=True)

scale = TARGET_H / float(y1 - y0 + 1)
out_w = int(round((x1 - x0 + 1) * scale))
print("scale", round(scale, 3), "out", out_w, "x", TARGET_H, flush=True)

# ---- pass 2 : 逐帧抠像 + 缩放输出 ----
for i, f in enumerate(files):
    a = load_rgb(f)
    rgba = key(a)[y0:y1 + 1, x0:x1 + 1, :]
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    arr = np.asarray(im, dtype=np.float32)
    af = arr[:, :, 3:4] / 255.0
    pm = np.dstack([arr[:, :, :3] * af, arr[:, :, 3]])       # 预乘 alpha
    pim = Image.fromarray(pm.astype(np.uint8), "RGBA").resize((out_w, TARGET_H), Image.LANCZOS)
    p = np.asarray(pim, dtype=np.float32)
    aa = np.clip(p[:, :, 3:4] / 255.0, 1e-6, 1.0)
    rgb = np.clip(p[:, :, :3] / aa, 0, 255)                  # 反预乘
    out = np.dstack([rgb, p[:, :, 3]]).astype(np.uint8)
    canvas = np.zeros((TARGET_H + PAD * 2, out_w + PAD * 2, 4), np.uint8)
    canvas[PAD:PAD + TARGET_H, PAD:PAD + out_w] = out
    Image.fromarray(canvas, "RGBA").save(os.path.join(OUT, "%04d.png" % i))
    if i % 50 == 0:
        print("frame", i, flush=True)

print("done", len(files), "frames", flush=True)
