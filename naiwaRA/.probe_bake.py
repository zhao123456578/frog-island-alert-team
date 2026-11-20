import bpy
bpy.ops.wm.open_mainfile(filepath=r"D:/gr/naiwaRA/assets/milkfrog_no13.blend")
mesh = bpy.data.objects['MilkFrog_NO13_Body']
print("VERTS", len(mesh.data.vertices), "POLYS", len(mesh.data.polygons))
print("COLOR_ATTRS", [(a.name, a.domain, a.data_type) for a in mesh.data.color_attributes])
print("ACTIVE", mesh.data.color_attributes.active_color_index if mesh.data.color_attributes else None)
sc = bpy.context.scene
print("ENGINES", [i.identifier for i in sc.render.bl_rna.properties['engine'].enum_items])
print("BAKE_TARGETS", [i.identifier for i in sc.render.bake.bl_rna.properties['target'].enum_items])
print("MATS", [m.name for m in mesh.data.materials])
