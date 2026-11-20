import bpy
op = bpy.ops.export_scene.gltf
props = op.get_rna_type().properties
for k in ['export_animations','export_animation_mode','export_nla_strips','export_bake_animation']:
    if k in props:
        p = props[k]
        items = [i.identifier for i in p.enum_items] if hasattr(p,'enum_items') and p.enum_items else p.default
        print("OPT", k, items)
