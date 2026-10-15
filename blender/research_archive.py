"""Direction B — The Research Archive.

A retro-futurist scientific archive: an aisle of index-card cabinets in haze,
hanging lamps, a film trolley, and a console of CRTs under a tall window.
Rendered as pre-rendered "plates" (Cycles + volumetrics) plus a depth plate per
view, used in the browser for 2.5D parallax. Hotspot and screen positions are
projected from 3D and saved as JSON so the web layer lines up exactly.

Usage:  /opt/bpyenv/bin/python blender/research_archive.py [--fast] [--samples N] [--only hall|console]
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

import lib  # noqa: E402
from lib import box, cyl, cone, sphere, plane, join, kelvin  # noqa: E402

ARGS = sys.argv[1:]
FAST = '--fast' in ARGS
SAMPLES = int(ARGS[ARGS.index('--samples') + 1]) if '--samples' in ARGS else (16 if FAST else 96)
ONLY = ARGS[ARGS.index('--only') + 1] if '--only' in ARGS else None
RES = (800, 450) if FAST else (1920, 1080)

scn = lib.reset()
R = lib.rand(21)

M = {
    'cabinet': lib.mat_wood('cabinet', (0.05, 0.035, 0.02), (0.11, 0.07, 0.035), scale=5, rough=0.35, stretch=(1, 1, 7)),
    'front': lib.mat_wood('front', (0.07, 0.045, 0.025), (0.15, 0.09, 0.045), scale=7, rough=0.3, stretch=(1, 6, 1)),
    'brass': lib.mat_principled('brass', (0.75, 0.52, 0.22), rough=0.28, metal=1.0),
    'card': lib.mat_principled('card', (0.85, 0.8, 0.68), rough=0.8),
    'floor': lib.mat_noise('floor', (0.035, 0.04, 0.04), (0.07, 0.075, 0.07), scale=8, rough=0.18, bump=0.02),
    'wall': lib.mat_noise('wall', (0.05, 0.08, 0.075), (0.08, 0.11, 0.1), scale=15, rough=0.9, bump=0.1),
    'ceiling': lib.mat_principled('ceiling', (0.02, 0.025, 0.025), rough=0.9),
    'green_metal': lib.mat_principled('green_metal', (0.04, 0.12, 0.1), rough=0.35, metal=0.6),
    'black': lib.mat_principled('black', (0.012, 0.012, 0.012), rough=0.4),
    'beige': lib.mat_principled('beige', (0.55, 0.5, 0.4), rough=0.45),
    'steel': lib.mat_principled('steel', (0.5, 0.52, 0.53), rough=0.25, metal=1.0),
    'film': lib.mat_principled('film', (0.03, 0.02, 0.015), rough=0.2),
    'reel': lib.mat_principled('reel', (0.55, 0.56, 0.58), rough=0.3, metal=1.0),
    'bulb': lib.mat_emission('bulb', kelvin(3200), 40),
    'lighttable': lib.mat_emission('lighttable', (0.85, 0.95, 1.0), 3.0),
}


def crt_material(name, color, strength=2.2, seed=0.0):
    m = bpy.data.materials.new(name)
    ns, ls = lib.nodes(m)
    ns.clear()
    out = ns.new('ShaderNodeOutputMaterial')
    tc = ns.new('ShaderNodeTexCoord')
    mp = ns.new('ShaderNodeMapping'); mp.inputs['Location'].default_value = (seed, seed * 0.37, 0)
    ls.new(tc.outputs['UV'], mp.inputs['Vector'])
    br = ns.new('ShaderNodeTexBrick')
    br.inputs['Scale'].default_value = 6.0
    br.inputs['Brick Width'].default_value = 0.5
    br.inputs['Row Height'].default_value = 0.1
    br.inputs['Mortar Size'].default_value = 0.04
    br.inputs['Color1'].default_value = (0.0, 0.0, 0.0, 1)
    br.inputs['Color2'].default_value = (1, 1, 1, 1)
    br.inputs['Mortar'].default_value = (0, 0, 0, 1)
    br.inputs['Bias'].default_value = 0.3
    ls.new(mp.outputs[0], br.inputs['Vector'])
    wv = ns.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'Y'
    wv.inputs['Scale'].default_value = 60
    ls.new(tc.outputs['UV'], wv.inputs['Vector'])
    mx = ns.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
    mx.inputs['Factor'].default_value = 0.35
    ls.new(br.outputs['Color'], mx.inputs['A']); ls.new(wv.outputs['Color'], mx.inputs['B'])
    tint = ns.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1.0
    tint.inputs['B'].default_value = (*color, 1)
    ls.new(mx.outputs['Result'], tint.inputs['A'])
    add = ns.new('ShaderNodeMix'); add.data_type = 'RGBA'; add.blend_type = 'ADD'; add.inputs['Factor'].default_value = 1
    add.inputs['B'].default_value = (color[0] * 0.12, color[1] * 0.12, color[2] * 0.12, 1)
    ls.new(tint.outputs['Result'], add.inputs['A'])
    em = ns.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = strength
    ls.new(add.outputs['Result'], em.inputs['Color']); ls.new(em.outputs[0], out.inputs[0])
    return m


AMBER = (1.0, 0.55, 0.12)
PHOSPHOR = (0.35, 1.0, 0.55)

# ------------------------------------------------------------------ architecture
L0, L1, HW, HH = -1.5, 14.0, 2.0, 5.2   # aisle length range, half width, height
WALL_END = 13.6
plane('floor', (2 * HW + 2, L1 - L0), (0, (L0 + L1) / 2, 0), mat=M['floor'])
plane('ceiling', (2 * HW + 2, L1 - L0), (0, (L0 + L1) / 2, HH), rot=(math.pi, 0, 0), mat=M['ceiling'])
for s in (-1, 1):
    box(f'wall{s}', (0.2, L1 - L0, HH), (s * (HW + 0.1), (L0 + L1) / 2, HH / 2), mat=M['wall'])
# end wall with a tall window opening (x -0.7..0.7, z 1.9..4.6)
WX, WZ0, WZ1 = 0.7, 1.9, 4.6
box('end_l', (HW - WX, 0.3, HH), (-(HW + WX) / 2, WALL_END + 0.15, HH / 2), mat=M['wall'])
box('end_r', (HW - WX, 0.3, HH), ((HW + WX) / 2, WALL_END + 0.15, HH / 2), mat=M['wall'])
box('end_b', (2 * WX, 0.3, WZ0), (0, WALL_END + 0.15, WZ0 / 2), mat=M['wall'])
box('end_t', (2 * WX, 0.3, HH - WZ1), (0, WALL_END + 0.15, (WZ1 + HH) / 2), mat=M['wall'])
mull = []
for xx in (-WX + 0.02, -0.233, 0.233, WX - 0.02):
    mull.append(box('wm', (0.04, 0.06, WZ1 - WZ0), (xx, WALL_END + 0.25, (WZ0 + WZ1) / 2), mat=M['black']))
for zz in (WZ0 + 0.02, 2.8, 3.7, WZ1 - 0.02):
    mull.append(box('wm', (2 * WX, 0.06, 0.04), (0, WALL_END + 0.25, zz), mat=M['black']))
join('window', mull)
# back wall behind camera
box('wall_back', (2 * HW, 0.2, HH), (0, L0 - 0.1, HH / 2), mat=M['wall'])

# ------------------------------------------------------------------ cabinet walls of drawers (array modifiers)
CAB_X, ROWS, DW, DH, Y0, Y1 = 1.62, 8, 0.44, 0.38, -1.2, 11.8
COLS = int((Y1 - Y0) / DW)
for s in (-1, 1):
    face = CAB_X - 0.32
    box(f'cab{s}', (0.64, Y1 - Y0, ROWS * DH + 0.3), (s * CAB_X, (Y0 + Y1) / 2, (ROWS * DH + 0.3) / 2 + 0.05), mat=M['cabinet'])
    box(f'cab_top{s}', (0.7, Y1 - Y0 + 0.04, 0.06), (s * CAB_X, (Y0 + Y1) / 2, ROWS * DH + 0.38), mat=M['cabinet'], bevel=0.01)
    parts = [box('front', (0.03, DW - 0.03, DH - 0.03), (s * (face - 0.015), Y0 + DW / 2, 0.25 + DH / 2), mat=M['front'], bevel=0.006),
             box('label', (0.006, 0.12, 0.05), (s * (face - 0.032), Y0 + DW / 2, 0.25 + DH / 2 + 0.08), mat=M['brass']),
             box('label_card', (0.002, 0.1, 0.035), (s * (face - 0.036), Y0 + DW / 2, 0.25 + DH / 2 + 0.08), mat=M['card']),
             cyl('pull', 0.012, 0.11, (s * (face - 0.045), Y0 + DW / 2, 0.25 + DH / 2 - 0.05), rot=(math.pi / 2, 0, 0), mat=M['brass'])]
    unit = join(f'drawers{s}', parts)
    a1 = unit.modifiers.new('cols', 'ARRAY'); a1.use_relative_offset = False; a1.use_constant_offset = True
    a1.constant_offset_displace = (0, DW, 0); a1.count = COLS
    a2 = unit.modifiers.new('rows', 'ARRAY'); a2.use_relative_offset = False; a2.use_constant_offset = True
    a2.constant_offset_displace = (0, 0, DH); a2.count = ROWS
# one drawer pulled open on the left, with index cards — the "current record"
OPEN = Vector((-(CAB_X - 0.32) + 0.22, Y0 + DW * 7.5, 0.25 + DH * 3.5))
dr = [box('od_front', (0.03, DW - 0.03, DH - 0.03), (OPEN.x + 0.2, OPEN.y, OPEN.z), mat=M['front'], bevel=0.006),
      box('od_l', (0.42, 0.012, DH - 0.12), (OPEN.x, OPEN.y - DW / 2 + 0.03, OPEN.z - 0.04), mat=M['front']),
      box('od_r', (0.42, 0.012, DH - 0.12), (OPEN.x, OPEN.y + DW / 2 - 0.03, OPEN.z - 0.04), mat=M['front']),
      box('od_b', (0.42, DW - 0.05, 0.012), (OPEN.x, OPEN.y, OPEN.z - 0.15), mat=M['front']),
      box('od_label', (0.006, 0.12, 0.05), (OPEN.x + 0.218, OPEN.y, OPEN.z + 0.08), mat=M['brass'])]
for i in range(22):
    dr.append(box('idx', (0.003, DW - 0.09, 0.2 + (0.03 if i % 5 == 0 else 0)), (OPEN.x - 0.18 + i * 0.016, OPEN.y, OPEN.z - 0.05),
                  rot=(0, -0.25 + R.uniform(-0.05, 0.05), 0), mat=M['card']))
join('open_drawer', dr)

# ------------------------------------------------------------------ rolling library ladder (right side)
ly = 5.2
lad = [lib.rod('rail', (CAB_X - 0.4 - 1.0, ly + s_, 0.02), (CAB_X - 0.42, ly + s_, 3.3), 0.018, mat=M['brass']) for s_ in (-0.22, 0.22)]
for i in range(10):
    f = (i + 0.5) / 10
    lad.append(lib.rod('rung', (CAB_X - 1.4 + f * 0.98, ly - 0.22, 0.02 + f * 3.28), (CAB_X - 1.4 + f * 0.98, ly + 0.22, 0.02 + f * 3.28),
                       0.012, mat=M['brass']))
lad.append(cyl('hookrail', 0.015, Y1 - Y0, (CAB_X - 0.4, (Y0 + Y1) / 2, 3.35), rot=(math.pi / 2, 0, 0), mat=M['brass']))
join('ladder', lad)

# ------------------------------------------------------------------ film trolley (left aisle)
tx, ty = -0.62, 7.4
tro = [box('tray', (0.5, 0.8, 0.02), (tx, ty, z), mat=M['green_metal'], bevel=0.005) for z in (0.25, 0.85)]
for sx in (-0.23, 0.23):
    for sy in (-0.38, 0.38):
        tro.append(cyl('post', 0.012, 0.85, (tx + sx, ty + sy, 0.45), mat=M['steel']))
        tro.append(sphere('wheel', 0.03, (tx + sx, ty + sy, 0.03), mat=M['black']))
for k in range(7):
    zz = 0.87 + k * 0.026
    tro.append(cyl('reel', 0.17 - (k % 2) * 0.01, 0.022, (tx + R.uniform(-0.02, 0.02), ty - 0.15 + R.uniform(-0.02, 0.02), zz), mat=M['reel']))
    tro.append(cyl('filmwind', 0.11, 0.018, (tx, ty - 0.15, zz + 0.003), mat=M['film']))
for k in range(4):
    tro.append(cyl('can', 0.16, 0.035, (tx, ty + 0.22, 0.29 + k * 0.04), mat=M['reel']))
join('film_trolley', tro)

# ------------------------------------------------------------------ console with CRTs
CY = 12.75
con = [box('console', (2.6, 0.85, 0.8), (0, CY, 0.4), mat=M['green_metal'], bevel=0.02),
       box('console_top', (2.7, 0.95, 0.04), (0, CY, 0.82), mat=M['black'], bevel=0.01),
       box('kbd', (0.5, 0.18, 0.03), (0, CY - 0.28, 0.855), rot=(0.08, 0, 0), mat=M['beige'], bevel=0.008)]
for i in range(40):
    con.append(box('key', (0.028, 0.026, 0.01), (-0.22 + (i % 14) * 0.033, CY - 0.33 + (i // 14) * 0.032, 0.875), mat=M['beige']))
for i in range(6):  # toggle switches + indicator lamps
    con.append(cyl('tgl', 0.01, 0.04, (0.6 + i * 0.07, CY - 0.36, 0.86), mat=M['steel']))
join('console', con)
lamps_ind = []
for i in range(6):
    lamps_ind.append(sphere('ind', 0.012, (0.6 + i * 0.07, CY - 0.3, 0.85), mat=lib.mat_emission(f'ind{i}', AMBER if i % 3 else (1, 0.15, 0.08), 8)))
SCREENS = {}
for name, x, rotz, col in (('crt_left', -0.85, 0.35, PHOSPHOR), ('crt_main', 0.0, 0.0, AMBER), ('crt_right', 0.85, -0.35, AMBER)):
    c = Vector((x, CY + 0.05, 1.12))
    body = box(f'{name}_body', (0.5, 0.48, 0.44), (c.x, c.y + 0.1, c.z), mat=M['beige'], bevel=0.04, segments=3)
    back = box(f'{name}_back', (0.36, 0.3, 0.3), (c.x, c.y + 0.42, c.z - 0.02), mat=M['beige'], bevel=0.04)
    bez = box(f'{name}_bezel', (0.42, 0.02, 0.34), (c.x, c.y - 0.15, c.z + 0.01), mat=M['black'], bevel=0.02)
    o = join(f'{name}_housing', [body, back, bez])
    scr = plane(f'{name}_screen', (0.36, 0.28), (c.x, c.y - 0.162, c.z + 0.01), rot=(math.pi / 2, 0, 0),
                mat=crt_material(f'{name}_mat', col, seed=x * 3))
    pivot = o.location.copy()  # rotate housing + screen together around the housing origin
    for ob in (o, scr):
        off = ob.location - pivot
        off.rotate(Euler((0, 0, rotz)))
        ob.location = pivot + off
        ob.rotation_euler.z += rotz
    SCREENS[name] = scr
    lib.light(f'{name}_glow', 'AREA', (c.x, c.y - 0.3, c.z), 4, col, size=(0.35, 0.28)).rotation_euler = (math.pi / 2, 0, rotz)

# light table + slides on the right of the console
lt = [box('lt_body', (0.7, 0.5, 0.06), (1.35, 11.9, 0.86), rot=(0.25, 0, -0.2), mat=M['black'], bevel=0.01)]
join('lt', lt)
plane('lt_glass', (0.62, 0.42), (1.35, 11.9 - 0.008, 0.893), rot=(0.25, 0, -0.2), mat=M['lighttable'])

# ------------------------------------------------------------------ hanging lamps
HANG = [1.8, 4.6, 7.4, 10.2]
for i, y in enumerate(HANG):
    z = 3.25
    join(f'lamp{i}', [cyl('cord', 0.006, HH - z - 0.15, (0, y, (HH + z) / 2 + 0.07), mat=M['black']),
                      cone('shade', 0.28, 0.05, 0.22, (0, y, z), mat=M['green_metal'])])
    sphere(f'bulb{i}', 0.045, (0, y, z - 0.08), mat=M['bulb'])
    sp = lib.light(f'spot{i}', 'SPOT', (0, y, z - 0.1), 380, kelvin(3200), size=0.05, spot=70, blend=0.45)
    sp.rotation_euler = (0, 0, 0)  # spot lights point down -Z by default

# ------------------------------------------------------------------ atmosphere: moonlight through window + haze
moon = lib.light('moon', 'AREA', (0, WALL_END + 1.2, 3.9), 900, (0.45, 0.6, 1.0), size=(1.5, 2.8))
lib.look_at(moon, (0.4, 6.0, 0.0))
lib.light('sky_fill', 'AREA', (0, WALL_END + 0.5, 3.25), 60, (0.4, 0.55, 0.9), size=(1.4, 2.7)).rotation_euler = (math.pi / 2, 0, 0)
lib.world((0.01, 0.015, 0.03), (0.02, 0.03, 0.05), strength=0.4)
haze = box('haze', (2 * HW - 0.02, L1 - L0 - 0.02, HH - 0.02), (0, (L0 + L1) / 2, HH / 2))
hm = bpy.data.materials.new('haze')
ns, ls = lib.nodes(hm)
ns.clear()
vol = ns.new('ShaderNodeVolumePrincipled')
vol.inputs['Density'].default_value = 0.035
vol.inputs['Anisotropy'].default_value = 0.45
vol.inputs['Color'].default_value = (0.75, 0.85, 0.85, 1)
out = ns.new('ShaderNodeOutputMaterial')
ls.new(vol.outputs[0], out.inputs['Volume'])
haze.data.materials.append(hm)

# ------------------------------------------------------------------ plates
PLATES = {
    'hall': dict(loc=(0.42, -0.9, 1.62), tgt=(-0.05, 12.0, 1.45), lens=26,
                 spots={'drawers': OPEN + Vector((0.2, 0, 0.05)), 'console': Vector((0, CY - 0.1, 1.15)),
                        'trolley': Vector((tx, ty, 1.0)), 'ladder': Vector((CAB_X - 0.9, ly, 1.6)),
                        'window': Vector((0, WALL_END, 3.3))}),
    'console': dict(loc=(0.12, 11.05, 1.42), tgt=(0.0, CY, 1.08), lens=32,
                    spots={'lighttable': Vector((1.35, 11.9, 0.9)), 'crt_left': Vector((-0.85, CY - 0.1, 1.12))}),
}


def project(cam, p):
    v = world_to_camera_view(scn, cam, Vector(p))
    return [round(v.x, 4), round(1 - v.y, 4)]  # image space, origin top-left


def depth_material():
    m = bpy.data.materials.new('depth')
    ns, ls = lib.nodes(m)
    ns.clear()
    cam = ns.new('ShaderNodeCameraData')
    mr = ns.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.3
    mr.inputs['From Max'].default_value = 16.0
    mr.inputs['To Min'].default_value = 1.0   # near = white
    mr.inputs['To Max'].default_value = 0.0
    em = ns.new('ShaderNodeEmission')
    out = ns.new('ShaderNodeOutputMaterial')
    ls.new(cam.outputs['View Distance'], mr.inputs['Value'])
    ls.new(mr.outputs['Result'], em.inputs['Color'])
    ls.new(em.outputs[0], out.inputs['Surface'])
    return m


meta = {}
outdir = os.path.join(lib.PUBLIC if not FAST else lib.OUT, 'renders')
os.makedirs(outdir, exist_ok=True)
for name, p in PLATES.items():
    if ONLY and name != ONLY:
        continue
    cam = lib.camera(f'cam_{name}', p['loc'], p['tgt'], lens=p['lens'])
    lib.cycles(samples=SAMPLES, w=RES[0], h=RES[1], bounces=6)
    scn.cycles.volume_bounces = 1
    scn.cycles.volume_step_rate = 4.0 if FAST else 2.0
    lib.render_still(os.path.join(outdir, f'archive-{name}.jpg'), quality=86)
    # depth plate (no haze, emission override, 1 spp)
    haze.hide_render = True
    scn.view_layers[0].material_override = depth_material()
    scn.cycles.samples = 2
    scn.cycles.use_denoising = False
    vt, look, ex = scn.view_settings.view_transform, scn.view_settings.look, scn.view_settings.exposure
    scn.view_settings.view_transform, scn.view_settings.look, scn.view_settings.exposure = 'Standard', 'None', 0
    scn.render.resolution_x, scn.render.resolution_y = RES[0] // 2, RES[1] // 2
    lib.render_still(os.path.join(outdir, f'archive-{name}-depth.jpg'), quality=90)
    scn.view_layers[0].material_override = None
    scn.view_settings.view_transform, scn.view_settings.look, scn.view_settings.exposure = vt, look, ex
    haze.hide_render = False
    scr = {}
    for sname, so in SCREENS.items():
        mw = so.matrix_world
        corners = [mw @ Vector(v.co) for v in so.data.vertices]  # plane order: (-,-) (+,-) (-,+) (+,+)
        scr[sname] = [project(cam, c) for c in corners]
    meta[name] = {'spots': {k: project(cam, v) for k, v in p['spots'].items()}, 'screens': scr, 'aspect': RES[0] / RES[1]}

if not FAST:
    path = os.path.join(lib.PUBLIC, 'renders', 'archive-plates.json')
    old = json.load(open(path)) if os.path.exists(path) else {}
    old.update(meta)
    json.dump(old, open(path, 'w'), indent=1)
lib.log('meta', json.dumps(meta)[:400])
