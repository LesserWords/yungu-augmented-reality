"""Preview renders. usage: python3 render_preview.py <blend> <outdir> <view> [res%] [samples]
views: front (ortho, pixel-aligned to the reference), threequarter, side, back, wire"""
import bpy, sys, math, os
from mathutils import Vector

blend, outdir, view = sys.argv[1], sys.argv[2], sys.argv[3]
pct = int(sys.argv[4]) if len(sys.argv) > 4 else 50
samples = int(sys.argv[5]) if len(sys.argv) > 5 else 48
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
prev = bpy.data.collections.get("Preview_Setup")

def add(obj):
    prev.objects.link(obj); return obj

# --- camera
cam_d = bpy.data.cameras.new("PreviewCam"); cam = add(bpy.data.objects.new("PreviewCam", cam_d))
sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 1024, 1536
sc.render.resolution_percentage = pct
target = Vector((0, 0, 0.56))
LOW = view.endswith("_low")
view = view.replace("_low", "")
if view in ("front", "wire"):
    cam_d.type = 'ORTHO'; cam_d.ortho_scale = 1.536
    cam.location = (0, -5, 0.562)
else:
    cam_d.lens = 70
    d = {"threequarter": Vector((1.35, -2.1, 0.95)), "side": Vector((2.5, 0, 0.62)),
         "back": Vector((-1.0, 2.35, 0.95)), "top": Vector((0.5, -1.3, 2.3)),
         "closeup_hand": Vector((-0.9, -1.0, 0.35)), "closeup_head": Vector((0.9, -1.1, 1.0))}[view]
    cam.location = d
    sc.render.resolution_x = sc.render.resolution_y = 1200
    if view == "closeup_hand":
        target = Vector((-0.30, -0.02, 0.27)); cam_d.lens = 120
    if view == "closeup_head":
        target = Vector((0, -0.1, 0.76)); cam_d.lens = 85
if view not in ("front", "wire") or True:
    direction = target - cam.location if view not in ("front", "wire") else Vector((0, 1, 0))
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

# --- lights (studio)
def area(name, loc, energy, size, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = add(bpy.data.objects.new(name, l)); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
area("Key", (1.3, -2.3, 2.5), 300, 0.9)
area("Fill", (-2.2, -1.6, 1.2), 140, 1.8)
area("Rim", (0.5, 2.2, 2.2), 160, 1.5)
area("Top", (0, -0.3, 3.0), 90, 2.5)
gl = bpy.data.lights.new("GlowBounce", 'POINT'); gl.energy = 18; gl.color = (0.6, 1.0, 0.1); gl.shadow_soft_size = 0.2
add(bpy.data.objects.new("GlowBounce", gl)).location = (0, -0.08, 0.05)

world = bpy.data.worlds.new("W"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.88, 0.92, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.30

sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'; sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'
sc.view_settings.exposure = -0.75
sc.cycles.max_bounces = 6

if view == "wire":
    # topology view: quad cage edges (wireframe modifier copies) over the shaded cage
    wm = bpy.data.materials.new("WireDark"); wm.use_nodes = True
    wb = wm.node_tree.nodes["Principled BSDF"]; wb.inputs["Base Color"].default_value = (0.02, 0.03, 0.05, 1)
    wb.inputs["Roughness"].default_value = 0.8
    cam_d.type = 'PERSP'; cam_d.lens = 70
    sc.render.resolution_x = sc.render.resolution_y = 1200
    cam.location = (1.35, -2.1, 0.95)
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    for o in list(bpy.data.objects):
        if o.type != 'MESH': continue
        if o.name == "Yungu_GroundGlow" or o.name == "Yungu_BodyGlow":
            o.hide_render = True; continue
        for m in o.modifiers:
            if m.type == 'SUBSURF': m.show_render = False
        w = o.copy(); w.data = o.data.copy(); prev.objects.link(w)
        w.data.materials.clear(); w.data.materials.append(wm)
        for p in w.data.polygons: p.material_index = 0
        for m in list(w.modifiers):
            if m.type in ('SUBSURF', 'SOLIDIFY', 'BEVEL'): w.modifiers.remove(m)
        wf = w.modifiers.new("WF", 'WIREFRAME'); wf.thickness = 0.0014; wf.use_even_offset = True
        wf.offset = 1.0

if LOW:
    for o in bpy.data.objects:
        for m in getattr(o, "modifiers", []):
            if m.type == 'SUBSURF': m.show_render = False
    view += "_low"
ACT = os.environ.get("ACTION"); FR = int(os.environ.get("FRAME", "1"))
if ACT:
    rig = bpy.data.objects["Yungu_Rig"]
    act = bpy.data.actions[ACT]
    rig.animation_data.action = act
    if hasattr(rig.animation_data, "action_slot") and act.slots:
        rig.animation_data.action_slot = act.slots[0]
    sc.frame_set(FR)
    view += f"_{ACT}{FR}"
sc.render.filepath = os.path.join(outdir, f"render_{view}.png")
bpy.ops.render.render(write_still=True)
print("RENDERED", sc.render.filepath)
