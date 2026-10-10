const {createRequire}=require('node:module');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=createRequire(process.execPath)('playwright'));}
const root=path.resolve(__dirname,'..');
const browserPath=process.env.CAMID_BROWSER||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
const port=process.env.CAMID_PORT||'4175';
(async()=>{
 const browser=await chromium.launch({headless:true,...(browserPath?{executablePath:browserPath}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?v=blackgold#home`);
  await page.waitForFunction(()=>window.CAMID_STATE?.ready);await page.waitForTimeout(700);
  const state=()=>page.evaluate(()=>({count:CAMID_STATE.partCount,logos:CAMID_STATE.logoCount,shot:CAMID_STATE.shot,projections:CAMID_STATE.projections}));
  const pixels=()=>page.evaluate(()=>{
   const c=document.querySelector('#viewport canvas'),gl=c.getContext('webgl2'),p=new Uint8Array(c.width*c.height*4);
   gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);
   let count=0,hash=2166136261;for(let i=0;i<p.length;i+=4){if(p[i+3])count++;hash=Math.imul(hash^p[i],16777619);}return {count,hash};
  });
  const screenshot=name=>page.screenshot({path:path.join(root,'screenshots',name)});
  const finished=progress=>page.waitForFunction(p=>CAMID_STATE.shot.progress===p&&!CAMID_STATE.shot.running,progress,{timeout:15000});
  const base=await state();assert.equal(base.count,47);assert.equal(base.logos,1);
  assert.equal(await page.evaluate(()=>CAMID_STATE.visibleParts.filter(n=>/^Trap /.test(n)).length),1);
  const first=await pixels();assert(first.count>20000);await screenshot('11-black-gold-home.png');
  await page.locator('#hero-explosion').click();await page.waitForTimeout(2200);
  const middle=await state();assert(middle.shot.running&&middle.shot.progress>0&&middle.shot.progress<1);
  await screenshot('12-black-gold-burst.png');await finished(1);
  const end=await state();assert(end.projections.every(p=>Math.abs(p.x)<.98&&Math.abs(p.y)<.98));
  assert.equal(end.projections.filter(p=>/^Trap /.test(p.name)).length,1);
  assert.notDeepEqual(end.shot.camera,base.shot.camera);assert.notEqual((await pixels()).hash,first.hash);
  await screenshot('13-black-gold-exploded.png');
  await page.locator('#shot-reverse').click();await page.waitForTimeout(1200);
  await page.locator('#shot-play').click();assert(!(await state()).shot.running);
  await page.locator('#shot-play').click();await finished(0);await page.waitForTimeout(1600);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  assert((await pixels()).count>3000,'Mobile return has no visible product');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('14-black-gold-mobile.png');
  await page.locator('#hero-explosion').click();await finished(1);
  assert((await state()).projections.every(p=>Math.abs(p.x)<.98&&Math.abs(p.y)<.98));
  await screenshot('15-black-gold-mobile-exploded.png');
  await page.locator('.chapter-nav [data-mode="assembly"]').click();
  await page.locator('.chapter-nav [data-mode="home"]').click();assert.equal((await state()).shot.progress,0);
  const offline=await browser.newPage();offline.on('pageerror',e=>errors.push(e.message));
  await offline.goto('file:///'+path.join(root,'index.html').replaceAll('\\','/'));
  await offline.waitForFunction(()=>CAMID_STATE?.ready);assert.equal(await offline.evaluate(()=>CAMID_STATE.logoCount),1);
  assert.equal(await offline.evaluate(()=>CAMID_STATE.partCount),47);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,parts:base.count,embeddedLogo:true,continuousShot:true,pauseResumeReverse:true,mobileReturn:true,offline:true,firstCanvasPixels:first.count,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
