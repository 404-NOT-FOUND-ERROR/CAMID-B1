const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),out=path.join(root,'screenshots','reveal-bezier');
const {build}=createRequire(path.join(root,'package.json'))('esbuild');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire(process.execPath)('playwright'));}
const url=process.env.CAMID_URL||'http://127.0.0.1:4189/#home';
const baseline=process.env.CAMID_BEZIER_BASELINE||path.join(root,'references','reveal-bezier','baseline');
const probe='\nwindow.__ad={meshes,camera,controls,renderer,scene,v3,Box3:THREE.Box3,Matrix4:THREE.Matrix4,keyLight,redRim,seek:seekShot,cue:cameraCue};';
const sample=page=>page.evaluate(()=>{
 const d=__ad;d.renderer.render(d.scene,d.camera);d.camera.updateMatrixWorld(true);
 let minimumDepth=Infinity,left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 for(const mesh of d.meshes.filter(m=>m.visible)){
  const view=new d.Matrix4().multiplyMatrices(d.camera.matrixWorldInverse,mesh.matrixWorld),projection=new d.Matrix4().multiplyMatrices(d.camera.projectionMatrix,view);
  const v=mesh.geometry.attributes.position,a=view.elements,b=projection.elements;
  for(let i=0;i<v.count;i++){
   const x=v.getX(i),y=v.getY(i),z=v.getZ(i),depth=-(a[2]*x+a[6]*y+a[10]*z+a[14]);minimumDepth=Math.min(minimumDepth,depth);
   const w=b[3]*x+b[7]*y+b[11]*z+b[15],px=(b[0]*x+b[4]*y+b[8]*z+b[12])/w,py=(b[1]*x+b[5]*y+b[9]*z+b[13])/w;
   left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
  }
 }
 const mesh=d.meshes.find(m=>/Glass/.test(m.userData.path||m.name));
 const lens=new d.Box3().setFromObject(mesh).getCenter(d.v3(0,0,0));
 const lensCase=d.meshes.find(m=>/Box 4001/.test(m.userData.path||m.name));
 const opticalOffset=lens.clone().sub(new d.Box3().setFromObject(lensCase).getCenter(d.v3(0,0,0))).toArray();
 const lensDistance=lens.distanceTo(d.camera.position),lensAzimuth=Math.atan2(d.camera.position.x-lens.x,-(d.camera.position.z-lens.z)),lensProjection=lens.project(d.camera).toArray();
 const canvas=d.renderer.domElement,gl=canvas.getContext('webgl2'),pixel=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
 let visible=0;for(let i=3;i<pixel.length;i+=4)if(pixel[i]>10)visible++;
 const r=document.querySelector('#viewport').getBoundingClientRect();
 return {eye:d.camera.position.toArray(),target:d.controls.target.toArray(),lensDistance,lensAzimuth,lensProjection,opticalOffset,minimumDepth,visible,bounds:{left,right,top,bottom},viewport:{top:r.top,bottom:r.bottom,height:r.height},productBottom:r.top+(1-top)*r.height/2,chaptersTop:document.querySelector('.shot-chapters').getBoundingClientRect().top,parts:CAMID_STATE.revealParts,progress:CAMID_STATE.shot.progress,cue:d.cue(CAMID_STATE.shot.progress,innerWidth<=760,false)};
});
const seek=async(page,p)=>{await page.evaluate(value=>__ad.seek(value),p);await page.waitForTimeout(100);};
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const beforeSource=await fs.readFile(path.join(baseline,'src/app.js'),'utf8'),beforeTimeline=await fs.readFile(path.join(baseline,'src/reveal-timeline.js'),'utf8'),bundles={};
 for(const [name,source] of [['before',beforeSource],['after',await fs.readFile(path.join(root,'src/app.js'),'utf8')]]){
  bundles[name]=(await build({stdin:{contents:source+probe,resolveDir:path.join(root,'src')},bundle:true,format:'iife',write:false,plugins:name==='before'?[{name:'baseline-timeline',setup(b){b.onLoad({filter:/reveal-timeline\.js$/},()=>({contents:beforeTimeline,loader:'js'}));}}]:[]})).outputFiles[0].text;
 }
 const browser=await chromium.launch({headless:true,executablePath:process.env.CAMID_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],report={};
 try{
  for(const name of ['before','after']){
   const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/assets/app.js',r=>r.fulfill({contentType:'text/javascript',body:bundles[name]}));
   if(name==='before')await page.route('**/assets/reveal.css',async r=>r.fulfill({contentType:'text/css',body:await fs.readFile(path.join(baseline,'assets/reveal.css'),'utf8')}));
   await page.goto(url);await page.waitForFunction(()=>window.CAMID_STATE?.ready);await page.waitForTimeout(1400);
   await page.locator('#hero-explosion').click();await page.locator('#shot-play').click();await page.waitForTimeout(1400);await seek(page,.13);
   const macro=await sample(page);report[name]={macro};await page.screenshot({path:path.join(out,name+'-01-macro.png')});
   if(name==='before'){await page.close();continue;}
   assert(macro.viewport.top===0&&macro.viewport.bottom===900,'Desktop stage must have no internal horizontal crop boundary');
   await seek(page,.18);const pan=await sample(page);report.after.pan=pan;
   const movement=(a,b)=>Math.hypot(...a.eye.map((v,i)=>v-b.eye[i]),...a.target.map((v,i)=>v-b.target[i]));
   assert(movement(macro,pan)>.015,'Macro still holds the camera at the first reference');
   assert(pan.lensProjection[0]<macro.lensProjection[0]-.04,'Macro pan stops instead of continuing towards the lens');
   await page.screenshot({path:path.join(out,'after-02-continuing-pan.png')});
   await seek(page,.23);const dollyStart=await sample(page);await seek(page,.28);const beforeTurn=await sample(page);await seek(page,.35);const turning=await sample(page);
   const yaw=s=>Math.atan2(s.cue.dir[0],-s.cue.dir[2]);
   assert(beforeTurn.lensDistance>dollyStart.lensDistance*1.15,'Dolly must build before the left turn');
   assert(Math.abs(yaw(beforeTurn)-yaw(dollyStart))<.01,'Left arc starts together with the dolly');
   assert(Math.abs(beforeTurn.lensProjection[0])<.20,'Subject drifts sideways during the first dolly');
   assert(yaw(turning)<yaw(beforeTurn)-.15,'Delayed left arc never arrives');
   assert(turning.parts.some(part=>part.amount>0),'Explosion must already start during the pullback');
   report.dollyBeforeTurn={dollyStart:dollyStart.lensDistance,beforeTurn:beforeTurn.lensDistance,earlyArcRadians:Math.abs(yaw(beforeTurn)-yaw(dollyStart))};
   for(const p of [.11,.13,.16,.19,.215,.295,.34,.37,.47,.52,.61,.86]){
    await seek(page,p-.001);const a=await sample(page);await seek(page,p+.001);const b=await sample(page);assert(movement(a,b)>.0001,'Motion stops at '+p);
   }
   for(const [label,p] of [['03-dolly-first',.28],['04-turn-arrives',.32],['05-overlapping-explosion',.38],['06-shell',.48],['07-mechanism',.72],['08-finale',1]]){
    await seek(page,p);await page.waitForTimeout(300);const measured=await sample(page);report.after[label]=measured;
    if(p<=.34)assert(measured.parts.every(part=>part.offset===0),'Shells open before the safe pullback');
    if(p===.38){
     assert(measured.parts.some(part=>part.amount>.01)&&measured.cue.zoom<1,'Explosion does not overlap the continuing dolly');
     assert(Math.hypot(...measured.opticalOffset.map((v,i)=>v-macro.opticalOffset[i]))<1e-8,'Optics detach from the lens ring during the case release');
    }
    await page.screenshot({path:path.join(out,'after-'+label+'.png')});
   }
   const final=report.after['08-finale'];assert(final.productBottom<final.chaptersTop-8,'Final parts overlap the timeline chapters');
   let minimumDepth=Infinity;
   for(let i=0;i<=50;i++){await seek(page,i/50);const measured=await sample(page);assert(measured.visible>1000,'Empty frame at '+i/50);assert(measured.minimumDepth>.075,'Camera near plane intersects a product vertex at '+i/50);minimumDepth=Math.min(minimumDepth,measured.minimumDepth);if(i/50<=.34)assert(measured.parts.every(part=>part.offset===0));}
   report.minimumAllPartDepth=minimumDepth;
   await seek(page,.25);const saved=await sample(page);await seek(page,.85);await seek(page,.25);assert.deepEqual(await sample(page),saved);assert(!(await page.locator('.shot-finale').isVisible()));
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1400);
   for(const [label,p] of [['09-mobile-macro',.13],['10-mobile-overlap',.38],['11-mobile-finale',1]]){
    await seek(page,p);await page.waitForTimeout(400);const measured=await sample(page);assert(measured.visible>1000&&measured.minimumDepth>.075);report.after[label]=measured;await page.screenshot({path:path.join(out,'after-'+label+'.png')});
   }
   await page.close();
  }
  assert.deepEqual(errors,[]);Object.assign(report,{passed:true,continuousMacro:true,dollyPrecedesLeftTurn:true,explosionDuringDolly:true,fullBleedDesktop:true,allPartNearPlaneSafety:true,deterministicSeeking:true,mobile:true,errors});
  const compact=value=>{const {parts,...rest}=value;return rest;};for(const group of Object.values(report))if(group&&typeof group==='object'&&!Array.isArray(group))for(const [key,value] of Object.entries(group))if(value&&value.parts)group[key]=compact(value);
  await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,continuousMacro:true,dollyPrecedesLeftTurn:true,explosionDuringDolly:true,fullBleedDesktop:true,allPartNearPlaneSafety:true,minimumAllPartDepth:report.minimumAllPartDepth,deterministicSeeking:true,mobile:true,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
