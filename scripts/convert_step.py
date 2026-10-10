"""Convert the supplied STEP assembly with OpenCascade; no substitute geometry.

Python 3.13 + cadquery-ocp 8.0.1.1.0 + numpy. Source paths are CLI arguments.
Preserves definition reuse, instance transforms, names and assembly hierarchy.
"""
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--packages', type=Path)
args = parser.parse_args()
if args.packages:
    sys.path.insert(0, str(args.packages.resolve()))
import numpy as np
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString, TCollection_AsciiString
from OCP.TDF import TDF_Label, TDF_Tool
from OCP.collections import Sequence_TDF_Label
from OCP.TDataStd import TDataStd_Name
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool, XCAFDoc_ColorSurf, XCAFDoc_ColorGen
from OCP.Quantity import Quantity_Color
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopoDS import TopoDS
from OCP.TopLoc import TopLoc_Location
from OCP.IFSelect import IFSelect_RetDone

doc = TDocStd_Document(TCollection_ExtendedString('CAMID B1'))
reader = STEPCAFControl_Reader()
reader.SetNameMode(True)
reader.SetColorMode(True)
assert reader.ReadFile(str(args.source.resolve())) == IFSelect_RetDone
assert reader.Transfer(doc)
st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
ct = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())
roots = Sequence_TDF_Label()
st.GetFreeShapes(roots)

# Exclude only the exact accidental instances confirmed by the designer.
# The source STEP and the attached rear cover remain intact.
EXCLUDED_PATHS = {
    '/Camera V3/Printer - FullAssembly/2113 - Printer - Big gear':
        'Designer-confirmed auxiliary gear accidentally included in export',
    '/Camera V3/Tank 6000_Défaut/Trap 6001_Défaut':
        'Designer-confirmed duplicate outer floating rear cover; attached Tank case instance retained',
    '/Camera V3/Tank 6000_Défaut/lever handle 6008_Défaut':
        'Designer-confirmed unwanted outer lever handle; inner Handle 2 retained and aligned with upper support slot',
}
CORRECTIONS = {item['path']:item for item in json.loads(
    Path(__file__).with_name('assembly-corrections.json').read_text(encoding='utf-8'))['corrections']}
applied_corrections = []

gltf = {'asset': {'version': '2.0', 'generator': 'CAMID STEP / OpenCascade 8',
        'extras': {'source': args.source.name, 'sha256': hashlib.sha256(args.source.read_bytes()).hexdigest(),
                   'units': 'metres', 'linearDeflection_mm': 0.12, 'angularDeflection_rad': 0.25,
                   'motionConstraints': False,
                   'excludedPaths': sorted(EXCLUDED_PATHS),
                   'assemblyCorrections': list(CORRECTIONS.values())}},
        'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
        'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': []}
binary = bytearray()
cache = {}
parts = []
omitted = []

def entry(label):
    s = TCollection_AsciiString()
    TDF_Tool.Entry_s(label, s)
    return s.ToCString()

def name(label):
    a = TDataStd_Name()
    if label.FindAttribute(TDataStd_Name.GetID_s(), a):
        return a.Get().ToExtString()
    return entry(label)

def matrix(location):
    tr = location.Transformation()
    m = np.eye(4)
    for i in range(3):
        for j in range(4):
            m[i,j] = tr.Value(i+1,j+1) * (0.001 if j == 3 else 1)
    return m

def accessor(a, kind, component, target, bounds=False):
    a = np.ascontiguousarray(a)
    while len(binary) % 4:
        binary.append(0)
    view = len(gltf['bufferViews'])
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': a.nbytes, 'target': target})
    binary.extend(a.tobytes())
    ac = {'bufferView': view, 'componentType': component, 'count': len(a), 'type': kind}
    if bounds:
        ac['min'] = a.min(axis=0).tolist()
        ac['max'] = a.max(axis=0).tolist()
    gltf['accessors'].append(ac)
    return len(gltf['accessors'])-1

