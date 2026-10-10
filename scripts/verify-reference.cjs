const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const {build}=createRequire(path.join(root,'package.json'))('esbuild');
const {chromium}=createRequire(process.execPath)('playwright');
(async()=>{
 const src=await fs.readFile(path.join(root,'src/app.js'),'utf8');
 const bundle=await build({stdin:{contents:src+'\nwindow.__inspect={meshes,camera,controls,fit,v3,THREE,renderer,scene,get model(){return model;},holder,decorations};',resolveDir:root},bundle:true,format:'iife',write:false});
 const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/assets/app.js',r=>r.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
  await p.goto(`http://127.0.0.1:${process.env.CAMID_PORT||4175}/?v=signature#home`);await p.waitForFunction(()=>window.CAMID_STATE?.ready);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
  await p.screenshot({path:path.join(root,'screenshots/20-reference-home.png')});
  const styles=[];
  for(const mode of ['assembly','build','shutter','detective']){
   await p.locator(`.chapter-nav [data-mode="${mode}"]`).click();await p.waitForTimeout(650);
   styles.push(await p.evaluate(()=>({mode:CAMID_STATE.mode,background:getComputedStyle(document.body).backgroundImage,accent:getComputedStyle(document.documentElement).getPropertyValue('--accent'),overflow:document.documentElement.scrollWidth>innerWidth})));
   await p.screenshot({path:path.join(root,`screenshots/21-reference-${mode}.png`)});
  }
  await p.locator('.chapter-nav [data-mode="home"]').click();await p.waitForTimeout(650);
  const side=await b.newPage({viewport:{width:1440,height:1000}});
  await side.route('**/assets/app.js',r=>r.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
  await side.goto(`http://127.0.0.1:${process.env.CAMID_PORT||4175}/?v=signature#home`);await side.waitForFunction(()=>window.CAMID_STATE?.ready);
  await side.addStyleTag({content:'#viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}.topbar,.chapter-nav,.hero-copy,.hero-caption,.hero-bottom,#model-tools,.corner-note{display:none!important}'});await side.waitForTimeout(300);
  const part=await side.evaluate(()=>{
   const d=__inspect,box=d.meshes.find(m=>m.userData.path.includes('/Box 4001'));
   const point=new d.THREE.Box3().setFromObject(d.decorations[0]).getCenter(d.v3(0,0,0));
   d.controls.enableDamping=false;d.controls.target.copy(point);d.camera.up.set(0,1,0);
   d.camera.position.copy(point).add(d.v3(1,.14,-.40).normalize().multiplyScalar(1.75));d.controls.update();
   return {materials:box.material.map(m=>({name:m.name,map:m.map?.image?.width})),mark:new d.THREE.Box3().setFromObject(d.decorations[0]).getCenter(d.v3(0,0,0)).toArray()};
  });await side.waitForTimeout(500);await side.screenshot({path:path.join(root,'screenshots/22-signature-panel-closeup.png')});
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(500);await p.screenshot({path:path.join(root,'screenshots/23-reference-mobile.png')});
  for(const mode of ['assembly','build','shutter','detective']){
   await p.locator(`.chapter-nav [data-mode="${mode}"]`).click();await p.waitForTimeout(650);
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow: '+mode);
   await p.screenshot({path:path.join(root,`screenshots/24-reference-mobile-${mode}.png`),fullPage:true});
  }
  const offline=await b.newPage();
  await offline.goto('file:///'+path.join(root,'index.html').replaceAll('\\','/'));await offline.waitForFunction(()=>window.CAMID_STATE?.ready);
  await offline.evaluate(()=>document.fonts.ready);
  assert(await offline.evaluate(()=>document.fonts.check('600 20px CAMID')&&document.fonts.check('400 20px Space')),'Offline brand fonts did not load');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({styles,part,errors},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
