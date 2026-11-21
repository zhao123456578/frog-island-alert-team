# -*- coding: utf-8 -*-
"""低面数骷髅怪物 v2：细长骨架 + 腐烂色差 + 大眼白针孔瞳 + 夸张下巴 + 重力长发 + 血渍。
新增：四肢加长、Armature 运动骨骼(刚性蒙皮)、Idle/Wave 动作。
Blender 后台脚本：bpy + bmesh 数据 API 建模，flat shading，导出带骨架+动画的 GLB + data.js + 渲染预览。
"""
import bpy, bmesh, math, random, base64, os
from mathutils import Vector, Matrix

# 清空 Blender 默认场景
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for _d in list(bpy.data.meshes):
    if _d.users == 0:
        bpy.data.meshes.remove(_d)

random.seed(13)
OUT_DIR = r"D:\gr\naiwaRA\assets\monster_concepts"
os.makedirs(OUT_DIR, exist_ok=True)
OUT_GLB = os.path.join(OUT_DIR, "skeleton_monster.glb")
OUT_JS  = os.path.join(OUT_DIR, "skeleton_monster_data.js")
OUT_PNG = os.path.join(OUT_DIR, "skeleton_monster_preview.png")
OUT_BLEND = os.path.join(OUT_DIR, "skeleton_monster.blend")

# ============ 形变参数 ============
LIFT = 0.35          # 全身抬高（配合腿拉伸让脚贴地）
LEG_STRETCH = 1.35   # 腿拉伸系数（脚 z=0 → -0.35，+LIFT 后回 0）
LEG_SEGS = {'Thigh_L','Shin_L','Foot_L','Thigh_R','Shin_R','Foot_R'}

# ============ 材质槽 ============
PALETTE = [
    ("Bone_Ivory",  (0.78, 0.73, 0.58, 1)),  # 0
    ("Bone_Rot",    (0.42, 0.31, 0.19, 1)),  # 1
    ("Bone_Dark",   (0.27, 0.25, 0.19, 1)),  # 2
    ("Bone_Yellow", (0.62, 0.52, 0.26, 1)),  # 3
    ("Eye_White",   (0.90, 0.88, 0.78, 1)),  # 4
    ("Pupil",       (0.03, 0.03, 0.02, 1)),  # 5
    ("Socket",      (0.08, 0.07, 0.05, 1)),  # 6
    ("Hair",        (0.14, 0.12, 0.10, 1)),  # 7
    ("Flesh",       (0.52, 0.37, 0.29, 1)),  # 8
    ("Blood_Dry",   (0.30, 0.022, 0.018, 1)),# 9 干涸暗红血渍
    ("Blood_Wet",   (0.45, 0.045, 0.03, 1)), # 10 稍新血渍
]
MAT_IDX = {name: i for i, (name, _) in enumerate(PALETTE)}

def make_materials():
    mats=[]
    for name,col in PALETTE:
        m=bpy.data.materials.new(name); m.use_nodes=True; m.diffuse_color=col
        for n in m.node_tree.nodes:
            if n.type=='BSDF_PRINCIPLED':
                n.inputs['Base Color'].default_value=col
                n.inputs['Roughness'].default_value=0.95
                n.inputs['Metallic'].default_value=0.0
        mats.append(m)
    return mats

# ============ bmesh + seg 标签 ============
bm = bmesh.new()
CURRENT_SEG = 'Hips'
SEG_IDS = {}
seg_layer = bm.verts.layers.int.new("SEG")   # 顶点 int 属性：seg id（覆盖式，嵌套不重复）
def seg_id(s):
    if s not in SEG_IDS:
        SEG_IDS[s] = len(SEG_IDS)
    return SEG_IDS[s]
seg_id(CURRENT_SEG)

def set_seg(s):
    global CURRENT_SEG
    CURRENT_SEG = s
    seg_id(s)

BODY_NARROW = 0.80   # 整体横向收窄（更瘦长）
def xform(p):
    p = Vector(p)
    p.x *= BODY_NARROW; p.y *= 0.86
    if CURRENT_SEG in LEG_SEGS and p.z < 1.0:
        p.z = 1.0 + (p.z - 1.0) * LEG_STRETCH
    p.z += LIFT
    return p

def _mark(n0):
    sid = seg_id(CURRENT_SEG)
    for v in list(bm.verts)[n0:]:
        v[seg_layer] = sid

