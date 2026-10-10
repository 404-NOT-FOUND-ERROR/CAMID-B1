import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const viewport = $('#viewport');
let mode = 'home', meshes = [], selected = null, isolated = false, group = 'all';
let hideShell = false, buildStep = 0, shutterCase = false, ready = false;
const shot={progress:0,goal:0,running:false,active:false,from:0,elapsed:0,duration:5,startDirection:null,startDistance:0,startTarget:null};
let decorations=[];
const v3 = (x,y,z) => new THREE.Vector3(x,y,z);
const rawName = m => m.userData.path?.split('/').pop() || m.name;
const shortName = m => rawName(m).split('_')[0].split('^')[0];
const family = m => /\/Printer - FullAssembly\//.test(m.userData.path) ? 'Printer' :
  /\/Shutter(?:_|\/)/.test(m.userData.path) ? 'Shutter' : /\/Tank/.test(m.userData.path) ? 'Tank' : 'Camera';
const isShell = m => /PrinterCase|Tank case|Box 4001/.test(shortName(m));
const isReference = m => /film dimensions/i.test(shortName(m));
// Guard stale assets using exact instance paths; the attached Trap is retained.
const omittedPaths=new Set([
  '/Camera V3/Printer - FullAssembly/2113 - Printer - Big gear',
  '/Camera V3/Tank 6000_Défaut/Trap 6001_Défaut'
]);
const isOmittedPart = m => omittedPaths.has(m.userData.path);
const layerIndex = m => /shutter [123]/i.test(shortName(m)) ? Number(shortName(m).match(/shutter ([123])/i)[1])-1 : -1;

let renderer;
try { renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true}); }
catch(e) { $('#loading').textContent='浏览器未启用 WebGL。请在支持 WebGL 的浏览器中打开。'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0,0);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.82;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
viewport.append(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(34,1,0.01,100);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.07;
controls.enablePan=true;controls.minDistance=.25;controls.maxDistance=40;
controls.autoRotate=false;controls.autoRotateSpeed=.35;
controls.addEventListener('start',()=>{controls.autoRotate=false;syncRotate();$('#tooltip').hidden=true;});
const pmrem=new THREE.PMREMGenerator(renderer);
const hdrBytes=Uint8Array.from(atob(window.CAMID_HDR),c=>c.charCodeAt(0));
const hdrData=new RGBELoader().parse(hdrBytes.buffer);
const hdr=new THREE.DataTexture(hdrData.data,hdrData.width,hdrData.height,THREE.RGBAFormat,hdrData.type);
hdr.mapping=THREE.EquirectangularReflectionMapping;hdr.colorSpace=THREE.LinearSRGBColorSpace;hdr.needsUpdate=true;
const environment=pmrem.fromEquirectangular(hdr).texture;
// Neutral softboxes keep the optical surface readable without green/red tint.
const opticalRoom=new RoomEnvironment();
const opticalEnvironment=pmrem.fromScene(opticalRoom,.025).texture;
opticalRoom.dispose();
scene.environment=environment;scene.environmentIntensity=.85;hdr.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xf0f2f5,0x393b42,1.1));
function light(color,intensity,pos){const l=new THREE.DirectionalLight(color,intensity);l.position.copy(pos);scene.add(l);return l;}
const keyLight=light(0xf2f4ff,4.4,v3(3,4,-3));
keyLight.castShadow=true;keyLight.shadow.mapSize.set(2048,2048);
Object.assign(keyLight.shadow.camera,{left:-2.3,right:2.3,top:2.3,bottom:-2.3,near:.1,far:14});
keyLight.shadow.bias=-.00015;keyLight.shadow.normalBias=.002;keyLight.shadow.radius=4;keyLight.shadow.blurSamples=16;
light(0xe0e8ff,1.0,v3(-4,2,-1));
const redRim=light(0xe61b2d,1.25,v3(1,3,4));
const holder=new THREE.Group();holder.rotation.x=-Math.PI/2;holder.scale.setScalar(10);scene.add(holder);
let model=null;

// The shadow catcher and light grid are studio props. Product meshes come from STEP.
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.3}));
shadow.rotation.x=-Math.PI/2;shadow.position.y=-.92;shadow.receiveShadow=true;scene.add(shadow);
const grid=new THREE.GridHelper(4,24,0x476250,0x304739);grid.position.y=-.72;grid.material.transparent=true;grid.material.opacity=.18;grid.visible=false;scene.add(grid);

