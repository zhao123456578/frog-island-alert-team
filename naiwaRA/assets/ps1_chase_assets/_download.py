# -*- coding: utf-8 -*-
"""批量下载 OGA 上的 CC0 PS1 素材：curl 直连 + 断点续传 + 大小校验。"""
import os, subprocess, time

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "raw")
os.makedirs(OUT, exist_ok=True)

# (name, url, expected_bytes)
ITEMS = [
    ("misc_lowpoly",    "https://opengameart.org/sites/default/files/psx_1.zip", 118264),
    ("winter_tree",     "https://opengameart.org/sites/default/files/WinterTree.zip", 219049),
    ("city_roads",      "https://opengameart.org/sites/default/files/kenney_city-kit-roads_2.2.zip", 2852289),
    ("city_suburban",   "https://opengameart.org/sites/default/files/kenney_city-kit-suburban_2.0.zip", 3038740),
    ("city_commercial", "https://opengameart.org/sites/default/files/kenney_city-kit-commercial_2.1.zip", 4096974),
    ("road_tiles",      "https://opengameart.org/sites/default/files/3D%20Road%20pack.zip", 3265217),
    ("animated_chars",  "https://opengameart.org/sites/default/files/kenney_animated-characters-3.zip", 706470),
]

CURL = ["curl", "-sS", "-m", "90", "--noproxy", "*", "-A", "Mozilla/5.0"]

def size(p):
    return os.path.getsize(p) if os.path.exists(p) else 0

def fetch(name, url, expect):
    dst = os.path.join(OUT, name + os.path.splitext(url.split('/')[-1])[1])
    # 又可能带 %20 等编码，统一用名字+.zip
    dst = os.path.join(OUT, name + ".zip")
    for attempt in range(8):
        have = size(dst)
        if have >= expect:
            print(f"[OK] {name}: {have}/{expect}", flush=True)
            return dst
        cmd = CURL + ["-C", "-", url, "-o", dst]
        try:
            subprocess.run(cmd, timeout=100, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except subprocess.TimeoutExpired:
            pass
        now = size(dst)
        print(f"  {name} attempt {attempt+1}: {have}->{now}/{expect}", flush=True)
        if now >= expect:
            print(f"[OK] {name}: {now}/{expect}", flush=True)
            return dst
        if now == have and attempt >= 2:
            # 连续无进展，重置从头再来一次
            try: os.remove(dst)
            except OSError: pass
    print(f"[FAIL] {name}: {size(dst)}/{expect}", flush=True)
    return None

if __name__ == "__main__":
    results = {}
    for name, url, expect in ITEMS:
        results[name] = fetch(name, url, expect)
    print("=== SUMMARY ===", flush=True)
    for name, path in results.items():
        print(f"{name}: {'OK' if path else 'FAIL'}", flush=True)
