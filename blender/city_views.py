"""The Signal Room's window: night views of the cities Gabriel has lived in.

Each city is a small procedural night scene rendered from a camera at the
origin looking +Y (horizontal). The web layer places the render on a plane
along the hero camera's line of sight through the window and cross-fades
between cities. Monuments are stylised silhouettes / metaball sculptures,
not accurate architectural models.

Usage: /opt/bpyenv/bin/python blender/city_views.py [baza granada madrid barcelona] [--fast]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
import bmesh  # noqa: E402  (must follow bpy)
from mathutils import Matrix  # noqa: E402

import lib  # noqa: E402
from lib import kelvin  # noqa: E402

ARGS = sys.argv[1:]
FAST = '--fast' in ARGS
CITIES = [a for a in ARGS if not a.startswith('--')] or ['baza', 'granada', 'madrid', 'barcelona']
RES = (1024, 512) if FAST else (2048, 1024)
SPP = 16 if FAST else 64
LENS = 24  # sensor 36 → hfov 73.7°, vfov 41.1° at 2:1 — must match src/concepts/signal-room/cityWindow.ts

D2R = math.pi / 180


def pos(az, d, z=0.0):
    """Azimuth (deg, + = right), horizontal distance, height → world xyz."""
    return (d * math.sin(az * D2R), d * math.cos(az * D2R), z)


def h_at(el, d, cam_z):
    """Height that appears at elevation el (deg) at distance d."""
    return cam_z + d * math.tan(el * D2R)


# ---------------------------------------------------------------- materials

def flood(name, color, strength=2.0, falloff=0.65, noise=0.25):
    """Floodlit stone: emission brighter at the base, with a little texture."""
    m = bpy.data.materials.new(name)
    ns, ls = lib.nodes(m)
    ns.clear()
    out = ns.new('ShaderNodeOutputMaterial')
    tc = ns.new('ShaderNodeTexCoord')
    sep = ns.new('ShaderNodeSeparateXYZ')
    ls.new(tc.outputs['Generated'], sep.inputs[0])
    grad = ns.new('ShaderNodeMath'); grad.operation = 'MULTIPLY_ADD'
    grad.inputs[1].default_value = -falloff; grad.inputs[2].default_value = 1.0
    ls.new(sep.outputs['Z'], grad.inputs[0])
    nz = ns.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 40
    ls.new(tc.outputs['Object'], nz.inputs['Vector'])
    nm = ns.new('ShaderNodeMath'); nm.operation = 'MULTIPLY_ADD'
    nm.inputs[1].default_value = noise; nm.inputs[2].default_value = 1 - noise / 2
    ls.new(nz.outputs['Fac'], nm.inputs[0])
    s = ns.new('ShaderNodeMath'); s.operation = 'MULTIPLY'
    ls.new(grad.outputs[0], s.inputs[0]); ls.new(nm.outputs[0], s.inputs[1])
    s2 = ns.new('ShaderNodeMath'); s2.operation = 'MULTIPLY'; s2.inputs[1].default_value = strength
    ls.new(s.outputs[0], s2.inputs[0])
    em = ns.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*color, 1)
    ls.new(s2.outputs[0], em.inputs['Strength']); ls.new(em.outputs[0], out.inputs[0])
    return m


def emit(name, color, strength):
    return lib.mat_emission(name, color, strength)


def windows(name, facade=(0.012, 0.012, 0.018), lit=0.32, cell=(3.6, 3.1), strength=3.0, warm=True, seed=0.0):
    """Buildings with a grid of randomly lit windows (world-space, triplanar by normal)."""
    m = bpy.data.materials.new(name)
    ns, ls = lib.nodes(m)
    ns.clear()
    out = ns.new('ShaderNodeOutputMaterial')
    geo = ns.new('ShaderNodeNewGeometry')
    sep = ns.new('ShaderNodeSeparateXYZ'); ls.new(geo.outputs['Position'], sep.inputs[0])
    nsep = ns.new('ShaderNodeSeparateXYZ'); ls.new(geo.outputs['Normal'], nsep.inputs[0])
    ax = ns.new('ShaderNodeMath'); ax.operation = 'ABSOLUTE'; ls.new(nsep.outputs['X'], ax.inputs[0])
    side = ns.new('ShaderNodeMath'); side.operation = 'GREATER_THAN'; side.inputs[1].default_value = 0.5
    ls.new(ax.outputs[0], side.inputs[0])
    u = ns.new('ShaderNodeMix'); u.data_type = 'FLOAT'
    ls.new(side.outputs[0], u.inputs['Factor']); ls.new(sep.outputs['X'], u.inputs['A']); ls.new(sep.outputs['Y'], u.inputs['B'])
    comb = ns.new('ShaderNodeCombineXYZ')
    du = ns.new('ShaderNodeMath'); du.operation = 'DIVIDE'; du.inputs[1].default_value = cell[0]
    dz = ns.new('ShaderNodeMath'); dz.operation = 'DIVIDE'; dz.inputs[1].default_value = cell[1]
    ls.new(u.outputs['Result'], du.inputs[0]); ls.new(sep.outputs['Z'], dz.inputs[0])
    ls.new(du.outputs[0], comb.inputs['X']); ls.new(dz.outputs[0], comb.inputs['Y'])
    comb.inputs['Z'].default_value = seed
    fl = ns.new('ShaderNodeVectorMath'); fl.operation = 'FLOOR'; ls.new(comb.outputs[0], fl.inputs[0])
    fr = ns.new('ShaderNodeVectorMath'); fr.operation = 'FRACTION'; ls.new(comb.outputs[0], fr.inputs[0])
    wn = ns.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; ls.new(fl.outputs[0], wn.inputs['Vector'])
    on = ns.new('ShaderNodeMath'); on.operation = 'GREATER_THAN'; on.inputs[1].default_value = 1 - lit
    ls.new(wn.outputs['Value'], on.inputs[0])
    fs = ns.new('ShaderNodeSeparateXYZ'); ls.new(fr.outputs[0], fs.inputs[0])
    wx = ns.new('ShaderNodeMath'); wx.operation = 'LESS_THAN'; wx.inputs[1].default_value = 0.5
    wy = ns.new('ShaderNodeMath'); wy.operation = 'LESS_THAN'; wy.inputs[1].default_value = 0.55
    ls.new(fs.outputs['X'], wx.inputs[0]); ls.new(fs.outputs['Y'], wy.inputs[0])
    pane = ns.new('ShaderNodeMath'); pane.operation = 'MULTIPLY'; ls.new(wx.outputs[0], pane.inputs[0]); ls.new(wy.outputs[0], pane.inputs[1])
    # roofs (normal up) have no windows
    up = ns.new('ShaderNodeMath'); up.operation = 'LESS_THAN'; up.inputs[1].default_value = 0.5
    ls.new(nsep.outputs['Z'], up.inputs[0])
    w1 = ns.new('ShaderNodeMath'); w1.operation = 'MULTIPLY'; ls.new(on.outputs[0], w1.inputs[0]); ls.new(pane.outputs[0], w1.inputs[1])
    w2 = ns.new('ShaderNodeMath'); w2.operation = 'MULTIPLY'; ls.new(w1.outputs[0], w2.inputs[0]); ls.new(up.outputs[0], w2.inputs[1])
    br = ns.new('ShaderNodeMath'); br.operation = 'MULTIPLY_ADD'; br.inputs[1].default_value = 0.7; br.inputs[2].default_value = 0.3
    ls.new(wn.outputs['Color'], br.inputs[0])
    st = ns.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; ls.new(w2.outputs[0], st.inputs[0]); ls.new(br.outputs[0], st.inputs[1])
    st2 = ns.new('ShaderNodeMath'); st2.operation = 'MULTIPLY'; st2.inputs[1].default_value = strength; ls.new(st.outputs[0], st2.inputs[0])
    tint = lib.ramp(ns, [(0.3, kelvin(2300) if warm else (0.6, 0.75, 1.0)), (0.75, kelvin(3400))])
    ls.new(wn.outputs['Value'], tint.inputs[0])
    em = ns.new('ShaderNodeEmission'); ls.new(tint.outputs[0], em.inputs['Color']); ls.new(st2.outputs[0], em.inputs['Strength'])
    dif = ns.new('ShaderNodeBsdfDiffuse'); dif.inputs['Color'].default_value = (*facade, 1)
    add = ns.new('ShaderNodeAddShader'); ls.new(dif.outputs[0], add.inputs[0]); ls.new(em.outputs[0], add.inputs[1])
    ls.new(add.outputs[0], out.inputs[0])
    return m


def mountain(name, rock, snow=None, snow_from=0.72, strength=0.12, lights=0.0):
    """Moonlit mountain: dark rock, optional pale snow above a height fraction, sparse village lights."""
    m = bpy.data.materials.new(name)
    ns, ls = lib.nodes(m)
    ns.clear()
    out = ns.new('ShaderNodeOutputMaterial')
    tc = ns.new('ShaderNodeTexCoord')
    sep = ns.new('ShaderNodeSeparateXYZ'); ls.new(tc.outputs['Generated'], sep.inputs[0])
    nz = ns.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 18; nz.inputs['Detail'].default_value = 8
    ls.new(tc.outputs['Generated'], nz.inputs['Vector'])
    hz = ns.new('ShaderNodeMath'); hz.operation = 'MULTIPLY_ADD'; hz.inputs[1].default_value = 0.18
    ls.new(nz.outputs['Fac'], hz.inputs[0]); ls.new(sep.outputs['Z'], hz.inputs[2])
    col = lib.ramp(ns, [(0.0, rock), (snow_from - 0.02, rock), (snow_from + 0.04, snow or rock), (1.0, snow or rock)])
    ls.new(hz.outputs[0], col.inputs[0])
    em = ns.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = strength
    ls.new(col.outputs[0], em.inputs['Color'])
    shader = em.outputs[0]
    if lights:
        vo = ns.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 90
        ls.new(tc.outputs['Generated'], vo.inputs['Vector'])
        dt = ns.new('ShaderNodeMath'); dt.operation = 'LESS_THAN'; dt.inputs[1].default_value = lights
        ls.new(vo.outputs['Distance'], dt.inputs[0])
        low = ns.new('ShaderNodeMath'); low.operation = 'LESS_THAN'; low.inputs[1].default_value = 0.45
        ls.new(sep.outputs['Z'], low.inputs[0])
        mm = ns.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; ls.new(dt.outputs[0], mm.inputs[0]); ls.new(low.outputs[0], mm.inputs[1])
        e2 = ns.new('ShaderNodeEmission'); e2.inputs['Color'].default_value = (*kelvin(2100), 1)
        s = ns.new('ShaderNodeMath'); s.operation = 'MULTIPLY'; s.inputs[1].default_value = 6; ls.new(mm.outputs[0], s.inputs[0])
        ls.new(s.outputs[0], e2.inputs['Strength'])
        add = ns.new('ShaderNodeAddShader'); ls.new(shader, add.inputs[0]); ls.new(e2.outputs[0], add.inputs[1])
        shader = add.outputs[0]
    ls.new(shader, out.inputs[0])
    return m


def night_sky(zenith, horizon, glow, stars=True):
    """Gradient night sky with light-pollution glow and stars (world shader)."""
    w = bpy.data.worlds.new('sky')
    bpy.context.scene.world = w
    ns, ls = lib.nodes(w)
    ns.clear()
    out = ns.new('ShaderNodeOutputWorld')
    tc = ns.new('ShaderNodeTexCoord')
    sep = ns.new('ShaderNodeSeparateXYZ'); ls.new(tc.outputs['Generated'], sep.inputs[0])
    col = lib.ramp(ns, [(0.0, glow), (0.06, horizon), (0.45, zenith)])
    ls.new(sep.outputs['Z'], col.inputs[0])
    bg = ns.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = 1.0
    ls.new(col.outputs[0], bg.inputs['Color'])
    shader = bg.outputs[0]
    if stars:
        vo = ns.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 420
        ls.new(tc.outputs['Generated'], vo.inputs['Vector'])
        dt = ns.new('ShaderNodeMath'); dt.operation = 'LESS_THAN'; dt.inputs[1].default_value = 0.045
        ls.new(vo.outputs['Distance'], dt.inputs[0])
        hi = ns.new('ShaderNodeMath'); hi.operation = 'GREATER_THAN'; hi.inputs[1].default_value = 0.08
        ls.new(sep.outputs['Z'], hi.inputs[0])
        mm = ns.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; ls.new(dt.outputs[0], mm.inputs[0]); ls.new(hi.outputs[0], mm.inputs[1])
        br = ns.new('ShaderNodeMath'); br.operation = 'MULTIPLY'; ls.new(mm.outputs[0], br.inputs[0]); ls.new(vo.outputs['Color'], br.inputs[1])
        s = ns.new('ShaderNodeBackground'); s.inputs['Color'].default_value = (0.85, 0.9, 1.0, 1)
        sm = ns.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'; sm.inputs[1].default_value = 2.2
        ls.new(br.outputs[0], sm.inputs[0]); ls.new(sm.outputs[0], s.inputs['Strength'])
        add = ns.new('ShaderNodeAddShader'); ls.new(shader, add.inputs[0]); ls.new(s.outputs[0], add.inputs[1])
        shader = add.outputs[0]
    ls.new(shader, out.inputs[0])


# ---------------------------------------------------------------- geometry helpers

def boxes(name, specs, mat):
    """Many boxes in one mesh. specs: (cx, cy, z0, sx, sy, sz, rot_z_deg)."""
    bm = bmesh.new()
    for cx, cy, z0, sx, sy, sz, rz in specs:
        geom = bmesh.ops.create_cube(bm, size=1.0)
        vs = geom['verts']
        bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=vs)
        bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(rz * D2R, 3, 'Z'))
        bmesh.ops.translate(bm, vec=(cx, cy, z0 + sz / 2), verts=vs)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat)
    return o


def ridge(name, d, az0, az1, el_base, amp, mat, cam_z, seed=1.0, n=240, peaks=(), bottom=-15.0):
    """A mountain/hill silhouette as a vertical sheet curved at distance d."""
    R = lib.rand(int(seed * 1000))
    ph = [R.uniform(0, 6.28) for _ in range(6)]
    verts, faces = [], []
    for i in range(n + 1):
        f = i / n
        az = az0 + (az1 - az0) * f
        h = sum(math.sin(f * k * 3.1 + ph[j]) / (k ** 1.1) for j, k in enumerate((1, 2, 3, 5, 8, 13)))
        el = el_base + amp * (0.5 + 0.35 * h)
        for paz, pel, pw in peaks:
            el = max(el, pel - abs(az - paz) / pw * (pel - el_base) * 0.9)
        x, y, _ = pos(az, d)
        top = h_at(el, d, cam_z)
        bot = h_at(bottom, d, cam_z)
        verts += [(x, y, bot), (x, y, top)]
        if i:
            a = 2 * i
            faces.append((a - 2, a, a + 1, a - 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    # Generated coords need a sane bbox; also give Z gradient from bottom to top
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat)
    return o


def city_carpet(name, cam_z, d0, d1, az0, az1, n, hmin, hmax, foot=(14, 26), seed=3, mat=None, ground=0.0, keep_clear=None):
    R = lib.rand(seed)
    specs = []
    for _ in range(n):
        d = d0 + (d1 - d0) * R.random() ** 0.7
        az = R.uniform(az0, az1)
        if keep_clear and keep_clear[0] < az < keep_clear[1] and d < keep_clear[2]:
            continue
        x, y, _ = pos(az, d)
        specs.append((x, y, ground, R.uniform(*foot), R.uniform(*foot), R.uniform(hmin, hmax), az + R.uniform(-8, 8)))
    return boxes(name, specs, mat or windows(name + '_m', seed=seed))


def metaball(name, elems, mat, res=0.04):
    """Sculpted blob figure: ellipsoids (BALL r / ELLIPSOID r*size) unioned by a voxel remesh.
    (Named for the metaball look; real metaballs fragmented at these sizes.)"""
    parts = []
    for typ, co, r, size in elems:
        k = 1.5 if typ == 'ELLIPSOID' else 1.15   # metaball-style radii → overlapping solids that fuse
        sc = (r * size[0] * k, r * size[1] * k, r * size[2] * k) if (typ == 'ELLIPSOID' and size) else (r * k, r * k, r * k)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=co, segments=20, ring_count=12)
        o = bpy.context.active_object
        o.scale = sc
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        parts.append(o)
    lib.select_only(parts)
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)   # origin = figure's local (0,0,0), so place() is exact
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    rm = o.modifiers.new('remesh', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = res
    sm = o.modifiers.new('smooth', 'SMOOTH'); sm.iterations = 10; sm.factor = 0.7
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.materials.append(mat)
    return o


def ground(color=(0.012, 0.012, 0.016), strength=1.0):
    lib.plane('ground', (60000, 60000), (0, 20000, -0.01), mat=emit('ground_m', color, strength))


def prism(name, w, d, h, loc, mat, rot_z=0.0):
    """Gable roof / pediment: triangular prism, ridge along local y."""
    v = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (0, -d / 2, h), (-w / 2, d / 2, 0), (w / 2, d / 2, 0), (0, d / 2, h)]
    f = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(v, [], f)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat)
    o.location = loc
    o.rotation_euler.z = rot_z * D2R
    return o


def place(o, loc, rot_z=0.0, scale=1.0):
    o.location = loc
    o.rotation_euler.z = rot_z * D2R
    o.scale = (scale, scale, scale)
    return o


def spot(name, loc, target, energy, color, angle=40):
    lt = lib.light(name, 'SPOT', loc, energy, color, size=0.3, spot=angle, blend=0.5)
    lib.look_at(lt, target)
    return lt


def bulb_string(name, p0, p1, sag, n, colors, mat_strength=12):
    """Festival lights hung in a catenary between two points."""
    objs = []
    for i in range(n):
        f = (i + 0.5) / n
        x = p0[0] + (p1[0] - p0[0]) * f
        y = p0[1] + (p1[1] - p0[1]) * f
        z = p0[2] + (p1[2] - p0[2]) * f - sag * 4 * f * (1 - f)
        objs.append(lib.sphere(f'{name}{i}', 0.18, (x, y, z), mat=emit(f'{name}_m{i % len(colors)}', colors[i % len(colors)], mat_strength), seg=8, rings=6))
    return objs


def moon(az, el, d=50000, r=900):
    x, y, _ = pos(az, d)
    lib.sphere('moon', r, (x, y, d * math.tan(el * D2R)), mat=emit('moon_m', (1.0, 0.96, 0.88), 6), seg=24, rings=12)


def camera(cam_z):
    c = lib.camera('cam', (0, 0, cam_z), (0, 100, cam_z), lens=LENS)
    c.data.clip_end = 120000
    return c


# ---------------------------------------------------------------- cities

def sheet(name, d, az0, az1, el_fn, bottom, mat, cam_z, n=200):
    """Vertical silhouette sheet at distance d whose top follows el_fn(az) (degrees)."""
    verts, faces = [], []
    for i in range(n + 1):
        az = az0 + (az1 - az0) * i / n
        x, y, _ = pos(az, d)
        verts += [(x, y, h_at(bottom, d, cam_z)), (x, y, h_at(el_fn(az), d, cam_z))]
        if i:
            a = 2 * i
            faces.append((a - 2, a, a + 1, a - 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat)
    return o


def barcelona():
    cz = 30
    night_sky((0.006, 0.01, 0.03), (0.05, 0.035, 0.05), (0.32, 0.16, 0.08))
    ground((0.01, 0.01, 0.014))
    moon(-22, 12)
    ridge('collserola', 5000, -60, 60, 1.5, 6.0, mountain('cs_m', (0.012, 0.016, 0.03), strength=1, lights=0.05), cz, seed=0.7,
          peaks=((-8, 7.2, 18),), bottom=-1.0)
    tx, ty, _ = pos(-8, 4900)
    base = h_at(6.9, 4900, cz)
    lib.cyl('torre_collserola', 9, 300, (tx, ty, base + 150), mat=emit('tc_m', (0.75, 0.8, 0.9), 0.6), verts=8)
    lib.cyl('tc_deck', 40, 30, (tx, ty, base + 150), mat=emit('tcd_m', (0.9, 0.9, 1.0), 1.2), verts=12)
    lib.sphere('tc_red', 9, (tx, ty, base + 305), mat=emit('tc_red_m', (1, 0.05, 0.02), 40), seg=8, rings=6)
    city_carpet('bcn_far', cz, 900, 3500, -45, 45, 700, 18, 45, seed=11, foot=(25, 45))
    city_carpet('bcn_near', cz, 120, 900, -45, 45, 600, 15, 30, seed=5, keep_clear=(-2, 10, 900))
    sf = flood('sagrada_m', (1.0, 0.7, 0.42), strength=1.1, falloff=0.6, noise=0.5)
    sf2 = flood('sagrada_m2', (0.85, 0.6, 0.38), strength=0.75, falloff=0.6, noise=0.5)
    sx, sy, _ = pos(4, 800)
    lib.box('sf_nave', (95, 60, 45), (sx, sy + 20, 22), mat=sf2)
    prism('sf_roof', 60, 95, 30, (sx, sy + 20, 45), sf, rot_z=90)
    spires = [(-34, 0, 100), (-22, 2, 107), (-10, 2, 107), (2, 0, 100),
              (-30, 75, 107), (-18, 77, 112), (-6, 77, 112), (6, 75, 107),
              (-14, 38, 135), (-2, 38, 135), (-14, 52, 135), (-2, 52, 135),
              (-8, 64, 138), (-8, 45, 172)]
    for i, (dx, dy, h) in enumerate(spires):
        r = 5.5 if h < 130 else 8
        m_ = sf if i % 2 else sf2
        lib.cyl(f'sf_t{i}', r * 0.8, h * 0.7, (sx + dx, sy + dy, h * 0.35), mat=m_, verts=12)
        lib.cone(f'sf_c{i}', r * 0.8, 0.5, h * 0.32, (sx + dx, sy + dy, h * 0.7 + h * 0.16), mat=m_, verts=12)
    lib.sphere('sf_star', 6, (sx - 8, sy + 64, 142), mat=emit('star_m', (1, 0.97, 0.9), 60), seg=12, rings=8)
    lib.box('sf_cross_v', (2.2, 2.2, 17), (sx - 8, sy + 45, 180), mat=emit('cross_m', (1, 1, 1), 25))
    lib.box('sf_cross_h', (12, 2.2, 2.2), (sx - 8, sy + 45, 183), mat=emit('cross_m2', (1, 1, 1), 25))
    gx, gy, _ = pos(15, 1300)
    glo = bpy.data.materials.new('glories')
    ns, ls = lib.nodes(glo)
    ns.clear()
    out = ns.new('ShaderNodeOutputMaterial'); tc = ns.new('ShaderNodeTexCoord')
    sep = ns.new('ShaderNodeSeparateXYZ'); ls.new(tc.outputs['Generated'], sep.inputs[0])
    rp = lib.ramp(ns, [(0.0, (0.05, 0.2, 1.0)), (0.55, (0.6, 0.15, 0.9)), (1.0, (1.0, 0.25, 0.3))])
    ls.new(sep.outputs['Z'], rp.inputs[0])
    em = ns.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 3.5
    ls.new(rp.outputs[0], em.inputs['Color']); ls.new(em.outputs[0], out.inputs[0])
    lib.cyl('glories', 22, 110, (gx, gy, 55), mat=glo, verts=32)
    lib.sphere('glories_top', 22, (gx, gy, 110), mat=glo, scale=(1, 1, 1.6))


def granada():
    cz = 40   # Mirador de San Nicolás, Albaicín
    night_sky((0.004, 0.008, 0.03), (0.03, 0.04, 0.08), (0.12, 0.09, 0.1))
    lib.plane('ground', (60000, 60000), (0, 20000, -120), mat=emit('ground_m', (0.006, 0.008, 0.008), 1))
    moon(22, 11.5)
    sn_peaks = lambda az: 2.6 + 4.6 * math.exp(-((az - 4) / 8) ** 2) + 4.0 * math.exp(-((az - 15) / 5) ** 2) \
        + 0.7 * math.sin(az * 0.35) + 0.35 * math.sin(az * 1.3) + 0.15 * math.sin(az * 4.1)  # noqa: E731
    sheet('sierra_nevada', 30000, -50, 60, sn_peaks, 0.3,
          mountain('sn_m', (0.03, 0.035, 0.065), snow=(0.62, 0.7, 0.9), snow_from=0.5, strength=0.7), cz)
    crest = lambda az: 0.25 + 0.9 * max(0.0, 1 - ((az + 3) / 34) ** 2)  # noqa: E731
    sheet('sabika', 660, -50, 50, crest, -7, mountain('sab_m', (0.008, 0.02, 0.012), strength=0.8), cz)
    amber = flood('alhambra_m', (1.0, 0.52, 0.2), strength=1.3, falloff=0.55, noise=0.45)
    amber2 = flood('alhambra_m2', (0.85, 0.42, 0.16), strength=0.95, falloff=0.55, noise=0.45)
    top = lambda az: h_at(crest(az), 645, cz)  # noqa: E731
    walls = []
    for az2 in range(-58, 46):
        az = az2 / 2
        x, y, _ = pos(az, 640)
        walls.append((x, y, top(az) - 8, 12, 5, 18 + (4 if az2 % 5 == 0 else 0) + 6 * math.sin(az2 * 0.7) ** 2, az))
    boxes('alhambra_walls', walls, amber)
    towers = [(-27, 18, 34, 'vela'), (-24, 12, 26, 't2'), (-19, 11, 24, 't3'), (-9, 18, 48, 'comares'), (-2, 13, 30, 't4'), (4, 11, 26, 't4b'),
              (9, 13, 30, 't5'), (14, 12, 32, 't6'), (20, 11, 26, 't7'), (25, 10, 22, 't8')]
    for az, w, h, n in towers:
        x, y, _ = pos(az, 636)
        lib.box(f'tower_{n}', (w, w, h), (x, y, top(az) - 8 + h / 2), rot=(0, 0, az * D2R), mat=amber2)
    x, y, _ = pos(-3, 690)
    lib.box('carlos_v', (64, 64, 20), (x, y, top(-3) + 3), mat=amber2)
    R = lib.rand(4)
    cyp = emit('cypress_m', (0.006, 0.014, 0.008), 1)
    for i in range(70):
        az = R.uniform(-40, 34)
        d = R.uniform(560, 630)
        x, y, _ = pos(az, d)
        lib.cone(f'cyp{i}', 3, 0.3, 22, (x, y, top(az) - 30 + R.uniform(-10, 4)), mat=cyp, verts=6)
    alb = windows('albaicin_m', facade=(0.5, 0.48, 0.44), lit=0.4, cell=(2.4, 2.8), strength=5)
    specs = []
    for _ in range(700):
        d = 120 + 470 * R.random() ** 0.8
        az = R.uniform(-48, 48)
        x, y, _ = pos(az, d)
        g = -d * 0.04 - 5
        specs.append((x, y, g, R.uniform(7, 12), R.uniform(7, 12), R.uniform(6, 10), az + R.uniform(-15, 15)))
    boxes('albaicin', specs, alb)
    lib.light('moonlight', 'SUN', (0, 0, 100), 0.5, (0.55, 0.65, 1.0)).rotation_euler = (1.1, 0, 2.6)


def madrid():
    cz = 2.5
    night_sky((0.005, 0.009, 0.03), (0.06, 0.05, 0.08), (0.3, 0.18, 0.12))
    ground((0.03, 0.025, 0.022), 1.0)
    moon(-26, 11.5)
    stone = flood('palacio_m', (1.0, 0.8, 0.55), strength=0.55, falloff=0.55, noise=0.4)
    rz = 7
    px, py, _ = pos(rz, 230)
    W, H = 140, 34
    lib.box('palacio_body', (W, 30, H), (px, py, H / 2), rot=(0, 0, rz * D2R), mat=stone)
    lib.box('palacio_center', (34, 31, H + 6), (px, py - 1, (H + 6) / 2), rot=(0, 0, rz * D2R), mat=stone)
    for s in (-1, 1):
        lib.box(f'palacio_wing{s}', (22, 32, H + 3), (px + s * 59 * math.cos(rz * D2R), py - s * 59 * math.sin(rz * D2R), (H + 3) / 2),
                rot=(0, 0, rz * D2R), mat=stone)
    winm = emit('pal_win', kelvin(2600), 5)
    shadow = emit('pal_shadow', (0.35, 0.25, 0.14), 0.45)
    ca, sa = math.cos(rz * D2R), math.sin(rz * D2R)
    win_specs, pil_specs, stat_specs = [], [], []
    for i in range(27):
        u = -W / 2 + 4 + i * (W - 8) / 26
        for row, zz in enumerate((7, 16, 26)):
            win_specs.append((px + u * ca, py - 16.4 - u * sa, zz - 2.5, 2.2, 0.4, 4.5 if row < 2 else 3, rz))
        pil_specs.append((px + (u + 2.6) * ca, py - 16.6 - (u + 2.6) * sa, 5, 1.0, 0.6, H - 6, rz))
        stat_specs.append((px + u * ca, py - 14 - u * sa, H + 1, 1.2, 1.2, 3.5, rz))
    boxes('pal_windows', win_specs, winm)
    boxes('pal_pilasters', pil_specs, shadow)
    boxes('pal_statues', stat_specs, stone)
    ax, ay, _ = pos(29, 300)
    lib.box('alm_body', (40, 60, 30), (ax, ay, 15), mat=stone)
    lib.cyl('alm_drum', 13, 16, (ax, ay, 38), mat=stone, verts=24)
    lib.sphere('alm_dome', 13, (ax, ay, 46), mat=flood('dome_m', (0.45, 0.55, 0.65), strength=0.7, falloff=0.3), scale=(1, 1, 1.15))
    lib.cyl('alm_lantern', 3, 8, (ax, ay, 63), mat=stone, verts=12)
    city_carpet('mad_blocks', cz, 120, 900, -60, 60, 240, 16, 28, seed=21, keep_clear=(-20, 40, 700))
    # El Oso y el Madroño (stylised bronze): bear upright against the strawberry tree
    bronze = lib.mat_principled('bronze', (0.3, 0.17, 0.08), rough=0.35, metal=0.9)
    bx, by, _ = pos(-9, 16)
    lib.box('oso_plinth', (2.0, 2.0, 1.5), (bx, by, 0.75), mat=lib.mat_principled('plinth', (0.55, 0.52, 0.48), rough=0.6), bevel=0.05)
    bear = metaball('oso', [
        ('ELLIPSOID', (0, 0, 0.95), 0.55, (0.62, 0.5, 0.95)),       # body, upright
        ('ELLIPSOID', (0.05, -0.05, 1.65), 0.32, (0.85, 0.85, 0.85)),  # head
        ('BALL', (0.22, -0.18, 1.62), 0.14, None),                  # snout
        ('BALL', (-0.1, 0.05, 1.92), 0.09, None), ('BALL', (0.18, 0.05, 1.92), 0.09, None),  # ears
        ('ELLIPSOID', (0.42, 0.12, 1.4), 0.2, (0.3, 0.3, 0.75)),    # forelegs reaching the trunk
        ('ELLIPSOID', (0.35, -0.12, 1.3), 0.2, (0.3, 0.3, 0.7)),
        ('ELLIPSOID', (-0.18, 0.0, 0.3), 0.24, (0.4, 0.45, 0.65)),  # hind legs
        ('ELLIPSOID', (0.2, 0.0, 0.3), 0.24, (0.4, 0.45, 0.65)),
    ], bronze, res=0.04)
    place(bear, (bx - 0.35, by, 1.38), rot_z=0)   # profile view: bear on the left, tree on the right
    tree = [('ELLIPSOID', (0.8, 0.15, 1.3), 0.2, (0.4, 0.4, 3.0))]
    R = lib.rand(9)
    for i in range(16):
        tree.append(('BALL', (0.8 + R.uniform(-0.6, 0.6), 0.15 + R.uniform(-0.45, 0.45), 2.45 + R.uniform(-0.35, 0.5)), 0.3, None))
    place(metaball('madrono', tree, bronze, res=0.04), (bx - 0.35, by, 1.42), rot_z=0)
    berry = lib.mat_principled('berry', (0.5, 0.06, 0.03), rough=0.4, metal=0.6)
    for i in range(14):
        lib.sphere(f'berry{i}', 0.05, (bx + 0.45 + R.uniform(-0.6, 0.6), by - 0.4 + R.uniform(-0.2, 0.2), 3.9 + R.uniform(-0.35, 0.45)),
                   mat=berry, seg=8, rings=6)
    spot('oso_key', (bx + 4, by - 6, 6), (bx, by, 2.5), 4500, kelvin(3000), 30)
    spot('oso_rim', (bx - 3, by + 4, 5), (bx, by, 2.5), 2500, (0.6, 0.7, 1.0), 35)
    for i, az in enumerate((-30, -21, 24, 32)):
        x, y, _ = pos(az, 22)
        lib.cyl(f'farola{i}', 0.1, 4, (x, y, 2), mat=bronze, verts=8)
        lib.sphere(f'farola_b{i}', 0.3, (x, y, 4.2), mat=emit('farola_m', kelvin(2400), 30), seg=10, rings=8)


def baza():
    cz = 2.5    # Plaza Mayor
    night_sky((0.005, 0.01, 0.035), (0.05, 0.05, 0.09), (0.18, 0.1, 0.08))
    ground((0.035, 0.028, 0.024), 1.0)
    moon(-28, 11)
    sheet('sierra_baza', 15000, -10, 70, lambda az: 0.9 + 0.5 * math.sin(az * 0.09) + 0.25 * math.sin(az * 0.5), 0.0,
          mountain('sb_m', (0.015, 0.02, 0.035), strength=0.6), cz)
    sheet('jabalcon', 9000, -26, -2, lambda az: 0.4 + 3.4 * math.exp(-((az + 12) / 4.5) ** 2), 0.0,
          mountain('jb_m', (0.018, 0.022, 0.04), strength=0.7, lights=0.03), cz)
    stone = flood('cocat_m', (1.0, 0.7, 0.4), strength=0.65, falloff=0.6, noise=0.45)
    cx, cy, _ = pos(7, 230)
    lib.box('cc_nave', (26, 55, 24), (cx, cy + 22, 12), mat=stone)
    prism('cc_gable', 26, 55, 9, (cx, cy + 22, 24), stone)
    tx, ty = cx - 19, cy - 2
    lib.box('cc_tower', (11, 11, 32), (tx, ty, 16), mat=stone)
    lib.box('cc_cornice', (12.4, 12.4, 1), (tx, ty, 32.5), mat=stone)
    lib.cyl('cc_oct', 5.6, 9, (tx, ty, 37.5), mat=stone, verts=8)
    lib.cyl('cc_oct2', 4.2, 6, (tx, ty, 45), mat=stone, verts=8)
    lib.sphere('cc_dome', 4.2, (tx, ty, 48), mat=stone, seg=8, rings=8, scale=(1, 1, 0.8))
    lib.box('cc_cross', (0.5, 0.5, 4), (tx, ty, 53.5), mat=stone)
    lib.box('cc_bells', (6, 11.2, 4), (tx, ty, 28), mat=emit('bells_m', (0.06, 0.03, 0.01), 1))
    lib.cyl('cc_rose', 2.6, 0.6, (cx, cy - 5.4, 16), rot=(math.pi / 2, 0, 0), mat=emit('rose_m', kelvin(2200), 6), verts=24)
    lib.box('cc_door', (5, 0.6, 8), (cx, cy - 5.4, 4), mat=emit('door_m', (0.08, 0.04, 0.02), 1))
    city_carpet('baza_houses', cz, 70, 600, -65, 65, 260, 7, 14, foot=(9, 16), seed=31, keep_clear=(-22, 26, 300),
                mat=windows('baza_w', facade=(0.2, 0.18, 0.16), lit=0.35, cell=(3.0, 3.0), strength=3.5, seed=2))
    # Dama de Baza (stylised): seated, head covered by a mantle, on a winged throne, holding a bird
    blue = lib.mat_principled('dama_blue', (0.07, 0.14, 0.38), rough=0.6)
    ochre = lib.mat_principled('dama_ochre', (0.62, 0.5, 0.36), rough=0.7)
    red = lib.mat_principled('dama_red', (0.5, 0.08, 0.04), rough=0.6)
    dx, dy, _ = pos(-8, 17)
    lib.box('dama_plinth', (2.2, 2.0, 1.3), (dx, dy, 0.65), mat=lib.mat_principled('plinth2', (0.5, 0.48, 0.45), rough=0.7), bevel=0.04)
    lib.box('dama_seat', (1.2, 1.1, 0.75), (dx, dy + 0.15, 1.68), mat=ochre, bevel=0.04)
    for s in (-1, 1):
        w = lib.box(f'dama_wing{s}', (0.1, 0.9, 1.5), (dx + s * 0.64, dy + 0.35, 2.4), rot=(0.25, s * 0.12, 0), mat=ochre, bevel=0.03)
    body = metaball('dama', [
        ('ELLIPSOID', (0, -0.25, 0.55), 0.45, (0.6, 0.75, 0.32)),   # lap / knees
        ('ELLIPSOID', (0, -0.42, 0.05), 0.4, (0.55, 0.3, 0.6)),     # lower mantle to the feet
        ('ELLIPSOID', (0, 0.05, 1.05), 0.45, (0.55, 0.42, 0.75)),   # torso in mantle
        ('BALL', (0, -0.02, 1.62), 0.24, None),                     # head
        ('ELLIPSOID', (0, 0.06, 1.66), 0.3, (0.42, 0.4, 0.55)),     # mantle over the head
    ], blue, res=0.04)
    place(body, (dx, dy - 0.05, 1.3))
    lib.sphere('dama_face', 0.16, (dx, dy - 0.3, 2.9), mat=ochre, scale=(0.9, 0.6, 1.1))
    lib.sphere('dama_bird', 0.12, (dx - 0.22, dy - 0.55, 2.15), mat=red, scale=(1.4, 0.8, 0.8))
    lib.torus('dama_necklace', 0.2, 0.025, (dx, dy - 0.2, 2.62), rot=(1.2, 0, 0), mat=red)
    spot('dama_key', (dx + 4, dy - 6, 6), (dx, dy, 2.2), 4000, kelvin(3100), 30)
    spot('dama_rim', (dx - 3, dy + 4, 5), (dx, dy, 2.2), 2000, (0.6, 0.7, 1.0), 35)
    # Cascamorras: harlequin figure running with a big flag, chased by oil-blackened locals
    harl = bpy.data.materials.new('harlequin')
    ns, ls = lib.nodes(harl)
    b = ns.get('Principled BSDF')
    tc = ns.new('ShaderNodeTexCoord')
    mp = ns.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, 0, math.pi / 4); mp.inputs['Scale'].default_value = (7, 7, 7)
    ck = ns.new('ShaderNodeTexChecker'); ck.inputs['Color1'].default_value = (0.75, 0.05, 0.03, 1); ck.inputs['Color2'].default_value = (0.95, 0.7, 0.05, 1)
    ls.new(tc.outputs['Object'], mp.inputs['Vector']); ls.new(mp.outputs[0], ck.inputs['Vector']); ls.new(ck.outputs['Color'], b.inputs['Base Color'])
    cmx, cmy, _ = pos(12, 22)
    cas = metaball('cascamorras', [
        ('ELLIPSOID', (0, 0, 1.15), 0.45, (0.45, 0.35, 0.6)),
        ('BALL', (0.05, 0, 1.75), 0.2, None),
        ('ELLIPSOID', (-0.25, 0.05, 0.5), 0.2, (0.25, 0.25, 0.55)), ('ELLIPSOID', (0.28, 0.15, 0.45), 0.2, (0.25, 0.25, 0.55)),
        ('ELLIPSOID', (0.35, 0, 1.45), 0.15, (0.2, 0.2, 0.45)), ('ELLIPSOID', (-0.35, 0, 1.3), 0.15, (0.2, 0.2, 0.4)),
    ], harl, res=0.04)
    place(cas, (cmx, cmy, 0), rot_z=-20, scale=1.15)
    pole_top = (cmx + 1.0, cmy + 0.25, 4.6)
    lib.rod('cas_pole', (cmx + 0.45, cmy, 1.7), pole_top, 0.04, mat=lib.mat_principled('pole', (0.4, 0.3, 0.2), rough=0.6))
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=28, y_subdivisions=14, size=1, location=(pole_top[0] + 1.1, pole_top[1] + 0.2, pole_top[2] - 0.6),
                                    rotation=(math.pi / 2, 0, -0.35))
    flag = bpy.context.active_object
    flag.name = 'cas_flag'
    flag.scale = (2.2, 1.3, 1)
    wv = flag.modifiers.new('wave', 'WAVE'); wv.height = 0.25; wv.width = 0.9; wv.narrowness = 1.2
    fm = bpy.data.materials.new('flag')
    ns, ls = lib.nodes(fm)
    b = ns.get('Principled BSDF')
    tc = ns.new('ShaderNodeTexCoord')
    mp = ns.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, 0, math.pi / 4); mp.inputs['Scale'].default_value = (5, 5, 5)
    ck = ns.new('ShaderNodeTexChecker'); ck.inputs['Color1'].default_value = (0.8, 0.05, 0.03, 1); ck.inputs['Color2'].default_value = (0.95, 0.75, 0.1, 1)
    ls.new(tc.outputs['UV'], mp.inputs['Vector']); ls.new(mp.outputs[0], ck.inputs['Vector']); ls.new(ck.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.7
    flag.data.materials.append(fm)
    oil = lib.mat_principled('oil', (0.01, 0.01, 0.01), rough=0.12, coat=0.9)
    R = lib.rand(17)
    for i in range(10):
        az, d = R.uniform(14, 30), R.uniform(25, 34)
        x, y, _ = pos(az, d)
        f = metaball(f'crowd{i}', [('ELLIPSOID', (0, 0, 1.1), 0.42, (0.4, 0.32, 0.65)), ('BALL', (0, 0, 1.75), 0.2, None),
                                   ('ELLIPSOID', (0, 0, 0.45), 0.25, (0.3, 0.25, 0.55)),
                                   ('ELLIPSOID', (0.3, 0, 1.6), 0.13, (0.2, 0.2, 0.5))], oil, res=0.05)
        place(f, (x, y, 0), rot_z=R.uniform(-70, -10), scale=R.uniform(1.0, 1.15))
    spot('cas_key', (cmx - 5, cmy - 7, 8), (cmx + 1, cmy, 2.5), 5000, kelvin(3300), 40)
    spot('cas_rim', (cmx + 4, cmy + 6, 6), (cmx + 1, cmy, 2.5), 2500, (0.6, 0.7, 1.0), 45)
    cols = [(1, 0.2, 0.1), (1, 0.75, 0.2), (0.2, 0.8, 0.3), (0.3, 0.5, 1.0)]
    bulb_string('lights_a', pos(-45, 26, 9.5), pos(40, 28, 9.5), 1.2, 40, cols)
    bulb_string('lights_b', pos(-40, 44, 11), pos(38, 48, 11), 1.5, 36, cols)


BUILD = {'baza': baza, 'granada': granada, 'madrid': madrid, 'barcelona': barcelona}
CAM_Z = {'baza': 2.5, 'granada': 40, 'madrid': 2.5, 'barcelona': 30}

for city in CITIES:
    lib.reset()
    BUILD[city]()
    camera(CAM_Z[city])
    s = lib.cycles(samples=SPP, w=RES[0], h=RES[1], bounces=4)
    s.view_settings.exposure = 0.3
    path = os.path.join(lib.OUT if FAST else os.path.join(lib.PUBLIC, 'textures'), f'window-{city}.jpg')
    lib.render_still(path, quality=86)