const buildSteps=[
  ['先立起两块支承件','按说明第 1 步，放置 RollerSupport3 和 RollerSupport4。', '两端的孔先确定轴的位置，后面插入的长轴才有落点。',m=>/RollerSupport[34]$/.test(shortName(m))],
  ['插入两根方辊','把两根 CubicRoller 放进支承件的孔中。','方辊的截面与圆辊不同。形状是判断用途的线索，具体送片动作仍需运动资料。',m=>/CubicRoller$/.test(shortName(m))],
  ['四个小齿轮就位','在方辊两端放置四个 CubeRollerGearS。','同一种零件可以出现多次。这里是四个实例，不是四种不同的设计。',m=>/CubeRollerGearS$/.test(shortName(m))],
  ['向两侧增加支承','放置 RollerSupport2 和 RollerSupport5。','多层支承限定不同轴段的位置，也给齿轮留出相邻的安装空间。',m=>/RollerSupport[25](?:\.2)?$/.test(shortName(m))],
  ['大方辊齿轮与弹簧支承','加入两块 CubicRollerGearL 和上下弹簧支承件。','支承件与弹簧是两种零件。CAD 中有支承件，不等于已经验证了弹簧的刚度或压紧力。',m=>/CubicRollerGearL|SpringSupport/.test(shortName(m))],
  ['加入两根圆辊','说明第 6 步插入 Roller 与 Roller2。网页同时显示 STEP 中它们的端部齿轮。','圆辊与方辊在同一机构中。它们怎样接触片材，需要进一步核对间隙与运动。',m=>/ - Roller2?$|RollerGear$/.test(shortName(m))],
  ['把两端支承补齐','放置 RollerSupport1 与 RollerSupport6。','轴、齿轮和支承之间互相限定空间；漏装端部支承会改变结构的支撑条件。',m=>/RollerSupport1\.2$|RollerSupport6$/.test(shortName(m))],
  ['安装左右出口件','按说明第 8 步加入 FilmExit 和 FilmExit2。','出口件位于辊筒机构旁。它限定出口的几何边界，但单凭位置不能确定片材的完整路径。',m=>/FilmExit/.test(shortName(m))],
  ['用锁件固定总成','说明第 9 步用 PrinterLock 锁定已装结构。','锁定与转动各有角色：锁件维持装配关系，轴与齿轮才是研究运动的对象。',m=>/PrinterLock/.test(shortName(m))],
  ['放进 Printer 外壳','将已装好的总成放入 PrinterCase。','内部先装好，再被外壳包围。试试上一页的“隐去外壳”，检查里面的轴与辊。',m=>/PrinterCase/.test(shortName(m))],
  ['最后安装曲柄','说明第 11 步加入 CrankHandle；这里展示 STEP 中完整的 Printer 子装配。','手柄提供输入位置。真实传动方向、比例与送片时序还需要 mates 或实机演示。',m=>true]
];

