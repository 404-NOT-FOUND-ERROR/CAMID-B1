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
    if(n.mesh!==undefined){
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
const studio=parse(await readFile('assets/camera-v3-studio.glb'));
const before=instances(cad),after=instances(studio);
assert.equal(after.size,48);assert.equal(before.size,after.size);
let maxTransformError=0,maxBoundsError=0;
for(const [key,a] of before){
  const b=after.get(key);assert(b,key);
  assert(!key.includes('2113 - Printer - Big gear'));
  maxTransformError=Math.max(maxTransformError,...a.world.map((v,i)=>Math.abs(v-b.world[i])));
  maxBoundsError=Math.max(maxBoundsError,...a.bounds.map((v,i)=>Math.abs(v-b.bounds[i])));
  assert(b.triangles>0,key);
}
assert(maxTransformError<.00002,`Transforms changed: ${maxTransformError}`);
assert(maxBoundsError<.000002,`Bounds changed: ${maxBoundsError}`);
assert(studio.materials.some(m=>m.name==='CAMID Satin Copper'));
assert(studio.materials.some(m=>m.name==='CAMID Optical Glass'&&m.extensions.KHR_materials_transmission));
assert(studio.meshes.some(m=>m.name.startsWith('Box 4001')&&m.primitives.length===2));
console.log(JSON.stringify({parts:after.size,trianglesNonzero:true,instanceIdentityPreserved:true,maxTransformError,maxBoundsError_m:maxBoundsError,copperCollar:true,glassTransmission:true},null,2));
