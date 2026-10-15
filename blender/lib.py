"""Shared helpers for procedural scene generation with Blender's Python API (bpy).

Run scripts with the bpy module (Blender 5.2 as a Python package):
    /opt/bpyenv/bin/python blender/<script>.py
"""
from __future__ import annotations

import math
import os
import random
import time

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'blender', 'out')          # scratch (gitignored)
PUBLIC = os.path.join(ROOT, 'public', 'assets')
os.makedirs(OUT, exist_ok=True)


def log(*a):
    print(f'[{time.strftime("%H:%M:%S")}]', *a, flush=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.unit_settings.system = 'METRIC'
    return scn


# ---------------------------------------------------------------- geometry

def _link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def box(name, size, loc, rot=(0, 0, 0), mat=None, bevel=0.0, segments=2):
    """Axis-aligned box from size (x,y,z) and centre location."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        m = o.modifiers.new('bevel', 'BEVEL')
        m.width = bevel
        m.segments = segments
        m.limit_method = 'ANGLE'
    if mat:
        o.data.materials.append(mat)
    return o


def cyl(name, r, depth, loc, rot=(0, 0, 0), mat=None, verts=32, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    if bevel > 0:
        m = o.modifiers.new('bevel', 'BEVEL')
        m.width = bevel
        m.segments = 2
        m.limit_method = 'ANGLE'
    if mat:
        o.data.materials.append(mat)
    shade_smooth(o)
    return o


def rod(name, p0, p1, r, mat=None, verts=16):
    """Cylinder spanning two points."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    o = cyl(name, r, d.length, (p0 + p1) / 2, mat=mat, verts=verts)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return o


def cone(name, r1, r2, depth, loc, rot=(0, 0, 0), mat=None, verts=32, open_shell=0.0):
    """open_shell > 0 → no caps + solidify of that thickness (lamp shades that let light out)."""
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts,
                                    end_fill_type='NOTHING' if open_shell else 'NGON')
    o = bpy.context.active_object
    o.name = name
    if open_shell:
        o.modifiers.new('shell', 'SOLIDIFY').thickness = open_shell
    if mat:
        o.data.materials.append(mat)
    shade_smooth(o)
    return o


def sphere(name, r, loc, mat=None, seg=32, rings=16, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=rings)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        o.data.materials.append(mat)
    shade_smooth(o)
    return o


def torus(name, R, r, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot,
                                     major_segments=40, minor_segments=14)
    o = bpy.context.active_object
    o.name = name
    if mat:
        o.data.materials.append(mat)
    shade_smooth(o)
    return o


