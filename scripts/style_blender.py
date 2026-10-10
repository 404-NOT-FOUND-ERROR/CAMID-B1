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
import numpy as np
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
assert len(mesh_objects) == 46

def material(name, color, metal, roughness, coat=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Clearcoat'].default_value = coat
    b.inputs['Clearcoat Roughness'].default_value = .12
    m['reference'] = 'Rendering/2x red charcoal studio (1).png; Rendering/exploded/9.jpg'
    return m

shell = material('CAMID Charcoal Micrograin Polymer', (.019,.021,.024), 0, .60)
panel = material('CAMID Graphite Bead Blasted Panel', (.038,.042,.047), .42, .46)
trim = material('CAMID Satin Graphite Edge', (.013,.015,.018), .45, .34)
graphite = material('CAMID Graphite Support', (.022,.025,.030), .30, .50)
red = material('CAMID Crimson Brushed Alloy', (.32,.027,.033), .68, .43, .04)
steel = material('CAMID Brushed Steel', (.32,.35,.38), .92, .32)
film = material('CAMID Film Black', (.003,.004,.005), 0, .58)
glass = material('CAMID Neutral Optical Glass', (.96,.975,.99), 0, .035)
logo_gold = material('CAMID Logo Silver', (.60,.64,.66), .2, .38)
gb = glass.node_tree.nodes.get('Principled BSDF')
gb.inputs['Transmission'].default_value = .94
gb.inputs['IOR'].default_value = 1.50

texture_dir = out/'textures'; texture_dir.mkdir(exist_ok=True)
rng = np.random.default_rng(214)
size = 512
def smooth(field, passes):
    for _ in range(passes):
        field = (field*4 + np.roll(field,1,0) + np.roll(field,-1,0) + np.roll(field,1,1) + np.roll(field,-1,1))/8
    return field
grain = smooth(rng.random((size,size)), 5)
grain = (grain-grain.mean())/grain.std()
lines = smooth(rng.random((size,1)), 3)
lines = np.repeat((lines-lines.mean())/lines.std(),size,axis=1)
brush = lines*.8 + smooth(rng.random((size,size))-.5,2)

def image_map(name, rgb):
    image=bpy.data.images.new(name,width=size,height=size,alpha=True)
    image.colorspace_settings.name='Non-Color'
    rgba=np.concatenate((np.clip(rgb,0,1),np.ones((size,size,1))),axis=2).astype(np.float32)
    image.pixels.foreach_set(rgba.reshape(-1));image.update()
    image.filepath_raw=str(texture_dir/(name+'.png'));image.file_format='PNG';image.save();image.pack()
    return image

def finish_maps(mat, field, roughness, metal, slope, tile):
    # Packed PBR images, rather than unsupported procedural nodes, travel with GLB.
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    orm=image_map(mat.name+' ORM',np.stack((np.ones_like(field),roughness+field*.035,np.full_like(field,metal)),axis=2))
    tex=nodes.new('ShaderNodeTexImage');tex.image=orm;tex.extension='REPEAT'
    separate=nodes.new('ShaderNodeSeparateRGB');links.new(tex.outputs['Color'],separate.inputs['Image'])
    links.new(separate.outputs['G'],bsdf.inputs['Roughness']);links.new(separate.outputs['B'],bsdf.inputs['Metallic'])
    dx=(np.roll(field,-1,1)-np.roll(field,1,1))*slope
    dy=(np.roll(field,-1,0)-np.roll(field,1,0))*slope
    normal=np.stack((-dx,-dy,np.ones_like(field)),axis=2);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    img=image_map(mat.name+' normal',normal*.5+.5)
    tex=nodes.new('ShaderNodeTexImage');tex.image=img;tex.extension='REPEAT'
    norm=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bsdf.inputs['Normal'])
    mat['finishTile_m']=tile;mat['surface']='packed roughness and tangent normal maps; original CAD normals retained'

finish_maps(shell,grain,.60,0,.14,.012)
finish_maps(panel,grain,.46,.42,.08,.010)
finish_maps(red,brush,.43,.68,.025,.012)
finish_maps(steel,brush,.32,.92,.02,.012)

