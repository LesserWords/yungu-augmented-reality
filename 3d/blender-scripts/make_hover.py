"""Adds a looping 'Hover' animation (rig) + synced glow/light animation to Yungu.blend,
then optionally renders the frames.
usage: python3 make_hover.py <in.blend> <out.blend> [render_dir] [res_pct] [samples]"""
import bpy, sys, math, os
from mathutils import Vector, Quaternion

src, dst = sys.argv[1], sys.argv[2]
rdir = sys.argv[3] if len(sys.argv) > 3 else None
pct = int(sys.argv[4]) if len(sys.argv) > 4 else 100
samples = int(sys.argv[5]) if len(sys.argv) > 5 else 24
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
N = 90                      # loop length in frames (3 s @ 30 fps); frame N+1 == frame 1
sc.render.fps = 30
sc.frame_start, sc.frame_end = 1, N
TAU = 2 * math.pi
def ph(f): return (f - 1) / N          # 0..1 over the loop
def height(f): return math.sin(TAU * ph(f))   # +1 top, -1 bottom

# ------------------------------------------------------------- rig: Hover action
rig = bpy.data.objects["Yungu_Rig"]
pose = rig.pose.bones
for pb in pose:
    pb.rotation_mode = 'QUATERNION'
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
old = bpy.data.actions.get("Hover")
if old: bpy.data.actions.remove(old)
act = bpy.data.actions.new("Hover"); act.use_fake_user = True
rig.animation_data_create(); rig.animation_data.action = act

def key(bname, f, loc=None, rot=None, scl=None):
    pb = pose[bname]; R = pb.bone.matrix_local.to_3x3().normalized(); Ri = R.inverted()
    if loc is not None:
        pb.location = Ri @ Vector(loc); pb.keyframe_insert("location", frame=f)
    if rot is not None:
        q = Quaternion()
        for ax, deg in rot: q = Quaternion(Ri @ ax, math.radians(deg)) @ q
        pb.rotation_quaternion = q; pb.keyframe_insert("rotation_quaternion", frame=f)
    if scl is not None:
        cols = [R.col[k] for k in range(3)]
        pb.scale = [sum(abs(cols[k][w]) * scl[w] for w in range(3)) for k in range(3)]
        pb.keyframe_insert("scale", frame=f)

def wave(f, lag=0.0, harm=1):
    return math.sin(TAU * (harm * ph(f) - lag))

for f in range(1, N + 2, 2):
    key("body", f, loc=(0, 0, 0.035 * height(f)),
        rot=[(Y, 1.5 * wave(f, 0.0, 1) * 0.6), (X, 1.2 * wave(f, 0.15))])
    key("head", f, rot=[(X, -2.0 * wave(f, 0.12)), (Y, 1.5 * wave(f, 0.30, 1))])
    key("antenna", f, rot=[(X, 6.0 * wave(f, 0.22)), (Y, -4.0 * wave(f, 0.40))])
    for side, s in (("R", -1), ("L", 1)):
        # arms trail the body: lift outward a little on the way down
        key(f"upper_arm.{side}", f, rot=[(Y, s * -5.0 * wave(f, 0.18)), (X, 3.0 * wave(f, 0.25))])
        key(f"hand.{side}", f, rot=[(Y, s * -4.0 * wave(f, 0.30))])
        key(f"ear.{side}", f, rot=[(X, 0.0)])
# one blink per loop
for f, sz in ((1, 1), (52, 1), (55, 0.12), (58, 1), (N + 1, 1)):
    for side in ("L", "R"):
        key(f"eye.{side}", f, scl=(1, 1, sz))

# ------------------------------------------------------------- lights & glow, synced to height
# Glow is strongest when Yungu dips toward the floor, softer at the top of the bob.
def strength_input(mat_name):
    return bpy.data.materials[mat_name].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
glow_specs = {                       # material: (base, swing, lag)
    "M_Glow_Lime":     (1.05, 0.60, 0.00),
    "M_Body_Glow":     (1.10, 0.70, 0.00),
    "M_Ground_Glow":   (1.30, 0.65, 0.00),
    "M_Chest_Screen":  (1.40, 0.40, 0.08),
    "M_Antenna_Lime":  (0.30, 0.95, 0.10),
}
ground = bpy.data.objects["Yungu_GroundGlow"]
bounce = bpy.data.objects.get("Light_GlowBounce")
for f in range(1, N + 2, 2):
    for mname, (base, swing, lag) in glow_specs.items():
        inp = strength_input(mname)
        inp.default_value = base * (1 - swing * wave(f, lag))
        inp.keyframe_insert("default_value", frame=f)
    s = 1.0 - 0.22 * height(f)                       # floor light tightens when he is low
    ground.scale = (s * 1.4, s * 1.4, 1); ground.keyframe_insert("scale", frame=f)
    if bounce:
        bounce.data.energy = 18 * (1 - 0.55 * height(f)); bounce.data.keyframe_insert("energy", frame=f)
        bounce.location = (0, -0.08, 0.05 + 0.035 * height(f)); bounce.keyframe_insert("location", frame=f)
# rim light breathes between cool white and a faint lime tint, a half-beat behind
rim = bpy.data.objects.get("Light_Rim")
if rim:
    for f in range(1, N + 2, 3):
        t = 0.5 + 0.5 * wave(f, 0.25)
        rim.data.color = (1 - 0.25 * t, 1.0, 1 - 0.55 * t); rim.data.keyframe_insert("color", frame=f)
        rim.data.energy = 160 + 90 * t; rim.data.keyframe_insert("energy", frame=f)

# make all keyed curves loop cleanly
def fcurves_of(idblock):
    ad = idblock.animation_data
    if not ad or not ad.action: return []
    a = ad.action
    if hasattr(a, "fcurves") and len(getattr(a, "fcurves", [])):
        return list(a.fcurves)
    out = []
    for layer in getattr(a, "layers", []):
        for strip in layer.strips:
            for cb in strip.channelbags: out += list(cb.fcurves)
    return out
for idb in [rig, ground, bounce, rim, bounce.data if bounce else None, rim.data if rim else None] + \
           [bpy.data.materials[m].node_tree for m in glow_specs]:
    if idb is None: continue
    for fc in fcurves_of(idb):
        for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'
        if not any(m.type == 'CYCLES' for m in fc.modifiers):
            fc.modifiers.new('CYCLES')

sc.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=dst)
print("SAVED", dst)

# ------------------------------------------------------------- render
if rdir:
    os.makedirs(rdir, exist_ok=True)
    cam = bpy.data.objects["Cam_Front"]
    cam.data.lens = 60
    cam.location = (0.95, -2.75, 0.85)
    cam.rotation_euler = (Vector((0, 0, 0.58)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 1080, 1080
    sc.render.resolution_percentage = pct
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    for o in bpy.data.objects:
        for m in getattr(o, "modifiers", []):
            if m.type == 'SUBSURF': m.render_levels = 1
    first = int(os.environ.get("F0", "1")); last = int(os.environ.get("F1", str(N)))
    for f in range(first, last + 1):
        sc.frame_set(f)
        sc.render.filepath = os.path.join(rdir, f"f_{f:04d}.png")
        bpy.ops.render.render(write_still=True)
        print("FRAME", f, flush=True)
