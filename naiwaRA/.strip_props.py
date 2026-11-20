"""去掉普通版（静态 / 骨骼版）模型上的全部道具，只保留奶蛙本体。

用法：blender -b -P .strip_props.py
- assets/milkfrog_no13.blend        → 删除 NO13_* 后另存，重导 .glb
- assets/milkfrog_no13_rigged.blend → 删除 NO13_* 后另存，重导 .glb（保留骨架与动作）
"""
import bpy

STATIC_BLEND = r"D:\gr\naiwaRA\assets\milkfrog_no13.blend"
STATIC_GLB = r"D:\gr\naiwaRA\assets\milkfrog_no13.glb"
RIG_BLEND = r"D:\gr\naiwaRA\assets\milkfrog_no13_rigged.blend"
RIG_GLB = r"D:\gr\naiwaRA\assets\milkfrog_no13_rigged.glb"


def strip(blend_path):
    bpy.ops.wm.open_mainfile(filepath=blend_path)
    props = [o for o in bpy.data.objects if o.name.startswith('NO13_')]
    names = [o.name for o in props]
    doomed_meshes, doomed_mats = [], []
    for o in props:
        if o.type == 'MESH':
            doomed_meshes.append(o.data)
            doomed_mats.extend([m for m in o.data.materials if m])
        bpy.data.objects.remove(o, do_unlink=True)
    print("REMOVED", blend_path.split('\\')[-1], names)

    # 只清理确认为道具的网格/材质，避免动到未使用的动作
    for me in doomed_meshes:
        if me and me.users == 0:
            bpy.data.meshes.remove(me)
    for m in set(doomed_mats):
        if m and m.users == 0:
            bpy.data.materials.remove(m)

    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print("SAVED", blend_path)
    print("REMAIN", sorted(o.name for o in bpy.data.objects))


# ---------- 静态版 ----------
strip(STATIC_BLEND)
for o in list(bpy.data.objects):
    if o.type in {'CAMERA', 'LIGHT'}:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=STATIC_GLB, export_format='GLB',
                          export_apply=True, export_yup=True)
print("EXPORTED", STATIC_GLB)

# ---------- 骨骼版 ----------
strip(RIG_BLEND)
print("ACTIONS", [a.name for a in bpy.data.actions])
for o in list(bpy.data.objects):
    if o.type in {'CAMERA', 'LIGHT'}:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(
    filepath=RIG_GLB, export_format='GLB', export_apply=False, export_yup=True,
    export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
    export_frame_range=False
)
print("EXPORTED", RIG_GLB)
