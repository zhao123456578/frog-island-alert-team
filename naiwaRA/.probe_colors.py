import bpy
bpy.ops.wm.open_mainfile(filepath=r"D:/gr/naiwaRA/assets/milkfrog_no13.blend")
o=bpy.data.objects['MilkFrog_NO13_Body']; me=o.data
ca=me.color_attributes['Col']
mw=o.matrix_world
pts={'bellyfront':(0,0.36,0.72),'bellylow':(0,0.30,0.50),'chest':(0,0.25,1.15),'head':(0,0.10,1.60),'side':(0.4,0.0,0.85),'back':(0,0.30,-0.36)}
for name,(x,y,z) in pts.items():
    # 找最近顶点
    best=None;bd=9
    for i,v in enumerate(me.vertices):
        w=mw@v.co
        d=(w.x-x)**2+(w.y-y)**2+(w.z-z)**2
        if d<bd: bd=d;best=i;bw=w
    c=ca.data[best].color
    print(name,"id",best,"pos",tuple(round(q,2) for q in bw),"color",tuple(round(q,3) for q in c),"dist",round(bd**0.5,3))