function description(m){
  const n=shortName(m);
  if(/RollerSupport/.test(n))return ['辊筒支承件','支承孔给轴提供安装位置。装配说明先放置中间支承，再插入方辊；其他支承在后续步骤补齐。'];
  if(/CubeRollerGearS/.test(n))return ['方辊小齿轮','同一几何被实例化四次，分布在两根方辊的端部。说明第 3 步明确要求四个小齿轮。'];
  if(/CubicRollerGearL/.test(n))return ['方辊大齿轮','装配说明第 5 步加入两块大方辊齿轮。它与小齿轮尺寸不同；精确传动比尚未验证。'];
  if(/RollerGear/.test(n))return ['圆辊齿轮','STEP 中有两个实例，与圆辊机构共处 Printer 子装配。具体啮合与转向需配合约束确认。'];
  if(/CubicRoller$/.test(n))return ['方辊','CAD 显示为长条方截面。说明第 2 步将两根方辊插入支承件的孔中。'];
  if(/ - Roller2?$/.test(n))return ['圆辊','真实 CAD 中的圆柱辊。两根圆辊在说明第 6 步加入，不能与方辊的功能直接混同。'];
  if(/SpringSupport/.test(n))return ['弹簧支承件','说明第 5 步加入两个支承件。实际弹簧、预紧量和压力需要补充；本页没有用假弹簧替代。'];
  if(/CrankHandle/.test(n))return ['曲柄手柄','Printer 装配的最后一步安装它。手柄是用户施加输入的位置，后续传动比尚未由运动资料验证。'];
  if(/CrankShaft/.test(n))return ['曲柄轴','位于曲柄与内部机构之间的实际轴形零件。CAD 提供静态安装位置，未提供旋转约束。'];
  if(/FilmExit/.test(n))return ['出片口构件','左右出口构件在说明第 8 步安装。它们限定出口几何，片材接触与行程仍需实机核对。'];
  if(/PrinterLock/.test(n))return ['打印机构锁件','说明第 9 步用它锁住前面装好的结构；它负责保持装配关系。'];
  if(/PrinterCase/.test(n))return ['Printer 外壳','说明第 10 步将已装总成放入盒体。关闭外壳以后，内部机构被包围。'];
  if(/Box 4001/.test(n))return ['快门盒体','快门组件的结构容器。说明要求翻到背面，再安装 Trigger、弹簧和三片快门。'];
  if(layerIndex(m)>=0)return ['快门片 '+(layerIndex(m)+1),'保留 CAD 中的具体轮廓、孔位和静态叠层。说明先放 Shutter 1，再组装 Shutter 2 与 3；实际触发时序尚未验证。'];
  if(/Wheel/.test(n))return ['光圈轮','装配说明把它称为 Aperture wheel（光圈轮）。不能把这个名字直接解释成驱动三片快门的轮。'];
  if(/Trigger/.test(n))return ['触发件','说明要求在快门盒体背面安装触发件和弹簧。具体联动和复位方式需要运动资料。'];
  if(/Glass/.test(n))return ['镜片节点','模型中的 Glass 节点。说明第 4 步安装 Lens；没有光学处方，不能据此确定焦距和成像效果。'];
  if(/back tank/i.test(n))return ['Tank 后部构件','说明在前壳和 Lever 后安装后部 Tank。CAD 保留框体与实际孔位。'];
  if(/Front tank/i.test(n))return ['Tank 前部构件','Tank Case 说明先装前壳，再插入 Lever；这些步骤确定了装配顺序。'];
  if(/lever support/i.test(n))return ['Lever 支承件','与 Lever 和操作手柄共处 Tank 子装配。静态几何已确认，运动限位尚未验证。'];
  if(/lever handle|Handle 2/i.test(n))return ['Lever 操作手柄','用户接触的操作件。说明第 5 步安装 Lever handle，不能据此确定一次拨动释放几张片材。'];
  if(/lever/i.test(n))return ['Lever 杠杆件','装配说明第 3 步插入 Lever。它在 Tank 内的几何位置已保留，工作行程需要运动资料。'];
  if(/Trap/.test(n))return ['Trap 后盖','装配说明最后关闭 Trap。这里保留贴合 Tank case 的后盖，位置与轮廓来自实际 CAD。'];
  if(/Tank case/.test(n))return ['Tank 外壳','总装配说明先将快门组滑入 Tank case，再将 Printer 组装到 Tank case 上。'];
  if(/film dimensions/i.test(n))return ['片材尺寸参考','这是源 STEP 中放在整机外的参考实体。整机展示隐藏它，目录选中后可单独检查。'];
  if(/Film/.test(n))return ['Film 片材节点','源模型中的实际片材几何。它与 film dimensions 参考实体不同，页面没有假定完整送片路径。'];
  if(/Pressure button/.test(n))return ['压力按钮','根装配中的独立零件节点。用途与操作顺序还需要说明或实机资料。'];
  return [n,'源 STEP 中的真实零件。其名称、几何、静态装配位置已保留；具体运动职责仍需补充资料。'];
}
const materialsOf=m=>Array.isArray(m.material)?m.material:[m.material];
function preserveStudioMaterial(material){
  const result=material.clone();result.side=THREE.FrontSide;result.envMapIntensity=1;
  if(result.name==='CAMID Neutral Optical Glass'){
    // Thickness is in CAD metres; the renderer already applies the holder scale.
    result.transmission=.96;result.thickness=.009;result.ior=1.5;result.roughness=.025;
    result.attenuationColor=new THREE.Color(0xffffff);result.attenuationDistance=Infinity;
    result.iridescence=0;result.envMap=opticalEnvironment;result.envMapIntensity=1.35;
    result.depthWrite=false;
  }
  return result;
}

function consolidatePartPrimitives(root){
  const parts=[];root.traverse(o=>{if(o.userData.path&&o.isGroup&&o.children.filter(c=>c.isMesh&&!c.userData.path&&!c.userData.decorative).length>1)parts.push(o);});
  // glTF splits a multimat CAD part into primitives. Merge these into one selectable part.
  parts.forEach(part=>{
    const primitives=part.children.filter(c=>c.isMesh&&!c.userData.path&&!c.userData.decorative);
    const geometry=mergeGeometries(primitives.map(c=>{c.updateMatrix();return c.geometry.clone().applyMatrix4(c.matrix);}),true);
    if(!geometry)throw new Error('Cannot consolidate CAD material primitives: '+part.name);
    const mesh=new THREE.Mesh(geometry,primitives.map(c=>c.material));mesh.name=part.name;mesh.userData={...part.userData};
    mesh.position.copy(part.position);mesh.quaternion.copy(part.quaternion);mesh.scale.copy(part.scale);
    part.children.filter(c=>!primitives.includes(c)).forEach(c=>mesh.add(c));
    part.parent.add(mesh);part.removeFromParent();
  });
}

