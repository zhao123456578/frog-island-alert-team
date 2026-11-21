import bpy, base64, os
from mathutils import Vector

SRC = r"D:\gr\naiwaRA\assets\rat_models\rat_pack_extracted\rat.blend"
OUT_BLEND = r"D:\gr\naiwaRA\assets\rat_models\rat_pack.blend"
OUT_GLB = r"D:\gr\naiwaRA\assets\rat_pack.glb"
OUT_JS = r"D:\gr\naiwaRA\assets\rat_pack_data.js"

bpy.ops.wm.open_mainfile(filepath=SRC)
bpy.context.view_layer.update()

# ---- 修复贴图路径（原路径少了一层目录）----
TEX = r"D:\gr\naiwaRA\assets\rat_models\rat_pack_extracted\LPoly-Pallete_Texture.jpg"
for im in bpy.data.images:
    if 'pallete' in im.name.lower() or 'palette' in im.name.lower():
        im.filepath = TEX
        im.reload()
        im.pack()
        print("IMAGE", im.name, list(im.size), "packed", bool(im.packed_file))

# ---- 删除相机 ----
for o in list(bpy.data.objects):
    if o.type in ('CAMERA', 'LIGHT'):
        bpy.data.objects.remove(o, do_unlink=True)

# ---- 每只鼠：应用变换 -> 居中贴地 -> 统一命名（三只重叠于原点，供 JS 分别克隆）----
names = {'Rat1': 'Rat_A', 'Rat2': 'Rat_B', 'Rat3': 'Rat_C'}
for old, new in names.items():
    o = bpy.data.objects.get(old)
    if not o: continue
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    # 关键：先应用 Mirror 修改器（原始模型是半边+镜像），否则导出时镜像平面错位导致身体塌陷
    for mod in list(o.modifiers):
        if mod.type == 'MIRROR':
            bpy.ops.object.modifier_apply(modifier=mod.name)
            print("APPLIED Mirror on", old, "-> verts", len(o.data.vertices))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    pts = [v.co.copy() for v in o.data.vertices]
    mn = [min(p[i] for p in pts) for i in range(3)]
    mx = [max(p[i] for p in pts) for i in range(3)]
    cx, cy, minz = (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]
    for v in o.data.vertices:
        v.co += Vector((-cx, -cy, -minz))
    o.location = (0, 0, 0)
    o.name = new
    o.data.name = new + '_Mesh'
    print("RAT", new, "size", [round(mx[i] - mn[i], 3) for i in range(3)],
          "verts", len(o.data.vertices), "faces", len(o.data.polygons))

# ---- 材质：保持贴图、关掉高光，Nearest 过滤在 JS 里设置 ----
for m in bpy.data.materials:
    for n in m.node_tree.nodes if m.use_nodes else []:
        if n.type == 'BSDF_PRINCIPLED':
            n.inputs['Roughness'].default_value = 0.95
            n.inputs['Metallic'].default_value = 0.0

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_apply=False, export_yup=True)
print("GLB", OUT_GLB, os.path.getsize(OUT_GLB))

with open(OUT_GLB, 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('ascii')
with open(OUT_JS, 'w', encoding='ascii') as f:
    f.write('window.RAT_PACK_B64="%s";\n' % b64)
print("DATA_JS", OUT_JS, os.path.getsize(OUT_JS))
