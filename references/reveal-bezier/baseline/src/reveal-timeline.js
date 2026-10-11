// Presentation choreography, not a simulation of the camera's kinematics.
// Everything is sampled from one time value so scrubbing and reversing agree.
export const REVEAL_SECONDS = 12;
export const smooth = t => { t = Math.max(0, Math.min(1, t)); return t*t*t*(t*(t*6-15)+10); };
export const interval = (t, start, end) => smooth((t-start)/(end-start));
export const phases = [
  {at:0, preview:.15, code:'01 / MATERIAL', title:'先看见，质感。', note:'微纹理壳体 · 赤红金属 · 光学玻璃', short:'质感'},
  {at:.19, preview:.39, code:'02 / THE OBJECT', title:'一台相机，一个整体。', note:'每个接缝，都通向里面的机械。', short:'整机'},
  {at:.40, preview:.52, code:'03 / UNDER THE SHELL', title:'让外壳，先退一步。', note:'外壳打开，三个子装配逐渐显露。', short:'开壳'},
  {at:.60, preview:.75, code:'04 / THE MECHANISM', title:'复杂，开始有了秩序。', note:'辊轴、齿轮、快门片，各自归于视野。', short:'展开'},
  {at:.86, preview:1, code:'05 / YOUR TURN', title:'一束光，如何成为照片？', note:'从这 46 个零件，开始寻找答案。', short:'探索'}
];
export const phaseAt = t => phases.findLastIndex(phase => t >= phase.at);
export function partReveal(name, family, t, layer = -1) {
  // Establish the full product before any shell moves, then keep the original order.
  t=t<.40?t*.35/.40:.35+(t-.40)*.65/.60;
  if (/PrinterCase|Tank case|Box 4001/.test(name)) return interval(t,.35,.55);
  if (/Trap|back tank/i.test(name)) return interval(t,.39,.63);
  if (layer >= 0) return interval(t,.61+layer*.045,.81+layer*.03);
  if (/Glass|Wheel/.test(name)) return interval(t,.53,.77);
  if (/Gear/.test(name)) return interval(t,.60,.87);
  if (/Crank/.test(name)) return interval(t,.49,.72);
  if (/RollerSupport/.test(name)) return interval(t,.48,.73);
  if (/Roller/.test(name)) return interval(t,.54,.79);
  return family === 'Tank' ? interval(t,.43,.71) : interval(t,.50,.78);
}

// Shape-preserving Hermite interpolation joins the restrained advertising arc.
function flightSample(keys,t,value){
  const index=Math.max(0,keys.findLastIndex(k=>t>=k.at));
  const end=Math.min(index+1,keys.length-1);
  if(index===end)return value(keys[index]);
  const slope=i=>{
    if(i===0||i===keys.length-1)return 0;
    const a=keys[i-1],b=keys[i],c=keys[i+1];
    const h0=b.at-a.at,h1=c.at-b.at;
    const d0=(value(b)-value(a))/h0,d1=(value(c)-value(b))/h1;
    if(d0*d1<=0)return 0;
    const w0=2*h1+h0,w1=h1+2*h0;
    return (w0+w1)/(w0/d0+w1/d1);
  };
  const a=keys[index],b=keys[end],span=b.at-a.at;
  const u=Math.max(0,Math.min(1,(t-a.at)/span)),u2=u*u,u3=u2*u;
  return (2*u3-3*u2+1)*value(a)+(u3-2*u2+u)*span*slope(index)+(-2*u3+3*u2)*value(b)+(u3-u2)*span*slope(end);
}
export function cameraCue(t, mobile, reduced) {
  if(reduced)return {dir:[1.7,.45,-1.35],roll:-.30,zoom:1,focus:0,screenX:0,screenY:0};
  const first={at:0,dir:[1.7,.45,-1.35],roll:-.30,zoom:1,focus:0};
  const keys=[
    {at:.11,dir:[1.1,.28,-1.8],roll:-.18,zoom:mobile?.31:.27,focus:1},
    {at:.19,dir:[1.05,.29,-1.8],roll:-.15,zoom:mobile?.31:.27,focus:1},
    {at:.25,dir:[1.05,.29,-1.8],roll:-.15,zoom:mobile?.31:.27,focus:1},
    {at:.32,dir:[-.60,.35,-1.9],roll:-.08,zoom:mobile?.70:.66,focus:.45},
    {at:.40,dir:[-1.35,.50,-1.85],roll:0,zoom:1,focus:0},
    {at:.60,dir:[-.45,.7,-1.9],roll:-.08,zoom:1,focus:0},
    {at:.86,dir:[.93,.70,-1.88],roll:mobile?-.99:-.22,zoom:mobile?1:1.04,focus:0},
    {at:1,dir:[1.15,.72,-1.8],roll:mobile?-1.2:-.24,zoom:mobile?1:1.05,focus:0}
  ];
  let dir,roll,zoom,focus;
  if(t<=.11){
    // Preserve the approved first push exactly.
    const blend=interval(t,0,.11),mix=(x,y)=>x+(y-x)*blend,b=keys[0];
    dir=first.dir.map((v,i)=>mix(v,b.dir[i]));roll=mix(first.roll,b.roll);
    zoom=mix(first.zoom,b.zoom);focus=mix(first.focus,b.focus);
  }else{
    const yaw=flightSample(keys,t,k=>Math.atan2(k.dir[0],-k.dir[2]));
    const pitch=flightSample(keys,t,k=>Math.atan2(k.dir[1],Math.hypot(k.dir[0],k.dir[2])));
    dir=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
    roll=flightSample(keys,t,k=>k.roll);zoom=flightSample(keys,t,k=>k.zoom);focus=flightSample(keys,t,k=>k.focus);
  }
  // Smaller offset recentres the macro. Pan rotates the head before the rig retreats.
  const detail=interval(t,0,.11)*(1-interval(t,.25,.40));
  const screenX=(mobile?.08:.28)*detail;
  const screenY=mobile?0:.18*detail+.03*interval(t,.40,.86);
  const pan=interval(t,.19,.29)*(1-interval(t,.29,.40));
  return {dir,roll,zoom,focus,screenX,screenY,pan};
}
