# -*- coding: utf-8 -*-
"""第二批：Retro Urban Kit + Base Materials 128px（curl 直连 + 续传 + 校验）。"""
import os, subprocess
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "raw")
os.makedirs(OUT, exist_ok=True)
ITEMS = [
    ("retro_urban", "https://opengameart.org/sites/default/files/kenney_retro-urban-kit.zip", 2161463),
    ("base_mat_128", "https://opengameart.org/sites/default/files/sbs_-_base_materials_pack_128x128.zip", 4033193),
]
CURL = ["curl", "-sS", "-m", "90", "--noproxy", "*", "-A", "Mozilla/5.0"]
def size(p): return os.path.getsize(p) if os.path.exists(p) else 0
def fetch(name, url, expect):
    dst = os.path.join(OUT, name + ".zip")
    for attempt in range(8):
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
    for name, url, expect in ITEMS:
        fetch(name, url, expect)
