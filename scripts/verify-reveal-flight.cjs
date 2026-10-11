const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),out=path.join(root,'screenshots','reveal-flight');
const {build}=createRequire(path.join(root,'package.json'))('esbuild');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire(process.execPath)('playwright'));}
const url=process.env.CAMID_URL||'http://127.0.0.1:4189/#home';
const baseline=process.env.CAMID_FLIGHT_BASELINE||path.join(root,'references','reveal-flight','baseline');
const moduleFrom=async file=>import('data:text/javascript;base64,'+Buffer.from(await fs.readFile(file,'utf8')).toString('base64'));
const yaw=c=>Math.atan2(c.dir[0],-c.dir[2]);
const near=(a,b)=>assert(Math.abs(a-b)<1e-10);
const sample=page=>page.evaluate(()=>{
 const d=__flight;d.renderer.render(d.scene,d.camera);const mesh=d.meshes.find(m=>/Glass/.test(m.name)),b=mesh.geometry.boundingBox;
 let lensDepth=Infinity;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])lensDepth=Math.min(lensDepth,-d.v3(x,y,z).applyMatrix4(mesh.matrixWorld).applyMatrix4(d.camera.matrixWorldInverse).z);
 const c=d.renderer.domElement,gl=c.getContext('webgl2'),p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);
 let visible=0;for(let i=3;i<p.length;i+=4)if(p[i]>10)visible++;
 return {camera:d.camera.position.toArray(),target:d.controls.target.toArray(),up:d.camera.up.toArray(),visible,lensDepth,key:d.keyLight.position.toArray(),rim:d.redRim.position.toArray(),progress:CAMID_STATE.shot.progress};
});
const seek=async(page,p)=>{await page.locator('#shot-range').fill(String(Math.round(p*1000)/10));await page.waitForTimeout(100);};
(async()=>{
 const old=await moduleFrom(path.join(baseline,'src/reveal-timeline.js')),now=await moduleFrom(path.join(root,'src/reveal-timeline.js'));
 for(const mobile of [false,true]){
  for(const p of [0,.02,.05,.075,.1,.11]){const a=now.cameraCue(p,mobile,false),b=old.cameraCue(p,mobile,false);for(let i=0;i<3;i++)near(a.dir[i],b.dir[i]);for(const field of ['roll','zoom','focus','screenX','screenY'])near(a[field],b[field]);}
  for(const p of [.35,.57,1]){const a=now.cameraCue(p,mobile,false),b=old.cameraCue(p,mobile,false);near(yaw(a),-yaw(b));near(a.roll,-b.roll);}
  let previous=yaw(now.cameraCue(.19,mobile,false));for(let i=20;i<=35;i++){const value=yaw(now.cameraCue(i/100,mobile,false));assert(value<previous,'Right turn reversed before the full object');previous=value;}
  const epsilon=1e-5;
  for(const p of [.19,.29,.35,.57,.86]){
   const a=now.cameraCue(p-epsilon,mobile,false),b=now.cameraCue(p,mobile,false),c=now.cameraCue(p+epsilon,mobile,false);
   const fields=s=>[yaw(s),Math.atan2(s.dir[1],Math.hypot(s.dir[0],s.dir[2])),s.roll,s.zoom,s.focus];
   const x=fields(a),y=fields(b),z=fields(c),left=y.map((v,i)=>(v-x[i])/epsilon),right=z.map((v,i)=>(v-y[i])/epsilon);
   assert(Math.hypot(...left)>1e-3,'Flight stops at '+p);assert(Math.hypot(...left.map((v,i)=>v-right[i]))<.03,'Velocity jumps at '+p);
  }
  for(const p of [0,.2,.5,1])assert.deepEqual(now.cameraCue(p,mobile,true),{dir:[1.7,.45,-1.35],roll:-.30,zoom:1,focus:0,screenX:0,screenY:0});
 }
 await fs.mkdir(out,{recursive:true});
 const source=await fs.readFile(path.join(root,'src/app.js'),'utf8');
 const bundle=await build({stdin:{contents:source+'\nwindow.__flight={meshes,camera,controls,renderer,scene,v3,keyLight,redRim,fillLight,rearFill};',resolveDir:path.join(root,'src')},bundle:true,format:'iife',write:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CAMID_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/app.js',r=>r.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
  await page.goto(url);await page.waitForFunction(()=>window.CAMID_STATE?.ready);await page.waitForTimeout(1400);
  await page.locator('#hero-explosion').click();await page.locator('#shot-play').click();await seek(page,.19);await page.waitForTimeout(1300);
  const poses=[];for(const [name,p] of [['01-slow-pass',.19],['02-right-bank',.25],['03-full-object',.35],['04-mirrored-shell',.50],['05-mirrored-mechanism',.69],['06-mirrored-finale',1]]){
   await seek(page,p);await page.waitForTimeout(400);poses.push({name,...await sample(page)});await page.screenshot({path:path.join(out,name+'.png')});
  }
  let minimumLensDepth=Infinity;for(let i=0;i<=50;i++){await seek(page,i/50);const s=await sample(page);assert(s.visible>1000,'Empty flight frame at '+i/50);minimumLensDepth=Math.min(minimumLensDepth,s.lensDepth);}
  assert(minimumLensDepth>.03,'Flight intersects the lens');
  await seek(page,.25);const saved=await sample(page);await seek(page,.8);await seek(page,.25);assert.deepEqual(await sample(page),saved);assert(!(await page.locator('.shot-finale').isVisible()));
  await seek(page,1);await page.locator('#shot-explore').click();assert.equal(await page.evaluate(()=>CAMID_STATE.mode),'assembly');
  assert.deepEqual(await page.evaluate(()=>({key:__flight.keyLight.position.toArray(),rim:__flight.redRim.position.toArray(),fill:__flight.fillLight.position.toArray(),rear:__flight.rearFill.position.toArray()})),{key:[3,4,-3],rim:[1,3,4],fill:[-4,2,-1],rear:[-3,2,4]});
  await page.locator('.chapter-nav [data-mode="home"]').click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1400);await page.locator('#hero-explosion').click();await page.locator('#shot-play').click();
  for(const [name,p] of [['07-mobile-bank',.25],['08-mobile-mirrored-finale',1]]){await seek(page,p);await page.waitForTimeout(500);assert((await sample(page)).visible>1000);await page.screenshot({path:path.join(out,name+'.png')});}
  assert.deepEqual(errors,[]);
  const report={passed:true,approvedOpeningPreserved:true,continuousKeyframeVelocity:true,rightBank:true,mirroredAngles:true,deterministicCameraAndLighting:true,explorationLightsRestored:true,reducedMotionFixed:true,mobile:true,minimumLensDepth,poses,errors};
  await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,poses:undefined},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
