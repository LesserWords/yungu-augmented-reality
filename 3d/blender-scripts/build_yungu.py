"""
Yungu mascot - procedural Blender build script (Blender 4.2+ / 5.x).

Every part is its own mesh object with clean quad topology (cube-sphere
superellipsoids, swept tubes, grid panels), its origin at its pivot, and a
100% weight to one bone of the Yungu_Rig armature (rigid skinning), so it
works in any engine as a single skinned character while staying separable.

Coordinates are derived from the 1024x1536 reference image:
    X = (px - 512) / 1000,  Z = (1330 - py) / 1000,  front = -Y,  1 unit = 1 m
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "..", "textures")

def PX(px): return (px - 512) / 1000.0
def PZ(py): return (1330 - py) / 1000.0

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = 30

def new_collection(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    return c

COL = new_collection("Yungu")
COL_MESH = new_collection("Yungu_Parts", COL)
COL_FX = new_collection("Yungu_FX", COL)
COL_PREVIEW = new_collection("Preview_Setup")

# ---------------------------------------------------------------- materials
def principled(name, base, rough=0.3, metal=0.0, coat=0.0, coat_rough=0.05,
               emis=None, strength=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    b.inputs["Specular IOR Level"].default_value = spec
    if emis:
        b.inputs["Emission Color"].default_value = (*emis, 1)
        b.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = (*base, 1)
    return m

LIME = (0.55, 1.0, 0.06)
M = {
    "white":   principled("M_White_Plastic", (0.80, 0.81, 0.82), rough=0.22, coat=0.6, coat_rough=0.04),
    "navy":    principled("M_Navy_Gloss", (0.003, 0.009, 0.020), rough=0.25, coat=0.5, coat_rough=0.04, spec=0.35),
    "visor":   principled("M_Visor_Glass", (0.001, 0.004, 0.009), rough=0.08, coat=0.35, coat_rough=0.02, spec=0.25),
    "glow":    principled("M_Glow_Lime", LIME, rough=0.3, emis=LIME, strength=4.0),
    "glow_soft": principled("M_Glow_Lime_Soft", (0.62, 0.95, 0.30), rough=0.25, coat=0.5, emis=LIME, strength=1.2),
    "antenna": principled("M_Antenna_Lime", (0.28, 0.74, 0.012), rough=0.22, coat=0.8, coat_rough=0.03,
                          emis=(0.28, 0.74, 0.012), strength=0.35),
    "palm":    principled("M_Palm_Dark", (0.025, 0.045, 0.035), rough=0.45, coat=0.3),
}

def screen_material():
    m = principled("M_Chest_Screen", (0.01, 0.02, 0.03), rough=0.12, coat=1.0, coat_rough=0.02,
                   emis=(1, 1, 1), strength=2.5)
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    tb = nt.nodes.new("ShaderNodeTexImage"); tb.location = (-500, 200)
    tb.image = bpy.data.images.load(os.path.join(TEX, "chest_screen_basecolor.png"))
    te = nt.nodes.new("ShaderNodeTexImage"); te.location = (-500, -150)
    te.image = bpy.data.images.load(os.path.join(TEX, "chest_screen_emission.png"))
    nt.links.new(tb.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(te.outputs["Color"], b.inputs["Emission Color"])
    return m
M["screen"] = screen_material()

def ground_glow_material():
    m = principled("M_Ground_Glow", LIME, rough=1.0, emis=LIME, strength=2.0)
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.location = (-500, 0)
    t.image = bpy.data.images.load(os.path.join(TEX, "ground_glow.png"))
    nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    try: m.blend_method = 'BLEND'
    except Exception: pass
    try: m.surface_render_method = 'BLENDED'
    except Exception: pass
    return m
M["ground"] = ground_glow_material()

def body_glow_material():
    m = principled("M_Body_Glow", LIME, rough=0.3, emis=LIME, strength=1.6)
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.location = (-500, 0)
    t.image = bpy.data.images.load(os.path.join(TEX, "body_glow_gradient.png"))
    t.extension = 'EXTEND'
    nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    try: m.blend_method = 'BLEND'
    except Exception: pass
    try: m.surface_render_method = 'BLENDED'
    except Exception: pass
    return m
M["body_glow"] = body_glow_material()

# ---------------------------------------------------------------- mesh helpers
def superellipsoid_bm(half, nh=2.0, ntop=2.0, nbot=None, seg=8):
    """Cube-sphere (all quads) mapped onto a superellipsoid.
    nh = horizontal (XY) exponent, ntop/nbot = vertical exponent above/below centre."""
    nbot = nbot or ntop
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=seg - 1, use_grid_fill=True)
    # tag each face with its source cube side (0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z) and height
    lay_f = bm.faces.layers.int.new("cube_face"); lay_z = bm.faces.layers.float.new("cube_z")
    for f in bm.faces:
        c = f.calc_center_median()
        ax = max(range(3), key=lambda k: abs(c[k]))
        f[lay_f] = ax * 2 + (0 if c[ax] > 0 else 1); f[lay_z] = c.z
    for v in bm.verts:
        p = Vector([math.tan(c * math.pi / 4) for c in v.co])  # equal-angle spacing
        nv = ntop if p.z >= 0 else nbot
        h = (abs(p.x) ** nh + abs(p.y) ** nh) ** (1.0 / nh)
        f = (h ** nv + abs(p.z) ** nv) ** (1.0 / nv)
        q = p / f
        v.co = Vector((q.x * half[0], q.y * half[1], q.z * half[2]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm

def torus_bm(R, r, seg_u=32, seg_v=10):
    bm = bmesh.new(); rings = []
    for i in range(seg_u):
        a = 2 * math.pi * i / seg_u; ring = []
        for j in range(seg_v):
            b = 2 * math.pi * j / seg_v
            ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a),
                                      (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(seg_u):
        for j in range(seg_v):
            bm.faces.new((rings[i][j], rings[(i + 1) % seg_u][j],
                          rings[(i + 1) % seg_u][(j + 1) % seg_v], rings[i][(j + 1) % seg_v]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm

def transform_bm(bm, mat):
    bmesh.ops.transform(bm, matrix=mat, verts=bm.verts[:])

def make_object(name, bm, mat, pivot=(0, 0, 0), subsurf=1, smooth=True, collection=None):
    """bm is in WORLD space; the object origin is placed at `pivot`."""
    pivot = Vector(pivot)
    transform_bm(bm, Matrix.Translation(-pivot))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    mats = mat if isinstance(mat, (list, tuple)) else [mat]
    for m in mats: me.materials.append(m)
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    ob.location = pivot
    (collection or COL_MESH).objects.link(ob)
    if subsurf:
        mod = ob.modifiers.new("Subdivision", 'SUBSURF')
        mod.levels = subsurf; mod.render_levels = subsurf + 1
    return ob

def se_object(name, half, mat, center, pivot=None, rot=None, nh=2.0, ntop=2.0, nbot=None,
              seg=8, subsurf=1):
    bm = superellipsoid_bm(half, nh, ntop, nbot, seg)
    M4 = Matrix.Translation(Vector(center)) @ (rot.to_4x4() if rot else Matrix.Identity(4))
    transform_bm(bm, M4)
    return make_object(name, bm, mat, pivot if pivot is not None else center, subsurf)

def bvh_of(ob):
    """World-space BVH of the evaluated (modifier-applied) object."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    verts = [ob.matrix_world @ v.co for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)