def mesh(label):
    key = entry(label)
    if key in cache:
        return cache[key]
    shape = st.GetShape_s(label)
    BRepMesh_IncrementalMesh(shape, 0.12, False, 0.25, True).Perform()
    verts, tris = [], []
    ex = TopExp_Explorer(shape, TopAbs_FACE)
    while ex.More():
        face = TopoDS.Face(ex.Current())
        loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, loc)
        if tri is not None:
            base = len(verts)
            for i in range(1, tri.NbNodes()+1):
                p = tri.Node(i).Transformed(loc.Transformation())
                verts.append([p.X()*0.001, p.Y()*0.001, p.Z()*0.001])
            for i in range(1, tri.NbTriangles()+1):
                a,b,c = tri.Triangle(i).Get()
                if face.Orientation() == TopAbs_REVERSED:
                    b,c = c,b
                tris.append([base+a-1,base+b-1,base+c-1])
        ex.Next()
    if not verts:
        raise ValueError('No triangulation: '+name(label))
    v = np.array(verts, dtype='<f4')
    t = np.array(tris, dtype='<u4')
    normals = np.zeros_like(v)
    n = np.cross(v[t[:,1]]-v[t[:,0]],v[t[:,2]]-v[t[:,0]])
    for i in range(3):
        np.add.at(normals,t[:,i],n)
    norm = np.linalg.norm(normals,axis=1)
    normals /= np.maximum(norm[:,None],1e-20)
    assert np.isfinite(v).all() and np.isfinite(normals).all()
    col = Quantity_Color()
    rgb = [0.68,0.70,0.72]
    if ct.GetColor_s(label,XCAFDoc_ColorSurf,col) or ct.GetColor_s(label,XCAFDoc_ColorGen,col) or ct.GetColor(shape,XCAFDoc_ColorSurf,col):
        rgb = [col.Red(),col.Green(),col.Blue()]
    mat = len(gltf['materials'])
    gltf['materials'].append({'name': name(label)+' / CAD color', 'pbrMetallicRoughness':
        {'baseColorFactor': rgb+[1], 'metallicFactor': 0.1, 'roughnessFactor': 0.45}, 'doubleSided': True})
    mid = len(gltf['meshes'])
    gltf['meshes'].append({'name':name(label), 'primitives':[{'attributes':
        {'POSITION':accessor(v,'VEC3',5126,34962,True),'NORMAL':accessor(normals,'VEC3',5126,34962)},
        'indices':accessor(t.reshape(-1),'SCALAR',5125,34963),'material':mat}]})
    value = (mid, v.min(0), v.max(0), len(t))
    cache[key] = value
    print('mesh',name(label),len(t),'triangles',flush=True)
    return value

def walk(instance, parent_matrix=np.eye(4), path=''):
    definition = instance
    ref = TDF_Label()
    local = matrix(st.GetLocation_s(instance))
    if st.IsReference_s(instance):
        assert st.GetReferredShape_s(instance,ref)
        definition = ref
    part_name = name(definition)
    full = path+'/'+part_name
    if full in EXCLUDED_PATHS:
        omitted.append({'name': part_name, 'path': full,
                        'reason': EXCLUDED_PATHS[full]})
        print('omit', full, flush=True)
        return None
    world = parent_matrix @ local
    correction = CORRECTIONS.get(full)
    if correction:
        source_world = world.copy()
        delta = (np.array(correction['targetSeatCenter_mm'])-np.array(correction['sourceSeatCenter_mm']))*.001
        world[:3,3] += delta
        local = np.linalg.inv(parent_matrix) @ world
        applied_corrections.append({**correction,'translationWorld_mm':(delta*1000).tolist(),
                                   'sourceWorldMatrix':source_world.T.reshape(-1).tolist(),
                                   'correctedWorldMatrix':world.T.reshape(-1).tolist()})
    node = {'name': part_name, 'matrix': local.T.reshape(-1).tolist(),
            'extras':{'stepLabel':entry(definition),'instanceLabel':entry(instance),'path':full}}
    if correction:
        node['extras']['assemblyCorrection'] = correction['reason']
    index = len(gltf['nodes'])
    gltf['nodes'].append(node)
    children = Sequence_TDF_Label()
    if st.IsAssembly_s(definition):
        st.GetComponents_s(definition,children,False)
        node['children'] = [child for i in range(1,children.Size()+1)
                            if (child := walk(children.Value(i),world,full)) is not None]
    else:
        mid,lo,hi,count = mesh(definition)
        node['mesh'] = mid
        corners = np.array([[x,y,z,1] for x in [lo[0],hi[0]] for y in [lo[1],hi[1]] for z in [lo[2],hi[2]]])
        points = (world @ corners.T).T[:,:3]
        parts.append({'node':index,'name':part_name,'path':full,'mesh':mid,'triangles':count,
                      'bounds_m':[points.min(0).tolist(),points.max(0).tolist()]})
    return index

gltf['scenes'][0]['nodes'] = [root for i in range(1,roots.Size()+1)
                              if (root := walk(roots.Value(i))) is not None]
gltf['buffers'] = [{'byteLength':len(binary)}]
js = json.dumps(gltf,ensure_ascii=False,separators=(',',':')).encode('utf-8')
js += b' ' * (-len(js)%4)
binary += b'\0' * (-len(binary)%4)
total = 12+8+len(js)+8+len(binary)
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_bytes(struct.pack('<III',0x46546c67,2,total)+struct.pack('<II',len(js),0x4e4f534a)+js+
                        struct.pack('<II',len(binary),0x004e4942)+binary)
manifest = {'source':args.source.name,'sha256':gltf['asset']['extras']['sha256'],
            'nodes':len(gltf['nodes']),'uniqueMeshes':len(cache),'partInstances':len(parts),
            'triangles':sum(p['triangles'] for p in parts),'bytes':total,
            'excludedPaths':sorted(EXCLUDED_PATHS),'omittedParts':omitted,
            'assemblyCorrections':applied_corrections,'parts':parts}
assert len(applied_corrections) == len(CORRECTIONS), 'Missing correction target'
args.output.with_suffix('.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in manifest.items() if k != 'parts'},ensure_ascii=False))
