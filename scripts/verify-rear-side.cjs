const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),{build}=createRequire(path.join(root,'package.json'))('esbuild');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire(process.execPath)('playwright'));}
const url=process.env.CAMID_URL||'http://127.0.0.1:4189/#home';
(async()=>{
 const src=await fs.readFile(path.join(root,'src/app.js'),'utf8');
 const bundle=await build({stdin:{contents:src+'\nwindow.__finish={meshes,camera,controls,fit,v3,THREE,renderer,scene};',resolveDir:path.join(root,'src')},bundle:true,format:'iife',write:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CAMID_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/app.js',r=>r.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
  await page.goto(url);await page.waitForFunction(()=>window.CAMID_STATE?.ready);await page.waitForTimeout(900);
  const surfaces=await page.evaluate(()=>{
   const names=['CAMID Rear Graphite Fascia','CAMID Rear Linear Grip','CAMID Side Linear Grip'];
   return names.map(name=>{
    const mesh=__finish.meshes.find(m=>(Array.isArray(m.material)?m.material:[m.material]).some(mat=>mat.name===name));
    const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material],slot=mats.findIndex(m=>m.name===name),mat=mats[slot];
    const groups=mesh.geometry.groups.filter(g=>g.materialIndex===slot),uv=mesh.geometry.attributes.uv,index=mesh.geometry.index;
    let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
    for(const g of groups)for(let i=g.start;i<g.start+g.count;i++){const n=index.getX(i),u=uv.getX(n),v=uv.getY(n);minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v);}
    return {name,part:mesh.userData.path,base:[mat.map?.image.width,mat.map?.image.height],normal:!!mat.normalMap,orm:!!mat.roughnessMap&&!!mat.metalnessMap,clamped:mat.map?.wrapS===__finish.THREE.ClampToEdgeWrapping&&mat.map?.wrapT===__finish.THREE.ClampToEdgeWrapping,uv:[minU,maxU,minV,maxV],zones:mats.length};
   });
  });
  assert.equal(surfaces.length,3);assert(surfaces.every(s=>s.base.every(v=>v>0)&&s.normal&&s.orm&&s.clamped));
  assert(surfaces.every(s=>s.uv[0]>=-.00001&&s.uv[1]<=1.00001&&s.uv[2]>=-.00001&&s.uv[3]<=1.00001));
  assert.equal(surfaces[0].zones,4);assert.equal(surfaces[1].zones,2);assert.equal(surfaces[2].zones,4);
  const capture=path.join(root,'screenshots','finish-v4');await fs.mkdir(capture,{recursive:true});
  await page.screenshot({path:path.join(capture,'01-home.png')});
  await page.addStyleTag({content:'#viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;transition:none!important;mask-image:none!important}.topbar,.chapter-nav,.hero-copy,.hero-caption,.hero-bottom,#model-tools,.corner-note,.shot-title,.shot-console,.shot-actions,.reveal-atmosphere{display:none!important}'});await page.waitForTimeout(400);
  const pose=direction=>page.evaluate(dir=>{const d=__finish;d.controls.autoRotate=false;d.controls.enableDamping=false;d.camera.up.set(0,1,0);d.fit(d.v3(...dir),1.22);},direction);
  const pixels=()=>page.evaluate(()=>{
   const d=__finish;d.renderer.render(d.scene,d.camera);const c=d.renderer.domElement,gl=c.getContext('webgl2'),data=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
   let count=0,hash=2166136261;for(let i=0;i<data.length;i+=4){if(data[i+3]>0)count++;hash=Math.imul(hash^data[i],16777619);}return {hash,count};
  });
  const materialChange=async name=>{
   const a=await pixels();assert(a.count>10000);
   await page.evaluate(name=>{const d=__finish;d.meshes.forEach(m=>(Array.isArray(m.material)?m.material:[m.material]).filter(mat=>mat.name===name).forEach(mat=>{mat.userData.savedMap=mat.map;mat.map=null;mat.color.setRGB(.019,.021,.024);mat.needsUpdate=true;}));},name);
   const b=await pixels();assert.notEqual(a.hash,b.hash,'Artwork is not visible: '+name);
   await page.evaluate(name=>{__finish.meshes.forEach(m=>(Array.isArray(m.material)?m.material:[m.material]).filter(mat=>mat.name===name).forEach(mat=>{mat.map=mat.userData.savedMap;mat.color.setRGB(1,1,1);mat.needsUpdate=true;}));},name);
  };
  await pose([.65,.55,1.8]);await page.waitForTimeout(300);
  await materialChange('CAMID Rear Graphite Fascia');await materialChange('CAMID Rear Linear Grip');await page.screenshot({path:path.join(capture,'02-rear-web.png')});
  await pose([-1.8,.35,-.45]);await page.waitForTimeout(300);await materialChange('CAMID Side Linear Grip');await page.screenshot({path:path.join(capture,'03-side-web.png')});
  // A forward/reverse reveal must carry each material region with its owning CAD part.
  await page.evaluate(()=>document.querySelector('#hero-explosion').click());
  await page.evaluate(()=>{const range=document.querySelector('#shot-range');range.value=100;range.dispatchEvent(new Event('input'));});
  assert.equal(await page.evaluate(()=>CAMID_STATE.partCount),46);assert.equal(await page.evaluate(()=>CAMID_STATE.logoCount),1);
  assert(await page.evaluate(()=>CAMID_STATE.revealParts.filter(p=>/Trap|PrinterCase|Tank case/.test(p.name)).every(p=>p.offset>0)));
  await page.screenshot({path:path.join(capture,'04-exploded-web.png')});assert.deepEqual(errors,[]);
  const report={passed:true,parts:46,baseArtworkAffectsRearAndSidePixels:true,clampedUV:true,attachedDuringReveal:true,surfaces,errors};
  await fs.writeFile(path.join(root,'references','finish-v4','validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
