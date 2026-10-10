"""Author real CAD materials, split normals and studio lighting in Blender 3.1.

Usage: blender --background --factory-startup --python scripts/style_blender.py
       -- --output-dir <directory> [--samples 64]
The source GLB retains instance hierarchy, face normals and STEP metadata.
The CAMID surface mark is presentation geometry, not a CAD part.
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
    m['reference'] = 'Rendering/4x black gold color test; Rendering/2x red studio; Rendering/exploded/9.jpg'
    return m

white = material('CAMID Black Satin Shell', (.009,.011,.014), .0, .39, .08)
graphite = material('CAMID Graphite Support', (.002,.003,.006), .32, .31, .12)
copper = material('CAMID Brushed Gold Copper', (.62,.235,.060), .88, .27, .12)
steel = material('CAMID Dark Polished Steel', (.08,.105,.12), .96, .2, .12)
film = material('CAMID Film Black', (.003,.004,.005), 0, .48)
glass = material('CAMID Emerald Coated Glass', (.012,.05,.035), .05, .035, .76)
logo_gold = material('CAMID Logo Silver', (.60,.64,.66), .2, .38)
gb = glass.node_tree.nodes.get('Principled BSDF')
gb.inputs['Transmission'].default_value = .7
gb.inputs['IOR'].default_value = 1.46
glass.node_tree.nodes.new('ShaderNodeVolumeAbsorption')
absorb = glass.node_tree.nodes.get('Volume Absorption')
absorb.inputs['Color'].default_value = (.065,.18,.145,1)
absorb.inputs['Density'].default_value = 80
glass.node_tree.links.new(absorb.outputs['Volume'], glass.node_tree.nodes.get('Material Output').inputs['Volume'])

# Microfinish uses object-space scale in Blender; it does not alter CAD geometry.
for m, scale, strength, distance in [(white, 52000, .028, .000002), (copper, 34000, .045, .000002)]:
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
    # STEP faces have separate vertices and correct custom split normals.
    # Welding the faces makes planar panels inherit curved corner normals.
    assert o.data.has_custom_normals, o.name
    authored.append({'path': o['path'], 'instanceLabel': o.get('instanceLabel'), 'finish': m.name})

# Add the real product mark as a surface decal on the existing shutter box.
# It is decorative metadata, so the web viewer renders it without counting it as a new CAD part.
box_obj = next(o for o in mesh_objects if 'box 4001' in o.get('path','').lower())
bpy.ops.object.text_add(location=(.04040, .027, .043))
logo = bpy.context.object; logo.name='CAMID logo decal'; logo.data.body='CAMID'; logo.data.align_x='CENTER'; logo.data.align_y='CENTER'
logo.rotation_euler = Matrix(((0,-.069756,.997564),(1,0,0),(0,.997564,.069756))).to_euler()
logo.data.size=.006; logo.data.extrude=0; logo.data.bevel_depth=0
logo.data.materials.append(logo_gold); logo['decorative']=True; logo['logo']='CAMID'
logo.parent=box_obj; logo.matrix_parent_inverse=box_obj.matrix_world.inverted()
bpy.context.view_layer.objects.active=logo; logo.select_set(True); bpy.ops.object.convert(target='MESH'); logo.select_set(False)
bpy.context.view_layer.update()
logo_matrix = logo.matrix_world.copy()
# Rasterize the reference wordmark locally and embed its transparent image in GLB.
main_scene = bpy.context.scene
mark_scene = bpy.data.scenes.new('CAMID decal artwork')
mark = bpy.data.objects.new('CAMID artwork', logo.data.copy());mark_scene.collection.objects.link(mark)
ink = bpy.data.materials.new('CAMID decal ink');ink.use_nodes=True
ink.node_tree.nodes.clear();em=ink.node_tree.nodes.new('ShaderNodeEmission');em.inputs['Color'].default_value=(.78,.82,.84,1)
output=ink.node_tree.nodes.new('ShaderNodeOutputMaterial');ink.node_tree.links.new(em.outputs[0],output.inputs['Surface'])
mark.data.materials.clear();mark.data.materials.append(ink)
mark_cam_data=bpy.data.cameras.new('Wordmark artwork camera');mark_cam=bpy.data.objects.new('Wordmark artwork camera',mark_cam_data)
mark_scene.collection.objects.link(mark_cam);mark_cam.location=(0,0,1);mark_cam_data.type='ORTHO';mark_cam_data.ortho_scale=.027
mark_scene.camera=mark_cam;mark_scene.render.engine='BLENDER_EEVEE';mark_scene.render.film_transparent=True
mark_scene.render.resolution_x=1024;mark_scene.render.resolution_y=256;mark_scene.render.resolution_percentage=100
mark_scene.view_settings.view_transform='Standard';mark_scene.view_settings.look='None'
mark_scene.render.image_settings.file_format='PNG';mark_scene.render.image_settings.color_mode='RGBA'
mark_scene.render.filepath=str(out/'camid-wordmark.png');bpy.ops.render.render(write_still=True,scene=mark_scene.name)
bpy.context.window.scene=main_scene
bpy.data.objects.remove(logo,do_unlink=True)
decal_mesh=bpy.data.meshes.new('CAMID surface UV');decal_mesh.from_pydata([(-.0135,-.003375,0),(.0135,-.003375,0),(.0135,.003375,0),(-.0135,.003375,0)],[],[(0,1,2,3)])
uv=decal_mesh.uv_layers.new(name='CAMID UV')
for loop,coord in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=coord
logo=bpy.data.objects.new('CAMID logo decal',decal_mesh);main_scene.collection.objects.link(logo)
logo.parent=box_obj;logo.matrix_world=logo_matrix;logo['decorative']=True;logo['logo']='CAMID'
decal_mat=bpy.data.materials.new('CAMID printed wordmark');decal_mat.use_nodes=True;decal_mat.blend_method='BLEND';decal_mat.use_screen_refraction=False
tex=decal_mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(out/'camid-wordmark.png'));tex.image.pack()
bsdf=decal_mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.45
decal_mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);decal_mat.node_tree.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha'])
decal_mesh.materials.append(decal_mat)
bpy.data.scenes.remove(mark_scene)

# Export only CAD objects plus the marked logo before applying the render-stage orientation.
for o in product: o.select_set(True)
logo.select_set(True)
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

world = bpy.data.worlds.new('Black gold studio'); bpy.context.scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.006,.003,.004,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .16
floor_mat = material('Studio floor', (.018,.006,.006), 0, .5)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.092))
floor = bpy.context.object; floor.name = 'Studio floor'; floor.data.materials.append(floor_mat); move_to_studio(floor)

lights = [
    ('Key - neutral softbox', (-.27,.32,.34), 6, .22, .36, (1,.94,.86)),
    ('Fill - cool strip', (.3,.2,.14), 2, .09, .28, (.70,.83,1)),
    ('Rim - red strip', (.04,-.19,.29), 9, .3, .12, (1,.025,.008)),
    ('Lens reflection', (.16,.36,.035), 1.2, .065, .10, (.8,1,.92)),
]
for name, pos, power, sx, sy, color in lights:
    data = bpy.data.lights.new(name, 'AREA'); data.energy=power; data.shape='RECTANGLE'; data.size=sx; data.size_y=sy; data.color=color
    obj = bpy.data.objects.new(name, data); studio.objects.link(obj); obj.location=pos; aim(obj,target)
data = bpy.data.cameras.new('CAMID studio camera'); cam=bpy.data.objects.new('CAMID studio camera', data)
studio.objects.link(cam); cam.location=(.25,.38,.17); aim(cam,target); cam.data.lens=64
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
scene.view_settings.view_transform='Filmic'; scene.view_settings.look='Medium High Contrast'; scene.view_settings.exposure=-.35
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(out/'camid-b1-studio.png')
scene['source'] = 'Corrected real CAD; 48 instances; accidental Big gear omitted'
scene['materials'] = 'Presentation finishes inferred from designer Rendering references, not fabrication specifications'
scene.render.film_transparent=False
bpy.ops.wm.save_as_mainfile(filepath=str(out/'CAMID-B1-studio.blend'))
bpy.ops.render.render(write_still=True)
# Empty studio backdrop keeps the live CAD model as the only product image.
for o in mesh_objects + [logo]: o.hide_render = True
scene.cycles.samples=32;scene.render.resolution_x=1920;scene.render.resolution_y=1080
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.color_mode='RGB'
scene.render.image_settings.quality=95;scene.render.filepath=str(out/'studio-backdrop.jpg')
bpy.ops.render.render(write_still=True)
# A panoramic HDR of the same softboxes supplies local, portable web reflections.
for o in mesh_objects + [logo]: o.hide_render = True
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
