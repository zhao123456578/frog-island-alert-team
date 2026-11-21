# -*- coding: utf-8 -*-
"""第四批：苏联赫鲁晓夫楼（好结局线）+ 后朋克野兽派 + 追兵怪物。"""
import os, subprocess
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "raw")
os.makedirs(OUT, exist_ok=True)
ITEMS = [
    ("soviet_house",   "https://opengameart.org/sites/default/files/Soviet_Panel_Apartment_House_3D.zip", 4076748, ".zip"),
    ("brutalism",      "https://opengameart.org/sites/default/files/brutalism.zip", 30362, ".zip"),
    ("brutalism2",     "https://opengameart.org/sites/default/files/brutalism2.zip", 113109, ".zip"),
    ("soviet_resid",   "https://opengameart.org/sites/default/files/residential-building-lowpoly-apartment-block.zip", 15761198, ".zip"),
    ("horror_monster", "https://opengameart.org/sites/default/files/horror_monster_fbx.zip", 18856572, ".zip"),
]
CURL = ["curl", "-sS", "-m", "90", "--noproxy", "*", "-A", "Mozilla/5.0"]
def size(p): return os.path.getsize(p) if os.path.exists(p) else 0
def fetch(name, url, expect, ext):
    dst = os.path.join(OUT, name + ext)
    for attempt in range(14):
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
