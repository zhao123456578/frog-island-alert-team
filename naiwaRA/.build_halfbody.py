import bpy, math
from mathutils import Vector, Matrix

SRC = r"D:\gr\naiwaRA\assets\milkfrog_no13.blend"
OUT_BLEND = r"D:\gr\naiwaRA\assets\milkfrog_halfbody.blend"
OUT_GLB = r"D:\gr\naiwaRA\assets\milkfrog_halfbody.glb"
OUT_PNG = r"D:\gr\naiwaRA\_halfbody.png"

bpy.ops.wm.open_mainfile(filepath=SRC)
body = bpy.data.objects['MilkFrog_NO13_Body']
mat_body = bpy.data.materials['yellow']

for o in list(bpy.data.objects):
    if o.type == 'MESH':
        o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.select_all(action='DESELECT')

WAIST = 0.58
SQUASH = 0.84
BODY_MN = 0.22
COL_YELLOW = (0.815, 0.516, 0.086)
COL_CREAM = (0.86, 0.78, 0.62)
COL_DARK = (0.095, 0.072, 0.025)

def mix(c1, c2, t):
    return tuple(c1[i] * (1 - t) + c2[i] * t for i in range(3))

def smooth01(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)

# ---------------- 切掉下半身 ----------------
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.bisect(plane_co=(0, 0, WAIST), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
bpy.ops.object.mode_set(mode='OBJECT')
print("CUT z", round(min(v.co.z for v in body.data.vertices), 3))

# ---------------- 手臂向后摆 ----------------
def rot_arm(p, pivot, ang, falloff=0.14):
    d = p - pivot
    r = d.length
    if r < 1e-6:
        return p
    w = max(0.0, min(1.0, (r - 0.02) / falloff))
    if w <= 0:
        return p
    return pivot + (Matrix.Rotation(ang * w, 3, 'X') @ d)

for v in body.data.vertices:
    p = v.co
    if abs(p.x) > 0.28 and 0.66 < p.z < 1.34:
        sx = 1 if p.x > 0 else -1
        pivot = Vector((0.30 * sx, 0.0, 1.24))
        if (Vector((abs(p.x), 0, p.z)) - Vector((0.30, 0, 1.24))).length < 0.42:
            v.co = rot_arm(p, pivot, math.radians(-46))

# ---------------- 躺下 + 压扁 ----------------
for v in body.data.vertices:
    p = v.co.copy()
    y, z = p.y, p.z
    p.y = -(z - WAIST)
    p.z = y + WAIST
    v.co = p
mn = min(v.co.z for v in body.data.vertices)
BODY_MN = mn
for v in body.data.vertices:
    v.co.z -= BODY_MN
    v.co.z *= SQUASH
    v.co.x *= 1.05
    v.co.y *= 1.05

# ---------------- 头自然贴地（保持仰面） ----------------
HEAD_PIVOT = Vector((0, -0.80, 0.40))
HEAD_ANG = math.radians(4)

def head_weight(y):
    t = max(0.0, min(1.0, (-0.74 - y) / 0.28))
    return t * t * (3 - 2 * t)

for v in body.data.vertices:
    w = head_weight(v.co.y)
    if w > 0:
        d = v.co - HEAD_PIVOT
        v.co = HEAD_PIVOT + (Matrix.Rotation(HEAD_ANG * w, 3, 'X') @ d)
        v.co.z -= 0.09 * w

for v in body.data.vertices:
    if v.co.z < 0.02:
        v.co.z = 0.02

print("BODY bbox", [round(min(v.co[i] for v in body.data.vertices), 2) for i in range(3)],
      [round(max(v.co[i] for v in body.data.vertices), 2) for i in range(3)])

# ---------------- 八爪鱼下半身：Skin 分叉 ----------------
N_TENT = 8
verts, edges, radii = [], [], []

def add_v(p, r1, r2=None):
    verts.append(Vector(p))
    radii.append((r1, r2 if r2 is not None else r1))
    return len(verts) - 1

root = add_v((0, 0.02, 0.25), 0.26, 0.21)

for n in range(N_TENT):
    phi = 2 * math.pi * n / N_TENT + math.pi / 8
    dx, dy = math.cos(phi), math.sin(phi)
    prev = root
    chain = [
        ((0.12 * dx, 0.03 + 0.10 * dy, 0.12), 0.110),
        ((0.28 * dx, 0.05 + 0.24 * dy, 0.080), 0.098),
        ((0.44 * dx + 0.02 * dy, 0.08 + 0.37 * dy, 0.062), 0.078),
        ((0.58 * dx + 0.07 * dy, 0.11 + 0.47 * dy, 0.052), 0.055),
        ((0.70 * dx + 0.15 * dy, 0.14 + 0.54 * dy, 0.048), 0.034),
        ((0.76 * dx + 0.24 * dy, 0.17 + 0.58 * dy, 0.052), 0.016),
    ]
    for p_, r_ in chain:
        idx = add_v(p_, r_)
        edges.append((prev, idx))
        prev = idx

octo_me = bpy.data.meshes.new('OctoLower')
octo_me.from_pydata(verts, edges, [])
octo_me.update()
octo = bpy.data.objects.new('OctoLower', octo_me)
bpy.context.collection.objects.link(octo)

skin = octo.modifiers.new('Skin', 'SKIN')
skin.use_smooth_shade = True
for i, (rx, ry) in enumerate(radii):
    octo_me.skin_vertices[0].data[i].radius = (rx, ry)
bpy.context.view_layer.objects.active = octo
bpy.ops.object.modifier_apply(modifier=skin.name)

sub = octo.modifiers.new('Sub', 'SUBSURF')
sub.levels = 2
sub.render_levels = 2
bpy.ops.object.modifier_apply(modifier=sub.name)

for v in octo.data.vertices:
    if v.co.z < 0.02:
        v.co.z = 0.02

ca = octo.data.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
for i, v in enumerate(octo.data.vertices):
    p_ = v.co
    d = math.sqrt(p_.x ** 2 + (p_.y - 0.12) ** 2 + (p_.z - 0.06) ** 2)
    tip = smooth01((d - 0.42) / 0.30)
    up = max(0.0, min(1.0, v.normal.z))
    c = mix(COL_YELLOW, COL_CREAM, 0.40 * up * (1 - tip))
    c = mix(c, COL_DARK, tip * 0.95)
    ca.data[i].color = (*c, 1.0)

octo.data.materials.append(mat_body)
for p_ in octo.data.polygons:
    p_.use_smooth = True
print("OCTO", len(octo.data.vertices), "verts", len(octo.data.polygons), "faces")

bpy.ops.object.select_all(action='DESELECT')
octo.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = 'MilkFrog_HalfBody'
for p_ in body.data.polygons:
    p_.use_smooth = True
print("JOINED", len(body.data.vertices))

# ---------------- 只保留奶蛙本体：删掉所有道具 ----------------
for o in list(bpy.data.objects):
    if o.name.startswith('NO13_'):
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print("SAVED")

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_apply=True, export_yup=True,
                          export_animations=False)
