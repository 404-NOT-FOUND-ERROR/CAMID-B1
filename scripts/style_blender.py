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
parser.add_argument('--skip-environment', action='store_true', help='Keep existing HDR/backdrop when revising product finishes')
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
signature = material('CAMID Graphite Signature Panel', (1,1,1), 1, 1)
fascia = material('CAMID Upper Graphite Fascia', (1,1,1), 1, 1)
rear_fascia = material('CAMID Rear Graphite Fascia', (1,1,1), 1, 1)
rear_grip = material('CAMID Rear Linear Grip', (1,1,1), 1, 1)
side_grip = material('CAMID Side Linear Grip', (1,1,1), 1, 1)
trim = material('CAMID Satin Graphite Edge', (.013,.015,.018), .45, .34)
graphite = material('CAMID Graphite Support', (.022,.025,.030), .30, .50)
red = material('CAMID Crimson Brushed Alloy', (.25,.020,.026), .82, .31, .04)
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
    height,width=rgb.shape[:2]
    image=bpy.data.images.new(name,width=width,height=height,alpha=True)
    image.colorspace_settings.name='Non-Color'
    rgba=np.concatenate((np.clip(rgb,0,1),np.ones((height,width,1))),axis=2).astype(np.float32)
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

finish_maps(shell,grain,.58,0,.09,.010)
finish_maps(panel,grain,.41,.48,.055,.010)
finish_maps(red,brush,.31,.82,.018,.012)
finish_maps(steel,brush,.32,.92,.02,.012)

# An authored, flat color atlas gives the broad upper shell a quiet product code,
# graphite inset and satin strip. All divisions remain surface finishes on CAD.
fascia_bounds=((-0.052979916,0.066620082),(-0.080440328,-0.030060671))
def fascia_maps():
    width,height=1280,512
    x=np.linspace(*fascia_bounds[0],width)[None,:]
    y=np.linspace(fascia_bounds[1][1],fascia_bounds[1][0],height)[:,None]
    samples=grain[np.floor(y/.010*size).astype(int)%size,np.floor(x/.010*size).astype(int)%size]
    u=np.linspace(0,1,width)[None,:];v=np.linspace(0,1,height)[:,None]
    inset=((u>.027)&(u<.973)&(v>.07)&(v<.93)).astype(float)
    band=inset*(v<.15)
    orm=image_map('CAMID upper fascia finish ORM',np.stack((np.ones_like(samples),.59-.14*inset-.10*band+samples*.018,.28*inset+.22*band),axis=2))
    field=samples*.07
    dx=np.roll(field,-1,1)-np.roll(field,1,1);dy=np.roll(field,-1,0)-np.roll(field,1,0)
    normals=np.stack((-dx,-dy,np.ones_like(field)),axis=2);normals/=np.linalg.norm(normals,axis=2,keepdims=True)
    normal=image_map('CAMID upper fascia micrograin normal',normals*.5+.5)
    base=bpy.data.images.load(str(root/'assets/branding/camid-upper-fascia.png'));base.pack()
    nodes,links=fascia.node_tree.nodes,fascia.node_tree.links;bsdf=nodes.get('Principled BSDF')
    for img,target in [(base,'Base Color'),(orm,None),(normal,'Normal')]:
        tex=nodes.new('ShaderNodeTexImage');tex.image=img;tex.extension='EXTEND'
        if target=='Base Color':links.new(tex.outputs['Color'],bsdf.inputs[target])
        elif target=='Normal':
            n=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],bsdf.inputs['Normal'])
        else:
            split=nodes.new('ShaderNodeSeparateRGB');links.new(tex.outputs['Color'],split.inputs['Image'])
            links.new(split.outputs['G'],bsdf.inputs['Roughness']);links.new(split.outputs['B'],bsdf.inputs['Metallic'])
    fascia['surface']='Graphite inset, satin strip, low contrast B1 product code; original CAD surface'
fascia_maps()

