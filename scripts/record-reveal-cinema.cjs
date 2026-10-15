// Record the actual WebGL reveal as a standalone, silent product film.
const fs=require('node:fs/promises'),path=require('node:path'),{createRequire}=require('node:module');
const filmName=process.env.CAMID_FILM_NAME||'camid-reveal-longtake';
const previewUrl=process.env.CAMID_URL||'http://127.0.0.1:4189/#home';
const root=path.resolve(__dirname,'..'),{build}=createRequire(path.join(root,'package.json'))('esbuild'),{chromium}=createRequire(process.execPath)('playwright');
(async()=>{
 const source=await fs.readFile(path.join(root,'src/app.js'),'utf8');
 const bundle=(await build({stdin:{contents:source+'\nwindow.__film={seek:seekShot,start:startShot,shot,renderer,scene,camera};',resolveDir:path.join(root,'src')},bundle:true,format:'iife',write:false})).outputFiles[0].text;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CAMID_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/app.js',r=>r.fulfill({contentType:'text/javascript',body:bundle}));
  await page.goto(previewUrl);await page.waitForFunction(()=>window.CAMID_STATE?.ready);await page.waitForTimeout(1400);
  await page.locator('#hero-explosion').click();await page.evaluate(()=>__film.seek(0));await page.waitForTimeout(1400);
  const movie=await page.evaluate(async()=>{
   const backdrop=new Image();backdrop.src='assets/studio-backdrop.jpg';await backdrop.decode();await document.fonts.ready;
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
   const ctx=canvas.getContext('2d'),source=__film.renderer.domElement;
   const stream=canvas.captureStream(30),type=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
   const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:7000000}),chunks=[];
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   const completed=new Promise(resolve=>recorder.onstop=resolve);
   const draw=()=>{
    ctx.fillStyle='#080406';ctx.fillRect(0,0,1280,720);
    const scale=Math.max(1280/backdrop.width,720/backdrop.height),w=backdrop.width*scale,h=backdrop.height*scale;
    ctx.drawImage(backdrop,(1280-w)/2,(720-h)/2,w,h);
    const shade=ctx.createLinearGradient(0,0,1280,0);shade.addColorStop(0,'#080406c0');shade.addColorStop(.55,'#08040625');shade.addColorStop(1,'#08040630');ctx.fillStyle=shade;ctx.fillRect(0,0,1280,720);
    ctx.drawImage(source,0,0,1280,720);
    ctx.font='600 16px "Chakra Petch",sans-serif';ctx.fillStyle='#f0e4e3';ctx.fillText('CAMID B1',40,43);
    ctx.font='9px "Space Grotesk",sans-serif';ctx.fillStyle='#bb969b';ctx.fillText('MECHANICAL CAMERA',40,62);
    ctx.fillStyle='#a6858d';ctx.fillText('LIGHT  /  MOTION  /  MEMORY',40,685);
   };
   __film.seek(0);__film.renderer.render(__film.scene,__film.camera);draw();
   recorder.start();__film.start(1);
   const started=performance.now();let frames=0,finishedAt=0;
   await new Promise(resolve=>{
    const tick=()=>{
     draw();frames++;
     if(__film.shot.progress===1&&!__film.shot.running){if(!finishedAt)finishedAt=performance.now();if(performance.now()-finishedAt>450){recorder.stop();resolve();return;}}
     if(performance.now()-started>30000){recorder.stop();resolve();return;}
     requestAnimationFrame(tick);
    };requestAnimationFrame(tick);
   });
   await completed;stream.getTracks().forEach(track=>track.stop());
   const blob=new Blob(chunks,{type:recorder.mimeType});
   const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
   return {data,mime:recorder.mimeType,frames,wallSeconds:(performance.now()-started)/1000,complete:__film.shot.progress===1};
  });
  if(errors.length||!movie.complete)throw new Error('Recording failed: '+JSON.stringify(errors));
  const out=path.join(root,'previews');await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,filmName+'.webm'),Buffer.from(movie.data,'base64'));
  const {data,...metadata}=movie;await fs.writeFile(path.join(out,filmName+'.json'),JSON.stringify(metadata,null,2));
  // Confirm the saved film decodes and its beginning, middle and end are seekable.
  const video=await browser.newPage();await video.goto(new URL('previews/'+filmName+'.webm',previewUrl).href);
  await video.locator('video').waitFor();await video.waitForFunction(()=>document.querySelector('video').readyState>=2);
  await video.evaluate(()=>{const v=document.querySelector('video');v.pause();v.currentTime=1e6;});
  await video.waitForFunction(()=>Number.isFinite(document.querySelector('video').duration));
  const decoded=await video.evaluate(async()=>{const v=document.querySelector('video');const duration=v.duration;for(const at of [0,duration/2,duration-.2]){v.currentTime=at;await new Promise(resolve=>v.addEventListener('seeked',resolve,{once:true}));}return {duration,width:v.videoWidth,height:v.videoHeight};});
  console.log(JSON.stringify({...metadata,decoded,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