print("EXPORTED")

# ---------------- 渲染 ----------------
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.resolution_x = 1100
scene.render.resolution_y = 820
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
if scene.world is None:
    scene.world = bpy.data.worlds.new('World')
scene.world.use_nodes = True
bg = next((n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND'), None)
if bg:
    bg.inputs['Color'].default_value = (0.12, 0.13, 0.11, 1)
    bg.inputs['Strength'].default_value = 1.0

bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
floor = bpy.context.object
fm = bpy.data.materials.new('Floor')
fm.use_nodes = True
fb = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
fb.inputs['Base Color'].default_value = (0.15, 0.16, 0.14, 1)
fb.inputs['Roughness'].default_value = 0.95
floor.data.materials.append(fm)

target = Vector((0, -0.45, 0.10))
def area(name, loc, energy, size, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = energy; d.shape = 'DISK'; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d)
    scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (target - o.location).to_track_quat('-Z', 'Y').to_euler()

area('Key', (1.8, -1.4, 3.2), 170, 4.5, (1.0, 0.97, 0.9))
area('Fill', (-2.4, -1.6, 2.2), 155, 4.5, (0.85, 0.9, 1.0))
area('Rim', (0.8, 2.0, 2.4), 170, 3.0, (1, 1, 1))

cam_data = bpy.data.cameras.new('Cam')
cam = bpy.data.objects.new('Cam', cam_data)
scene.collection.objects.link(cam)
cam.location = (1.7, -1.5, 3.0)
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_data.lens = 45
scene.camera = cam
scene.render.filepath = OUT_PNG
bpy.ops.render.render(write_still=True)
print("RENDERED", OUT_PNG)
