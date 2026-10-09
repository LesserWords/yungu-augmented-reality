"""Adds a preview setup to the source .blend and exports game files.
usage: python3 export_yungu.py <Yungu.blend> <outdir>"""
import bpy, sys, os
from mathutils import Vector

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
prev = bpy.data.collections["Preview_Setup"]

# ---- preview camera / lights / world saved into the .blend (not exported)
HAS_PREVIEW = "Cam_Front" in bpy.data.objects
if not HAS_PREVIEW:
    cam_d = bpy.data.cameras.new("Cam_Front"); cam_d.lens = 70
    cam = bpy.data.objects.new("Cam_Front", cam_d); prev.objects.link(cam)
    cam.location = (1.35, -2.1, 0.95)
    cam.rotation_euler = (Vector((0, 0, 0.56)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    def area(name, loc, energy, size):
        l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size
        o = bpy.data.objects.new(name, l); prev.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    area("Light_Key", (1.3, -2.3, 2.5), 300, 0.9)
    area("Light_Fill", (-2.2, -1.6, 1.2), 140, 1.8)
    area("Light_Rim", (0.5, 2.2, 2.2), 160, 1.5)
    area("Light_Top", (0, -0.3, 3.0), 90, 2.5)
    gl = bpy.data.lights.new("Light_GlowBounce", 'POINT'); gl.energy = 18; gl.color = (0.6, 1.0, 0.1)
    o = bpy.data.objects.new("Light_GlowBounce", gl); prev.objects.link(o); o.location = (0, -0.08, 0.05)
    w = bpy.data.worlds.new("Studio"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.88, 0.92, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.30
sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'; sc.view_settings.exposure = -0.75
sc.frame_start, sc.frame_end = 1, 90
# pack textures into the .blend so it is self-contained
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "Yungu.blend"))

char_objs = [o for o in bpy.data.objects if o.users_collection and
             any(c.name in ("Yungu", "Yungu_Parts", "Yungu_FX") for c in o.users_collection)]

def select_char():
    bpy.ops.object.select_all(action='DESELECT')
    for o in char_objs: o.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects["Yungu_Rig"]

def set_subsurf(level):
    for o in char_objs:
        for m in getattr(o, "modifiers", []):
            if m.type == 'SUBSURF':
                m.show_viewport = level > 0; m.levels = max(level, 1)

rig = bpy.data.objects["Yungu_Rig"]
# game files carry the rig clips only (glow/light keys stay in the .blend)
for o in bpy.data.objects:
    if o.name != "Yungu_Rig" and o.animation_data: o.animation_data_clear()
for m in bpy.data.materials:
    if m.node_tree and m.node_tree.animation_data: m.node_tree.animation_data_clear()
rig.animation_data.action = None   # export from rest pose; all actions exported as clips
for pb in rig.pose.bones:
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)

for tag, level in (("GameReady", 0), ("HighPoly", 1)):
    set_subsurf(level)
    select_char()
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out, f"Yungu_{tag}.glb"), export_format='GLB',
        use_selection=True, export_apply=True, export_yup=True,
        export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_optimize_animation_size=False,
        export_materials='EXPORT', export_image_format='AUTO', export_lights=False, export_cameras=False)
    select_char()
    bpy.ops.export_scene.fbx(
        filepath=os.path.join(out, f"Yungu_{tag}.fbx"), use_selection=True,
        object_types={'ARMATURE', 'MESH'}, use_mesh_modifiers=True, mesh_smooth_type='FACE',
        add_leaf_bones=False, primary_bone_axis='Y', secondary_bone_axis='X',
        apply_scale_options='FBX_SCALE_ALL', bake_anim=True, bake_anim_use_all_actions=True,
        bake_anim_use_nla_strips=False, bake_anim_simplify_factor=0.0,
        path_mode='COPY', embed_textures=True)
print("EXPORTED")
