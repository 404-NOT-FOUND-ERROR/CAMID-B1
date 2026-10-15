// One deterministic clock drives the camera rail, light and assembly choreography.
export const REVEAL_SECONDS = 15;
const clamp=t=>Math.max(0,Math.min(1,t));
export const smooth=t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10);};
export const interval=(t,start,end)=>smooth((t-start)/(end-start));
export const curves={push:[.42,0,.16,1],glide:[.24,0,.55,1],shell:[.56,0,.18,1],mechanism:[.48,0,.16,1],settle:[.22,0,.55,1]};
export function cubicBezier(t,[x1,y1,x2,y2]){
  t=clamp(t);if(t===0||t===1)return t;
  const sample=(u,a,b)=>3*(1-u)*(1-u)*u*a+3*(1-u)*u*u*b+u*u*u;
  let lo=0,hi=1,u=t;
  for(let i=0;i<28;i++){const x=sample(u,x1,x2);if(Math.abs(x-t)<1e-9)break;if(x<t)lo=u;else hi=u;u=(lo+hi)/2;}
  return sample(u,y1,y2);
}
export const bezierProgress=(t,start,end,curve=curves.settle)=>cubicBezier((t-start)/(end-start),curve);
export const phases=[
  {at:0,preview:.15,code:'01 / MATERIAL',title:'先看见，质感。',note:'微纹理壳体 · 赤红金属 · 光学玻璃',short:'质感'},
  {at:.22,preview:.31,code:'02 / THE OBJECT',title:'一台相机，一个整体。',note:'每个接缝，都通向里面的机械。',short:'整机'},
  {at:.35,preview:.45,code:'03 / UNDER THE SHELL',title:'让外壳，先退一步。',note:'外壳打开，三个子装配逐渐显露。',short:'开壳'},
  {at:.51,preview:.65,code:'04 / THE MECHANISM',title:'复杂，开始有了秩序。',note:'辊轴、齿轮、快门片，各自归于视野。',short:'展开'},
  {at:.84,preview:1,code:'05 / YOUR TURN',title:'一束光，如何成为照片？',note:'从这 46 个零件，开始寻找答案。',short:'探索'}
];
export const phaseAt=t=>phases.findLastIndex(phase=>t>=phase.at);
export function partReveal(name,family,t,layer=-1){
  if(/PrinterCase|Tank case|Box 4001/.test(name))return bezierProgress(t,.34,.58,curves.shell);
  if(/Trap|back tank/i.test(name))return bezierProgress(t,.39,.65,curves.shell);
  if(layer>=0)return bezierProgress(t,.60+layer*.035,.80+layer*.035,curves.mechanism);
  if(/Glass|Wheel/.test(name))return bezierProgress(t,.48,.72,curves.mechanism);
  if(/Gear/.test(name))return bezierProgress(t,.54,.80,curves.mechanism);
  if(/Crank/.test(name))return bezierProgress(t,.46,.70,curves.mechanism);
  if(/RollerSupport/.test(name))return bezierProgress(t,.47,.70,curves.mechanism);
  if(/Roller/.test(name))return bezierProgress(t,.51,.75,curves.mechanism);
  return family==='Tank'?bezierProgress(t,.44,.72,curves.mechanism):bezierProgress(t,.49,.76,curves.mechanism);
}
// Distances refer to the CLOSED product, not the changing exploded bounds.
// The final four stations use the complete assembly's framing distance.
// flow is the shared rail tangent in local screen-right / up / radial axes.
// Short macro handles protect the surface pass; long crane handles draw the C arc.
export function cinemaStations(mobile){
  return [
    {time:0,start:true,roll:-.30},
    {time:.065,yaw:.87,pitch:.15,distance:mobile?.31:.255,focus:1,detail:.54,x:mobile?.06:.16,y:.16,roll:-.30,handle:.28},
    {time:.15,yaw:.65,pitch:-.07,distance:mobile?.29:.235,focus:1,detail:.23,x:mobile?.02:.04,y:-.06,roll:-.22,flow:[.65,-1,0],handle:.34},
    {time:.22,yaw:.52,pitch:-.23,distance:mobile?.34:.28,focus:1,detail:.02,x:-.04,y:-.18,roll:-.08,handle:.34},
    {time:.285,yaw:.51,pitch:-.26,distance:.52,focus:.82,detail:.02,x:-.04,y:-.10,roll:.02,flow:[.30,-.24,1],handle:.40},
    {time:.39,yaw:.05,pitch:-.22,distance:.94,focus:.30,detail:.02,x:.02,y:-.04,roll:.10,flow:[1,.20,.80],handle:.46},
    {time:.51,yaw:-.32,pitch:.44,distance:1.38,open:.20,x:.08,y:.04,roll:.28,flow:[.45,1,.15],handle:.52},
    {time:.64,yaw:-.64,pitch:.78,finalDistance:.82,open:.72,x:.12,y:.08,roll:mobile?.52:.36,handle:.50},
    {time:.76,yaw:-.86,pitch:.51,finalDistance:.97,open:1,x:.14,y:.075,roll:mobile?.82:.30,handle:.42},
    {time:.88,yaw:-.91,pitch:.42,finalDistance:1.005,open:1,x:.14,y:.055,roll:mobile?.96:.24,handle:.34},
    {time:1,yaw:-.94,pitch:.35,finalDistance:1,open:1,x:.14,y:.055,roll:mobile?1.02:.22}
  ];
}
// Monotone cubic Bezier timing over travelled metres. Interior velocity stays
// nonzero; a station is a fly-through point, never an ease-to-stop waypoint.
export function railProgress(knots,t){
  t=clamp(t);const i=Math.min(knots.length-2,Math.max(0,knots.findLastIndex(k=>t>=k.time)));
  const slope=j=>{
    if(j===0||j===knots.length-1)return 0;
    const a=knots[j-1],b=knots[j],c=knots[j+1],h0=b.time-a.time,h1=c.time-b.time;
    const d0=(b.offset-a.offset)/h0,d1=(c.offset-b.offset)/h1;
    if(d0*d1<=0)return 0;
    const w0=2*h1+h0,w1=h1+2*h0;return (w0+w1)/(w0/d0+w1/d1);
  };
  const a=knots[i],b=knots[i+1],h=b.time-a.time,u=(t-a.time)/h,v=1-u;
  const c1=a.offset+slope(i)*h/3,c2=b.offset-slope(i+1)*h/3;
  return v*v*v*a.offset+3*v*v*u*c1+3*v*u*u*c2+u*u*u*b.offset;
}
