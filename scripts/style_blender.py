"""Author real CAD materials, split normals and studio lighting in Blender 3.1.

Usage: blender --background --factory-startup --python scripts/style_blender.py
       -- --output-dir <directory> [--samples 64]
The source GLB retains instance hierarchy and STEP metadata. No parts are added.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', type=Path, required=True)
parser.add_argument('--samples', type=int, default=64)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root = Path(__file__).resolve().parent.parent
out = args.output_dir.resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/camera-v3.glb'))
bpy.ops.object.select_all(action='DESELECT')
product = [o for o in bpy.context.scene.objects if o.get('path')]
mesh_objects = [o for o in product if o.type == 'MESH']
assert len(mesh_objects) == 48

def material(name, color, metal, roughness, coat=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Clearcoat'].default_value = coat
    b.inputs['Clearcoat Roughness'].default_value = .12
    m['reference'] = 'Rendering/6.jpg; Rendering/web/6.jpeg; Rendering/exploded/9.jpg'
    return m

white = material('CAMID Satin Ceramic White', (.56,.57,.58), 0, .34, .12)
graphite = material('CAMID Graphite Support', (.023,.025,.028), .22, .34)
copper = material('CAMID Satin Copper', (.64,.19,.075), .97, .25, .08)
steel = material('CAMID Polished Steel', (.57,.6,.63), .98, .22)
film = material('CAMID Film Black', (.01,.013,.014), 0, .45)
glass = material('CAMID Optical Glass', (.025,.08,.06), 0, .035, .7)
gb = glass.node_tree.nodes.get('Principled BSDF')
gb.inputs['Transmission'].default_value = .7
gb.inputs['IOR'].default_value = 1.46
glass.node_tree.nodes.new('ShaderNodeVolumeAbsorption')
absorb = glass.node_tree.nodes.get('Volume Absorption')
absorb.inputs['Color'].default_value = (.065,.18,.145,1)
absorb.inputs['Density'].default_value = 80
glass.node_tree.links.new(absorb.outputs['Volume'], glass.node_tree.nodes.get('Material Output').inputs['Volume'])

# Microfinish uses object-space scale in Blender; it does not alter CAD geometry.
for m, scale, strength, distance in [(white, 18000, .14, .000012), (copper, 26000, .08, .000003)]:
    nodes, links = m.node_tree.nodes, m.node_tree.links
    tex = nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = scale
    coord = nodes.new('ShaderNodeTexCoord'); links.new(coord.outputs['Object'], tex.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = strength; bump.inputs['Distance'].default_value = distance
    links.new(tex.outputs['Fac'], bump.inputs['Height']); links.new(bump.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])

glass_obj = next(o for o in mesh_objects if o.get('path').endswith('/Glass'))
lens_points = [glass_obj.matrix_world @ Vector(v) for v in glass_obj.bound_box]
lens_center = sum(lens_points, Vector())/8
authored = []
seen = set()
for o in mesh_objects:
    n = o.get('path').split('/')[-1].lower()
    if 'glass' in n: m = glass
    elif any(k in n for k in ['gear','crankhandle','lever handle','handle 2','wheel','trigger','trap','pressure button']): m = copper
    elif 'shutter ' in n: m = copper
    elif any(k in n for k in ['rollersupport','springsupport','printerlock','filmexit','lever support','finger','clip']): m = graphite
    elif 'roller' in n or 'shaft' in n or 'lever ' in n: m = steel
    elif 'film' in n: m = film
    else: m = white
    o.data.materials.clear(); o.data.materials.append(m)
    if 'box 4001' in n:
        o.data.materials.append(copper)
        # The actual lens collar is integrated in Box 4001, not a separate invented ring.
        for p in o.data.polygons:
            c = o.matrix_world @ p.center
            r = math.hypot(c.x-lens_center.x, c.y-lens_center.y)
            verts = [o.matrix_world @ o.data.vertices[i].co for i in p.vertices]
            if max(v.z for v in verts) > .077 and r < .032:
                p.material_index = 1
    o['finish'] = m.name
    if o.data.name not in seen:
        seen.add(o.data.name)
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=0.0000005)
        bpy.ops.object.mode_set(mode='OBJECT')
        o.data.use_auto_smooth = True; o.data.auto_smooth_angle = math.radians(32)
        for p in o.data.polygons: p.use_smooth = True
        o.select_set(False)
    authored.append({'path': o['path'], 'instanceLabel': o.get('instanceLabel'), 'finish': m.name})

# Export only CAD objects before applying the render-stage orientation.
for o in product: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'camera-v3-studio.glb'), export_format='GLB', use_selection=True,
                         export_extras=True, export_yup=True, export_materials='EXPORT', export_normals=True)
bpy.ops.object.select_all(action='DESELECT')
cad_root = bpy.data.objects.get('Camera V3')
cad_root.matrix_world = Matrix.Rotation(-math.pi/2, 4, 'X') @ cad_root.matrix_world
next(o for o in mesh_objects if 'film dimensions' in o.get('path').lower()).hide_render = True

def aim(o, target):
    o.rotation_euler = (Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()

target = Vector((.004,.025,.008))
studio = bpy.data.collections.new('STUDIO - presentation only'); bpy.context.scene.collection.children.link(studio)
def move_to_studio(o):
    for coll in list(o.users_collection): coll.objects.unlink(o)
    studio.objects.link(o)

world = bpy.data.worlds.new('Neutral grey studio'); bpy.context.scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.13,.14,.16,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .24
floor_mat = material('Studio floor', (.055,.06,.067), 0, .57)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.092))
floor = bpy.context.object; floor.name = 'Studio floor'; floor.data.materials.append(floor_mat); move_to_studio(floor)

lights = [
    ('Key - vertical softbox', (-.27,.32,.34), 8, .22, .36, (1,.955,.9)),
    ('Fill - tall strip', (.3,.2,.14), 2.8, .09, .28, (.86,.92,1)),
    ('Rim - overhead strip', (.04,-.19,.29), 10, .3, .12, (1,1,1)),
    ('Lens reflection', (.16,.36,.035), .9, .065, .10, (1,1,1)),
]
for name, pos, power, sx, sy, color in lights:
    data = bpy.data.lights.new(name, 'AREA'); data.energy=power; data.shape='RECTANGLE'; data.size=sx; data.size_y=sy; data.color=color
    obj = bpy.data.objects.new(name, data); studio.objects.link(obj); obj.location=pos; aim(obj,target)
data = bpy.data.cameras.new('CAMID studio camera'); cam=bpy.data.objects.new('CAMID studio camera', data)
studio.objects.link(cam); cam.location=(-.25,.38,.17); aim(cam,target); cam.data.lens=64
scene=bpy.context.scene; scene.camera=cam; scene.render.engine='CYCLES'
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type='CUDA'; prefs.get_devices()
    for d in prefs.devices: d.use=d.type=='CUDA'
    scene.cycles.device='GPU'
except Exception:
    scene.cycles.device='CPU'
scene.cycles.samples=args.samples; scene.cycles.use_denoising=True
scene.render.resolution_x=1400; scene.render.resolution_y=1200; scene.render.resolution_percentage=100
scene.view_settings.view_transform='Filmic'; scene.view_settings.look='Medium High Contrast'; scene.view_settings.exposure=0
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(out/'camid-b1-studio.png')
scene['source'] = 'Corrected real CAD; 48 instances; accidental Big gear omitted'
scene['materials'] = 'Presentation finishes inferred from designer Rendering references, not fabrication specifications'
scene.render.film_transparent=False
bpy.ops.wm.save_as_mainfile(filepath=str(out/'CAMID-B1-studio.blend'))
bpy.ops.render.render(write_still=True)
# A panoramic HDR of the same softboxes supplies local, portable web reflections.
for o in mesh_objects: o.hide_render = True
floor.hide_render = True
for name, pos, power, sx, sy, color in lights:
    bpy.ops.mesh.primitive_plane_add(size=1, location=pos)
    panel = bpy.context.object; panel.name = name + ' reflection card'; panel.scale=(sx,sy,1)
    aim(panel,target); move_to_studio(panel)
    em = bpy.data.materials.new(panel.name); em.use_nodes=True
    nodes=em.node_tree.nodes; nodes.clear()
    shader=nodes.new('ShaderNodeEmission'); shader.inputs['Color'].default_value=(*color,1)
    shader.inputs['Strength'].default_value=power/(sx*sy*math.pi)*.12
    output=nodes.new('ShaderNodeOutputMaterial'); em.node_tree.links.new(shader.outputs[0],output.inputs['Surface'])
    panel.data.materials.append(em)
cam.location=target; cam.rotation_euler=(math.pi/2,0,0); cam.data.type='PANO'; cam.data.cycles.panorama_type='EQUIRECTANGULAR'
scene.cycles.samples=16; scene.render.resolution_x=1024; scene.render.resolution_y=512
scene.render.image_settings.file_format='HDR'; scene.render.filepath=str(out/'camid-studio.hdr')
bpy.ops.render.render(write_still=True)
(out/'studio-materials.json').write_text(json.dumps({'blender':bpy.app.version_string,'parts':authored,'lights':lights},indent=2),encoding='utf-8')
print('CAMID STUDIO COMPLETE', out)