def face_idx(new_faces, idx):
    for f in new_faces:
        f.material_index = idx

def octa(c, r, idx, scale=(1,1,1), xformed=False):
    n0=len(bm.verts); c=Vector(c) if xformed else xform(c)
    vs=[bm.verts.new(c+Vector((r*scale[0],0,0))), bm.verts.new(c+Vector((-r*scale[0],0,0))),
        bm.verts.new(c+Vector((0,r*scale[1],0))), bm.verts.new(c+Vector((0,-r*scale[1],0))),
        bm.verts.new(c+Vector((0,0,r*scale[2]))), bm.verts.new(c+Vector((0,0,-r*scale[2])))]
    fs=[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)]
    face_idx([bm.faces.new([vs[i] for i in f]) for f in fs], idx)
    _mark(n0)

def bone(a, b, r1, r2, idx, sides=6, knob=True, knob_idx=None):
    n0=len(bm.verts); a=xform(a); b=xform(b)
    d=b-a
    if d.length<1e-6:
        _mark(n0); return
    d.normalize()
    up=Vector((0,0,1)) if abs(d.z)<0.9 else Vector((0,1,0))
    u=d.cross(up).normalized(); v=d.cross(u).normalized()
    ring1=[]; ring2=[]
    for i in range(sides):
        ang=2*math.pi*i/sides; off=u*math.cos(ang)+v*math.sin(ang)
        ring1.append(bm.verts.new(a+off*r1)); ring2.append(bm.verts.new(b+off*r2))
    made=[]
    for i in range(sides):
        j=(i+1)%sides
        made.append(bm.faces.new([ring1[i],ring1[j],ring2[j],ring2[i]]))
    made.append(bm.faces.new(list(reversed(ring1)))); made.append(bm.faces.new(ring2))
    face_idx(made, idx)
    if knob:
        ki=idx if knob_idx is None else knob_idx
        octa(a, r1*1.4, ki, xformed=True); octa(b, r2*1.4, ki, xformed=True)
    _mark(n0)

def ico(center, scale, idx, subdiv=1, deform=None, mottle=None):
    n0=len(bm.verts); center=xform(center)
    mat=Matrix.Translation(center) @ Matrix.Diagonal((scale[0],scale[1],scale[2],1))
    res=bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0, matrix=mat)
    if deform:
        for v in res['verts']:
            deform(v)
    # 新建面设材质；mottle 让部分面变色（与骨面齐平，非凸起斑块）
    fset=set()
    for v in res['verts']:
        for f in v.link_faces:
            fset.add(f)
    for f in fset:
        f.material_index=idx
    if mottle:
        for f in fset:
            r=random.random(); acc=0.0
            for mid,prob in mottle:
                acc+=prob
                if r<acc:
                    f.material_index=mid; break
    _mark(n0)

def scrap(pts, idx):
    n0=len(bm.verts); pts=[xform(p) for p in pts]
    made=[bm.faces.new([bm.verts.new(Vector(p)) for p in pts])]
    face_idx(made, idx)
    _mark(n0)

# 骨色随机（腐朽斑驳）
BONE_MAIN=[0,3,1,2,3,0]
def rb(): return random.choice(BONE_MAIN)
def rknob(): return random.choice([1,2,1,3])

# ================= 骨架主体 =================
set_seg('Hips')
octa((0,0.0,1.02), 0.10, rb(), scale=(1.25,0.8,0.75))
bone((0,0.0,1.06),(0.14,0.02,0.98),0.035,0.028,rb(),knob_idx=rknob())
bone((0,0.0,1.06),(-0.14,0.02,0.98),0.035,0.028,rb(),knob_idx=rknob())
bone((0.14,0.02,0.98),(0.12,0.0,0.90),0.028,0.022,rb(),knob=False)
bone((-0.14,0.02,0.98),(-0.12,0.0,0.90),0.028,0.022,rb(),knob=False)

# 脊椎（下段 Hips / 上段 Spine）
spine=[]
for i in range(9):
    t=i/8; z=1.06+t*0.72; y=0.02-0.06*math.sin(t*math.pi)
    spine.append((0,y,z))
for i in range(len(spine)-1):
    set_seg('Hips' if i<4 else 'Spine')
    octa(spine[i],0.030,rknob(),scale=(0.9,0.9,1.15))
    bone(spine[i],spine[i+1],0.018,0.016,rb(),sides=5,knob=False)
set_seg('Spine'); octa(spine[-1],0.030,rknob())

