# -*- coding: utf-8 -*-
"""解压 raw/ 下所有 zip 到 extracted/<name>/，并统计模型/贴图文件。"""
import os, zipfile, py7zr
BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, "raw")
EXT = os.path.join(BASE, "extracted")
os.makedirs(EXT, exist_ok=True)

MODEL_EXT = ('.fbx', '.obj', '.dae', '.blend', '.glb', '.gltf', '.unitypackage')
TEX_EXT = ('.png', '.jpg', '.jpeg', '.tga', '.bmp')

def report(name, files):
    models = [f for f in files if f.lower().endswith(MODEL_EXT)]
    tex = [f for f in files if f.lower().endswith(TEX_EXT)]
    print(f"[{name}] {len(files)} files | models={len(models)} tex={len(tex)}")
    for f in models[:8]:
        print(f"    M {f}")
    for f in tex[:5]:
        print(f"    T {f}")
    if len(models) > 8: print(f"    ... +{len(models)-8} models")
    if len(tex) > 5: print(f"    ... +{len(tex)-5} tex")

for fn in sorted(os.listdir(RAW)):
    path = os.path.join(RAW, fn)
    if fn.endswith('.zip'):
        try:
            with zipfile.ZipFile(path) as z:
                names = [n for n in z.namelist() if not n.endswith('/')]
                dest = os.path.join(EXT, fn[:-4])
                z.extractall(dest)
                report(fn[:-4], names)
        except Exception as e:
            print(f"[FAIL zip] {fn}: {e}")
    elif fn.endswith('.7z'):
        try:
            with py7zr.SevenZipFile(path) as a:
                names = a.getnames()
                dest = os.path.join(EXT, fn[:-3])
                a.extractall(dest)
                report(fn[:-3], names)
        except Exception as e:
            print(f"[FAIL 7z] {fn}: {e}")