# The reference has a bounded graphite finish around CAMID, within the same CAD face.
# A non-repeating physical-coordinate mask keeps the boundary crisp without adding
# a floating plate, changing the shell shape, or cutting up the source triangles.
signature_bounds = ((-.020,.064),(.018,.071))  # STEP world Y/Z in metres
signature_rectangle = ((.004,.060),(.024,.065))
def signature_maps():
    res=1024
    y=np.linspace(*signature_bounds[0],res)[None,:]
    z=np.linspace(*signature_bounds[1],res)[:,None]
    y0,y1=signature_rectangle[0];z0,z1=signature_rectangle[1]
    radius=.0006
    dy=np.abs(y-(y0+y1)/2)-(y1-y0)/2+radius
    dz=np.abs(z-(z0+z1)/2)-(z1-z0)/2+radius
    distance=np.hypot(np.maximum(dy,0),np.maximum(dz,0))+np.minimum(np.maximum(dy,dz),0)-radius
    mask=np.clip(.5-distance/.00009,0,1)
    edge=np.exp(-((distance+.00007)/.000065)**2)*mask
    samples=grain[(np.floor(z/.010*size).astype(int)%size), (np.floor(y/.010*size).astype(int)%size)]
    outer=np.array([.019,.021,.024]);inside=np.array([.057,.061,.066])
    color=outer+(inside-outer)*mask[:,:,None]
    color*=1+samples[:,:,None]*.025
    color*=1-edge[:,:,None]*.32
    # Color textures use sRGB; ORM and tangent normals stay linear.
    srgb=np.where(color<=.0031308,color*12.92,1.055*np.power(color,1/2.4)-.055)
    base=image_map('CAMID signature bounded graphite color',srgb)
    base.colorspace_settings.name='sRGB';base.reload();base.pack()
    orm=image_map('CAMID signature finish ORM',np.stack((np.ones_like(mask),.62-.16*mask+samples*.025,.44*mask),axis=2))
    field=samples*(.09-.045*mask)
    dx=np.roll(field,-1,1)-np.roll(field,1,1)
    dy=np.roll(field,-1,0)-np.roll(field,1,0)
    normal=np.stack((-dx,-dy,np.ones_like(mask)),axis=2)
    normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    normal_image=image_map('CAMID signature micrograin normal',normal*.5+.5)
    nodes,links=signature.node_tree.nodes,signature.node_tree.links;bsdf=nodes.get('Principled BSDF')
    for image,target in [(base,'Base Color'),(orm,None),(normal_image,'Normal')]:
        tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='EXTEND'
        if target=='Base Color':links.new(tex.outputs['Color'],bsdf.inputs[target])
        elif target=='Normal':
            n=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],bsdf.inputs['Normal'])
        else:
            separate=nodes.new('ShaderNodeSeparateRGB');links.new(tex.outputs['Color'],separate.inputs['Image'])
            links.new(separate.outputs['G'],bsdf.inputs['Roughness']);links.new(separate.outputs['B'],bsdf.inputs['Metallic'])
    signature['surface']='Bounded graphite signature finish; dark material boundary; continuous original CAD surface'
    signature['rectangleWorldYZ_m']=[list(b) for b in signature_rectangle]
signature_maps()

def flat_finish_maps(mat, artwork, width, height, ribs=0):
    """Keep generated flat artwork intact; add portable physical finish maps."""
    u=np.linspace(0,1,width)[None,:];v=np.linspace(0,1,height)[:,None]
    samples=grain[np.floor(v*size*11).astype(int)%size,np.floor(u*size*5).astype(int)%size]
    grip=((u>.09)&(u<.91)&(v>.17)&(v<.95)).astype(float) if ribs else np.zeros_like(samples)
    # Directional normal detail is very shallow; it never changes the CAD mesh.
    field=samples*.035+grip*.08*np.sin(v*math.pi*2*ribs)
    dx=np.roll(field,-1,1)-np.roll(field,1,1)
    dy=np.roll(field,-1,0)-np.roll(field,1,0)
    normals=np.stack((-dx,-dy,np.ones_like(field)),axis=2)
    normals/=np.linalg.norm(normals,axis=2,keepdims=True)
    normal=image_map(mat.name+' microtexture normal',normals*.5+.5)
    orm=image_map(mat.name+' finish ORM',np.stack((np.ones_like(samples),.56-.065*grip+samples*.012,.16+.08*(1-grip)),axis=2))
    base=bpy.data.images.load(str(root/'assets/branding/finish-v4'/artwork))
    base.pixels[0]  # Blender 3.1 lazily loads file images; read before changing the path.
    # Keep the generated PNG masters. These opaque color atlases can travel as
    # JPEG in the GLB; normal and ORM maps retain lossless PNG encoding.
    base.file_format='JPEG';base.filepath_raw=str(texture_dir/(Path(artwork).stem+'.jpg'))
    base.save();base.reload();base.pack()
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    for img,target in [(base,'Base Color'),(normal,'Normal'),(orm,None)]:
        tex=nodes.new('ShaderNodeTexImage');tex.image=img;tex.extension='EXTEND'
        if target=='Base Color':links.new(tex.outputs['Color'],bsdf.inputs[target])
        elif target=='Normal':
            norm=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bsdf.inputs['Normal'])
        else:
            split=nodes.new('ShaderNodeSeparateRGB');links.new(tex.outputs['Color'],split.inputs['Image'])
            links.new(split.outputs['G'],bsdf.inputs['Roughness']);links.new(split.outputs['B'],bsdf.inputs['Metallic'])
    mat['surface']='Nonrepeating generated finish artwork; shallow linear grain, packed ORM/normal; unchanged CAD face'