function frame(direction,margin=1.22){
  if(!model)return;
  model.updateMatrixWorld(true);
  const points=[];meshes.filter(m=>m.visible).forEach(m=>{
    if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();
    const b=m.geometry.boundingBox;
    for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(v3(x,y,z).applyMatrix4(m.matrixWorld));
  });
  if(!points.length)return;
  const dir=direction.clone().normalize(),right=camera.up.clone().cross(dir).normalize(),up=dir.clone().cross(right);
  const ext=axis=>[Math.min(...points.map(p=>p.dot(axis))),Math.max(...points.map(p=>p.dot(axis)))];
  const [rx0,rx1]=ext(right),[uy0,uy1]=ext(up),[dz0,dz1]=ext(dir);
  const center=right.clone().multiplyScalar((rx0+rx1)/2).addScaledVector(up,(uy0+uy1)/2).addScaledVector(dir,(dz0+dz1)/2);
  const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;
  let distance=0;
  for(const point of points){
    const p=point.clone().sub(center),depth=p.dot(dir);
    distance=Math.max(distance,Math.abs(p.dot(right))*margin/tanH+depth,Math.abs(p.dot(up))*margin/tanV+depth);
  }
  return {center,distance,dir};
}
function fit(direction,margin=1.22){
  const result=frame(direction,margin);if(!result)return;
  const {center,distance,dir}=result;
  controls.target.copy(center);camera.position.copy(center).add(dir.multiplyScalar(distance));
  controls.update();
}
function defaultView(){
  if(shot.running)return;
  if(mode==='home'&&shot.active&&shot.startDirection){positionShotCamera();controls.update();return;}
  camera.up.set(mode==='home'?.10:0,1,0).normalize();
  const directions={home:v3(1,.58,-1.7),assembly:v3(1,.6,-1.7),build:v3(-1,.85,-1.35),shutter:v3(-1.5,.65,1.4)};
  fit(mode==='home'&&shot.progress>0?v3(1,.78,-1.6):(directions[mode]||directions.home),mode==='home'?1.13:1.2);
}
function syncRotate(){ $('#auto-rotate').setAttribute('aria-pressed',String(controls.autoRotate)); }
function localOffset(m,rawOffset){
  // Convert world STEP-space displacement into this instance parent's frame.
  const mat=new THREE.Matrix3().setFromMatrix4(m.userData.parentRawMatrix).invert();
  return rawOffset.clone().applyMatrix3(mat);
}
function explodedOffset(m,center){
  const n=shortName(m),f=family(m),side=Math.sign(center.x-.006)||1;
  if(f==='Shutter'){
    if(/Glass/.test(n))return v3(0,.265,.172);
    if(/Box 4001/.test(n))return v3(0,.155,.15);
    if(/Wheel/.test(n))return v3(-.022,.225,.185);
    if(layerIndex(m)>=0)return v3(0,.095-layerIndex(m)*.026,.15);
    return v3(-.075,.14,.135);
  }
  if(f==='Printer'){
    if(/PrinterCase/.test(n))return v3(0,-.045,.135);
    if(/RollerSupport/.test(n))return v3((center.x-.006)*2.9,-.006,.025);
    if(/Gear/.test(n))return v3((center.x-.006)*3.5,.018+(center.y<.003?-.028:.01),.036);
    if(/CrankHandle/.test(n))return v3(-.24,0,.025);
    if(/CrankShaft/.test(n))return v3(-.18,0,.025);
    if(/CubicRoller$/.test(n))return v3(0,.028,center.z>.063?.086:.053);
    if(/ - Roller2?$/.test(n))return v3(0,-.035,center.y>.012?.085:.050);
    if(/FilmExit/.test(n))return v3(side*.055,-.018,.108);
    if(/SpringSupport/.test(n))return v3(0,-.065,/Up/.test(n)?.025:0);
    if(/PrinterLock/.test(n))return v3(0,-.08,.07);
    return v3(side*.08,-.06,.09);
  }
  if(/Tank case\^Tank case/.test(rawName(m)))return v3(0,-.19,-.008);
  if(/back tank/i.test(n))return v3(0,-.30,-.026);
  if(/Front tank/i.test(n))return v3(0,-.11,-.025);
  if(/Trap/.test(n))return v3(0,-.405,-.026);
  if(/lever support/i.test(n))return v3(.18,-.12,-.026);
  if(/lever handle|Handle 2/i.test(n))return v3(.24,-.15,-.026);
  if(/lever/i.test(n))return v3(.12,-.14,-.026);
  if(/Film/.test(n))return v3(0,-.075,-.025);
  if(/Pressure button/.test(n))return v3(-.13,-.095,-.025);
  return v3(side*.07,-.08,0);
}
const ease=t=>t*t*(3-2*t);
function updateShotUI(){
  $('#shot-range').value=Math.round(shot.progress*100);
  $('#shot-value').textContent=Math.round(shot.progress*100)+'%';
  $('#shot-play').textContent=shot.running?'Ⅱ':'▶';
  $('#shot-play').title=shot.running?'暂停镜头':'播放镜头';
  $('#hero-explosion').disabled=!ready;
}
function captureShotCamera(){
  shot.startDirection=camera.position.clone().sub(controls.target).normalize();
  shot.startDistance=camera.position.distanceTo(controls.target);
  shot.startTarget=controls.target.clone();
}
function startShot(goal=1){
  if(!ready)return;
  if(!shot.active){captureShotCamera();shot.active=true;document.body.classList.add('shot-active');}
  shot.from=shot.progress;shot.goal=goal;shot.elapsed=0;
  shot.duration=reducedMotion?1.4:Math.max(1.8,Math.abs(goal-shot.from)*5.2);
  shot.running=true;controls.enabled=false;controls.autoRotate=false;syncRotate();updateShotUI();
}
function positionShotCamera(){
  camera.up.set(THREE.MathUtils.lerp(.10,.5,ease(shot.progress)),1,0).normalize();
  const p=ease(shot.progress),dir=shot.startDirection.clone().lerp(v3(-1.15,.72,-1.8).normalize(),p).normalize();
  const result=frame(dir,1.13);if(!result)return;
  controls.target.copy(shot.startTarget).lerp(result.center,p);
  const distance=THREE.MathUtils.lerp(shot.startDistance,result.distance,p);
  camera.position.copy(controls.target).addScaledVector(dir,Math.max(distance,result.distance));
  camera.lookAt(controls.target);
}
function tickShot(dt){
  if(mode!=='home'||!shot.running)return;
  shot.elapsed+=dt;
  const t=Math.min(shot.elapsed/shot.duration,1);
  shot.progress=THREE.MathUtils.lerp(shot.from,shot.goal,ease(t));
  updateModel();positionShotCamera();updateShotUI();
  if(t===1){shot.running=false;controls.enabled=true;updateShotUI();
    if(shot.progress===0){shot.active=false;document.body.classList.remove('shot-active');setTimeout(()=>{if(mode==='home'&&!shot.active){resize();defaultView();}},650);}
  }
}
$('#hero-explosion').addEventListener('click',()=>startShot(1));
$('#shot-play').addEventListener('click',()=>{if(shot.running){shot.running=false;controls.enabled=true;updateShotUI();}else startShot(Math.abs(shot.progress-shot.goal)>.001?shot.goal:(shot.progress>=.99?0:1));});
$('#shot-reverse').addEventListener('click',()=>startShot(0));
$('#shot-range').addEventListener('input',()=>{shot.running=false;controls.enabled=true;shot.progress=Number($('#shot-range').value)/100;updateModel();positionShotCamera();updateShotUI();});
function setAppearance(m){
  const highlight=mode==='assembly'&&selected===m;
  materialsOf(m).forEach(material=>{
    material.emissive.setHex(highlight?0xbc662b:0x000000);material.emissiveIntensity=highlight?.32:0;
    material.opacity=1;material.transparent=false;material.depthWrite=true;
    if(mode==='build' && buildStep===9 && isShell(m)){material.opacity=.28;material.transparent=true;material.depthWrite=false;}
  });
}
function updateModel(){
  if(!ready)return;
  const explode=Number($('#explode').value)/100;
  const gap=Number($('#layer-gap').value)/100;
  meshes.forEach(m=>{
    const f=family(m),n=shortName(m),idx=layerIndex(m);
    m.position.copy(m.userData.basePosition);
    m.visible=!isOmittedPart(m);
    if(mode==='home'){
      m.visible=!isReference(m);
      m.position.addScaledVector(m.userData.explodeVector,shot.progress);
      const pulse=Math.sin(Math.PI*shot.progress)*(1-shot.progress)*.5;
      m.position.addScaledVector(m.userData.burstVector,pulse);
    }
    if(mode==='assembly'){
      m.visible=(group==='all'||f===group)&&(!hideShell||!isShell(m))&&!isReference(m);
      if(isolated)m.visible=m===selected;
      if(selected===m&&isReference(m))m.visible=true;
      m.position.addScaledVector(m.userData.explodeVector,explode);
    }
    if(mode==='build')m.visible=f==='Printer' && buildSteps.slice(0,buildStep+1).some(s=>s[3](m));
    if(mode==='shutter'){
      m.visible=f==='Shutter'&&(idx>=0||shutterCase);
      if(idx>=0){
        m.position.add(localOffset(m,v3((idx-1)*gap*.075, (idx-1)*gap*.02, 0)));
      }
    }
    setAppearance(m);
  });
  shadow.visible=mode==='home'&&shot.progress<.1;grid.visible=mode==='build';
  redRim.intensity=mode==='home'?1.8:1;
  model.updateMatrixWorld(true);
}
function setMode(next){
  if(!['home','assembly','build','shutter','detective'].includes(next))next='home';
  if(next!=='home'){shot.running=false;shot.active=false;shot.progress=0;controls.enabled=true;document.body.classList.remove('shot-active');}
  mode=next;document.body.dataset.mode=mode;
  $$('.chapter').forEach(s=>{s.hidden=s.id!==mode;s.classList.toggle('active',s.id===mode);});
  $$('.chapter-nav button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  history.replaceState(null,'','#'+mode);window.scrollTo(0,0);$('#tooltip').hidden=true;
  controls.autoRotate=false;syncRotate();updateModel();
  resize();defaultView();
  // ResizeObserver handles the CSS transition; refit once after it ends.
  clearTimeout(setMode.timer);setMode.timer=setTimeout(()=>{resize();defaultView();},550);
}
$$('[data-mode]').filter(b=>b.tagName==='BUTTON').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('.brand').addEventListener('click',e=>{e.preventDefault();setMode('home');});
$('#auto-rotate').addEventListener('click',()=>{controls.autoRotate=!controls.autoRotate;syncRotate();});
$('#reset-view').addEventListener('click',()=>{if(mode==='home'&&shot.active){shot.running=false;shot.progress=0;shot.active=false;controls.enabled=true;document.body.classList.remove('shot-active');updateShotUI();updateModel();}defaultView();});
$('#fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch(e){$('#fullscreen').title='当前容器不允许全屏，请在独立浏览器打开';}
});
document.addEventListener('fullscreenchange',()=>{$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'进入全屏');});
$('#explode').addEventListener('input',()=>{$('#explode-value').textContent=$('#explode').value+'%';updateModel();});
$('#explode').addEventListener('change',()=>defaultView());
$('#shell-toggle').addEventListener('click',()=>{hideShell=!hideShell;$('#shell-toggle').setAttribute('aria-pressed',String(hideShell));$('#shell-toggle').textContent=hideShell?'显示外壳':'隐去外壳';updateModel();});
$('#layer-gap').addEventListener('input',()=>{$('#layer-gap-value').textContent=$('#layer-gap').value+'%';updateModel();});
$('#layer-gap').addEventListener('change',()=>defaultView());
$('#shutter-case').addEventListener('click',()=>{shutterCase=!shutterCase;$('#shutter-case').setAttribute('aria-pressed',String(shutterCase));$('#shutter-case').textContent=shutterCase?'只看三片快门':'显示盒体与其他零件';updateModel();defaultView();});
$$('[data-answer]').forEach(b=>b.addEventListener('click',()=>{
  const yes=b.dataset.answer==='correct';b.classList.add(yes?'correct':'wrong');
  $('#fact-answer').textContent=yes?'答对了。说明书写的是 Aperture wheel。光圈与快门各有职责；还不能据此推断快门驱动链。':'再观察说明：Wheel 被列为 Aperture wheel，也就是光圈轮。零件名字与装配资料需要一起核对。';
}));