glass_obj = next(o for o in mesh_objects if o.get('path').endswith('/Glass'))
lens_points = [glass_obj.matrix_world @ Vector(v) for v in glass_obj.bound_box]
lens_center = sum(lens_points, Vector())/8
authored = []
seen = set()
for o in mesh_objects:
    n = o.get('path').split('/')[-1].lower()
    if 'glass' in n: m = glass
    elif any(k in n for k in ['crankhandle','lever handle','handle 2','wheel','trigger','pressure button']): m = red
    elif 'gear' in n or 'shutter ' in n: m = steel
    elif 'trap' in n: m = panel
    elif any(k in n for k in ['rollersupport','springsupport','printerlock','filmexit','lever support','finger','clip']): m = graphite
    elif 'roller' in n or 'shaft' in n or 'lever ' in n: m = steel
    elif 'film' in n: m = film
    else: m = shell
    o.data.materials.clear(); o.data.materials.append(m)
    if 'box 4001' in n:
        o.data.materials.append(red);o.data.materials.append(panel);o.data.materials.append(trim)
        # The actual lens collar is integrated in Box 4001, not a separate invented ring.
        for p in o.data.polygons:
            c = o.matrix_world @ p.center
            r = math.hypot(c.x-lens_center.x, c.y-lens_center.y)
            verts = [o.matrix_world @ o.data.vertices[i].co for i in p.vertices]
            if max(v.z for v in verts) > .077 and r < .032:
                p.material_index = 1
            elif abs(c.x-lens_center.x)>.029 and .02<c.z<.063:
                p.material_index = 2
            elif .070<c.z<.077 and r<.034:
                p.material_index = 3
    # Face projection uses physical dimensions. Seam duplication in the CAD is preserved.
    uv=o.data.uv_layers.new(name='CAMID finish UV')
    for p in o.data.polygons:
        normal=o.matrix_world.to_3x3()@p.normal
        dominant=max(range(3),key=lambda i:abs(normal[i]))
        axes=([1,2],[0,2],[0,1])[dominant]
        tile=o.data.materials[p.material_index].get('finishTile_m',.012)
        for loop_index in p.loop_indices:
            v=o.matrix_world@o.data.vertices[o.data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv=(v[axes[0]]/tile,v[axes[1]]/tile)
    o['finish'] = m.name
    # STEP faces have separate vertices and correct custom split normals.
    # Welding the faces makes planar panels inherit curved corner normals.
    assert o.data.has_custom_normals, o.name
    authored.append({'path': o['path'], 'instanceLabel': o.get('instanceLabel'), 'finish': m.name,
                     'zones': [slot.name for slot in o.data.materials]})

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
ink.node_tree.nodes.clear();em=ink.node_tree.nodes.new('ShaderNodeEmission');em.inputs['Color'].default_value=(.42,.025,.033,1)
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

world = bpy.data.worlds.new('Charcoal crimson studio'); bpy.context.scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.006,.003,.004,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .16
floor_mat = material('Studio floor', (.018,.006,.006), 0, .5)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.092))
floor = bpy.context.object; floor.name = 'Studio floor'; floor.data.materials.append(floor_mat); move_to_studio(floor)

lights = [
    ('Key - neutral softbox', (-.27,.32,.34), 6, .22, .36, (.96,.98,1)),
    ('Fill - cool strip', (.3,.2,.14), 2.5, .09, .28, (.82,.88,1)),
    ('Rim - crimson strip', (.04,-.19,.29), 7, .3, .12, (1,.02,.04)),
    ('Lens - white softbox', (.17,.38,.20), 2.5, .14, .24, (1,1,1)),
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
scene['source'] = 'Corrected real CAD; 46 instances; accidental gear, floating rear cover and outer lever handle omitted; inner Handle 2 aligned to upper support slot'
scene['materials'] = 'Charcoal micrograin polymer, bead-blasted panel, brushed crimson alloy, brushed steel, neutral optical glass; presentation references, not fabrication specifications'
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