def hit_front(bvh, x, z):
    loc, nrm, _, _ = bvh.ray_cast(Vector((x, -5.0, z)), Vector((0, 1, 0)))
    if loc is None:
        raise RuntimeError(f"no surface hit at x={x:.3f} z={z:.3f}")
    if nrm.y > 0: nrm = -nrm
    return loc, nrm.normalized()

def superellipse_grid(hw, hh, n, seg):
    """(seg+1)^2 grid of a square mapped radially into a 2D superellipse.
    returns list of (u, v, x, z, ring)"""
    out = []
    for j in range(seg + 1):
        for i in range(seg + 1):
            u = -1 + 2 * i / seg; v = -1 + 2 * j / seg
            m = max(abs(u), abs(v))
            nn = (abs(u) ** n + abs(v) ** n) ** (1 / n)
            s = m / nn if nn > 0 else 0
            out.append((u, v, u * s * hw, v * s * hh, m))
    return out

def projected_panel(name, mat, target, cx, cz, hw, hh, n, seg, offset, bulge=0.0,
                    thickness=0.01, uv_from_xy=True, subsurf=1):
    bvh = bvh_of(target)
    g = superellipse_grid(hw, hh, n, seg)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    verts, uvs = [], []
    for (u, v, x, z, m) in g:
        P, N = hit_front(bvh, cx + x, cz + z)
        verts.append(bm.verts.new(P + N * (offset + bulge * (1 - m * m))))
        uvs.append((x / hw * 0.5 + 0.5, z / hh * 0.5 + 0.5))
    W = seg + 1
    for j in range(seg):
        for i in range(seg):
            idx = (j * W + i, j * W + i + 1, (j + 1) * W + i + 1, (j + 1) * W + i)
            f = bm.faces.new([verts[k] for k in idx])
            for l, k in zip(f.loops, idx): l[uvl].uv = uvs[k]
    # make sure normals face the viewer (-Y)
    bm.normal_update()
    if sum(f.normal.y for f in bm.faces) > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    ob = make_object(name, bm, mat, (cx, 0, cz), subsurf=0)
    if thickness:
        so = ob.modifiers.new("Solidify", 'SOLIDIFY')
        so.thickness = thickness; so.offset = -1; so.use_even_offset = False
        so.use_rim = True
    if subsurf:
        s = ob.modifiers.new("Subdivision", 'SUBSURF'); s.levels = subsurf; s.render_levels = subsurf + 1
    return ob

