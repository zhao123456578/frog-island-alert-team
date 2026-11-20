import bpy, math
from mathutils import Vector

BLEND = r"D:\gr\naiwaRA\assets\milkfrog_no13_rigged.blend"
OUT = r"D:\gr\naiwaRA\_pose_test.png"

bpy.ops.wm.open_mainfile(filepath=BLEND)
rig = bpy.data.objects['MilkFrog_Rig']
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')

def rot(name, x=0, y=0, z=0):
    pb = rig.pose.bones.get(name)
    if not pb:
        print("NO BONE", name); return
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler = (x, y, z)

# 右手举起 + 挥手
rot('UpperArm.R', 0, 0, 2.05)
rot('LowerArm.R', -0.55, 0, 0.35)
rot('Hand.R', 0, 0.3, 0)
# 左腿弯一点
rot('Thigh.L', 0.55, 0, 0)
rot('Shin.L', -0.95, 0, 0)
# 头歪一下
rot('Head', 0.08, 0, 0.18)
rot('Chest', 0, 0.06, 0)

bpy.ops.object.mode_set(mode='OBJECT')

# ---- 场景灯光/相机（同预览） ----
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
if scene.world is None:
    scene.world = bpy.data.worlds.new('World')
scene.world.use_nodes = True
bg = next((n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND'), None)
if bg:
    bg.inputs['Color'].default_value = (0.55, 0.55, 0.56, 1.0)
    bg.inputs['Strength'].default_value = 0.8

target = Vector((0, 0, 1.0))
def area(name, loc, energy, size, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = energy; d.shape = 'DISK'; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d)
    scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (target - o.location).to_track_quat('-Z', 'Y').to_euler()

area('Key', (3.0, 4.0, 5.0), 320, 5.0, (1.0, 0.97, 0.9))
area('Fill', (-4.0, 2.0, 3.0), 170, 5.0, (0.85, 0.9, 1.0))
area('Rim', (0.0, -3.5, 4.0), 260, 4.0, (1.0, 1.0, 1.0))

cam_data = bpy.data.cameras.new('Cam')
cam = bpy.data.objects.new('Cam', cam_data)
scene.collection.objects.link(cam)
cam.location = (3.2, 5.2, 2.6)
cam.rotation_euler = (Vector((0, 0, 1.05)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_data.lens = 55
scene.camera = cam
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("RENDERED", OUT)
