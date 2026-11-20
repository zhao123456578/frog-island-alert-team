import bpy, math
from mathutils import Vector

BLEND = r"D:\gr\naiwaRA\assets\milkfrog_no13.blend"
OUT_BLEND = r"D:\gr\naiwaRA\assets\milkfrog_no13_rigged.blend"
OUT_GLB = r"D:\gr\naiwaRA\assets\milkfrog_no13_rigged.glb"

bpy.ops.wm.open_mainfile(filepath=BLEND)

body = bpy.data.objects['MilkFrog_NO13_Body']

# ---------------- 骨架 ----------------
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
rig = bpy.context.object
rig.name = 'MilkFrog_Rig'
rig.data.name = 'MilkFrog_Armature'
rig.show_in_front = True
rig.data.display_type = 'OCTAHEDRAL'

eb = rig.data.edit_bones
for b in list(eb):
    eb.remove(b)

def bone(name, head, tail, parent=None, connect=False, roll=(0, 1, 0)):
    b = eb.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    if roll:
        b.align_roll(Vector(roll))
    return b

# 中轴
bone('Root',  (0, 0, 0),    (0, 0.18, 0), None, roll=(0, 0, 1))
bone('Hips',  (0, 0, 0.62), (0, 0, 0.82), 'Root')
bone('Spine', (0, 0, 0.82), (0, 0, 1.04), 'Hips', True)
bone('Chest', (0, 0, 1.04), (0, 0, 1.30), 'Spine', True)
bone('Neck',  (0, 0, 1.30), (0, 0, 1.46), 'Chest', True)
bone('Head',  (0, 0, 1.46), (0, 0, 1.84), 'Neck', True)

# 四肢（+X 是角色左侧 = .L）
for side, sx in (('L', 1), ('R', -1)):
    bone('Shoulder.' + side, (0.06 * sx, 0, 1.26), (0.30 * sx, 0, 1.25), 'Chest')
    bone('UpperArm.' + side, (0.30 * sx, 0, 1.25), (0.41 * sx, 0, 1.05), 'Shoulder.' + side, True)
    bone('LowerArm.' + side, (0.41 * sx, 0, 1.05), (0.44 * sx, 0, 0.88), 'UpperArm.' + side, True)
    bone('Hand.' + side,     (0.44 * sx, 0, 0.88), (0.45 * sx, 0, 0.74), 'LowerArm.' + side, True)

    bone('Thigh.' + side, (0.16 * sx, 0, 0.62), (0.22 * sx, 0, 0.36), 'Hips')
    bone('Shin.' + side,  (0.22 * sx, 0, 0.36), (0.23 * sx, 0, 0.10), 'Thigh.' + side, True)
    bone('Foot.' + side,  (0.23 * sx, 0, 0.10), (0.23 * sx, 0.14, 0.04), 'Shin.' + side, True)
    bone('Toe.' + side,   (0.23 * sx, 0.14, 0.04), (0.23 * sx, 0.24, 0.03), 'Foot.' + side, True)

bpy.ops.object.mode_set(mode='OBJECT')

# ---------------- 身体蒙皮（自动权重） ----------------
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
try:
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    print("AUTO WEIGHTS OK")
except Exception as e:
    print("AUTO WEIGHTS FAILED", e)

# ---------------- 配件：整件绑到单根骨 ----------------
ACC = {
    'NO13_Cap': 'Head',
    'NO13_CapRim': 'Head',
    'NO13_Tag': 'Chest',
    'NO13_TagCord': 'Chest',
    'NO13_PackBottle': 'Spine',
    'NO13_PackNipple': 'Spine',
    'NO13_PackStrap': 'Spine',
}
for name, bname in ACC.items():
    o = bpy.data.objects.get(name)
    if not o:
        print("MISSING", name); continue
    mod = o.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    vg = o.vertex_groups.get(bname) or o.vertex_groups.new(name=bname)
    vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    print("BOUND", name, '->', bname)

# 统计身体顶点组
print("GROUPS", [g.name for g in body.vertex_groups])
counts = {}
for v in body.data.vertices:
    for g in v.groups:
        if g.weight > 0.01:
            n = body.vertex_groups[g.group].name
            counts[n] = counts.get(n, 0) + 1
print("WEIGHT COUNTS", sorted(counts.items(), key=lambda kv: -kv[1]))

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print("SAVED", OUT_BLEND)

bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_apply=False,
                          export_yup=True, export_animations=True)
print("EXPORTED", OUT_GLB)
