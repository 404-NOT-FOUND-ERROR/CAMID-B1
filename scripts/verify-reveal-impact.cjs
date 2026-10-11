// Compare the actual rendered framing with the backed-up reveal, then sample the
// entire camera path for lens clipping and collisions with the presentation UI.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),out=path.join(root,'screenshots','reveal-impact');
const {build}=createRequire(path.join(root,'package.json'))('esbuild');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire(process.execPath)('playwright'));}
const url=process.env.CAMID_URL||'http://127.0.0.1:4189/#home';
const baseline=process.env.CAMID_BASELINE||path.join(root,'references','reveal-impact','baseline');
const probe='\nwindow.__impact={meshes,camera,renderer,scene,controls,v3,keyLight,fillLight,redRim,ambientLight};';
const measure=page=>page.evaluate(()=>{
 const d=__impact;d.renderer.render(d.scene,d.camera);
 const rect=document.querySelector('#viewport').getBoundingClientRect();
 const project=mesh=>{
  const b=mesh.geometry.boundingBox,points=[];let near=Infinity;
  for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
   const world=d.v3(x,y,z).applyMatrix4(mesh.matrixWorld);near=Math.min(near,-world.clone().applyMatrix4(d.camera.matrixWorldInverse).z);
   points.push(world.project(d.camera));
  }
  return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.max(...points.map(p=>p.y)),bottom:Math.min(...points.map(p=>p.y)),near};
 };
 const parts=d.meshes.filter(m=>m.visible),bounds=parts.map(project),lens=project(parts.find(m=>/Glass/.test(m.name)));
 const product={left:Math.min(...bounds.map(b=>b.left)),right:Math.max(...bounds.map(b=>b.right)),top:Math.max(...bounds.map(b=>b.top)),bottom:Math.min(...bounds.map(b=>b.bottom))};
 const c=d.renderer.domElement,gl=c.getContext('webgl2'),pixels=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
 let visible=0,red=0,bright=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<=10)continue;visible++;if(pixels[i]>pixels[i+1]*1.35&&pixels[i]>pixels[i+2]*1.2&&pixels[i]>35)red++;if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>190)bright++;}
 return {lens,product,lensHeightPx:(lens.top-lens.bottom)*rect.height/2,productHeightPx:(product.top-product.bottom)*rect.height/2,viewport:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},visible,red,bright,lights:{key:d.keyLight.intensity,fill:d.fillLight.intensity,rim:d.redRim.intensity,ambient:d.ambientLight.intensity},parts:parts.length};
});
const seek=async(page,value)=>{await page.locator('#shot-range').fill(String(Math.round(value*1000)/10));await page.waitForTimeout(160);};
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const beforeSource=await fs.readFile(path.join(baseline,'src/app.js'),'utf8'),beforeTimeline=await fs.readFile(path.join(baseline,'src/reveal-timeline.js'),'utf8');
 const sources=[['before',beforeSource],['after',await fs.readFile(path.join(root,'src/app.js'),'utf8')]],bundles={};
 for(const [name,source] of sources){
  bundles[name]=(await build({stdin:{contents:source+probe,resolveDir:path.join(root,'src')},bundle:true,format:'iife',write:false,plugins:name==='before'?[{name:'baseline-timeline',setup(b){b.onLoad({filter:/reveal-timeline\.js$/},()=>({contents:beforeTimeline,loader:'js'}));}}]:[]})).outputFiles[0].text;
 }
 const browser=await chromium.launch({headless:true,executablePath:process.env.CAMID_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],report={};
 try{
  for(const name of ['before','after']){
   const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/assets/app.js',r=>r.fulfill({contentType:'text/javascript',body:bundles[name]}));
   if(name==='before')await page.route('**/assets/reveal.css',async r=>r.fulfill({contentType:'text/css',body:await fs.readFile(path.join(baseline,'assets/reveal.css'),'utf8')}));
   await page.goto(url);await page.waitForFunction(()=>window.CAMID_STATE?.ready);await page.waitForTimeout(1400);
   const home=await measure(page);await page.screenshot({path:path.join(out,name+'-01-home.png')});
   await page.locator('#hero-explosion').click();await page.locator('#shot-play').click();
   await seek(page,.15);await page.waitForTimeout(1300);const macro=await measure(page);await page.screenshot({path:path.join(out,name+'-02-macro.png')});
   await seek(page,.34);const whole=await measure(page);await page.screenshot({path:path.join(out,name+'-03-whole.png')});
   await seek(page,1);await page.waitForTimeout(800);const final=await measure(page);await page.screenshot({path:path.join(out,name+'-04-final.png')});
   report[name]={home,macro,whole,final};
   if(name==='after'){
    let minimumLensDepth=Infinity;
    for(let i=0;i<=40;i++){await seek(page,i/40);const m=await measure(page);assert(m.visible>1000,'Empty camera frame at '+i/40);minimumLensDepth=Math.min(minimumLensDepth,m.lens.near);}
    assert(minimumLensDepth>.03,'Camera intersects the optical surface');report.minimumLensDepth=minimumLensDepth;
    await seek(page,.15);const sampled=await measure(page);await seek(page,.8);await seek(page,.15);assert.deepEqual(await measure(page),sampled);report.deterministicLightingAndFraming=true;
    await page.locator('#shot-exit').click();await page.locator('.chapter-nav [data-mode="assembly"]').click();
    const studio=await page.evaluate(()=>({ambient:__impact.ambientLight.intensity,key:__impact.keyLight.intensity,fill:__impact.fillLight.intensity}));
    assert.deepEqual(studio,{ambient:1.1,key:4.4,fill:1});report.explorationLightingRestored=true;
    await page.locator('.chapter-nav [data-mode="home"]').click();await page.waitForTimeout(1400);
    await page.locator('#hero-explosion').click();await page.locator('#shot-play').click();await seek(page,.15);
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);const mobile=await measure(page);assert(mobile.visible>1000);assert(mobile.lensHeightPx>210);report.mobileMacro=mobile;
    await page.screenshot({path:path.join(out,'after-05-mobile-macro.png')});
   }
   await page.close();
  }
  report.macroMagnification=report.after.macro.lensHeightPx/report.before.macro.lensHeightPx;
  report.homeMagnification=report.after.home.productHeightPx/report.before.home.productHeightPx;
  assert(report.macroMagnification>2.5,'Opening remains too conservative');assert(report.homeMagnification>1.15);
  assert(report.after.macro.product.top-report.after.macro.product.bottom>3,'Macro should crop the body');
  assert(report.after.macro.lensHeightPx>report.after.whole.lensHeightPx*2.5,'Pullback does not establish a distinct full product view');
  assert(report.after.macro.red>report.before.macro.red*2,'Red material detail is not visible');
  assert.deepEqual(errors,[]);report.errors=errors;report.passed=true;
  await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,macroMagnification:report.macroMagnification,homeMagnification:report.homeMagnification,minimumLensDepth:report.minimumLensDepth,deterministicLightingAndFraming:true,explorationLightingRestored:true,mobileMacro:true,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
