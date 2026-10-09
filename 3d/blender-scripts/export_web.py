"""Exports web/AR assets from the hover .blend.
usage: python3 export_web.py <Yungu_Hover.blend> <outdir> [scale]
  yungu.glb       - Hover clip only (model-viewer + Android Scene Viewer)
  yungu-play.glb  - all clips (Hover, Idle, Wave, Blink) for the joystick mode
  yungu.usdz      - iPhone / iPad AR Quick Look (Hover clip)"""
import bpy, sys, os
src, out = sys.argv[1], sys.argv[2]
SCALE = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
os.makedirs(out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
rig = bpy.data.objects["Yungu_Rig"]

# bone clips only: drop glow/light keyframes (they don't travel in glTF/USDZ)
for o in bpy.data.objects:
    if o is not rig and o.animation_data: o.animation_data_clear()
for d in list(bpy.data.lights) + [m.node_tree for m in bpy.data.materials if m.node_tree]:
    if d.animation_data: d.animation_data_clear()
# steady glow values for real-time use
B = lambda m: bpy.data.materials[m].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
for m, v in (("M_Glow_Lime", 2.0), ("M_Body_Glow", 1.4), ("M_Ground_Glow", 1.5),
             ("M_Chest_Screen", 1.6), ("M_Antenna_Lime", 0.35)):
    B(m).default_value = v
bpy.data.objects["Yungu_GroundGlow"].scale = (1.4, 1.4, 1)

rig.scale = (SCALE, SCALE, SCALE)        # children are parented to the rig
char = [o for o in bpy.data.objects if o is rig or o.parent is rig]
for o in char:
    for m in getattr(o, "modifiers", []):
        if m.type == 'SUBSURF': m.show_render = m.show_viewport = False

def select_char():
    bpy.ops.object.select_all(action='DESELECT')
    for o in char: o.select_set(True)
    bpy.context.view_layer.objects.active = rig

def glb(path, keep):
    for a in list(bpy.data.actions):
        a.use_fake_user = a.name in keep
    rig.animation_data.action = bpy.data.actions["Hover"]
    if rig.animation_data.action.slots:
        rig.animation_data.action_slot = rig.animation_data.action.slots[0]
    select_char()
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_materials='EXPORT', export_image_format='AUTO',
        export_lights=False, export_cameras=False)

glb(os.path.join(out, "yungu-play.glb"), {"Hover", "Idle", "Wave", "Blink"})
# viewer file: Hover only
for a in list(bpy.data.actions):
    if a.name != "Hover": bpy.data.actions.remove(a)
glb(os.path.join(out, "yungu.glb"), {"Hover"})

# USDZ for AR Quick Look
rig.animation_data.action = bpy.data.actions["Hover"]
sc.frame_start, sc.frame_end = 1, 90
sc.render.fps = 30
select_char()
bpy.ops.wm.usd_export(
    filepath=os.path.join(out, "yungu.usdz"), selected_objects_only=True,
    export_animation=True, export_armatures=True, only_deform_bones=False,
    export_subdivision='IGNORE', evaluation_mode='RENDER', generate_preview_surface=True,
    convert_orientation=True, export_global_forward_selection='NEGATIVE_Z', export_global_up_selection='Y',
    export_lights=False, export_cameras=False, export_textures_mode='NEW', overwrite_textures=True,
    usdz_downscale_size='1024', root_prim_path="/Yungu", convert_world_material=False,
    accessibility_label="Yungu", accessibility_description="Yungu, the Kero robot mascot, hovering")
print("WEB EXPORT DONE")
