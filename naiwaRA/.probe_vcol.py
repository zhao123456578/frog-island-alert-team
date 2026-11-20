import bpy
bpy.ops.wm.open_mainfile(filepath=r"D:/gr/naiwaRA/assets/milkfrog_no13.blend")
o = bpy.data.objects['MilkFrog_NO13_Body']
me = o.data
for ca in me.color_attributes:
    print("ATTR", ca.name, ca.domain, ca.data_type, len(ca.data))
    vals = []
    if ca.domain == 'POINT':
        for d in ca.data:
            vals.append(tuple(d.color))
    else:
        for i in range(0, len(ca.data), max(1, len(ca.data)//2000)):
            vals.append(tuple(ca.data[i].color))
    if vals:
        print("  sample", [tuple(round(x,3) for x in v) for v in vals[:6]])
        for ch in range(4):
            arr=[v[ch] for v in vals]
            print("  ch",ch,"min",round(min(arr),3),"max",round(max(arr),3),"mean",round(sum(arr)/len(arr),3))
# 位置切片
zs = [(0.0,0.25),(0.25,0.5),(0.5,0.75),(0.75,1.0),(1.0,1.25),(1.25,1.5),(1.5,1.87)]
for a,b in zs:
    pts=[(v.co.x, v.co.y, v.co.z) for v in me.vertices if a<=v.co.z<b]
    if pts:
        print("Z",a,b,"n",len(pts),"x",round(min(p[0] for p in pts),2),round(max(p[0] for p in pts),2),"y",round(min(p[1] for p in pts),2),round(max(p[1] for p in pts),2))