# 胸骨 + 锁骨 + 肋骨 → Chest
set_seg('Chest')
bone((0,-0.20,1.66),(0,-0.22,1.34),0.022,0.016,rb(),sides=5,knob=False)
bone((0,-0.02,1.70),(0.26,-0.06,1.68),0.020,0.016,rb(),sides=5,knob=True)
bone((0,-0.02,1.70),(-0.26,-0.06,1.68),0.020,0.016,rb(),sides=5,knob=True)
for side in (1,-1):
    for i in range(6):
        z=1.66-i*0.062
        p0=(0,0.0-0.05*math.sin(i/5*math.pi),z)
        p1=(side*(0.16+i*0.004),0.02,z+0.02)
        p2=(side*(0.27+i*0.004),-0.11,z-0.05)
        p3=(side*0.13,-0.205,z-0.13)
        segc=rb()
        bone(p0,p1,0.013,0.011,segc,sides=5,knob=False)
        bone(p1,p2,0.011,0.010,segc,sides=5,knob=False)
        bone(p2,p3,0.010,0.008,rb(),sides=5,knob=False)

# 颈椎 → Neck
set_seg('Neck')
bone(spine[-1],(0,0.0,1.86),0.016,0.014,rb(),sides=5,knob=True)
bone((0,0.0,1.86),(0,0.0,2.30),0.014,0.012,rb(),sides=5,knob=False)  # 延长颈椎接到头骨底
octa((0,0.0,2.28),0.026,rknob())

# ================= 头骨：使用现成 CC-BY-SA 低模人头骨（ulf / OpenGameArt）=================
# 来源：https://opengameart.org/node/31045  Human Skull by ulf, low-res 186v/364f
# 已导出为 skull_aged.obj（脸朝 -Y、头顶 +Z 的直立朝向，尺寸 x0.139/y0.182/z0.178）
set_seg('Head')
SKULL_OBJ = r"D:\gr\naiwaRA\assets\monster_concepts\skull_source\skull_aged.obj"
# 读取 OBJ 顶点/面
_sv=[]; _sf=[]
for _line in open(SKULL_OBJ, encoding='utf-8'):
    if _line.startswith('v '):
        _sv.append(tuple(float(x) for x in _line.split()[1:4]))
    elif _line.startswith('f '):
        idx=[int(tok.split('/')[0]) for tok in _line.split()[1:]]
        _sf.append([i-1 for i in idx])  # OBJ 1-based → 0-based
# 归一化：居中 x/y，缩小头骨（用户要求头改小）
_sx=[p[0] for p in _sv]; _sy=[p[1] for p in _sv]; _sz=[p[2] for p in _sv]
_cx=(min(_sx)+max(_sx))/2; _cy=(min(_sy)+max(_sy))/2; _cz=min(_sz)
_skull_scale=0.30/max(max(_sx)-min(_sx), max(_sz)-min(_sz))   # 头宽约 0.30（原 0.40）
SKULL_BASE=2.02   # xform 前的底部基准（xform +LIFT 后下巴落在 ≈2.37，接颈椎）
def skull_map(p):
    # 输出"建模空间"坐标，随后统一走 xform（与眼球同坐标系）
    return ((p[0]-_cx)*_skull_scale,
            (p[1]-_cy)*_skull_scale,
            (p[2]-_cz)*_skull_scale + SKULL_BASE)
# 头骨顶点也走 xform（关键修复：之前直接写 bmesh 漏掉 xform，导致与眼球错位 0.35）
_skull_pts=[xform(skull_map(p)) for p in _sv]
_n0=len(bm.verts)
_skull_bmverts=[bm.verts.new(Vector(q)) for q in _skull_pts]
for _f in _sf:
    try:
        _face=bm.faces.new([_skull_bmverts[i] for i in _f])
        _r=random.random(); _zf=_skull_pts[_f[0]][2]
        if _zf<2.48 and _r<0.35: _mi=MAT_IDX['Bone_Dark']       # 下颌/下部偏暗
        elif _r<0.18: _mi=MAT_IDX['Bone_Dark']
        elif _r<0.30: _mi=MAT_IDX['Bone_Yellow']
        elif _r<0.36: _mi=MAT_IDX['Bone_Ivory']
        else: _mi=MAT_IDX['Bone_Rot']
        _face.material_index=_mi
    except Exception:
        pass
