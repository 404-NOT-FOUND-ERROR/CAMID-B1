// Inspect actual WebGL materials, including offline image decoding and surface detail.
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {build}=require('esbuild');
const {chromium}=createRequire(process.execPath)('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const src=await fs.readFile(path.join(root,'src/app.js'),'utf8');
 const bundled=await build({stdin:{contents:src+'\nwindow.__materials={meshes,camera,controls,fit,v3,THREE,renderer,scene};',resolveDir:root,loader:'js'},bundle:true,format:'iife',write:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CAMID_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const errors=[];const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/app.js',route=>route.fulfill({contentType:'text/javascript',body:bundled.outputFiles[0].text}));
  await page.goto(`http://127.0.0.1:${process.env.CAMID_PORT||4175}/?v=surface#home`);
  await page.waitForFunction(()=>window.CAMID_STATE?.ready);await page.waitForTimeout(800);
  await page.screenshot({path:path.join(root,'screenshots/17-charcoal-crimson-home.png')});
  const surface=await page.evaluate(()=>{
   const d=__materials;const mat=d.meshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]);
   const textures=[...new Map(mat.filter(m=>m.normalMap).map(m=>[m.name,m])).values()];
   const box=d.meshes.find(m=>m.userData.path.includes('/Box 4001'));
   const glass=mat.find(m=>m.name==='CAMID Neutral Optical Glass');
   return {parts:d.meshes.length,zones:box.material.length,textures:textures.map(m=>({name:m.name,width:m.normalMap.image.width,height:m.normalMap.image.height,roughness:!!m.roughnessMap})),glass:{color:glass.color.toArray(),transmission:glass.transmission,iridescence:glass.iridescence,attenuation:glass.attenuationColor.toArray()}};
  });
  assert.equal(surface.parts,46);assert.equal(surface.zones,4);assert.equal(surface.textures.length,5);
  assert(surface.textures.every(t=>t.width===(t.name==='CAMID Graphite Signature Panel'?1024:512)&&t.height===t.width&&t.roughness));
  assert(surface.glass.color.every(c=>c>.9));assert(surface.glass.transmission>.9);assert.equal(surface.glass.iridescence,0);
  await page.setViewportSize({width:1400,height:1100});
  await page.addStyleTag({content:'#viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}.topbar,.chapter-nav,.hero-copy,.hero-caption,.hero-index,.hero-watermark,#model-tools,.corner-note,.hero-bottom,.shot-controls{display:none!important}'});
  await page.waitForTimeout(300);
  await page.evaluate(()=>{
   const d=__materials;const box=d.meshes.find(m=>m.userData.path.includes('/Box 4001'));
   const c=new d.THREE.Box3().setFromObject(box).getCenter(d.v3(0,0,0));
   d.controls.target.copy(c).add(d.v3(0,.09,0));d.camera.position.copy(d.controls.target).add(d.v3(1,.35,-1.5).normalize().multiplyScalar(1.95));d.controls.update();
  });
  await page.waitForTimeout(500);await page.screenshot({path:path.join(root,'screenshots/18-surface-closeup.png')});
  const pixelHash=()=>page.evaluate(()=>{const d=__materials;d.renderer.render(d.scene,d.camera);const c=d.renderer.domElement,gl=c.getContext('webgl2'),p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);let hash=2166136261;for(let i=0;i<p.length;i+=4)hash=Math.imul(hash^p[i],16777619);return hash;});
  const textured=await pixelHash();
  await page.evaluate(()=>{__materials.meshes.forEach(m=>(Array.isArray(m.material)?m.material:[m.material]).forEach(a=>{if(a.normalMap){a.userData.savedNormal=a.normalMap;a.normalMap=null;a.needsUpdate=true;}}));});
  const plain=await pixelHash();assert.notEqual(textured,plain,'Normal texture has no visible effect');
  const signature=await page.evaluate(()=>{
   const d=__materials,box=d.meshes.find(m=>m.userData.path.includes('/Box 4001'));
   const m=box.material.find(m=>m.name==='CAMID Graphite Signature Panel');
   const result={boundedColorMap:m.map?.image?.width,clamped:m.map?.wrapS===d.THREE.ClampToEdgeWrapping&&m.map?.wrapT===d.THREE.ClampToEdgeWrapping};
   m.map=null;m.needsUpdate=true;return result;
  });
  assert.equal(signature.boundedColorMap,1024);assert(signature.clamped,'Signature boundary repeats over the shell');
  assert.notEqual(await pixelHash(),plain,'Signature boundary has no visible effect');
  const offline=await browser.newPage();offline.on('pageerror',e=>errors.push(e.message));
  await offline.route('**/assets/app.js',route=>route.fulfill({contentType:'text/javascript',body:bundled.outputFiles[0].text}));
  await offline.goto('file:///'+path.join(root,'index.html').replaceAll('\\','/'));await offline.waitForFunction(()=>window.CAMID_STATE?.ready);
  assert.equal(await offline.evaluate(()=>__materials.meshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]).filter(m=>m.normalMap?.image?.width===512).length>10),true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...surface,signature,surfaceAffectsPixels:true,signatureAffectsPixels:true,offlineTextures:true,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
