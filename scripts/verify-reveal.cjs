const {createRequire}=require('node:module');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire(process.execPath)('playwright'));}
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'screenshots','reveal');fs.mkdirSync(out,{recursive:true});
const url=process.env.CAMID_URL||'http://127.0.0.1:4189/#home';
const state=page=>page.evaluate(()=>({shot:CAMID_STATE.shot,parts:CAMID_STATE.revealParts,projections:CAMID_STATE.projections,mode:CAMID_STATE.mode}));
const seek=(page,p)=>page.locator('#shot-range').fill(String(p*100));
const screenshot=async(page,name)=>{
 const pixels=await page.evaluate(()=>{
  const c=document.querySelector('#viewport canvas'),gl=c.getContext('webgl2');
  if(gl.isContextLost())return -1;
  const data=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
  let visible=0;for(let i=3;i<data.length;i+=4)if(data[i]>10)visible++;return visible;
 });
 assert(pixels>1000,'No visible WebGL product at '+name+': '+pixels);
 await page.screenshot({path:path.join(out,name+'.png')});
};
const contained=s=>assert(s.projections.every(p=>Math.abs(p.x)<.98&&Math.abs(p.y)<.98&&p.z<1),'Product escaped the view');
const loaded=async page=>{await page.goto(url);await page.waitForFunction(()=>window.CAMID_STATE?.ready);await page.waitForTimeout(1300);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CAMID_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],report={};
 const watch=page=>page.on('pageerror',e=>errors.push(e.message));
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});watch(page);await loaded(page);
  assert.equal(await page.evaluate(()=>CAMID_STATE.partCount),46);assert.equal(await page.evaluate(()=>CAMID_STATE.logoCount),1);
  assert((await state(page)).parts.every(p=>p.offset===0));contained(await state(page));
  await screenshot(page,'01-home');
  const start=Date.now();await page.locator('#hero-explosion').click();
  await page.waitForFunction(()=>CAMID_STATE.shot.progress>.12);
  const coast=(await state(page)).shot;
  await page.waitForFunction(()=>CAMID_STATE.shot.progress>.18);
  const bank=(await state(page)).shot,yaw=s=>Math.atan2(s.camera[0]-s.target[0],-(s.camera[2]-s.target[2]));
  assert(bank.running,'Reveal stopped after the material shot');
  assert(yaw(bank)>yaw(coast)+.03,'Camera head must pan right after the slow material pass');
  report.continuesThroughMacro=true;
  await page.waitForFunction(()=>CAMID_STATE.shot.progress>.38);
  assert((await state(page)).parts.some(part=>part.amount>.01),'Explosion must begin before the pullback finishes');
  report.explosionDuringPullback=true;
  await page.waitForFunction(()=>CAMID_STATE.shot.progress>.48);await page.locator('#shot-play').click();
  const paused=await state(page);assert(!paused.shot.running);assert(paused.parts.some(p=>p.amount>.3));
  assert(paused.parts.filter(p=>/Gear/.test(p.name)).every(p=>p.amount===0),'Gears should wait for the shells');
  await page.waitForTimeout(400);assert.equal((await state(page)).shot.progress,paused.shot.progress);
  assert.deepEqual((await state(page)).shot.camera,paused.shot.camera);report.pauseAndStagger=true;
  await page.locator('#shot-play').click();await page.waitForFunction(()=>CAMID_STATE.shot.progress===1&&!CAMID_STATE.shot.running,null,{timeout:25000});
  report.playbackWallSeconds=+((Date.now()-start)/1000).toFixed(2);contained(await state(page));
  await page.waitForTimeout(800);await screenshot(page,'06-finale');
  assert(await page.locator('#shot-explore').isVisible());
  await page.locator('#shot-sound').click();assert.equal(await page.locator('#shot-sound').getAttribute('aria-pressed'),'true');
  await page.locator('#shot-sound').click();assert.equal((await state(page)).shot.sound,false);report.gestureAudio=true;
  for(const [name,p] of [['02-macro',.13],['03-object',.30],['04-shell',.38],['05-mechanism',.71]]){
   await seek(page,p);await page.waitForTimeout(350);await screenshot(page,name);
   assert(!(await page.locator('.shot-finale').isVisible()),'Final exploration action overlays the material close-up');
   if(p<=.34)assert((await state(page)).parts.every(part=>part.offset===0));
  }
  const sampled=await state(page);await seek(page,.95);await seek(page,.71);
  assert.deepEqual((await state(page)).parts,sampled.parts);assert.deepEqual((await state(page)).shot.camera,sampled.shot.camera);
  report.deterministicScrubbing=true;
  await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(400);assert.equal((await state(page)).shot.progress,.71);contained(await state(page));
  await page.locator('.shot-chapters button').last().click();assert.equal((await state(page)).shot.progress,1);report.chapterSeeking=true;
  await page.locator('#shot-reverse').click();await page.waitForFunction(()=>CAMID_STATE.shot.progress<.85);await page.locator('#shot-play').click();
  assert(!(await state(page)).shot.running);await seek(page,.1);await page.locator('#shot-reverse').click();
  await page.waitForFunction(()=>!CAMID_STATE.shot.active);await page.waitForTimeout(1300);
  assert((await state(page)).parts.every(part=>part.offset===0));contained(await state(page));report.reverseAndExactReset=true;
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1300);contained(await state(page));await screenshot(page,'07-mobile-home');
  await page.locator('#hero-explosion').click();await page.locator('#shot-play').click();
  await seek(page,.15);await page.waitForTimeout(400);await screenshot(page,'08-mobile-macro');
  await seek(page,.69);await page.waitForTimeout(300);await screenshot(page,'09-mobile-mechanism');
  await page.locator('#shot-skip').click();await page.waitForTimeout(800);contained(await state(page));await screenshot(page,'10-mobile-finale');
  const layout=await page.evaluate(()=>{
   const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
   return {viewport:box('#viewport'),title:box('.shot-title'),finale:box('.shot-finale'),console:box('.shot-console'),width:document.documentElement.scrollWidth,innerWidth};
  });
  assert(layout.width<=layout.innerWidth);assert(layout.title.bottom<=layout.viewport.top+5);assert(layout.finale.bottom<layout.console.top);report.mobileLayout=layout;
  await page.setViewportSize({width:360,height:640});await page.waitForTimeout(500);contained(await state(page));await screenshot(page,'11-small-mobile-finale');
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(1400);contained(await state(page));await screenshot(page,'12-landscape-finale');
  await page.locator('#shot-explore').click();assert.equal((await state(page)).mode,'assembly');
  for(const mode of ['build','shutter','detective','home']){await page.locator('.chapter-nav [data-mode="'+mode+'"]').click();assert.equal((await state(page)).mode,mode);}
  assert.equal((await state(page)).shot.progress,0);report.chapterRegression=true;
  await page.locator('#hero-explosion').click();await page.keyboard.press('Escape');assert(!(await state(page)).shot.active);report.keyboardEscape=true;
  const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});watch(reduced);await loaded(reduced);
  assert((await state(reduced)).shot.reducedMotion);await reduced.locator('#hero-explosion').click();
  await reduced.waitForFunction(()=>CAMID_STATE.shot.progress===1&&!CAMID_STATE.shot.running,null,{timeout:8000});contained(await state(reduced));report.reducedMotion=true;
  const offline=await browser.newPage({viewport:{width:1280,height:800}});watch(offline);
  await offline.goto('file:///'+path.join(root,'index.html').replaceAll('\\','/'));await offline.waitForFunction(()=>window.CAMID_STATE?.ready);await offline.waitForTimeout(600);
  await offline.locator('#hero-explosion').click();await offline.locator('#shot-skip').click();contained(await state(offline));report.offline=true;
  assert.deepEqual(errors,[]);report.parts=46;report.errors=errors;report.passed=true;
  fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
