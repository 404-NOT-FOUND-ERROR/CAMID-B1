import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Matrix4,Quaternion,Vector3} from 'three';
const corrections=JSON.parse(await readFile('scripts/assembly-corrections.json','utf8')).corrections;
const manifest=JSON.parse(await readFile('assets/camera-v3.manifest.json','utf8'));
const results=[];
for(const file of ['assets/camera-v3.glb','assets/camera-v3-studio.glb']){
 const bytes=await readFile(file),length=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+length));
 const binaryOffset=28+length,instances=new Map();
 function positions(index){
  const a=g.accessors[index],v=g.bufferViews[a.bufferView];
  return new Float32Array(bytes.buffer,bytes.byteOffset+binaryOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*3);
 }
 function walk(index,parent){
  const n=g.nodes[index],local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3().fromArray(n.translation||[0,0,0]),new Quaternion().fromArray(n.rotation||[0,0,0,1]),new Vector3().fromArray(n.scale||[1,1,1]));
  const world=parent.clone().multiply(local);
  if(n.extras?.path&&n.mesh!==undefined){
   const points=[];
   for(const p of g.meshes[n.mesh].primitives){const a=positions(p.attributes.POSITION);for(let i=0;i<a.length;i+=3)points.push(new Vector3().fromArray(a,i).applyMatrix4(world).multiplyScalar(1000));}
   instances.set(n.extras.path,{world,points});
  }
  for(const child of n.children||[])walk(child,world);
 }
 for(const root of g.scenes[g.scene||0].nodes)walk(root,new Matrix4());
 assert(!instances.has('/Camera V3/Tank 6000_Défaut/lever handle 6008_Défaut'));
 for(const c of corrections){
  const applied=manifest.assemblyCorrections.find(x=>x.path===c.path);assert(applied);
  const handle=instances.get(c.path),support=instances.get(c.targetPartPath);assert(handle&&support);
  const source=new Matrix4().fromArray(applied.sourceWorldMatrix);
  const localSeat=new Vector3().fromArray(c.sourceSeatCenter_mm).multiplyScalar(.001).applyMatrix4(source.invert());
  const actualSeat=localSeat.applyMatrix4(handle.world).multiplyScalar(1000),target=new Vector3().fromArray(c.targetSeatCenter_mm);
  const seatError=actualSeat.distanceTo(target);assert(seatError<.002,`Seat not aligned: ${seatError} mm`);
  const minHandleX=Math.min(...handle.points.map(p=>p.x)),maxSupportX=Math.max(...support.points.map(p=>p.x));
  assert(Math.abs(minHandleX-maxSupportX)<.003,'Retained handle floats off support face');
  // Independently inspect the actual support mesh near both analytic slot ends.
  const radiusErrors=c.targetSlotEndCenters_mm.map(center=>{
   const samples=support.points.filter(p=>Math.abs(p.x-center[0])<.002&&Math.abs(p.y-center[1])<3&&Math.abs(p.z-center[2])<3);
   const errors=samples.map(p=>Math.abs(Math.hypot(p.y-center[1],p.z-center[2])-c.targetSlotRadius_mm)).filter(e=>e<.03);
   assert(errors.length>=6,'No corresponding slot rim in support geometry');
   return Math.max(...errors);
  });
  results.push({file,handle:c.path,seatError_mm:seatError,contactGap_mm:minHandleX-maxSupportX,slotRimError_mm:Math.max(...radiusErrors)});
 }
}
console.log(JSON.stringify({outerHandleRemoved:true,innerHandleRetained:true,upperSlotSeatAligned:true,results},null,2));
