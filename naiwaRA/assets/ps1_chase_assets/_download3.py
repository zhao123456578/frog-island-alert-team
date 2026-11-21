# -*- coding: utf-8 -*-
"""第三批：阴间/恐怖向素材（curl 直连 + 续传 + 校验）。"""
import os, subprocess
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "raw")
os.makedirs(OUT, exist_ok=True)
ITEMS = [
    ("dead_trees",    "https://opengameart.org/sites/default/files/dead_trees.blend", 733432, ".blend"),
    ("cemetery",      "https://opengameart.org/sites/default/files/cemetery.zip", 3842, ".zip"),
    ("spooktober",    "https://opengameart.org/sites/default/files/kaykit_spooktober_seasonal_pack_1.1.zip", 6946078, ".zip"),
    ("halloween_kit", "https://opengameart.org/sites/default/files/free_halloween_kit_assetquest.zip", 8242033, ".zip"),
]
CURL = ["curl", "-sS", "-m", "90", "--noproxy", "*", "-A", "Mozilla/5.0"]
def size(p): return os.path.getsize(p) if os.path.exists(p) else 0
def fetch(name, url, expect, ext):
    dst = os.path.join(OUT, name + ext)
    for attempt in range(10):
        have = size(dst)
        if have >= expect:
            print(f"[OK] {name}: {have}/{expect}", flush=True); return dst
        try:
            subprocess.run(CURL + ["-C", "-", url, "-o", dst], timeout=100,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except subprocess.TimeoutExpired:
            pass
        now = size(dst)
        print(f"  {name} attempt {attempt+1}: {have}->{now}/{expect}", flush=True)
        if now >= expect:
            print(f"[OK] {name}: {now}/{expect}", flush=True); return dst
        if now == have and attempt >= 2:
            try: os.remove(dst)
            except OSError: pass
    print(f"[FAIL] {name}: {size(dst)}/{expect}", flush=True); return None
if __name__ == "__main__":
    for name, url, expect, ext in ITEMS:
        fetch(name, url, expect, ext)