let catalog=[];
function makeCatalog(){
  const byName=new Map();meshes.forEach(m=>{const key=family(m)+'/'+rawName(m);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(m);});
  catalog=[...byName.values()];renderCatalog();
}
function renderCatalog(){
  const term=$('#part-search').value.toLowerCase().trim();const list=$('#part-list');list.replaceChildren();
  catalog.filter(ms=>(group==='all'||family(ms[0])===group)&&(!term||(rawName(ms[0])+' '+description(ms[0])[0]).toLowerCase().includes(term))).forEach((ms,i)=>{
    const b=document.createElement('button');b.className='part-row';b.classList.toggle('active',ms.includes(selected));
    const index=document.createElement('span');index.className='part-index';index.textContent=String(i+1).padStart(2,'0');
    const label=document.createElement('span');label.className='part-name';label.textContent=description(ms[0])[0];
    const count=document.createElement('span');count.className='part-count';count.textContent=ms.length>1?'×'+ms.length:'↗';
    b.append(index,label,count);b.title=shortName(ms[0]);b.addEventListener('click',()=>selectPart(ms[0]));list.append(b);
  });
}
function selectPart(m){
  selected=m;isolated=false;$('#isolate').classList.remove('active');$('#isolate').textContent='单独观察';$('#isolate').disabled=!m;
  if(m){const d=description(m);$('#part-family').textContent=family(m).toUpperCase()+' / '+m.userData.stepLabel;
    $('#part-title').textContent=d[0];$('#part-cad').textContent=shortName(m);$('#part-description').textContent=d[1];
    $('#part-source').textContent='● 几何 / 静态位置已确认 · 功能依据见讲解';}
  else {$('#part-family').textContent='CAMERA V3 / 总装配';$('#part-title').textContent='从外面，看进里面。';$('#part-cad').textContent='点击模型上的零件';$('#part-description').textContent='外壳限定空间，支承件保持轴的位置。拆开以后，才能看清零件怎样互相配合。';}
  renderCatalog();updateModel();
}
$('#part-search').addEventListener('input',renderCatalog);
$$('[data-group]').forEach(b=>b.addEventListener('click',()=>{
  group=b.dataset.group;$$('[data-group]').forEach(x=>x.classList.toggle('selected',x===b));
  selectPart(null);defaultView();
}));
$('#clear-selection').addEventListener('click',()=>{selectPart(null);defaultView();});
$('#isolate').addEventListener('click',()=>{if(!selected)return;isolated=!isolated;$('#isolate').classList.toggle('active',isolated);$('#isolate').textContent=isolated?'回到装配':'单独观察';updateModel();defaultView();});