def tube_bm(pts, nrms, rw, rd, seg=10, closed=False, cap_rings=3):
    """Sweep an elliptical section (rw across the surface, rd along the surface normal)
    along pts. Open tubes get rounded (hemispherical) caps. All quads except the cap poles."""
    bm = bmesh.new(); n = len(pts); rings = []
    frames = []
    for i in range(n):
        if closed:
            t = (pts[(i + 1) % n] - pts[i - 1])
        else:
            t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        t.normalize()
        nn = (nrms[i] - t * nrms[i].dot(t)).normalized()
        b = t.cross(nn)
        frames.append((t, nn, b))
    def ring(c, nn, b, scale=1.0):
        return [bm.verts.new(c + b * (rw * scale * math.cos(2 * math.pi * k / seg))
                             + nn * (rd * scale * math.sin(2 * math.pi * k / seg))) for k in range(seg)]
    for i in range(n):
        t, nn, b = frames[i]
        rings.append(ring(pts[i], nn, b))
    def bridge(r0, r1):
        for k in range(seg):
            bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]))
    for i in range(n - 1): bridge(rings[i], rings[i + 1])
    if closed:
        bridge(rings[-1], rings[0])
    else:
        for end, sgn in ((0, -1), (n - 1, 1)):
            t, nn, b = frames[end]
            prev = rings[end]
            for k in range(1, cap_rings + 1):
                phi = (math.pi / 2) * k / (cap_rings + 1)
                c = pts[end] + t * (sgn * rw * math.sin(phi))
                r = ring(c, nn, b, math.cos(phi))
                if sgn > 0: bridge(prev, r)
                else: bridge(r, prev)
                prev = r
            pole = bm.verts.new(pts[end] + t * (sgn * rw))
            for k in range(seg):
                if sgn > 0: bm.faces.new((prev[k], prev[(k + 1) % seg], pole))
                else: bm.faces.new((prev[(k + 1) % seg], prev[k], pole))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm

def resample(points, count, closed=False):
    pts = points + ([points[0]] if closed else [])
    d = [0.0]
    for a, b in zip(pts, pts[1:]): d.append(d[-1] + (b - a).length)
    L = d[-1]; out = []
    steps = count if closed else count - 1
    j = 0
    for i in range(count):
        s = L * i / steps
        while j < len(d) - 2 and d[j + 1] < s: j += 1
        f = (s - d[j]) / max(d[j + 1] - d[j], 1e-9)
        out.append(pts[j].lerp(pts[j + 1], f))
    return out

def surface_stroke(name, mat, target, xz_points, rw, rd, lift, pivot, closed=False, count=24, seg=10):
    bvh = bvh_of(target)
    pts2 = resample([Vector((x, 0, z)) for x, z in xz_points], count, closed)
    P, N = [], []
    for p in pts2:
        loc, nrm = hit_front(bvh, p.x, p.z)
        P.append(loc + nrm * lift); N.append(nrm)  # nrm points out of the surface
    bm = tube_bm(P, N, rw, rd, seg=seg, closed=closed)
    return make_object(name, bm, mat, pivot, subsurf=1)

# ================================================================ BUILD PARTS
parts = {}   # object -> bone name

# ---- Body (egg: rounder bottom, flatter top)
BODY_C = Vector((0, 0, (PZ(1250) + PZ(815)) / 2))
body = se_object("Yungu_Body", (0.250, 0.222, (PZ(815) - PZ(1250)) / 2), M["white"],
                 BODY_C, pivot=(0, 0, PZ(1250)), nh=2.2, ntop=4.5, nbot=2.2, seg=12)