_mark(_n0)
print("SKULL imported verts=%d faces=%d scale=%.3f"%(len(_sv),len(_sf),_skull_scale))

# 大眼白 + 针孔瞳：眼眶中心用同一 skull_map+xform 从 OBJ 坐标推导（绝不手算）
# 眼眶在 OBJ 空间：相对中心 x=±0.025, y=-0.086(最前), z=+0.1344
def eye_center(side):
    # 只返回建模坐标；ico() 内部会再 xform，避免二次 LIFT
    return skull_map((_cx+side*0.025, _cy-0.086, _cz+0.1344))
for s in (1,-1):
    ec=eye_center(s); ex,ey,ez=ec[0],ec[1],ec[2]
    ico((ex,ey+0.012,ez),(0.028,0.016,0.030),MAT_IDX['Socket'],subdiv=1)     # 眼窝阴影
    ico((ex,ey,ez),(0.024,0.013,0.026),MAT_IDX['Eye_White'],subdiv=2)        # 大眼白，嵌眼窝
    ico((ex,ey-0.017,ez+0.001),(0.008,0.004,0.008),MAT_IDX['Pupil'],subdiv=1)# 针孔瞳
print("EYE centers (pre-xform)", [tuple(round(v,3) for v in eye_center(s)) for s in (1,-1)])

# ================= 手臂（加长）+ 长手指 =================
for s in (1,-1):
    tag='L' if s==1 else 'R'
    sh=(s*0.26,-0.06,1.68); el=(s*0.42,-0.10,1.22); wr=(s*0.54,-0.17,0.74)
    set_seg('UpperArm_'+tag)
    bone(sh,el,0.027,0.019,rb(),knob_idx=rknob())
    set_seg('LowerArm_'+tag)
    bone(el,wr,0.019,0.013,rb(),knob_idx=rknob()); octa(el,0.022,rknob())
    set_seg('Hand_'+tag)
    palm=(s*0.55,-0.19,0.70)
    octa(palm,0.026,rb(),scale=(1,0.7,1.2))
    bone(wr,palm,0.014,0.012,rb(),sides=5,knob=False)
    finger_lens=[0.34,0.46,0.52,0.45,0.32]  # 更长手指
    for f,L in enumerate(finger_lens):
        spread=(f-2)*0.032
        root=(s*0.55+s*spread*0.4,-0.20+spread,0.68)
        mid=(s*(0.55+spread*0.4)+s*0.02,-0.20+spread-0.04,0.68-L*0.52)
        tip=(s*(0.56+spread*0.4)+s*0.03,-0.20+spread-0.07,0.68-L)
        fc=rb()
        bone(root,mid,0.009,0.007,fc,sides=4,knob=False)
        bone(mid,tip,0.007,0.002,fc,sides=4,knob=False)

# ================= 腿（加长）+ 脚 =================
for s in (1,-1):
    tag='L' if s==1 else 'R'
    hip=(s*0.14,0.0,0.99); knee=(s*0.19,-0.02,0.53); ankle=(s*0.21,0.0,0.10)
    set_seg('Thigh_'+tag)
    bone(hip,knee,0.033,0.022,rb(),knob_idx=rknob())
    set_seg('Shin_'+tag)
    octa(knee,0.026,rknob())
    bone(knee,ankle,0.022,0.015,rb(),knob_idx=rknob())
    set_seg('Foot_'+tag)
    bone((s*0.21,0.0,0.10),(s*0.21,-0.22,0.045),0.020,0.012,rb(),sides=5,knob=False)
    for t in range(3):
        tx=s*0.21+s*(t-1)*0.030
        bone((tx,-0.21,0.045),(tx,-0.30,0.035),0.008,0.003,rb(),sides=4,knob=False)

# ================= 长发（重力下垂；从头顶+后脑披散，露出正脸）=================
set_seg('Hair')
N_HAIR=15
for i in range(N_HAIR):
    ang=math.pi*(i/(N_HAIR-1))          # 0..π：+X 侧 → +Y(后) → -X 侧
    rx,ry=math.cos(ang)*0.15, math.sin(ang)*0.12 + 0.03
    root=(rx,ry,2.55-0.02*abs(math.cos(ang)))   # 贴缩小后的头骨顶
    L=1.30+0.60*((i*7)%6)/5
    spread=1.0+0.4*abs(math.cos(ang))           # 两侧发丝外披，不挤成板
    p0=root
    p1=(root[0]*spread, max(root[1],0.03), root[2]-L*0.22)
    p2=(root[0]*spread*1.05, max(root[1],0.05)+0.02, root[2]-L*0.60)
    p3=(root[0]*spread*1.10, max(root[1],0.06)+0.04, root[2]-L)
    bone(p0,p1,0.016,0.011,MAT_IDX['Hair'],sides=4,knob=False)
    bone(p1,p2,0.011,0.007,MAT_IDX['Hair'],sides=4,knob=False)
    bone(p2,p3,0.007,0.002,MAT_IDX['Hair'],sides=4,knob=False)