buildSteps.forEach((s,i)=>{const b=document.createElement('button');b.textContent=String(i+1).padStart(2,'0');b.title=s[0];b.addEventListener('click',()=>setBuild(i));$('#build-strip').append(b);});
function setBuild(i){
  buildStep=Math.max(0,Math.min(10,i));const s=buildSteps[buildStep];
  $('#build-title').textContent=s[0];$('#build-description').textContent=s[1];$('#build-cause').textContent=s[2];
  $('#build-count').textContent=(buildStep+1)+' / 11';$('#build-number').textContent=String(buildStep+1).padStart(2,'0');
  $('#build-range').value=buildStep;$('#build-prev').disabled=buildStep===0;$('#build-next').disabled=buildStep===10;
  $$('#build-strip button').forEach((b,j)=>{b.classList.toggle('active',j===buildStep);b.classList.toggle('past',j<buildStep);});
  updateModel();if(mode==='build')defaultView();
}
$('#build-prev').addEventListener('click',()=>setBuild(buildStep-1));$('#build-next').addEventListener('click',()=>setBuild(buildStep+1));
$('#build-range').addEventListener('input',()=>setBuild(Number($('#build-range').value)));$('#build-complete').addEventListener('click',()=>setBuild(10));
setBuild(0);

const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let pointerStart=null;
function intersect(e){
  const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
  raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(meshes.filter(m=>m.visible),false)[0]?.object;
}
renderer.domElement.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup',e=>{
  if(mode!=='assembly'||!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)return;
  const m=intersect(e);if(m)selectPart(m);pointerStart=null;
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(mode!=='assembly'||e.buttons){$('#tooltip').hidden=true;return;}
  const m=intersect(e);const t=$('#tooltip');t.hidden=!m;
  if(m){t.textContent=description(m)[0]+' · '+shortName(m);t.style.left=Math.min(e.clientX+14,innerWidth-220)+'px';t.style.top=e.clientY+14+'px';}
  renderer.domElement.style.cursor=m?'pointer':'grab';
});
renderer.domElement.addEventListener('pointerleave',()=>{$('#tooltip').hidden=true;});