parts[body] = "body"

# ---- Body bottom glow: thin emissive shell over the lower body, alpha fades upward
GLOW_H = 0.105
def body_glow_shell():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg); me = ev.to_mesh()
    bm = bmesh.new(); bm.from_mesh(me); ev.to_mesh_clear()
    transform_bm(bm, body.matrix_world)
    z0 = PZ(1250)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if min(v.co.z for v in f.verts) > z0 + GLOW_H], context='FACES')
    bm.normal_update()
    for v in bm.verts: v.co += v.normal * 0.0015
    uvl = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for l in f.loops:
            l[uvl].uv = (0.5, min(1.0, (l.vert.co.z - z0) / GLOW_H))
    return bm
bglow = make_object("Yungu_BodyGlow", body_glow_shell(), M["body_glow"], (0, 0, PZ(1250)), subsurf=0)
parts[bglow] = "body"

# ---- Neck (dark gap between head and body)
neck = se_object("Yungu_Neck", (0.17, 0.15, 0.035), M["navy"], (0, 0, PZ(808)), nh=2.0, ntop=4, seg=6)
parts[neck] = "head"

# ---- Head (dome top, flatter bottom)
HEAD_C = Vector((0, 0, (PZ(318) + PZ(805)) / 2))
head = se_object("Yungu_Head", (0.298, 0.262, (PZ(318) - PZ(805)) / 2), M["white"], HEAD_C,
                 pivot=(0, 0, PZ(805)), nh=2.6, ntop=2.4, nbot=4.5, seg=14)
parts[head] = "head"

# ---- Visor (glass screen) - laid out in the head's own front-face parameter space,
#      so the grid follows the surface evenly even where the head wraps around
HEAD_HALF = (0.298, 0.262, (PZ(318) - PZ(805)) / 2); HEAD_EXP = (2.6, 2.4, 4.5)
def se_map(p, half, nh, ntop, nbot, center):
    p = Vector([math.tan(c * math.pi / 4) for c in p])
    nv = ntop if p.z >= 0 else nbot
    h = (abs(p.x) ** nh + abs(p.y) ** nh) ** (1.0 / nh)
    f = (h ** nv + abs(p.z) ** nv) ** (1.0 / nv)
    q = p / f
    return Vector((q.x * half[0], q.y * half[1], q.z * half[2])) + center
def head_front(a, b):
    return se_map(Vector((a, -1.0, b)), HEAD_HALF, *HEAD_EXP, HEAD_C)
def head_front_normal(a, b, e=1e-4):
    da = head_front(a + e, b) - head_front(a - e, b)
    db = head_front(a, b + e) - head_front(a, b - e)
    n = db.cross(da).normalized()
    return n if n.y < 0 else -n
def solve(fn, target, lo, hi):
    for _ in range(60):
        mid = (lo + hi) / 2
        if (fn(mid) - target) * (fn(hi) - target) > 0: hi = mid
        else: lo = mid
    return (lo + hi) / 2
VIS_TOP, VIS_BOT, VIS_HW = PZ(394), PZ(769), 0.254
b_top = solve(lambda b: head_front(0, b).z, VIS_TOP, -1.9, 1.9)
b_bot = solve(lambda b: head_front(0, b).z, VIS_BOT, -1.9, 1.9)
b0, rb = (b_top + b_bot) / 2, (b_top - b_bot) / 2
ra = solve(lambda a: head_front(a, b0).x, VIS_HW, 0.0, 1.9)
def visor_mesh(n_exp=3.6, seg=16, offset=0.0025, bulge=0.005):
    g = superellipse_grid(ra, rb, n_exp, seg)
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); vs = []; uvs = []
    for (u, v, x, z, m) in g:
        P = head_front(x, b0 + z); N = head_front_normal(x, b0 + z)
        vs.append(bm.verts.new(P + N * (offset + bulge * (1 - m * m))))
        uvs.append((x / ra * .5 + .5, z / rb * .5 + .5))
    W = seg + 1
    for j in range(seg):
        for i in range(seg):
            idx = (j * W + i, j * W + i + 1, (j + 1) * W + i + 1, (j + 1) * W + i)
            f = bm.faces.new([vs[k] for k in idx])
            for l, k in zip(f.loops, idx): l[uvl].uv = uvs[k]
    bm.normal_update()
    if sum(f.normal.y for f in bm.faces) > 0: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm
