import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Matrix4, Quaternion, Vector3} from 'three';

function parse(bytes){
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
}
function instances(gltf){
  const rows=new Map();
  function walk(index,parent){
    const n=gltf.nodes[index];
    const local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(
      new Vector3().fromArray(n.translation||[0,0,0]),
      new Quaternion().fromArray(n.rotation||[0,0,0,1]),
      new Vector3().fromArray(n.scale||[1,1,1]));
    const world=parent.clone().multiply(local);
    if(n.mesh!==undefined&&!n.extras?.decorative){
      assert(n.extras?.path);assert(n.extras?.instanceLabel);
      const key=n.extras.path+'|'+n.extras.instanceLabel;
      assert(!rows.has(key));
      const points=[];
      let triangles=0;
      for(const p of gltf.meshes[n.mesh].primitives){
        const a=gltf.accessors[p.attributes.POSITION];
        for(const x of [a.min[0],a.max[0]])for(const y of [a.min[1],a.max[1]])for(const z of [a.min[2],a.max[2]])points.push(new Vector3(x,y,z).applyMatrix4(world));
        triangles+=gltf.accessors[p.indices].count/3;
      }
      rows.set(key,{world:world.elements,bounds:[0,1,2].flatMap(axis=>[Math.min(...points.map(p=>p.getComponent(axis))),Math.max(...points.map(p=>p.getComponent(axis)))]),triangles});
    }
    for(const child of n.children||[])walk(child,world);
  }
  for(const root of gltf.scenes[gltf.scene||0].nodes)walk(root,new Matrix4());
  return rows;
}
const cad=parse(await readFile('assets/camera-v3.glb'));
const studioBytes=await readFile('assets/camera-v3-studio.glb');
const studio=parse(studioBytes);
const before=instances(cad),after=instances(studio);
assert.equal(after.size,46);assert.equal(before.size,after.size);
const retainedHandle='/Camera V3/Tank 6000_Défaut/Handle 2^Tank 6000_Défaut';
const outerHandle='/Camera V3/Tank 6000_Défaut/lever handle 6008_Défaut';
const retainedCover='/Camera V3/Tank case 7003^Camera V3_Défaut/Trap 6001_Défaut';
const floatingCover='/Camera V3/Tank 6000_Défaut/Trap 6001_Défaut';
for(const gltf of [cad,studio]){
  assert.equal(gltf.nodes.filter(n=>n.extras?.path===retainedHandle).length,1);
  assert(!gltf.nodes.some(n=>n.extras?.path===outerHandle));
  const covers=gltf.nodes.filter(n=>n.extras?.path?.endsWith('/Trap 6001_Défaut'));
  assert.equal(covers.length,1);assert.equal(covers[0].extras.path,retainedCover);
  assert(!gltf.nodes.some(n=>n.extras?.path===floatingCover));
}
let maxTransformError=0,maxBoundsError=0;
for(const [key,a] of before){
  const b=after.get(key);assert(b,key);
  assert(!key.includes('2113 - Printer - Big gear'));
  maxTransformError=Math.max(maxTransformError,...a.world.map((v,i)=>Math.abs(v-b.world[i])));
  maxBoundsError=Math.max(maxBoundsError,...a.bounds.map((v,i)=>Math.abs(v-b.bounds[i])));
  assert(b.triangles>0,key);
  assert.equal(b.triangles,a.triangles,`Material zones changed CAD triangles: ${key}`);
}
assert(maxTransformError<.00002,`Transforms changed: ${maxTransformError}`);
assert(maxBoundsError<.000002,`Bounds changed: ${maxBoundsError}`);
for(const name of ['CAMID Charcoal Micrograin Polymer','CAMID Graphite Bead Blasted Panel','CAMID Graphite Signature Panel','CAMID Crimson Brushed Alloy','CAMID Brushed Steel']){
  const m=studio.materials.find(m=>m.name===name);assert(m,name);
  assert(m.normalTexture&&m.pbrMetallicRoughness.metallicRoughnessTexture,`Missing portable texture: ${name}`);
}
const signature=studio.materials.find(m=>m.name==='CAMID Graphite Signature Panel');
assert(signature.pbrMetallicRoughness.baseColorTexture,'No bounded signature finish');
const glass=studio.materials.find(m=>m.name==='CAMID Neutral Optical Glass');
assert(glass?.extensions.KHR_materials_transmission.transmissionFactor>.9);
assert(glass.pbrMetallicRoughness.baseColorFactor.slice(0,3).every(v=>v>.9),'Glass contains dark color absorption');
assert(studio.images.every(image=>image.bufferView!==undefined),'External texture breaks offline loading');
assert.equal(studio.nodes.filter(n=>n.extras?.decorative&&n.extras.logo==='CAMID').length,1);
assert(studio.images.some(image=>image.name==='camid-wordmark'&&image.bufferView!==undefined));
assert(studio.meshes.some(m=>m.name.startsWith('Box 4001')&&m.primitives.length===4));
const binaryOffset=20+studioBytes.readUInt32LE(12)+8;
function values(index){
  const a=studio.accessors[index],view=studio.bufferViews[a.bufferView];
  const count=a.count*(a.type==='VEC3'?3:1);
  const ArrayType=a.componentType===5126?Float32Array:a.componentType===5123?Uint16Array:Uint32Array;
  return new ArrayType(studioBytes.buffer,studioBytes.byteOffset+binaryOffset+view.byteOffset+(a.byteOffset||0),count);
}
let planarCorners=0,maxPlanarNormalError=0;
for(const n of studio.nodes){
  if(n.mesh===undefined||!/PrinterCase|Box 4001|Tank case/.test(n.name))continue;
  for(const primitive of studio.meshes[n.mesh].primitives){
    const positions=values(primitive.attributes.POSITION),normals=values(primitive.attributes.NORMAL),indices=values(primitive.indices);
    for(let i=0;i<indices.length;i+=3){
      const ids=[indices[i],indices[i+1],indices[i+2]];
      const p=ids.map(id=>new Vector3().fromArray(positions,id*3));
      const faceNormal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
      // Large CAD triangles cover the shell panels; tiny fillet facets are smooth.
      if(faceNormal.length()/2<.0003)continue;
      faceNormal.normalize();
      for(const id of ids){maxPlanarNormalError=Math.max(maxPlanarNormalError,1-faceNormal.dot(new Vector3().fromArray(normals,id*3).normalize()));planarCorners++;}
    }
  }
}
assert(planarCorners>300);assert(maxPlanarNormalError<.000001,'Planar shell corners inherit curved normals');
console.log(JSON.stringify({parts:after.size,retainedRearCover:retainedCover,floatingRearCoverRemoved:true,trianglesNonzero:true,instanceIdentityPreserved:true,maxTransformError,maxBoundsError_m:maxBoundsError,portableFinishTextures:studio.images.length-1,integratedMaterialZones:4,neutralGlassTransmission:true,embeddedWordmark:true,planarCorners,maxPlanarNormalError},null,2));