# ================= 少量附着残皮 =================
set_seg('Chest')
scrap([(0.24,-0.10,1.72),(0.34,-0.14,1.60),(0.18,-0.16,1.62)],MAT_IDX['Flesh'])
scrap([(-0.22,-0.10,1.70),(-0.33,-0.12,1.58),(-0.16,-0.17,1.61)],MAT_IDX['Flesh'])
scrap([(0.10,-0.19,1.55),(0.20,-0.16,1.50),(0.14,-0.21,1.44)],MAT_IDX['Bone_Rot'])
scrap([(-0.12,-0.18,1.48),(-0.21,-0.15,1.44),(-0.15,-0.20,1.39)],MAT_IDX['Flesh'])
set_seg('Hips')
scrap([(0.08,0.02,1.18),(0.16,-0.02,1.12),(0.09,-0.06,1.10)],MAT_IDX['Flesh'])

# ================= 血渍（贴面扁斑，不再是凸起方块）=================
def blood(center, scale, seg, wet=False, face='front'):
    """贴骨面的扁平血斑：2~3 个薄三角片。face: front(-Y) / top(+Z) / side(+X)。"""
    set_seg(seg)
    idx=MAT_IDX['Blood_Wet'] if wet else MAT_IDX['Blood_Dry']
    cx,cy,cz=center; w,h=scale[0],scale[1]
    if face=='front':   # 贴朝前的骨面（x-z 平面）
        scrap([(cx-w,cy,cz-h*0.4),(cx-w*0.2,cy-0.002,cz+h),(cx+w,cy,cz-h*0.3)],idx)
        scrap([(cx-w*0.7,cy,cz-h*0.2),(cx+w,cy,cz-h*0.3),(cx+w*0.3,cy,cz-h)],idx)
    elif face=='top':   # 贴朝上的骨面（x-y 平面）
        scrap([(cx-w,cy-h,cz),(cx,cy+h,cz),(cx+w,cy-h*0.5,cz)],idx)
    else:               # 贴侧面（y-z 平面）
        scrap([(cx,cy-w,cz-h*0.4),(cx,cy,cz+h),(cx,cy+w,cz-h*0.3)],idx)
# 头骨 / 下颌（贴前面；头骨正面 y≈-0.19）
blood((0.08,-0.195,2.64),(0.040,0.045),'Head')
blood((-0.07,-0.195,2.52),(0.035,0.040),'Head',wet=True)
blood((0.0,-0.205,2.38),(0.035,0.030),'Head')
# 胸腔肋骨
blood((0.19,-0.16,1.60),(0.045,0.05),'Chest')
blood((-0.20,-0.15,1.52),(0.042,0.048),'Chest',wet=True)
blood((0.12,-0.21,1.45),(0.038,0.04),'Chest')
# 脊椎 / 腰椎（贴顶面）
blood((0.0,0.05,1.55),(0.045,0.035),'Spine',face='top')
blood((0.0,0.06,1.22),(0.05,0.04),'Hips',face='top')
# 手臂关节（贴侧面）
blood((0.42,-0.10,1.22),(0.035,0.04),'LowerArm_L',wet=True,face='side')
blood((-0.42,-0.10,1.22),(0.035,0.04),'LowerArm_R',face='side')
# 骨盆 / 腿
blood((0.14,0.0,1.00),(0.04,0.045),'Hips',face='top')
blood((0.19,-0.02,0.53),(0.035,0.04),'Shin_L',face='side')
blood((-0.19,-0.02,0.53),(0.035,0.04),'Shin_R',wet=True,face='side')

