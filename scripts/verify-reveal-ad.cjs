const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),out=path.join(root,'screenshots','reveal-ad');
const {build}=createRequire(path.join(root,'package.json'))('esbuild');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire(process.execPath)('playwright'));}
const url=process.env.CAMID_URL||'http://127.0.0.1:4189/#home';
const baseline=process.env.CAMID_AD_BASELINE||path.join(root,'references','reveal-ad','baseline');
const probe='\nwindow.__ad={meshes,camera,controls,renderer,scene,v3,Box3:THREE.Box3,Matrix4:THREE.Matrix4,keyLight,redRim,seek:seekShot};';
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
 const lensDistance=lens.distanceTo(d.camera.position),lensProjection=lens.project(d.camera).toArray();
 const canvas=d.renderer.domElement,gl=canvas.getContext('webgl2'),pixel=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
 let visible=0;for(let i=3;i<pixel.length;i+=4)if(pixel[i]>10)visible++;
 const r=document.querySelector('#viewport').getBoundingClientRect();
 return {eye:d.camera.position.toArray(),target:d.controls.target.toArray(),lensDistance,lensProjection,minimumDepth,visible,bounds:{left,right,top,bottom},viewport:{top:r.top,bottom:r.bottom,height:r.height},productBottom:r.top+(1-top)*r.height/2,chaptersTop:document.querySelector('.shot-chapters').getBoundingClientRect().top,parts:CAMID_STATE.revealParts,progress:CAMID_STATE.shot.progress};
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
   await page.locator('#hero-explosion').click();await page.locator('#shot-play').click();await page.waitForTimeout(1400);await seek(page,.19);
   const macro=await sample(page);report[name]={macro};await page.screenshot({path:path.join(out,name+'-01-macro.png')});
   if(name==='before'){await page.close();continue;}
   assert(macro.viewport.top===0&&macro.viewport.bottom===900,'Desktop stage must have no internal horizontal crop boundary');
   await seek(page,.25);const pan=await sample(page);report.after.pan=pan;
   assert(Math.hypot(...macro.eye.map((v,i)=>v-pan.eye[i]))<1e-8,'Camera retreats while it should pan from a fixed position');
   assert(Math.abs(macro.lensDistance-pan.lensDistance)<1e-8,'Pan changes physical lens distance');
   assert(pan.lensProjection[0]<macro.lensProjection[0]-.12&&Math.abs(pan.lensProjection[0])<.20,'Right pan does not bring the lens towards the centre');
   assert(macro.lensProjection[0]<report.before.macro.lensProjection[0]-.30,'Macro remains too far to the right');
   await page.screenshot({path:path.join(out,'after-02-pan.png')});
   for(const [label,p] of [['03-arc',.29],['04-object',.39],['05-shell',.52],['06-mechanism',.72],['07-finale',1]]){
    await seek(page,p);await page.waitForTimeout(300);const measured=await sample(page);report.after[label]=measured;
    if(p<=.40)assert(measured.parts.every(part=>part.offset===0),'Shells open during the close-up');
    await page.screenshot({path:path.join(out,'after-'+label+'.png')});
   }
   const final=report.after['07-finale'];assert(final.productBottom<final.chaptersTop-8,'Final parts overlap the timeline chapters');
   let minimumDepth=Infinity;
   for(let i=0;i<=50;i++){await seek(page,i/50);const measured=await sample(page);assert(measured.visible>1000,'Empty frame at '+i/50);assert(measured.minimumDepth>.075,'Camera near plane intersects a product vertex at '+i/50);minimumDepth=Math.min(minimumDepth,measured.minimumDepth);if(i/50<=.4)assert(measured.parts.every(part=>part.offset===0));}
   report.minimumAllPartDepth=minimumDepth;
   await seek(page,.25);const saved=await sample(page);await seek(page,.85);await seek(page,.25);assert.deepEqual(await sample(page),saved);assert(!(await page.locator('.shot-finale').isVisible()));
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1400);
   for(const [label,p] of [['08-mobile-pan',.25],['09-mobile-object',.40],['10-mobile-finale',1]]){
    await seek(page,p);await page.waitForTimeout(400);const measured=await sample(page);assert(measured.visible>1000&&measured.minimumDepth>.075);report.after[label]=measured;await page.screenshot({path:path.join(out,'after-'+label+'.png')});
   }
   await page.close();
  }
  assert.deepEqual(errors,[]);Object.assign(report,{passed:true,fixedPositionRightPan:true,recentredMacro:true,fullBleedDesktop:true,shellsWaitForWholeObject:true,allPartNearPlaneSafety:true,deterministicSeeking:true,mobile:true,errors});
  const compact=value=>{const {parts,...rest}=value;return rest;};for(const group of Object.values(report))if(group&&typeof group==='object'&&!Array.isArray(group))for(const [key,value] of Object.entries(group))if(value&&value.parts)group[key]=compact(value);
  await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,fixedPositionRightPan:true,recentredMacro:true,fullBleedDesktop:true,shellsWaitForWholeObject:true,allPartNearPlaneSafety:true,minimumAllPartDepth:report.minimumAllPartDepth,deterministicSeeking:true,mobile:true,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