visor = make_object("Yungu_Visor", visor_mesh(), M["visor"], (0, 0, (VIS_TOP + VIS_BOT) / 2), subsurf=0)
so = visor.modifiers.new("Solidify", 'SOLIDIFY'); so.thickness = 0.014; so.offset = -1; so.use_rim = True
sv = visor.modifiers.new("Subdivision", 'SUBSURF'); sv.levels = 1; sv.render_levels = 2
parts[visor] = "head"

# ---- Eyes (happy ^ ^ arcs) and smile on the visor
def half_ellipse(cx, base, a, h, up=True, n=24):
    out = []
    for i in range(n + 1):
        t = math.pi * i / n
        out.append((PX(cx - a * math.cos(t)), PZ(base - (h if up else -h) * math.sin(t))))
    return out

eyes = {}
for side, cx in (("R", 389), ("L", 636)):          # .L = character's left = +X
    pts = half_ellipse(cx, 590, 44, 38, up=True)
    eyes[side] = surface_stroke(f"Yungu_Eye.{side}", M["glow"], visor, pts, rw=0.0102, rd=0.0050,
                                lift=0.001, pivot=(PX(cx), 0, PZ(575)), count=28)
    # pivot y: put origin on the surface centre of the eye
    parts[eyes[side]] = f"eye.{side}"
mouth = surface_stroke("Yungu_Mouth", M["glow"], visor, half_ellipse(512.5, 637, 45.5, 16, up=False),
                       rw=0.0088, rd=0.0045, lift=0.001, pivot=(0, 0, PZ(645)), count=24)
parts[mouth] = "mouth"

# ---- Chin light (small glowing pill under the visor)
hbvh = bvh_of(head)
P, N = hit_front(hbvh, 0, PZ(776))
chin = se_object("Yungu_ChinLight", (0.042, 0.006, 0.006), M["glow"], P + N * 0.0015, nh=2.0, ntop=2.0, seg=4)
# orient: long in X, thin along normal and Z
bm = bmesh.new(); bm.from_mesh(chin.data)
align = N.to_track_quat('-Y', 'Z').to_matrix().to_4x4()
bmesh.ops.transform(bm, matrix=align, verts=bm.verts[:]); bm.to_mesh(chin.data); bm.free()
parts[chin] = "head"

# ---- Ears / headphones (cup + glowing ring + outer cap), per side
EAR_Z = PZ(619.5)
def puck_bm(radius, half_thick, n_side=4.0, seg=8):
    return superellipsoid_bm((radius, radius, half_thick), nh=2.0, ntop=n_side, seg=seg)
for side, s in (("R", -1), ("L", 1)):
    to_x = Matrix.Rotation(math.radians(90 * s), 4, 'Y')   # puck axis Z -> +-X
    for nm, bmf, xc, mat in (
        ("EarCup", lambda: puck_bm(0.1025, 0.034, 3.2, 10), 0.316, M["navy"]),
        ("EarRing", lambda: torus_bm(0.071, 0.0100, 40, 10), 0.346, M["glow"]),
        ("EarCap", lambda: puck_bm(0.064, 0.014, 2.6, 6), 0.356, M["navy"]),
    ):
        bm = bmf()
        transform_bm(bm, Matrix.Translation((s * xc, 0, EAR_Z)) @ to_x)
        ob = make_object(f"Yungu_{nm}.{side}", bm, mat, (s * 0.300, 0, EAR_Z),
                         subsurf=0 if nm == "EarRing" else 1)
        parts[ob] = f"ear.{side}"

# ---- Antenna base (navy rounded block)
ant_base = se_object("Yungu_AntennaBase", (0.070, 0.050, 0.0235), M["navy"], (0, 0, PZ(307)),
                     pivot=(0, 0, PZ(331)), nh=5.0, ntop=4.0, seg=6)
parts[ant_base] = "head"