# ============ 生成 mesh ============
mesh=bpy.data.meshes.new("SkeletonMonster_Mesh")
bm.to_mesh(mesh)
# 从 int 属性读回 seg（to_mesh 后 bm 已被清空的副本，需从 mesh attribute 读）
id2seg = {v:k for k,v in SEG_IDS.items()}
seg_attr = mesh.attributes.get("SEG")
vert_seg = [id2seg[seg_attr.data[i].value] for i in range(len(mesh.vertices))]
bm.free()
mats=make_materials()
for m in mats: mesh.materials.append(m)
for p in mesh.polygons: p.use_smooth=False
obj=bpy.data.objects.new("SkeletonMonster",mesh)
bpy.context.collection.objects.link(obj)

# 居中贴地（seg 变形后重新算）
pts=[v.co.copy() for v in mesh.vertices]
minz=min(p.z for p in pts)
for v in mesh.vertices: v.co.z-=minz
bpy.context.view_layer.update()
print("MESH verts=%d faces=%d mats=%d segs=%d" % (len(mesh.vertices),len(mesh.polygons),len(mesh.materials),len(set(vert_seg))))
assert len(vert_seg)==len(mesh.vertices), "vert_seg mismatch %d vs %d"%(len(vert_seg),len(mesh.vertices))

# ============ Armature 骨骼 ============
arm_data=bpy.data.armatures.new("SkeletonMonster_Armature")
arm=bpy.data.objects.new("SkeletonMonster_Rig",arm_data)
bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True); bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode='EDIT')

# 骨骼定义：name -> (head, tail, parent)。坐标用 seg 变形后的世界坐标
BONES={
 'Root':      ((0,0,0),      (0,0,0.45),   None),
 'Hips':      ((0,0,1.30),   (0,0,1.55),   'Root'),
 'Spine':     ((0,0,1.55),   (0,0,1.95),   'Hips'),
 'Chest':     ((0,0,1.95),   (0,0,2.25),   'Spine'),
 'Neck':      ((0,0,2.25),   (0,0,2.31),   'Chest'),
 'Head':      ((0,0,2.36),   (0,-0.03,2.68),'Neck'),
 'Hair':      ((0,0.06,2.56),(0,0.10,1.95), 'Head'),
 'UpperArm_L':((0.26,-0.06,2.03),(0.42,-0.10,1.57),'Chest'),
 'LowerArm_L':((0.42,-0.10,1.57),(0.54,-0.17,1.09),'UpperArm_L'),
 'Hand_L':    ((0.54,-0.17,1.09),(0.56,-0.20,0.60),'LowerArm_L'),
 'UpperArm_R':((-0.26,-0.06,2.03),(-0.42,-0.10,1.57),'Chest'),
 'LowerArm_R':((-0.42,-0.10,1.57),(-0.54,-0.17,1.09),'UpperArm_R'),
 'Hand_R':    ((-0.54,-0.17,1.09),(-0.56,-0.20,0.60),'LowerArm_R'),
 'Thigh_L':   ((0.14,0,1.35), (0.19,-0.02,0.74),'Hips'),
 'Shin_L':    ((0.19,-0.02,0.74),(0.21,0,0.15),'Thigh_L'),
 'Foot_L':    ((0.21,0,0.15),(0.21,-0.22,0.05),'Shin_L'),
 'Thigh_R':   ((-0.14,0,1.35),(-0.19,-0.02,0.74),'Hips'),
 'Shin_R':    ((-0.19,-0.02,0.74),(-0.21,0,0.15),'Thigh_R'),
 'Foot_R':    ((-0.21,0,0.15),(-0.21,-0.22,0.05),'Shin_R'),
}
for name,(h,t,par) in BONES.items():
    eb=arm_data.edit_bones.new(name)
    eb.head=Vector(h); eb.tail=Vector(t)
    if par: eb.parent=arm_data.edit_bones[par]
bpy.ops.object.mode_set(mode='OBJECT')

# 刚性顶点组：每个 seg → 骨骼，权重 1.0
groups={}
for vi,bn in enumerate(vert_seg):
    groups.setdefault(bn,[]).append(vi)
for bn,vis in groups.items():
    vg=obj.vertex_groups.new(name=bn)
    vg.add(vis,1.0,'REPLACE')
print("VERTEX GROUPS", list(groups.keys()))

# Armature 修改器
mod=obj.modifiers.new("Armature","ARMATURE"); mod.object=arm

# ============ 动作：Idle 呼吸 + Wave 挥手 ============
scene=bpy.context.scene
scene.frame_start=1; scene.frame_end=60
def set_pose(pb, rx=0, ry=0, rz=0):
    pb.rotation_mode='XYZ'; pb.rotation_euler=(rx,ry,rz)

