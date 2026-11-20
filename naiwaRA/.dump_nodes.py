import bpy
bpy.ops.wm.open_mainfile(filepath=r"D:/gr/naiwaRA/assets/milkfrog_no13.blend")
nt = bpy.data.materials['yellow'].node_tree
for n in nt.nodes:
    if n.type != 'MATH': continue
    ins = []
    for i in n.inputs:
        if i.is_linked:
            ins.append('LINK:'+i.links[0].from_node.name+'.'+i.links[0].from_socket.name)
        else:
            ins.append(round(i.default_value, 4))
    print("MATH", n.name, n.operation, ins)
for n in nt.nodes:
    if n.type == 'MIX_RGB':
        print("MIX", n.name, n.blend_type, "fac", round(n.inputs['Factor'].default_value,4) if not n.inputs['Factor'].is_linked else 'LINK',
              "c1", tuple(round(x,3) for x in n.inputs['Color1'].default_value),
              "c2", tuple(round(x,3) for x in n.inputs['Color2'].default_value))