def plane(name, size, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        o.data.materials.append(mat)
    return o


def text(name, body, loc, rot=(0, 0, 0), size=0.05, mat=None, align='LEFT', extrude=0.0):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.align_x = align
    cu.extrude = extrude
    o = _link(bpy.data.objects.new(name, cu))
    o.location = loc
    o.rotation_euler = rot
    if mat:
        cu.materials.append(mat)
    return o


def shade_smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def join(name, objs):
    """Convert (text→mesh), apply modifiers and join parts into one named object."""
    meshes = []
    for o in objs:
        select_only([o])
        if o.type != 'MESH':
            bpy.ops.object.convert(target='MESH')
            o = bpy.context.active_object
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
        meshes.append(o)
    select_only(meshes)
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    return o


# ---------------------------------------------------------------- materials

def mat_principled(name, color, rough=0.5, metal=0.0, emission=None, strength=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    nt = m.node_tree if m.node_tree else None
    if nt is None:
        m.use_nodes = True
        nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if coat:
        b.inputs['Coat Weight'].default_value = coat
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


def nodes(m):
    if not m.node_tree:
        m.use_nodes = True
    return m.node_tree.nodes, m.node_tree.links


def mat_emission(name, color, strength):
    m = bpy.data.materials.new(name)
    ns, ls = nodes(m)
    ns.clear()
    out = ns.new('ShaderNodeOutputMaterial')
    em = ns.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = strength
    ls.new(em.outputs[0], out.inputs[0])
    return m


def ramp(ns, stops):
    r = ns.new('ShaderNodeValToRGB')
    el = r.color_ramp.elements
    el[0].position, el[0].color = stops[0][0], (*stops[0][1], 1)
    el[1].position, el[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = el.new(pos)
        e.color = (*col, 1)
    return r


def mat_wood(name, c1, c2, scale=6.0, rough=0.45, stretch=(1, 8, 1)):
    """Procedural wood: stretched noise → wave rings → ramp."""
    m = bpy.data.materials.new(name)
    ns, ls = nodes(m)
    b = ns.get('Principled BSDF')
    tc = ns.new('ShaderNodeTexCoord')
    mp = ns.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = stretch
    nz = ns.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 8
    nz.inputs['Distortion'].default_value = 2.5
    rp = ramp(ns, [(0.3, c1), (0.55, c2), (0.75, c1)])
    ls.new(tc.outputs['Object'], mp.inputs['Vector'])
    ls.new(mp.outputs[0], nz.inputs['Vector'])
    ls.new(nz.outputs['Fac'], rp.inputs[0])
    ls.new(rp.outputs[0], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    return m


def mat_noise(name, c1, c2, scale=40.0, rough=0.8, bump=0.15):
    """Generic speckled surface (plaster, paper, rubber)."""
    m = bpy.data.materials.new(name)
    ns, ls = nodes(m)
    b = ns.get('Principled BSDF')
    tc = ns.new('ShaderNodeTexCoord')
    nz = ns.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 10
    rp = ramp(ns, [(0.35, c1), (0.7, c2)])
    bp = ns.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = bump
    ls.new(tc.outputs['Object'], nz.inputs['Vector'])
    ls.new(nz.outputs['Fac'], rp.inputs[0])
    ls.new(rp.outputs[0], b.inputs['Base Color'])
    ls.new(nz.outputs['Fac'], bp.inputs['Height'])
    ls.new(bp.outputs[0], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    return m


def world(color_zenith, color_horizon, strength=1.0):
    w = bpy.data.worlds.new('World')
    bpy.context.scene.world = w
    ns, ls = nodes(w)
    bg = ns.get('Background')
    tc = ns.new('ShaderNodeTexCoord')
    sep = ns.new('ShaderNodeSeparateXYZ')
    rp = ramp(ns, [(0.0, color_horizon), (0.35, color_zenith)])
    ls.new(tc.outputs['Generated'], sep.inputs[0])
    ls.new(sep.outputs['Z'], rp.inputs[0])
    ls.new(rp.outputs[0], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    return w


# ---------------------------------------------------------------- lights / camera / render

def kelvin(t):
    """Approximate blackbody → linear RGB (Tanner Helland fit), good enough for art."""
    t /= 100
    r = 255 if t <= 66 else 329.698727446 * (t - 60) ** -0.1332047592
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * (t - 60) ** -0.0755148492
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    srgb = [max(0, min(255, c)) / 255 for c in (r, g, b)]
    return tuple(c ** 2.2 for c in srgb)


def light(name, kind, loc, energy, color=(1, 1, 1), rot=(0, 0, 0), size=0.1, spot=None, blend=0.3):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size if isinstance(size, (int, float)) else size[0]
        if not isinstance(size, (int, float)):
            ld.shape = 'RECTANGLE'
            ld.size_y = size[1]
    elif kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = size
    if kind == 'SPOT':
        ld.spot_size = math.radians(spot or 60)
        ld.spot_blend = blend
    o = _link(bpy.data.objects.new(name, ld))
    o.location = loc
    o.rotation_euler = rot
    return o


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def camera(name, loc, target, lens=28, sensor=36):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = sensor
    o = _link(bpy.data.objects.new(name, cd))
    o.location = loc
    look_at(o, target)
    bpy.context.scene.camera = o
    return o


def cycles(samples=64, w=1280, h=720, denoise=True, bounces=6):
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = samples
    s.cycles.use_adaptive_sampling = True
    s.cycles.use_denoising = denoise
    s.cycles.max_bounces = bounces
    s.cycles.diffuse_bounces = 4
    s.cycles.glossy_bounces = 2
    s.cycles.transmission_bounces = 4
    s.cycles.sample_clamp_indirect = 4.0
    s.render.resolution_x, s.render.resolution_y = w, h
    s.render.resolution_percentage = 100
    s.view_settings.view_transform = 'AgX'
    s.view_settings.look = 'AgX - Medium High Contrast'
    s.view_settings.exposure = 0.5
    s.render.threads_mode = 'AUTO'
    return s


def render_still(path, fmt='JPEG', quality=88):
    s = bpy.context.scene
    s.render.image_settings.file_format = fmt
    if fmt == 'JPEG':
        s.render.image_settings.quality = quality
    s.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    log(f'rendered {os.path.relpath(path, ROOT)} in {time.time() - t:.0f}s')


def rand(seed):
    return random.Random(seed)
