"""Direction A — The Signal Room.

A night-time research workspace in a Barcelona attic, generated procedurally.
Steps (all by default):
    render  — Cycles hero still → public/assets/renders/signal-room-hero.jpg
    bake    — bake lighting into two lightmap atlases (room shell + props)
    export  — GLB with lightmap UVs → public/assets/models/signal-room.glb
Usage:
    /opt/bpyenv/bin/python blender/signal_room.py [render] [bake] [export] [--samples N] [--fast]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402

import lib  # noqa: E402
from lib import box, cyl, cone, sphere, torus, plane, text, join, kelvin  # noqa: E402

ARGS = sys.argv[1:]
STEPS = [a for a in ARGS if not a.startswith('--') and not a.isdigit()] or ['render', 'bake', 'export']
FAST = '--fast' in ARGS
SAMPLES = int(ARGS[ARGS.index('--samples') + 1]) if '--samples' in ARGS else (24 if FAST else 128)

W, D0, D1, H = 2.2, -2.0, 1.8, 2.8      # room half-width, front y, back y, height
WIN = (-1.3, 1.3, 1.0, 2.45)            # window opening x0, x1, z0, z1
DESK_Z = 0.76

scn = lib.reset()
R = lib.rand(7)

# ------------------------------------------------------------------ materials
M = {
    'plaster': lib.mat_noise('plaster', (0.62, 0.57, 0.5), (0.72, 0.67, 0.6), scale=60, rough=0.9, bump=0.05),
    'ceiling': lib.mat_noise('ceiling', (0.55, 0.52, 0.48), (0.62, 0.6, 0.55), scale=30, rough=0.95, bump=0.03),
    'floor': lib.mat_wood('floor', (0.16, 0.08, 0.04), (0.28, 0.15, 0.07), scale=3, rough=0.35, stretch=(0.6, 6, 1)),
    'desk': lib.mat_wood('desk', (0.22, 0.11, 0.05), (0.40, 0.22, 0.10), scale=4, rough=0.3, stretch=(6, 0.7, 1)),
    'frame': lib.mat_principled('frame', (0.05, 0.06, 0.06), rough=0.4, metal=0.3),
    'sill': lib.mat_noise('sill', (0.55, 0.53, 0.5), (0.7, 0.68, 0.64), scale=25, rough=0.5, bump=0.05),
    'black': lib.mat_principled('black', (0.015, 0.015, 0.017), rough=0.35),
    'enamel': lib.mat_principled('enamel', (0.78, 0.76, 0.7), rough=0.25, coat=0.4),
    'steel': lib.mat_principled('steel', (0.55, 0.56, 0.58), rough=0.3, metal=0.8),
    'brass': lib.mat_principled('brass', (0.7, 0.48, 0.2), rough=0.3, metal=0.8),
    'paper': lib.mat_noise('paper', (0.82, 0.78, 0.68), (0.9, 0.86, 0.76), scale=200, rough=0.9, bump=0.02),
    'ink': lib.mat_principled('ink', (0.05, 0.06, 0.12), rough=0.6),
    'accent': lib.mat_principled('accent', (0.75, 0.12, 0.08), rough=0.4),
    'teal': lib.mat_principled('teal', (0.05, 0.35, 0.38), rough=0.4),
    'screen': None,  # built below
    'bulb': lib.mat_emission('bulb', kelvin(2700), 30),
    'leaf': lib.mat_principled('leaf', (0.05, 0.16, 0.05), rough=0.5),
    'pot': lib.mat_noise('pot', (0.45, 0.2, 0.12), (0.55, 0.27, 0.16), scale=30, rough=0.8),
    'iron': lib.mat_principled('iron', (0.03, 0.03, 0.03), rough=0.55, metal=0.6),
    'ocean': lib.mat_principled('ocean', (0.06, 0.18, 0.3), rough=0.35, coat=0.6),
    'mug': lib.mat_principled('mug', (0.85, 0.82, 0.75), rough=0.2, coat=0.5),
}
def screen_material():
    m = lib.bpy.data.materials.new('screen')
    ns, ls = lib.nodes(m)
    ns.clear()
    out = ns.new('ShaderNodeOutputMaterial')
    tc = ns.new('ShaderNodeTexCoord')
    br = ns.new('ShaderNodeTexBrick')
    br.inputs['Scale'].default_value = 9.0
    br.inputs['Brick Width'].default_value = 0.6
    br.inputs['Row Height'].default_value = 0.12
    br.inputs['Mortar Size'].default_value = 0.03
    br.inputs['Color1'].default_value = (0.05, 0.25, 0.35, 1)
    br.inputs['Color2'].default_value = (0.5, 0.75, 0.9, 1)
    br.inputs['Mortar'].default_value = (0.01, 0.02, 0.04, 1)
    ls.new(tc.outputs['UV'], br.inputs['Vector'])
    em = ns.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 0.9
    ls.new(br.outputs['Color'], em.inputs['Color']); ls.new(em.outputs[0], out.inputs[0])
    return m


M['screen'] = screen_material()
BOOK_COLS = [(0.35, 0.08, 0.06), (0.06, 0.12, 0.25), (0.6, 0.45, 0.2), (0.12, 0.2, 0.12), (0.7, 0.66, 0.58),
             (0.08, 0.08, 0.08), (0.55, 0.2, 0.08), (0.2, 0.3, 0.4)]
BOOK_MATS = [lib.mat_principled(f'book{i}', c, rough=0.6) for i, c in enumerate(BOOK_COLS)]

shell, props, interactive = [], [], {}

# ------------------------------------------------------------------ room shell
x0, x1, z0, z1 = WIN
T = 0.18  # wall thickness
shell += [
    plane('floor', (2 * W, D1 - D0), (0, (D0 + D1) / 2, 0), mat=M['floor']),
    plane('ceiling', (2 * W, D1 - D0), (0, (D0 + D1) / 2, H), rot=(math.pi, 0, 0), mat=M['ceiling']),
    box('wall_L', (T, D1 - D0, H), (-W - T / 2, (D0 + D1) / 2, H / 2), mat=M['plaster']),
    box('wall_R', (T, D1 - D0, H), (W + T / 2, (D0 + D1) / 2, H / 2), mat=M['plaster']),
    box('wall_F', (2 * W, T, H), (0, D0 - T / 2, H / 2), mat=M['plaster']),
    # back wall built around the window opening
    box('wallB_l', (x0 + W, T, H), ((-W + x0) / 2, D1 + T / 2, H / 2), mat=M['plaster']),
    box('wallB_r', (W - x1, T, H), ((x1 + W) / 2, D1 + T / 2, H / 2), mat=M['plaster']),
    box('wallB_b', (x1 - x0, T, z0), (0, D1 + T / 2, z0 / 2), mat=M['plaster']),
    box('wallB_t', (x1 - x0, T, H - z1), (0, D1 + T / 2, (z1 + H) / 2), mat=M['plaster']),
    box('sill', (x1 - x0 + 0.12, T + 0.08, 0.04), (0, D1 + 0.02, z0 - 0.02), mat=M['sill'], bevel=0.008),
    box('skirting', (2 * W, 0.02, 0.09), (0, D1 - 0.01, 0.045), mat=M['plaster']),
]
# steel window frame + mullions (Barcelona balcony-door style)
fr = []
for xx in (x0 + 0.03, 0, x1 - 0.03):
    fr.append(box('mull_v', (0.05, 0.06, z1 - z0), (xx, D1 + 0.08, (z0 + z1) / 2), mat=M['frame']))
for zz in (z0 + 0.03, z0 + (z1 - z0) * 0.72, z1 - 0.03):
    fr.append(box('mull_h', (x1 - x0, 0.06, 0.05), (0, D1 + 0.08, zz), mat=M['frame']))
shell.append(join('window_frame', fr))
# exposed ceiling beams (typical Catalan "volta" attic)
for i, yy in enumerate((-1.2, 0.0, 1.2)):
    shell.append(box(f'beam{i}', (2 * W, 0.16, 0.2), (0, yy, H - 0.1), mat=M['desk'], bevel=0.01))

# ------------------------------------------------------------------ desk
desk_parts = [box('desktop', (2.3, 0.78, 0.04), (0, 1.33, DESK_Z - 0.02), mat=M['desk'], bevel=0.006)]
for sx in (-1.08, 1.08):
    for sy in (1.0, 1.66):
        desk_parts.append(box('leg', (0.04, 0.04, DESK_Z - 0.04), (sx, sy, (DESK_Z - 0.04) / 2), mat=M['iron']))
    desk_parts.append(box('rail', (0.03, 0.66, 0.03), (sx, 1.33, 0.12), mat=M['iron']))
props.append(join('desk', desk_parts))

# ------------------------------------------------------------------ computer (monitor + keyboard)
mx, my = 0.1, 1.5
mon = [
    box('mon_body', (0.66, 0.035, 0.40), (mx, my, DESK_Z + 0.36), mat=M['black'], bevel=0.008),
    box('mon_neck', (0.05, 0.03, 0.2), (mx, my + 0.05, DESK_Z + 0.12), mat=M['steel']),
    box('mon_foot', (0.24, 0.17, 0.012), (mx, my + 0.02, DESK_Z + 0.006), mat=M['steel'], bevel=0.004),
    box('kbd', (0.42, 0.13, 0.018), (mx, 1.12, DESK_Z + 0.009), mat=M['enamel'], bevel=0.004),
]
for r_ in range(4):
    for c in range(13):
        mon.append(box('key', (0.024, 0.022, 0.008), (mx - 0.18 + c * 0.03, 1.08 + r_ * 0.028, DESK_Z + 0.021),
                       mat=M['enamel']))
mon.append(box('mouse', (0.06, 0.1, 0.025), (mx + 0.34, 1.13, DESK_Z + 0.012), mat=M['black'], bevel=0.012))
interactive['computer'] = join('computer', mon)
# screen kept separate: in the web build it becomes a live canvas texture
screen = plane('screen', (0.62, 0.36), (mx, my - 0.019, DESK_Z + 0.37), rot=(math.pi / 2, 0, 0), mat=M['screen'])

# ------------------------------------------------------------------ microscope (upright, cream enamel + black)
ux, uy = -0.72, 1.38
mic = [
    box('mic_base', (0.22, 0.3, 0.05), (ux, uy + 0.02, DESK_Z + 0.025), mat=M['enamel'], bevel=0.015),
    box('mic_pillar', (0.07, 0.08, 0.36), (ux, uy + 0.12, DESK_Z + 0.22), mat=M['enamel'], bevel=0.02),
    box('mic_arm', (0.07, 0.22, 0.07), (ux, uy + 0.03, DESK_Z + 0.42), mat=M['enamel'], bevel=0.02),
    box('mic_stage', (0.16, 0.14, 0.015), (ux, uy - 0.02, DESK_Z + 0.17), mat=M['black'], bevel=0.003),
    box('mic_slide', (0.075, 0.025, 0.002), (ux, uy - 0.03, DESK_Z + 0.179), mat=M['paper']),
    cyl('mic_turret', 0.045, 0.03, (ux, uy - 0.04, DESK_Z + 0.36), mat=M['black']),
    cyl('mic_head', 0.04, 0.12, (ux, uy - 0.05, DESK_Z + 0.46), rot=(math.radians(-25), 0, 0), mat=M['enamel']),
    cyl('mic_knob_l', 0.035, 0.03, (ux - 0.05, uy + 0.12, DESK_Z + 0.12), rot=(0, math.pi / 2, 0), mat=M['black']),
    cyl('mic_knob_r', 0.035, 0.03, (ux + 0.05, uy + 0.12, DESK_Z + 0.12), rot=(0, math.pi / 2, 0), mat=M['black']),
    cyl('mic_lamp', 0.03, 0.02, (ux, uy - 0.02, DESK_Z + 0.06), mat=M['steel']),
]
for i, ang in enumerate((-20, 0, 25)):
    a = math.radians(ang)
    mic.append(cyl(f'mic_obj{i}', 0.012, 0.07, (ux + 0.03 * math.sin(a), uy - 0.04 + 0.02 * math.cos(a), DESK_Z + 0.32),
                   mat=M['steel']))
for sx in (-0.022, 0.022):
    mic.append(cyl('mic_eye', 0.014, 0.1, (ux + sx, uy - 0.1, DESK_Z + 0.55), rot=(math.radians(-35), 0, 0), mat=M['black']))
interactive['microscope'] = join('microscope', mic)

# ------------------------------------------------------------------ research notebook (open) + pen
nx, ny = 0.72, 1.18
nb = [box('nb_cover', (0.44, 0.3, 0.008), (nx, ny, DESK_Z + 0.004), rot=(0, 0, 0.08), mat=M['ink'], bevel=0.002)]
for side in (-1, 1):
    nb.append(box('nb_page', (0.205, 0.285, 0.008), (nx + side * 0.106 * math.cos(0.08) - 0.0, ny + side * 0.106 * math.sin(0.08),
                  DESK_Z + 0.011 + 0.003 * (side + 1)), rot=(0, side * -0.04, 0.08), mat=M['paper'], bevel=0.002))
nb.append(cyl('pen', 0.005, 0.15, (nx + 0.05, ny - 0.2, DESK_Z + 0.006), rot=(0, math.pi / 2, 0.5), mat=M['accent']))
interactive['notebook'] = join('notebook', nb)

# ------------------------------------------------------------------ desk lamp (anglepoise-like)
lx, ly = 0.98, 1.6
ELBOW = (lx - 0.04, ly + 0.02, DESK_Z + 0.42)
HEAD = (0.66, 1.36, DESK_Z + 0.47)
lamp = [
    cyl('lamp_base', 0.085, 0.025, (lx, ly, DESK_Z + 0.012), mat=M['iron']),
    lib.rod('lamp_arm1', (lx, ly, DESK_Z + 0.02), ELBOW, 0.008, mat=M['iron']),
    lib.rod('lamp_arm1b', (lx + 0.02, ly, DESK_Z + 0.02), (ELBOW[0] + 0.02, ELBOW[1], ELBOW[2]), 0.004, mat=M['steel']),
    lib.rod('lamp_arm2', ELBOW, (HEAD[0] + 0.03, HEAD[1] + 0.04, HEAD[2] + 0.05), 0.008, mat=M['iron']),
    sphere('lamp_joint', 0.02, ELBOW, mat=M['brass']),
    sphere('lamp_joint2', 0.016, (HEAD[0] + 0.03, HEAD[1] + 0.04, HEAD[2] + 0.05), mat=M['brass']),
    cone('lamp_shade', 0.09, 0.035, 0.14, HEAD, rot=(0.35, 0.25, 0), mat=M['iron'], open_shell=0.003),
]
interactive['lamp'] = join('lamp', lamp)
bulb = sphere('lamp_bulb', 0.024, (HEAD[0], HEAD[1] - 0.01, HEAD[2] - 0.04), mat=M['bulb'])
props.append(bulb)

# ------------------------------------------------------------------ mug + loose papers
props.append(join('mug', [cyl('mug_b', 0.04, 0.095, (-0.28, 1.12, DESK_Z + 0.048), mat=M['mug']),
                          torus('mug_h', 0.028, 0.007, (-0.235, 1.12, DESK_Z + 0.05), rot=(math.pi / 2, 0, 0), mat=M['mug'])]))
pp = []
for i in range(4):
    pp.append(box('paper', (0.21, 0.297, 0.001), (-0.35 + R.uniform(-0.05, 0.05), 1.45 + R.uniform(-0.04, 0.04),
                  DESK_Z + 0.001 + i * 0.0012), rot=(0, 0, R.uniform(-0.3, 0.3)), mat=M['paper']))
props.append(join('papers', pp))

# ------------------------------------------------------------------ conference poster (left wall)
px_, py_, pz_ = -W + 0.006, 1.02, 1.6
pst = [box('poster_board', (0.012, 0.84, 1.18), (px_, py_, pz_), mat=M['paper'])]
pst.append(box('poster_band', (0.004, 0.84, 0.16), (px_ + 0.008, py_, pz_ + 0.5), mat=M['ink']))
rot = (math.pi / 2, 0, math.pi / 2)
pst.append(text('poster_title', 'POSTER  [PLACEHOLDER]', (px_ + 0.012, py_ - 0.37, pz_ + 0.5), rot=rot, size=0.05,
                mat=M['paper']))
pst.append(text('poster_sub', 'Calcium signalling & arrhythmia', (px_ + 0.012, py_ - 0.37, pz_ + 0.44), rot=rot,
                size=0.032, mat=M['paper']))
# three columns of "text lines" + figures
for c in range(3):
    cy = py_ - 0.27 + c * 0.27
    pst.append(box('fig', (0.004, 0.22, 0.16), (px_ + 0.008, cy, pz_ + 0.24), mat=[M['teal'], M['accent'], M['ink']][c]))
    for li in range(14):
        ln = R.uniform(0.12, 0.22)
        pst.append(box('line', (0.003, ln, 0.012), (px_ + 0.008, cy - (0.22 - ln) / 2, pz_ + 0.1 - li * 0.03), mat=M['ink']))
for k in range(4):  # pins
    pst.append(sphere('pin', 0.008, (px_ + 0.014, py_ + (-0.38 if k % 2 else 0.38), pz_ + (0.56 if k < 2 else -0.56)),
                      mat=M['accent']))
interactive['poster'] = join('poster', pst)

# ------------------------------------------------------------------ bookshelf (right wall) + globe + kettlebell
sx_, sy_ = -W + 0.17, -0.75   # bookshelf on the left wall, nearer the viewer
shelf = []
for i, zz in enumerate((0.05, 0.55, 1.05, 1.55, 2.05)):
    shelf.append(box('shelf', (0.32, 1.1, 0.025), (sx_, sy_, zz), mat=M['desk'], bevel=0.003))
for yy in (sy_ - 0.55, sy_ + 0.55):
    shelf.append(box('side', (0.32, 0.025, 2.1), (sx_, yy, 1.05), mat=M['desk']))
props.append(join('bookshelf', shelf))
books = []
for zz in (0.065, 0.565, 1.065, 1.565):
    y = sy_ - 0.52
    while y < sy_ + 0.45:
        hgt, th = R.uniform(0.2, 0.32), R.uniform(0.025, 0.055)
        if zz > 1 and R.random() < 0.12:
            y += 0.12
            continue
        tilt = R.uniform(-0.06, 0.06) if R.random() < 0.2 else 0
        books.append(box('book', (R.uniform(0.17, 0.24), th, hgt), (sx_ + R.uniform(-0.02, 0.03), y + th / 2, zz + hgt / 2),
                         rot=(tilt, 0, 0), mat=R.choice(BOOK_MATS), bevel=0.002))
        y += th + 0.003
props.append(join('books', books))
gz = 2.065
interactive['globe'] = join('globe', [
    cyl('globe_foot', 0.06, 0.02, (sx_, sy_ + 0.3, gz + 0.01), mat=M['brass']),
    cyl('globe_post', 0.008, 0.08, (sx_, sy_ + 0.3, gz + 0.06), mat=M['brass']),
    sphere('globe_ball', 0.11, (sx_, sy_ + 0.3, gz + 0.2), mat=M['ocean']),
    torus('globe_ring', 0.125, 0.006, (sx_, sy_ + 0.3, gz + 0.2), rot=(math.pi / 2, 0.4, 0), mat=M['brass']),
])
interactive['kettlebell'] = join('kettlebell', [
    sphere('kb_body', 0.11, (-0.95, 0.55, 0.11), mat=M['iron'], scale=(1, 1, 0.92)),
    torus('kb_handle', 0.075, 0.016, (-0.95, 0.55, 0.24), rot=(math.pi / 2, 0, 0), mat=M['iron']),
])
# running shoes as a simple pair of stylised lasted forms near the door
shoes = []
for k, sx in enumerate((-1.55, -1.4)):
    shoes.append(sphere('shoe', 0.06, (sx, 0.05 - 0.04 * k, 0.045), mat=M['teal'], scale=(0.75, 2.0, 0.65)))
    shoes.append(box('sole', (0.09, 0.25, 0.022), (sx, 0.05 - 0.04 * k, 0.011), mat=M['enamel'], bevel=0.01))
interactive['shoes'] = join('shoes', shoes)
# plant on the window sill
plant = [cyl('pot', 0.07, 0.12, (-1.05, D1 + 0.03, z0 + 0.06), mat=M['pot'])]
for i in range(14):
    a = i / 14 * math.tau
    plant.append(sphere('leaf', 0.05, (-1.05 + 0.05 * math.cos(a), D1 + 0.03 + 0.05 * math.sin(a), z0 + 0.16 + R.uniform(0, 0.12)),
                        mat=M['leaf'], scale=(0.4, 1.4, 0.25)))
props.append(join('plant', plant))
# chair
chair = [box('seat', (0.46, 0.44, 0.05), (0.1, 0.62, 0.47), mat=M['black'], bevel=0.02),
         box('back', (0.44, 0.05, 0.42), (0.1, 0.38, 0.8), rot=(-0.12, 0, 0), mat=M['black'], bevel=0.02),
         cyl('stem', 0.025, 0.36, (0.1, 0.62, 0.25), mat=M['steel'])]
for i in range(5):
    a = i / 5 * math.tau
    chair.append(box('foot', (0.03, 0.3, 0.025), (0.1 + 0.13 * math.sin(a), 0.62 + 0.13 * math.cos(a), 0.05), rot=(0, 0, -a),
                     mat=M['steel']))
chair_o = join('chair', chair)
chair_o.rotation_euler.z = 0.55
chair_o.location.x += 0.35
props.append(chair_o)
rug = lib.mat_noise('rug', (0.32, 0.08, 0.06), (0.45, 0.2, 0.1), scale=12, rough=1.0, bump=0.3)
props.append(box('rug', (2.0, 1.4, 0.012), (0.0, 0.55, 0.006), mat=rug, bevel=0.004))
props += list(interactive.values())

# ------------------------------------------------------------------ the city outside (procedural shader planes)

def city_material(name, seed, lit=0.35, base_h=-1.0, var_h=3.0, col_w=1.2, warm=True):
    m = lib.bpy.data.materials.new(name)
    ns, ls = lib.nodes(m)
    ns.clear()
    out = ns.new('ShaderNodeOutputMaterial')
    tc = ns.new('ShaderNodeTexCoord')
    sep = ns.new('ShaderNodeSeparateXYZ')
    ls.new(tc.outputs['Object'], sep.inputs[0])
    # building id → height (white noise on floor(x / col_w))
    div = ns.new('ShaderNodeMath'); div.operation = 'DIVIDE'; div.inputs[1].default_value = col_w
    flo = ns.new('ShaderNodeMath'); flo.operation = 'FLOOR'
    wn = ns.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '1D'
    ls.new(sep.outputs['X'], div.inputs[0]); ls.new(div.outputs[0], flo.inputs[0])
    add_seed = ns.new('ShaderNodeMath'); add_seed.inputs[1].default_value = seed
    ls.new(flo.outputs[0], add_seed.inputs[0]); ls.new(add_seed.outputs[0], wn.inputs['W'])
    hmul = ns.new('ShaderNodeMath'); hmul.operation = 'MULTIPLY_ADD'
    hmul.inputs[1].default_value = var_h; hmul.inputs[2].default_value = base_h
    ls.new(wn.outputs['Value'], hmul.inputs[0])
    below = ns.new('ShaderNodeMath'); below.operation = 'LESS_THAN'
    ls.new(sep.outputs['Y'], below.inputs[0]); ls.new(hmul.outputs[0], below.inputs[1])
    # windows: own grid (cells of 0.16 × 0.13 m-ish) → per-cell white noise → lit threshold
    grid = ns.new('ShaderNodeVectorMath'); grid.operation = 'MULTIPLY'
    grid.inputs[1].default_value = (6.0, 7.5, 1.0)
    ls.new(tc.outputs['Object'], grid.inputs[0])
    cell = ns.new('ShaderNodeVectorMath'); cell.operation = 'FLOOR'
    frac = ns.new('ShaderNodeVectorMath'); frac.operation = 'FRACTION'
    ls.new(grid.outputs[0], cell.inputs[0]); ls.new(grid.outputs[0], frac.inputs[0])
    cn = ns.new('ShaderNodeTexWhiteNoise'); cn.noise_dimensions = '3D'
    ls.new(cell.outputs[0], cn.inputs['Vector'])
    thr = ns.new('ShaderNodeMath'); thr.operation = 'GREATER_THAN'; thr.inputs[1].default_value = 1 - lit
    ls.new(cn.outputs['Value'], thr.inputs[0])
    fs = ns.new('ShaderNodeSeparateXYZ'); ls.new(frac.outputs[0], fs.inputs[0])
    wx = ns.new('ShaderNodeMath'); wx.operation = 'LESS_THAN'; wx.inputs[1].default_value = 0.55
    wy = ns.new('ShaderNodeMath'); wy.operation = 'LESS_THAN'; wy.inputs[1].default_value = 0.5
    ls.new(fs.outputs['X'], wx.inputs[0]); ls.new(fs.outputs['Y'], wy.inputs[0])
    pane = ns.new('ShaderNodeMath'); pane.operation = 'MULTIPLY'
    ls.new(wx.outputs[0], pane.inputs[0]); ls.new(wy.outputs[0], pane.inputs[1])
    win = ns.new('ShaderNodeMath'); win.operation = 'MULTIPLY'
    ls.new(thr.outputs[0], win.inputs[0]); ls.new(pane.outputs[0], win.inputs[1])
    # per-window brightness variation
    bvar = ns.new('ShaderNodeMath'); bvar.operation = 'MULTIPLY'
    ls.new(win.outputs[0], bvar.inputs[0]); ls.new(cn.outputs['Color'], bvar.inputs[1])
    # tint variety: warm tungsten vs cool LED/TV
    tint_n = ns.new('ShaderNodeTexNoise'); tint_n.inputs['Scale'].default_value = 3
    ls.new(tc.outputs['Object'], tint_n.inputs['Vector'])
    tint = lib.ramp(ns, [(0.4, kelvin(2400) if warm else (0.5, 0.7, 1.0)), (0.6, (0.55, 0.7, 1.0))])
    ls.new(tint_n.outputs['Fac'], tint.inputs[0])
    em = ns.new('ShaderNodeEmission')
    ls.new(tint.outputs[0], em.inputs['Color'])
    strength = ns.new('ShaderNodeMath'); strength.operation = 'MULTIPLY'; strength.inputs[1].default_value = 4.0
    ls.new(bvar.outputs[0], strength.inputs[0]); ls.new(strength.outputs[0], em.inputs['Strength'])
    facade = ns.new('ShaderNodeBsdfDiffuse'); facade.inputs['Color'].default_value = (0.01, 0.012, 0.02, 1)
    addsh = ns.new('ShaderNodeAddShader')
    ls.new(facade.outputs[0], addsh.inputs[0]); ls.new(em.outputs[0], addsh.inputs[1])
    tr = ns.new('ShaderNodeBsdfTransparent')
    mix = ns.new('ShaderNodeMixShader')
    ls.new(below.outputs[0], mix.inputs['Fac'])
    ls.new(tr.outputs[0], mix.inputs[1]); ls.new(addsh.outputs[0], mix.inputs[2])
    ls.new(mix.outputs[0], out.inputs[0])
    return m


def hills_material():
    m = lib.bpy.data.materials.new('hills')
    ns, ls = lib.nodes(m)
    ns.clear()
    out = ns.new('ShaderNodeOutputMaterial')
    tc = ns.new('ShaderNodeTexCoord')
    sep = ns.new('ShaderNodeSeparateXYZ')
    ls.new(tc.outputs['Object'], sep.inputs[0])
    nz = ns.new('ShaderNodeTexNoise'); nz.noise_dimensions = '1D'; nz.inputs['Scale'].default_value = 0.06
    nz.inputs['Detail'].default_value = 4
    ls.new(sep.outputs['X'], nz.inputs['W'])
    ridge = ns.new('ShaderNodeMath'); ridge.operation = 'MULTIPLY_ADD'
    ridge.inputs[1].default_value = 12.0; ridge.inputs[2].default_value = 4.0
    ls.new(nz.outputs['Fac'], ridge.inputs[0])
    below = ns.new('ShaderNodeMath'); below.operation = 'LESS_THAN'
    ls.new(sep.outputs['Y'], below.inputs[0]); ls.new(ridge.outputs[0], below.inputs[1])
    dots = ns.new('ShaderNodeTexVoronoi'); dots.inputs['Scale'].default_value = 3.0
    ls.new(tc.outputs['Object'], dots.inputs['Vector'])
    dthr = ns.new('ShaderNodeMath'); dthr.operation = 'LESS_THAN'; dthr.inputs[1].default_value = 0.035
    ls.new(dots.outputs['Distance'], dthr.inputs[0])
    em = ns.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*kelvin(2000), 1)
    es = ns.new('ShaderNodeMath'); es.operation = 'MULTIPLY'; es.inputs[1].default_value = 8
    ls.new(dthr.outputs[0], es.inputs[0]); ls.new(es.outputs[0], em.inputs['Strength'])
    dif = ns.new('ShaderNodeBsdfDiffuse'); dif.inputs['Color'].default_value = (0.004, 0.005, 0.01, 1)
    add = ns.new('ShaderNodeAddShader'); ls.new(dif.outputs[0], add.inputs[0]); ls.new(em.outputs[0], add.inputs[1])
    tr = ns.new('ShaderNodeBsdfTransparent'); mix = ns.new('ShaderNodeMixShader')
    ls.new(below.outputs[0], mix.inputs['Fac']); ls.new(tr.outputs[0], mix.inputs[1]); ls.new(add.outputs[0], mix.inputs[2])
    ls.new(mix.outputs[0], out.inputs[0])
    return m


city = [
    # heights chosen so roof lines sit between ~-6° and +2° seen from the eye point
    plane('city_near', (30, 16), (0, 12, -4), rot=(math.pi / 2, 0, 0), mat=city_material('city_near', 3, lit=0.28, base_h=3.9, var_h=1.9, col_w=1.4)),
    plane('city_mid', (60, 20), (0, 22, -5), rot=(math.pi / 2, 0, 0), mat=city_material('city_mid', 11, lit=0.4, base_h=5.3, var_h=2.0, col_w=1.0)),
    plane('hills', (120, 30), (0, 60, -8), rot=(math.pi / 2, 0, 0), mat=hills_material()),
]
for c in city:
    c.visible_shadow = False

# ------------------------------------------------------------------ lighting
lib.world((0.004, 0.006, 0.018), (0.05, 0.03, 0.035), strength=1.0)
lamp_light = lib.light('lamp_spot', 'SPOT', (HEAD[0], HEAD[1] - 0.02, HEAD[2] - 0.05), 260, kelvin(2700), size=0.025, spot=110, blend=0.7)
lib.look_at(lamp_light, (0.45, 1.15, DESK_Z))
lib.light('lamp_fill', 'POINT', (HEAD[0], HEAD[1] + 0.02, HEAD[2] + 0.06), 4, kelvin(2700), size=0.03)  # light leaking up
mon_l = lib.light('monitor_glow', 'AREA', (mx, my - 0.06, DESK_Z + 0.37), 10, (0.5, 0.7, 1.0), size=(0.6, 0.35))
mon_l.rotation_euler = (math.pi / 2, 0, 0)
sky = lib.light('window_sky', 'AREA', (0, D1 + 0.25, (z0 + z1) / 2), 25, (0.35, 0.45, 0.9), size=(x1 - x0, z1 - z0))
sky.rotation_euler = (-math.pi / 2, 0, 0)
lib.light('shelf_led', 'AREA', (sx_ + 0.05, sy_, 1.53), 5, kelvin(3000), size=(0.2, 1.0))
lib.light('city_bounce', 'AREA', (0, D1 + 1.5, 0.2), 15, kelvin(2200), size=(3, 1)).rotation_euler = (-math.pi / 2.6, 0, 0)

CAM_LOC, CAM_TGT = (1.65, -1.7, 1.55), (-0.45, 1.05, 1.0)
cam = lib.camera('hero_cam', CAM_LOC, CAM_TGT, lens=21)

# ------------------------------------------------------------------ steps
if 'render' in STEPS:
    lib.cycles(samples=SAMPLES, w=960 if FAST else 1600, h=540 if FAST else 900)
    path = os.path.join(lib.OUT if FAST else os.path.join(lib.PUBLIC, 'renders'), 'signal-room-hero.jpg')
    lib.render_still(path)

    # Backdrop for the web build: the city alone, seen from the hero camera, through a 2:1 frame
    for o in bpy.data.objects:
        if o.type == 'MESH' and o not in city:
            o.hide_render = True
    lights = [o for o in bpy.data.objects if o.type == 'LIGHT']
    for o in lights:
        o.hide_render = True
    bc = lib.camera('backdrop_cam', (0, -1.5, 1.6), (0, 12, 1.6), lens=30)
    lib.cycles(samples=32, w=2048, h=1024, denoise=True)
    lib.render_still(os.path.join(lib.OUT, 'signal-room-city.jpg'), quality=85)  # legacy single-city backdrop; the window now uses blender/city_views.py
    for o in bpy.data.objects:
        o.hide_render = False
    scn.camera = cam

if 'bake' in STEPS or 'export' in STEPS:
    for c in city:
        bpy.data.objects.remove(c)
    import bake  # noqa: E402  (shared baking/export pipeline)
    groups = {'shell': shell, 'props': [o for o in props if o.name not in ('lamp_bulb',)]}
    bake.run(groups, name='signal-room', size={'shell': 1024, 'props': 2048} if not FAST else 512,
             samples=48 if not FAST else SAMPLES,
             do_bake='bake' in STEPS, do_export='export' in STEPS,
             keep_material=['screen', 'lamp_bulb'], extras={'interactive': list(interactive)})