# ---- Antenna "Y" (extruded glyph built from quads, beveled)
def antenna_y():
    h = 0.020; a = math.radians(37); half_depth = 0.016
    Jz = PZ(217); top = PZ(150); zb = PZ(318)
    sa, ca = math.sin(a), math.cos(a)
    s = h * (1 - ca) / sa; A = Vector((-h, Jz - h * sa + s * ca)); B = Vector((h, A.y))
    s = h * ca / sa; C = Vector((0, Jz + h * sa + s * ca))
    s = (top - Jz + h * sa) / ca; LO = Vector((-h * ca - s * sa, top))
    s = (top - Jz - h * sa) / ca; LI = Vector((h * ca - s * sa, top))
    RO = Vector((-LO.x, top)); RI = Vector((-LI.x, top))
    SL = Vector((-h, zb)); SR = Vector((h, zb))
    mid = lambda p, q: (p + q) / 2
    mAB, mBC, mCA = mid(A, B), mid(B, C), mid(C, A); Mc = (A + B + C) / 3
    quads = [(A, mAB, Mc, mCA), (mAB, B, mBC, Mc), (Mc, mBC, C, mCA)]
    def strip(e0, e1, rows):  # e0/e1: 3-point edges (left, mid, right)
        prev = e0
        for r in range(1, rows + 1):
            f = r / rows
            cur = [e0[k].lerp(e1[k], f) for k in range(3)]
            quads.append((prev[0], prev[1], cur[1], cur[0]))
            quads.append((prev[1], prev[2], cur[2], cur[1]))
            prev = cur
    strip([A, mAB, B], [SL, mid(SL, SR), SR], 4)          # stem (down)
    strip([C, mCA, A], [LI, mid(LI, LO), LO], 3)          # left arm
    strip([B, mBC, C], [RO, mid(RO, RI), RI], 3)          # right arm
    bm = bmesh.new(); vmap = {}
    def V(p):
        k = (round(p.x, 6), round(p.y, 6))
        if k not in vmap: vmap[k] = bm.verts.new((p.x, 0, p.y))
        return vmap[k]
    for q in quads:
        vs = [V(p) for p in q]
        try: bm.faces.new(vs)
        except ValueError: pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    if bm.faces[0].normal.y > 0: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    ev = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 2 * half_depth, 0), verts=ev)
    bmesh.ops.translate(bm, vec=(0, -half_depth, 0), verts=bm.verts[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm
ant = make_object("Yungu_Antenna", antenna_y(), M["antenna"], (0, 0, PZ(318)), subsurf=0)
bev = ant.modifiers.new("Bevel", 'BEVEL'); bev.width = 0.0075; bev.segments = 4
bev.limit_method = 'ANGLE'; bev.harden_normals = False
s = ant.modifiers.new("Subdivision", 'SUBSURF'); s.levels = 1; s.render_levels = 2
parts[ant] = "antenna"

# ---- Chest screen: panel (textured), glowing frame tube, top slot
CH_CX, CH_CZ = 0.0, (PZ(872) + PZ(1079)) / 2
CH_HW, CH_HH = (669 - 355) / 2000, (1079 - 872) / 2000
chest = projected_panel("Yungu_ChestScreen", M["screen"], body, CH_CX, CH_CZ, CH_HW, CH_HH,
                        n=4.0, seg=16, offset=0.0025, bulge=0.002, thickness=0.010)
parts[chest] = "body"
frame_pts = []
for i in range(400):
    t = 2 * math.pi * i / 400
    c, s_ = math.cos(t), math.sin(t)
    fx = (CH_HW - 0.0085) * math.copysign(abs(c) ** 0.5, c)
    fz = (CH_HH - 0.0085) * math.copysign(abs(s_) ** 0.5, s_)
    frame_pts.append((CH_CX + fx, CH_CZ + fz))
frame = surface_stroke("Yungu_ChestFrame", M["glow"], chest, frame_pts, rw=0.0036, rd=0.0028, lift=0.0,
                       pivot=(CH_CX, 0, CH_CZ), closed=True, count=96, seg=8)
parts[frame] = "body"
bbvh = bvh_of(body)
P, N = hit_front(bbvh, 0, PZ(841))
slot = se_object("Yungu_ChestSlot", (0.032, 0.011, 0.0105), M["navy"], P + N * 0.002, nh=2.6, ntop=2.6, seg=4)
bm = bmesh.new(); bm.from_mesh(slot.data)
bmesh.ops.transform(bm, matrix=N.to_track_quat('-Y', 'Z').to_matrix().to_4x4(), verts=bm.verts[:])
bm.to_mesh(slot.data); bm.free()
parts[slot] = "body"

# ---- Arms: upper arm, mitten hand, thumb (per side)
ARM_Y = -0.015
arm_joints = {}
def palm_and_glow(ob, inward):
    """material zones on the hand: dark curled-finger side, lime glow at the tips"""
    for p in ob.data.polygons:
        n = p.normal; c = p.center
        if n.z < -0.72:
            p.material_index = 2
        elif n.dot(inward) > 0.35 and c.z < -0.06 and n.z < 0.15:
            p.material_index = 1
for side, s in (("R", -1), ("L", 1)):
    S = Vector((s * -PX(275), ARM_Y, PZ(850)))      # shoulder
    Wr = Vector((s * -PX(213), ARM_Y, PZ(993)))     # wrist
    Hb = Vector((s * -PX(196), ARM_Y, PZ(1147)))    # hand tip
    arm_joints[side] = (S, Wr, Hb)
    d1 = (Wr - S).normalized()
    r1 = d1.to_track_quat('-Z', 'Y').to_matrix()
    up = se_object(f"Yungu_UpperArm.{side}", (0.050, 0.053, 0.092), M["white"], (S + Wr) / 2 + d1 * 0.004,
                   pivot=S, rot=r1, nh=2.0, ntop=2.2, nbot=2.4, seg=8)
    parts[up] = f"upper_arm.{side}"
    d2 = (Hb - Wr).normalized()
    r2 = d2.to_track_quat('-Z', 'Y').to_matrix()
    hc = Wr + d2 * 0.072
    hand = se_object(f"Yungu_Hand.{side}", (0.057, 0.056, 0.086), [M["white"], M["palm"]],
                     hc, pivot=Wr, rot=r2, nh=2.2, ntop=2.6, nbot=2.1, seg=8)
    # material zones follow the cage grid (clean loops): bottom = glow, inner-lower = dark
    inward_code = 0 if s < 0 else 1
    cf = hand.data.attributes["cube_face"].data; cz = hand.data.attributes["cube_z"].data
    for p in hand.data.polygons:
        code, z = cf[p.index].value, cz[p.index].value
        if code == inward_code and z < 0.25: p.material_index = 1
        elif code == 3 and z < -0.5 and False: p.material_index = 1
    parts[hand] = f"hand.{side}"
    # thumb: inner-front lobe, curling down
    tb = hc + Vector((-s * 0.030, -0.030, 0.026))
    tt = tb + Vector((-s * 0.010, -0.014, -0.075))
    dt = (tt - tb).normalized()
    rt = dt.to_track_quat('-Z', 'Y').to_matrix()
    thumb = se_object(f"Yungu_Thumb.{side}", (0.026, 0.028, 0.046), [M["white"], M["palm"]],
                      (tb + tt) / 2, pivot=tb, rot=rt, nh=2.0, ntop=2.4, nbot=2.0, seg=6)
    cf = thumb.data.attributes["cube_face"].data
    for p in thumb.data.polygons:
        if cf[p.index].value == 5: p.material_index = 1
    arm_joints[side] += (tb, tt)
    parts[thumb] = f"thumb.{side}"

# ---- Ground glow (soft lime blob shadow)
bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
g = superellipse_grid(0.150, 0.110, 2.0, 12); W_ = 13; vs = []
for (u, v, x, y, m) in g: vs.append(bm.verts.new((x, y, 0.001)))
for j in range(12):
    for i in range(12):
        idx = (j * W_ + i, j * W_ + i + 1, (j + 1) * W_ + i + 1, (j + 1) * W_ + i)
        f = bm.faces.new([vs[k] for k in idx])
        for l, k in zip(f.loops, idx): l[uvl].uv = (g[k][0] * .5 + .5, g[k][1] * .5 + .5)
glow = make_object("Yungu_GroundGlow", bm, M["ground"], (0, 0, 0), subsurf=0, collection=COL_FX)
parts[glow] = "root"

# ---------------------------------------------------------------- UVs (smart project)
def smart_uv(ob):
    if ob.data.uv_layers: return
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')
for ob in list(parts):
    try: smart_uv(ob)
    except Exception as e: print("UV fail", ob.name, e)

# ================================================================ RIG
arm_data = bpy.data.armatures.new("Yungu_Rig")
rig = bpy.data.objects.new("Yungu_Rig", arm_data)
COL.objects.link(rig)
rig.show_in_front = True
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
def bone(name, h, t, parent=None, roll=0.0):
    b = eb.new(name); b.head = Vector(h); b.tail = Vector(t); b.roll = roll
    if parent: b.parent = eb[parent]; b.use_connect = False
    return b
bone("root", (0, 0, 0), (0, 0.25, 0))
bone("body", (0, 0, PZ(1250) + 0.05), (0, 0, PZ(815) - 0.02), "root")
bone("head", (0, 0, PZ(805)), (0, 0, PZ(318) - 0.05), "body")
bone("antenna", (0, 0, PZ(318)), (0, 0, PZ(150)), "head")
for side, s in (("R", -1), ("L", 1)):
    bone(f"ear.{side}", (s * 0.300, 0, EAR_Z), (s * 0.380, 0, EAR_Z), "head")
    ex = PX(389) if side == "R" else PX(636)
    bone(f"eye.{side}", (ex, -0.24, PZ(575)), (ex, -0.33, PZ(575)), "head")
    S, Wr, Hb, tb, tt = arm_joints[side]
    bone(f"upper_arm.{side}", S, Wr, "body")
    bone(f"hand.{side}", Wr, Hb, f"upper_arm.{side}")
    bone(f"thumb.{side}", tb, tt, f"hand.{side}")
bone("mouth", (0, -0.24, PZ(645)), (0, -0.33, PZ(645)), "head")
bpy.ops.object.mode_set(mode='OBJECT')

# rigid skin: every part 100% to one bone, parented to the rig
for ob, bname in parts.items():
    vg = ob.vertex_groups.new(name=bname)
    vg.add(range(len(ob.data.vertices)), 1.0, 'REPLACE')
    mw = ob.matrix_world.copy()
    ob.parent = rig
    ob.matrix_world = mw
    am = ob.modifiers.new("Armature", 'ARMATURE'); am.object = rig
    # armature first in the stack
    ob.modifiers.move(ob.modifiers.find("Armature"), 0)

# ---------------------------------------------------------------- animations
pose = rig.pose.bones
for pb in pose: pb.rotation_mode = 'QUATERNION'
rig.animation_data_create()
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

def key(bname, frame, loc=None, rot=None, scl=None):
    """loc in world-space offset, rot = list of (world_axis, degrees), scl in world axes"""
    pb = pose[bname]
    R = pb.bone.matrix_local.to_3x3().normalized()
    Ri = R.inverted()
    if loc is not None:
        pb.location = Ri @ Vector(loc); pb.keyframe_insert("location", frame=frame)
    if rot is not None:
        q = Quaternion()
        for ax, deg in rot:
            q = Quaternion(Ri @ ax, math.radians(deg)) @ q
        pb.rotation_quaternion = q; pb.keyframe_insert("rotation_quaternion", frame=frame)
    if scl is not None:
        sw = Vector(scl)
        # map world-axis scale onto the bone's local axes
        loc_axes = [R.col[k] for k in range(3)]
        pb.scale = [sum(abs(loc_axes[k][w]) * sw[w] for w in range(3)) for k in range(3)]
        pb.keyframe_insert("scale", frame=frame)

def reset_pose():
    for pb in pose:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)

def new_action(name):
    reset_pose()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    return act

# Idle: hover bob, head tilt, antenna sway, gentle arm swing (60f loop)
act_idle = new_action("Idle")
for f, ph in ((1, 0), (16, 1), (31, 2), (46, 3), (61, 0)):
    key("body", f, loc=(0, 0, (0, 0.012, 0, -0.012)[ph]))
    key("head", f, rot=[(Y, (2, 0, -2, 0)[ph]), (X, (0, 1.5, 0, -1.5)[ph])])
    key("antenna", f, rot=[(Y, (-7, 0, 7, 0)[ph])])
    for side in ("R", "L"):
        key(f"upper_arm.{side}", f, rot=[(X, (4, 0, -4, 0)[ph])])
        key(f"hand.{side}", f, rot=[(X, (-4, 0, 4, 0)[ph])])

# Wave: raise the character's left arm (+X) and wave the hand (48f)
new_action("Wave")
for f, ang, w in ((1, 0, 0), (10, -118, 0), (18, -118, 25), (26, -118, -25), (34, -118, 25), (42, -118, 0), (49, 0, 0)):
    key("upper_arm.L", f, rot=[(Y, ang), (X, ang * 0.17)])
    key("hand.L", f, rot=[(Y, w)])
    key("head", f, rot=[(Y, -6 if 10 <= f <= 42 else 0)])
    key("antenna", f, rot=[(Y, -w * 0.4)])

# Blink: eyes squash vertically (24f)
new_action("Blink")
for f, sz in ((1, 1), (5, 1), (8, 0.15), (11, 1), (24, 1)):
    for side in ("L", "R"):
        key(f"eye.{side}", f, scl=(1, 1, sz))

reset_pose()
rig.animation_data.action = act_idle

# ---------------------------------------------------------------- tidy & save
for ob in parts:
    ob.data.name = ob.name
    for nm in ("cube_face", "cube_z"):
        at = ob.data.attributes.get(nm)
        if at: ob.data.attributes.remove(at)
bpy.context.view_layer.update()
out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.join(HERE, "Yungu.blend")
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out, "parts:", len(parts))
