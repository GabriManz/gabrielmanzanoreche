"""Lightmap baking + GLB export pipeline (shared by Blender-based concepts).

For each object group:
  1. make materials unique to the group, apply modifiers;
  2. smart-UV-project all objects of the group into ONE shared atlas ("lightmap" UV);
  3. Cycles-bake COMBINED lighting (albedo × light) into a float image;
  4. denoise with OpenImageDenoise through the compositor;
  5. scale into LDR range (÷ EXPOSURE, undone in the web shader) and save as PNG;
  6. swap materials for a single texture-only material and export a GLB.

The browser then renders these meshes unlit (MeshBasicMaterial): all the
expensive global illumination is pre-computed — the Felix Rieseberg trick.
"""
import math
import os
import time

import bpy
import numpy as np

import lib

EXPOSURE = 2.0  # baked radiance is divided by this before 8-bit encoding


def _unique_materials(objs, tag):
    cache = {}
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if m is None:
                continue
            if m not in cache:
                cache[m] = m.copy()
                cache[m].name = f'{m.name}__{tag}'
            slot.material = cache[m]
    return list(cache.values())


def _apply_modifiers(o):
    lib.select_only([o])
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def _unwrap(objs):
    for o in objs:
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name='lightmap')
    lib.select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.004, rotate=True, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')


def _denoise(img):
    """OIDN via a throw-away compositor run (Blender 5 node-group compositor)."""
    scn = bpy.context.scene
    ng = bpy.data.node_groups.new('denoise', 'CompositorNodeTree')
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    n_img = ng.nodes.new('CompositorNodeImage')
    n_img.image = img
    n_dn = ng.nodes.new('CompositorNodeDenoise')
    n_out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(n_img.outputs['Image'], n_dn.inputs['Image'])
    ng.links.new(n_dn.outputs['Image'], n_out.inputs[0])
    scn.compositing_node_group = ng
    prev = (scn.render.engine, scn.render.resolution_x, scn.render.resolution_y, scn.render.use_compositing)
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.render.resolution_x, scn.render.resolution_y = img.size
    scn.render.use_compositing = True
    for o in bpy.data.objects:  # nothing to draw — we only want the compositor
        o.hide_render = True
    bpy.ops.render.render()
    for o in bpy.data.objects:
        o.hide_render = False
    res = bpy.data.images['Render Result']
    tmp = os.path.join(lib.OUT, '_dn.exr')
    scn.render.image_settings.file_format = 'OPEN_EXR'
    res.save_render(filepath=tmp)
    scn.render.engine, scn.render.resolution_x, scn.render.resolution_y, scn.render.use_compositing = prev
    scn.compositing_node_group = None
    dn = bpy.data.images.load(tmp)
    px = np.array(dn.pixels[:], dtype=np.float32)
    bpy.data.images.remove(dn)
    return px


def _encode_srgb(lin):
    lin = np.clip(lin, 0, 1)
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)


def bake_group(objs, tag, size, samples, glossy):
    t = time.time()
    _unique_materials(objs, tag)
    for o in objs:
        _apply_modifiers(o)
    _unwrap(objs)
    img = bpy.data.images.new(f'lm_{tag}', size, size, float_buffer=True, alpha=False)
    for o in objs:
        for slot in o.material_slots:
            nt = slot.material.node_tree
            n = nt.nodes.new('ShaderNodeTexImage')
            n.image = img
            nt.nodes.active = n
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.samples = samples
    s.cycles.use_denoising = False
    b = s.render.bake
    b.use_pass_direct = b.use_pass_indirect = True
    b.use_pass_diffuse = b.use_pass_emit = b.use_pass_transmission = True
    b.use_pass_glossy = glossy
    b.margin = 12
    b.margin_type = 'EXTEND'
    lib.select_only(objs)
    bpy.ops.object.bake(type='COMBINED')
    lib.log(f'baked {tag}: {len(objs)} objects, {size}px, {samples} spp in {time.time() - t:.0f}s')
    try:
        px = _denoise(img)
        lib.log('denoised with OIDN')
    except Exception as e:  # keep the raw bake if the compositor path fails
        lib.log('denoise failed, using raw bake:', e)
        px = np.array(img.pixels[:], dtype=np.float32)
    px = px.reshape(-1, 4)
    rgb = _encode_srgb(px[:, :3] / EXPOSURE)
    out = bpy.data.images.new(f'{tag}_lightmap', size, size, alpha=False)
    out.colorspace_settings.name = 'sRGB'
    # byte images with sRGB colourspace expect *display* values in .pixels
    out.pixels.foreach_set(np.concatenate([rgb, np.ones((rgb.shape[0], 1))], axis=1).astype(np.float32).ravel())
    path = os.path.join(lib.OUT, f'{tag}_lightmap.png')
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    return out


def run(groups, name, size=2048, samples=128, do_bake=True, do_export=True, keep_material=(), extras=None):
    baked = {}
    for tag, objs in groups.items():
        objs = [o for o in objs if o.type == 'MESH' and o.name not in keep_material]
        path = os.path.join(lib.OUT, f'{name}-{tag}_lightmap.png')
        if do_bake:
            img = bake_group(objs, f'{name}-{tag}', size[tag] if isinstance(size, dict) else size, samples,
                             glossy=(tag != 'shell'))
        else:
            for o in objs:
                _apply_modifiers(o)
            _unwrap(objs)  # deterministic: same UVs as the bake run
            img = bpy.data.images.load(path)
        baked[tag] = (objs, img)

    if not do_export:
        return
    for tag, (objs, img) in baked.items():
        m = bpy.data.materials.new(f'baked_{tag}')
        ns, ls = lib.nodes(m)
        bsdf = ns.get('Principled BSDF')
        tex = ns.new('ShaderNodeTexImage')
        tex.image = img
        ls.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 1.0
        for o in objs:
            o.data.materials.clear()
            o.data.materials.append(m)
            o['lightmap'] = tag
    for n in (extras or {}).get('interactive', []):
        bpy.data.objects[n]['interactive'] = True
    path = os.path.join(lib.PUBLIC, 'models', f'{name}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              export_image_format='WEBP', export_image_quality=88, export_cameras=True,
                              export_lights=False, export_extras=True, export_materials='EXPORT')
    lib.log(f'exported {os.path.relpath(path, lib.ROOT)} ({os.path.getsize(path) / 1e6:.2f} MB)')