const questions=[
  [/CrankHandle/,'曲柄手柄','Printer','手部输入件，最后加入 Printer。'],
  [/Shutter 3/i,'第三片快门','Shutter','与 Shutter 2 先组装，再放入快门盒体。'],
  [/lever handle/i,'杠杆手柄','Tank','Tank 说明第 5 步安装的操作件。'],
  [/CubicRoller$/,'方辊','Printer','两根长方辊先插入 Printer 支承孔。'],
  [/Wheel/,'光圈轮','Shutter','说明将 Aperture wheel 放在快门盒体内。'],
  [/back tank/i,'Tank 后部','Tank','Tank Case 说明的后部框体。']
];
function thumbnail(m){
  const r=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});r.setSize(360,280);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=.92;
  const s=new THREE.Scene();s.environment=environment;s.environmentIntensity=1.1;s.add(new THREE.HemisphereLight(0xffffff,0x313139,.35));
  const l=new THREE.DirectionalLight(0xfff4e7,2.2);l.position.set(-2,3,-4);s.add(l);
  const rim=new THREE.DirectionalLight(0xffffff,2.5);rim.position.set(1,3,4);s.add(rim);
  const c=new THREE.PerspectiveCamera(32,360/280,.001,100);const copy=new THREE.Mesh(m.geometry,m.material);
  m.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);s.add(copy);
  const box=new THREE.Box3().setFromObject(copy),center=box.getCenter(v3(0,0,0));copy.position.sub(center);
  const size=box.getSize(v3(0,0,0));const d=Math.max(size.x/(360/280),size.y,size.z)*1.55/(2*Math.tan(Math.PI*32/360));
  c.position.copy(v3(-1,.65,-1.7).normalize().multiplyScalar(d));c.lookAt(0,0,0);r.render(s,c);
  const result=r.domElement.toDataURL('image/png');r.dispose();return result;
}
function makeDetective(){
  $('#detective-grid').replaceChildren();$('#score').textContent='00';$('#detective-message').textContent='形状是线索，装配关系是证据。';
  questions.forEach((q,i)=>{
    const m=meshes.find(x=>q[0].test(shortName(x)));if(!m)throw new Error('Missing real part: '+q[1]);
    const card=document.createElement('article');card.className='detective-card';const img=new Image();img.src=m.userData.thumbnail ||= thumbnail(m);img.alt=q[1]+'真实 CAD 网格肖像';
    const copy=document.createElement('div');copy.className='card-copy';const micro=document.createElement('span');micro.className='micro';micro.textContent='PART '+String(i+1).padStart(2,'0')+' / CAD';
    const h=document.createElement('h3');h.textContent=q[1];const answers=document.createElement('div');answers.className='answer-options';
    ['Printer','Shutter','Tank'].forEach(f=>{const b=document.createElement('button');b.textContent=f;b.addEventListener('click',()=>{
      if(f!==q[2]){$('#detective-message').textContent='再想一想：'+q[3];b.style.borderColor='#d48b5d';return;}
      card.classList.add('solved');answers.dataset.solved='✓ '+q[2]+' · 已归位';const score=$$('.detective-card.solved').length;
      $('#score').textContent=String(score).padStart(2,'0');$('#detective-message').textContent=score===6?'全部归位！你已经读懂了三个子装配的零件地图。':q[3];
    });answers.append(b);});copy.append(micro,h,answers);card.append(img,copy);$('#detective-grid').append(card);
  });
}
$('#detective-reset').addEventListener('click',makeDetective);

