import bpy, math

BLEND = r"D:\gr\naiwaRA\assets\milkfrog_no13_rigged.blend"
OUT_BLEND = r"D:\gr\naiwaRA\assets\milkfrog_no13_rigged.blend"
OUT_GLB = r"D:\gr\naiwaRA\assets\milkfrog_no13_rigged.glb"

bpy.ops.wm.open_mainfile(filepath=BLEND)
rig = bpy.data.objects['MilkFrog_Rig']
bpy.context.view_layer.objects.active = rig
rig.animation_data_create()
for nm in ('Idle', 'Wave', 'Squat'):
    old = bpy.data.actions.get(nm)
    if old:
        bpy.data.actions.remove(old)

bpy.context.scene.render.fps = 24

def rest():
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)

def key(pb, frame, rot=None, loc=None):
    if rot is not None:
        pb.rotation_euler = rot
        pb.keyframe_insert('rotation_euler', frame=frame)
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert('location', frame=frame)

def new_action(name):
    rest()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    return act

# ---------------- Idle：呼吸 / 轻微摆 ----------------
new_action('Idle')
P = rig.pose.bones
key(P['Chest'], 1, rot=(0, 0, 0))
key(P['Chest'], 25, rot=(0.035, 0, 0))
key(P['Chest'], 49, rot=(0, 0, 0))
key(P['Chest'], 61, rot=(0.02, 0, 0))
key(P['Chest'], 73, rot=(0, 0, 0))
key(P['Head'], 1, rot=(0, 0, 0))
key(P['Head'], 37, rot=(-0.02, 0, 0.05))
key(P['Head'], 73, rot=(0, 0, 0))
for s, sign in (('L', 1), ('R', -1)):
    key(P['UpperArm.' + s], 1, rot=(0, 0, 0))
    key(P['UpperArm.' + s], 37, rot=(0.03, 0, 0.02 * sign))
    key(P['UpperArm.' + s], 73, rot=(0, 0, 0))

# ---------------- Wave：右手举起挥两下 ----------------
new_action('Wave')
P = rig.pose.bones
key(P['UpperArm.R'], 1, rot=(0, 0, 0))
key(P['UpperArm.R'], 9, rot=(0, 0, 2.0))
key(P['UpperArm.R'], 34, rot=(0, 0, 2.0))
key(P['UpperArm.R'], 44, rot=(0, 0, 0))
key(P['LowerArm.R'], 1, rot=(0, 0, 0))
key(P['LowerArm.R'], 9, rot=(-0.4, 0, -0.2))
for i, f in enumerate((14, 18, 22, 26, 30)):
    key(P['LowerArm.R'], f, rot=(-0.4, 0, -0.2 if i % 2 == 0 else 0.35))
key(P['LowerArm.R'], 38, rot=(0, 0, 0))
key(P['Hand.R'], 1, rot=(0, 0, 0))
key(P['Hand.R'], 14, rot=(0, 0, 0.25))
key(P['Hand.R'], 18, rot=(0, 0, -0.25))
key(P['Hand.R'], 22, rot=(0, 0, 0.25))
key(P['Hand.R'], 26, rot=(0, 0, -0.25))
key(P['Hand.R'], 30, rot=(0, 0, 0.2))
key(P['Hand.R'], 44, rot=(0, 0, 0))
key(P['Head'], 1, rot=(0, 0, 0))
key(P['Head'], 9, rot=(0, 0, 0.12))
key(P['Head'], 38, rot=(0, 0, 0.12))
key(P['Head'], 48, rot=(0, 0, 0))
key(P['Chest'], 1, rot=(0, 0, 0))
key(P['Chest'], 9, rot=(0, 0.05, 0))
key(P['Chest'], 38, rot=(0, 0.05, 0))
key(P['Chest'], 48, rot=(0, 0, 0))

# ---------------- Squat：蹲一下 ----------------
new_action('Squat')
P = rig.pose.bones
for f, hy, th, sh, ft, ch, arm in (
    (1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
    (12, -0.14, 0.85, -1.45, 0.62, 0.12, 0.55),
    (26, -0.14, 0.85, -1.45, 0.62, 0.12, 0.55),
    (40, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
):
    key(P['Hips'], f, loc=(0, hy, 0))
    for s in ('L', 'R'):
        key(P['Thigh.' + s], f, rot=(th, 0, 0))
        key(P['Shin.' + s], f, rot=(sh, 0, 0))
        key(P['Foot.' + s], f, rot=(ft, 0, 0))
        key(P['UpperArm.' + s], f, rot=(arm, 0, 0))
    key(P['Chest'], f, rot=(ch, 0, 0))
    key(P['Head'], f, rot=(-ch * 0.5, 0, 0))

# 恢复静止，清掉当前动作以免导出时套用
rest()
rig.animation_data.action = None

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print("SAVED", OUT_BLEND)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format='GLB', export_apply=False, export_yup=True,
    export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
    export_frame_range=False
)
print("EXPORTED", OUT_GLB)