flat_finish_maps(rear_fascia,'camid-rear-fascia.png',1024,448)
flat_finish_maps(rear_grip,'camid-rear-grip.png',512,768,110)
flat_finish_maps(side_grip,'camid-side-grip.png',448,1024,70)

def projection_bounds(obj,material,axes):
    points=[obj.matrix_world@obj.data.vertices[i].co for face in obj.data.polygons
            if obj.data.materials[face.material_index]==material for i in face.vertices]
    assert points,'No exterior faces for '+material.name
    return [(min(p[axis] for p in points),max(p[axis] for p in points)) for axis in axes]

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
    if 'printercase' in n:
        o.data.materials.append(fascia);o.data.materials.append(trim);o.data.materials.append(rear_fascia)
        for p in o.data.polygons:
            c=o.matrix_world@p.center;normal=(o.matrix_world.to_3x3()@p.normal).normalized()
            if normal.z>.9999 and c.z>.026:p.material_index=1
            elif normal.y<-.9999:p.material_index=2
            elif normal.z<-.9999 and -.0186<c.z<-.0183:p.material_index=3
        o['rearFasciaXY_m']=projection_bounds(o,rear_fascia,[0,1])
    if 'tank case^tank case' in n:
        o.data.materials.append(panel);o.data.materials.append(trim);o.data.materials.append(side_grip)
        for p in o.data.polygons:
            c=o.matrix_world@p.center;normal=(o.matrix_world.to_3x3()@p.normal).normalized()
            if abs(normal.x)>.9999 and (c.x<-.0388 or c.x>.0745):p.material_index=3
            elif abs(normal.x)>.9999:p.material_index=1
            elif normal.y>.9999:p.material_index=2
        o['sideGripZY_m']=projection_bounds(o,side_grip,[2,1])
    if 'trap 6001' in n:
        o.data.materials.append(rear_grip)
        for p in o.data.polygons:
            c=o.matrix_world@p.center;normal=(o.matrix_world.to_3x3()@p.normal).normalized()
            if normal.z<-.9999 and c.z<-.0249:p.material_index=1
        o['rearGripXY_m']=projection_bounds(o,rear_grip,[0,1])
    if 'box 4001' in n:
        o.data.materials.append(red);o.data.materials.append(signature);o.data.materials.append(trim)
        # The actual lens collar is integrated in Box 4001, not a separate invented ring.
        for p in o.data.polygons:
            c = o.matrix_world @ p.center
            r = math.hypot(c.x-lens_center.x, c.y-lens_center.y)
            verts = [o.matrix_world @ o.data.vertices[i].co for i in p.vertices]
            if max(v.z for v in verts) > .077 and r < .032:
                p.material_index = 1
            elif c.x>.03 and (o.matrix_world.to_3x3()@p.normal).normalized().dot(Vector((.997564,0,.069756)))>.99999:
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
            if o.data.materials[p.material_index]==fascia:
                uv.data[loop_index].uv=((fascia_bounds[0][1]-v.x)/(fascia_bounds[0][1]-fascia_bounds[0][0]),
                                        (fascia_bounds[1][1]-v.y)/(fascia_bounds[1][1]-fascia_bounds[1][0]))
            elif o.data.materials[p.material_index]==signature:
                uv.data[loop_index].uv=((v.y-signature_bounds[0][0])/(signature_bounds[0][1]-signature_bounds[0][0]),
                                        (v.z-signature_bounds[1][0])/(signature_bounds[1][1]-signature_bounds[1][0]))
            elif o.data.materials[p.material_index] in [rear_fascia,rear_grip]:
                bounds=o['rearFasciaXY_m'] if o.data.materials[p.material_index]==rear_fascia else o['rearGripXY_m']
                uv.data[loop_index].uv=((v.x-bounds[0][0])/(bounds[0][1]-bounds[0][0]),
                                        (bounds[1][1]-v.y)/(bounds[1][1]-bounds[1][0]))
            elif o.data.materials[p.material_index]==side_grip:
                bounds=o['sideGripZY_m']
                u=(v.z-bounds[0][0])/(bounds[0][1]-bounds[0][0])
                uv.data[loop_index].uv=(1-u if normal.x<0 else u,
                                        (bounds[1][1]-v.y)/(bounds[1][1]-bounds[1][0]))
            else:
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
main_scene = bpy.context.scene
# Use the reference-derived thick condensed artwork, preserving its source pixels.
# Crop only the decal UV coordinates to fit a physical 36 mm visible ink width.
import shutil
shutil.copy2(root/'assets/branding/camid-wordmark-reference.png',out/'camid-wordmark.png')
wordmark=bpy.data.images.load(str(out/'camid-wordmark.png'));wordmark.name='camid-wordmark';wordmark.pack()
w,h=wordmark.size
alpha=np.array(wordmark.pixels[:],dtype=np.float32).reshape(h,w,4)[:,:,3]
yy,xx=np.where(alpha>.15)
assert len(xx)>0,'Wordmark artwork must have visible alpha'
assert (alpha<.01).sum()>w*h*.15,'Wordmark must have a transparent background'
u0,u1=max(0,xx.min()-2)/w,min(w,xx.max()+3)/w
v0,v1=max(0,yy.min()-2)/h,min(h,yy.max()+3)/h
half_width=.018;half_height=half_width*(v1-v0)*h/((u1-u0)*w)
decal_mesh=bpy.data.meshes.new('CAMID surface UV');decal_mesh.from_pydata([(-half_width,-half_height,0),(half_width,-half_height,0),(half_width,half_height,0),(-half_width,half_height,0)],[],[(0,1,2,3)])
uv=decal_mesh.uv_layers.new(name='CAMID UV')
for loop,coord in zip(uv.data,[(u0,v0),(u1,v0),(u1,v1),(u0,v1)]):loop.uv=coord
logo=bpy.data.objects.new('CAMID logo decal',decal_mesh);main_scene.collection.objects.link(logo)
rotation=Matrix(((0,-.069756,.997564),(1,0,0),(0,.997564,.069756))).to_4x4()
rotation.translation=Vector((.04040+(.043-.039)*.069756/.997564+.000015,.033,.039))
logo.parent=box_obj;logo.matrix_world=rotation;logo['decorative']=True;logo['logo']='CAMID'
logo['artwork']='Reference reconstruction from user rendering; not an original vector master'
logo['inkWidth_m']=.036
decal_mat=bpy.data.materials.new('CAMID printed wordmark');decal_mat.use_nodes=True;decal_mat.blend_method='BLEND';decal_mat.use_screen_refraction=False
tex=decal_mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=wordmark;tex.extension='EXTEND'
bsdf=decal_mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.57
decal_mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);decal_mat.node_tree.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha'])
decal_mesh.materials.append(decal_mat)

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
# A second proof records the actual Blender material/wordmark placement.
saved_camera=cam.matrix_world.copy();saved_lens=cam.data.lens
cam.location=(.17,.20,.045);aim(cam,(.033,.038,-.026));cam.data.lens=82
scene.render.resolution_x=1600;scene.render.resolution_y=1200
scene.render.filepath=str(out/'camid-signature-closeup.png');bpy.ops.render.render(write_still=True)
cam.matrix_world=saved_camera;cam.data.lens=saved_lens
# Proofs of the same surfaces viewed from the previously blank directions.
data=bpy.data.lights.new('Rear proof - neutral softbox','AREA');data.energy=4;data.shape='DISK';data.size=.28
rear_light=bpy.data.objects.new(data.name,data);studio.objects.link(rear_light);rear_light.location=(.12,-.32,.22);aim(rear_light,target)
points=[o.matrix_world@Vector(v) for o in mesh_objects if not o.hide_render for v in o.bound_box]
proof_center=Vector([(min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)])
cam.data.type='ORTHO';cam.data.ortho_scale=.235
scene.render.resolution_x=1200;scene.render.resolution_y=1200
for proof,direction in [('camid-rear-finish',(.65,-1.8,.55)),('camid-side-finish',(-1.8,.45,.35))]:
    cam.location=proof_center+Vector(direction).normalized()*.45;aim(cam,proof_center)
    scene.render.filepath=str(out/(proof+'.png'));bpy.ops.render.render(write_still=True)
cam.data.type='PERSP';cam.matrix_world=saved_camera;cam.data.lens=saved_lens
rear_light.hide_render=True
(out/'studio-materials.json').write_text(json.dumps({'blender':bpy.app.version_string,'parts':authored,'lights':lights,'wordmark':'User rendering reconstruction; thick condensed dark crimson, 36 mm ink width','fascia':'Graphite / satin upper shell atlas with B1 product code','rearSideFinishes':'Rear CAMID B1 fascia, horizontal-grain rear cover, linear side grip with crimson stripe and B1 identifier; generated flat color maps with portable ORM and tangent normals'},indent=2),encoding='utf-8')
if args.skip_environment:
    print('CAMID STUDIO FINISH UPDATE COMPLETE',out)
    sys.exit(0)
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
print('CAMID STUDIO COMPLETE', out)