# Idle
act_idle=bpy.data.actions.new("Idle")
arm.animation_data_create(); arm.animation_data.action=act_idle
for f,br,hy,hr in [(1,0,-0.05,0.06),(30,0.05,0.06,-0.05),(60,0,-0.05,0.06)]:
    scene.frame_set(f)
    for bn,rot in [('Chest',(br,0,0)),('Neck',(-br*0.5,0,0)),('Head',(0,0,hy)),('Hair',(hr,0,0))]:
        pb=arm.pose.bones[bn]; set_pose(pb,*rot); pb.keyframe_insert('rotation_euler',frame=f)

# Wave（右臂抬起挥动）
act_wave=bpy.data.actions.new("Wave")
arm.animation_data.action=act_wave
for f,armr,elbow in [(1,0,0),(12,-1.25,-0.55),(24,-0.85,-0.30),(36,-1.25,-0.55),(48,0,0)]:
    scene.frame_set(f)
    for bn,rot in [('UpperArm_R',(0,0,armr)),('LowerArm_R',(0,0,elbow)),('Hand_R',(0,0,-elbow*0.4))]:
        pb=arm.pose.bones[bn]; set_pose(pb,*rot); pb.keyframe_insert('rotation_euler',frame=f)

# 回到 Idle 作为默认
arm.animation_data.action=act_idle
scene.frame_set(1)
print("ACTIONS", [a.name for a in bpy.data.actions])

# ============ 暗色地面 ============
gm=bpy.data.meshes.new("FloorMesh")
gm.from_pydata([(-3,-3,0),(3,-3,0),(3,3,0),(-3,3,0)],[],[(0,1,2,3)]); gm.update()
floor=bpy.data.objects.new("Floor",gm); bpy.context.collection.objects.link(floor)
fmat=bpy.data.materials.new("FloorMat"); fmat.use_nodes=True
fmat.diffuse_color=(0.06,0.075,0.09,1)
for n in fmat.node_tree.nodes:
    if n.type=='BSDF_PRINCIPLED':
        n.inputs['Base Color'].default_value=(0.06,0.075,0.09,1); n.inputs['Roughness'].default_value=1.0
gm.materials.append(fmat)

# ============ 灯光/相机 ============
world=bpy.data.worlds[0] if bpy.data.worlds else bpy.data.worlds.new("ColdFog")
bpy.context.scene.world=world; world.use_nodes=True
bg=world.node_tree.nodes.get('Background')
if bg:
    bg.inputs['Color'].default_value=(0.035,0.055,0.075,1); bg.inputs['Strength'].default_value=0.45

def area_light(name,loc,color,energy,size,target=(0,0,1.45)):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.color=color
    data.shape='DISK'; data.size=size
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o)
    o.location=loc; o.rotation_euler=(Vector(target)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
area_light("Key_ColdBlue",(2.6,-3.2,3.8),(0.55,0.75,1.0),170,3.0)
area_light("Fill_Dim",(-3.0,-1.0,2.4),(0.9,0.85,0.7),50,3.0)
area_light("Rim",(0.0,3.0,3.0),(0.4,0.7,1.0),110,2.5)

cam_data=bpy.data.cameras.new("Cam")
cam=bpy.data.objects.new("Cam",cam_data); bpy.context.collection.objects.link(cam)
cam.location=(1.0,-4.8,3.1)
cam.rotation_euler=(Vector((0,0,1.55))-cam.location).to_track_quat('-Z','Y').to_euler()
cam_data.lens=54; bpy.context.scene.camera=cam

scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
scene.render.resolution_x=800; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath=OUT_PNG
scene.view_settings.view_transform='Standard'

# ============ 保存/渲染/导出 ============
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
scene.frame_set(1)
bpy.ops.render.render(write_still=True)
print("PNG",OUT_PNG,os.path.getsize(OUT_PNG))

bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True,
    export_apply=False, export_yup=True, export_materials='EXPORT',
    export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True)
print("GLB",OUT_GLB,os.path.getsize(OUT_GLB))

with open(OUT_GLB,'rb') as f: b64=base64.b64encode(f.read()).decode('ascii')
with open(OUT_JS,'w',encoding='ascii') as f: f.write('window.SKELETON_MONSTER_B64="%s";\n'%b64)
print("DATA_JS",OUT_JS,os.path.getsize(OUT_JS))
print("DONE")