function resize(){const r=viewport.getBoundingClientRect();if(!r.width||!r.height)return;const w=Math.round(r.width),h=Math.round(r.height),size=renderer.getSize(v3(0,0,0));if(size.x!==w||size.y!==h)renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(viewport);window.addEventListener('resize',()=>{resize();defaultView();});
const labelElements=[];
function updateLabels(){
  if(mode!=='shutter')return;
  const r=viewport.getBoundingClientRect();
  labelElements.forEach(({m,el})=>{
    const p=new THREE.Box3().setFromObject(m).getCenter(v3(0,0,0)).project(camera);
    el.style.left=(r.left+(p.x+1)*r.width/2+15)+'px';el.style.top=(r.top+scrollY+(1-p.y)*r.height/2-35)+'px';el.hidden=!m.visible||p.z>1;
  });
}
const clock=new THREE.Clock();
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.1);if(document.hidden||mode==='detective')return;tickShot(dt);if(!shot.running)controls.update(dt);renderer.render(scene,camera);updateLabels();}
animate();
function fatal(e){console.error(e);$('#loading').hidden=false;$('#loading').textContent='模型加载失败。请保留 assets 文件夹并重新打开。';}
try{
  const bytes=Uint8Array.from(atob(window.CAMID_GLTF),c=>c.charCodeAt(0));
  new GLTFLoader().parse(bytes.buffer,'',gltf=>{
    model=gltf.scene;consolidatePartPrimitives(model);holder.add(model);model.updateMatrixWorld(true);
    const omitted=[];
    model.traverse(m=>{if(!m.isMesh)return;if(m.userData.decorative){decorations.push(m);m.material=preserveStudioMaterial(m.material);return;}if(!m.userData.path)return;if(isOmittedPart(m)){omitted.push(m);return;}meshes.push(m);m.userData.basePosition=m.position.clone();m.userData.parentRawMatrix=m.parent.matrixWorld.clone();
      // Holder has a studio transform; remove it before computing STEP-space offsets.
      m.userData.parentRawMatrix.premultiply(holder.matrixWorld.clone().invert());
      m.material=Array.isArray(m.material)?m.material.map(preserveStudioMaterial):preserveStudioMaterial(m.material);
      m.castShadow=!/Glass/.test(shortName(m));m.receiveShadow=false;
    });
    omitted.forEach(m=>m.removeFromParent());
    model.position.set(-.005,-.025,-.002);model.updateMatrixWorld(true);
    meshes.forEach(m=>{
      const box=new THREE.Box3().setFromObject(m),center=box.getCenter(v3(0,0,0));
      const raw=center.clone().applyMatrix4(holder.matrixWorld.clone().invert()).sub(model.position);
      m.userData.explodeVector=localOffset(m,explodedOffset(m,raw));
      m.userData.burstVector=localOffset(m,raw.clone().sub(v3(.006,.012,0)).normalize().multiplyScalar(.095));
      if(layerIndex(m)>=0){const el=document.createElement('span');el.className='layer-label';el.innerHTML='<i></i>Shutter '+(layerIndex(m)+1);$('#shutter-labels').append(el);labelElements.push({m,el});}
    });
    ready=true;$('#loading').hidden=true;makeCatalog();makeDetective();setMode(location.hash.slice(1)||'home');updateShotUI();
    window.CAMID_STATE={get ready(){return ready;},get mode(){return mode;},get partCount(){return meshes.length;},get visibleParts(){return meshes.filter(m=>m.visible).map(m=>shortName(m));},get selectedPart(){return selected?shortName(selected):null;},get buildStep(){return buildStep;},get stats(){return renderer.info.render;},get shot(){return {progress:shot.progress,running:shot.running,active:shot.active,camera:camera.position.toArray(),target:controls.target.toArray()};},get logoCount(){return decorations.length;},get projections(){return meshes.filter(m=>m.visible).map(m=>{const p=new THREE.Box3().setFromObject(m).getCenter(v3(0,0,0)).project(camera);return {name:shortName(m),x:p.x,y:p.y,z:p.z};});}};
  },fatal);
}catch(e){fatal(e);}
