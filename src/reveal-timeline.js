// Presentation choreography sampled from one clock, including reverse and seek.
export const REVEAL_SECONDS = 12;
const clamp=t=>Math.max(0,Math.min(1,t));
export const smooth = t => { t=clamp(t);return t*t*t*(t*(t*6-15)+10); };
export const interval = (t,start,end)=>smooth((t-start)/(end-start));
export const curves={
  push:[.42,0,.18,1],glide:[.24,0,.55,1],pan:[.22,0,.22,1],
  dolly:[.46,0,.10,1],turn:[.54,0,.13,1],shell:[.48,0,.18,1],
  mechanism:[.34,0,.24,1],settle:[.32,0,.68,1]
};
// CSS-style cubic Bezier: solve x(u)=time before evaluating y(u).
export function cubicBezier(t,[x1,y1,x2,y2]){
  t=clamp(t);if(t===0||t===1)return t;
  const sample=(u,a,b)=>3*(1-u)*(1-u)*u*a+3*(1-u)*u*u*b+u*u*u;
  let lo=0,hi=1,u=t;
  for(let i=0;i<28;i++){
    const x=sample(u,x1,x2);if(Math.abs(x-t)<1e-9)break;
    if(x<t)lo=u;else hi=u;u=(lo+hi)/2;
  }
  return sample(u,y1,y2);
}
export const bezierProgress=(t,start,end,curve=curves.settle)=>cubicBezier((t-start)/(end-start),curve);
export const phases=[
  {at:0,preview:.135,code:'01 / MATERIAL',title:'先看见，质感。',note:'微纹理壳体 · 赤红金属 · 光学玻璃',short:'质感'},
  {at:.19,preview:.30,code:'02 / THE OBJECT',title:'一台相机，一个整体。',note:'每个接缝，都通向里面的机械。',short:'整机'},
  {at:.37,preview:.48,code:'03 / UNDER THE SHELL',title:'让外壳，先退一步。',note:'外壳打开，三个子装配逐渐显露。',short:'开壳'},
  {at:.61,preview:.75,code:'04 / THE MECHANISM',title:'复杂，开始有了秩序。',note:'辊轴、齿轮、快门片，各自归于视野。',short:'展开'},
  {at:.86,preview:1,code:'05 / YOUR TURN',title:'一束光，如何成为照片？',note:'从这 46 个零件，开始寻找答案。',short:'探索'}
];
export const phaseAt=t=>phases.findLastIndex(phase=>t>=phase.at);
export function partReveal(name,family,t,layer=-1){
  // The first shell separation rides the dolly, before the whole-object landing.
  if(/PrinterCase|Tank case|Box 4001/.test(name))return bezierProgress(t,.34,.59,curves.shell);
  if(/Trap|back tank/i.test(name))return bezierProgress(t,.40,.66,curves.shell);
  if(layer>=0)return bezierProgress(t,.64+layer*.045,.84+layer*.03,curves.mechanism);
  if(/Glass|Wheel/.test(name))return bezierProgress(t,.56,.79,curves.mechanism);
  if(/Gear/.test(name))return bezierProgress(t,.63,.88,curves.mechanism);
  if(/Crank/.test(name))return bezierProgress(t,.50,.74,curves.mechanism);
  if(/RollerSupport/.test(name))return bezierProgress(t,.52,.75,curves.mechanism);
  if(/Roller/.test(name))return bezierProgress(t,.57,.80,curves.mechanism);
  return family==='Tank'?bezierProgress(t,.46,.72,curves.mechanism):bezierProgress(t,.52,.79,curves.mechanism);
}
export function cameraCue(t,mobile,reduced){
  if(reduced)return {dir:[1.7,.45,-1.35],roll:-.30,zoom:1,focus:0,screenX:0,screenY:0,pan:0};
  const push=bezierProgress(t,0,.11,curves.push);
  const glide=bezierProgress(t,.095,.25,curves.glide);
  const dolly=bezierProgress(t,.215,.52,curves.dolly);
  const turn=bezierProgress(t,.295,.47,curves.turn);
  const orbit=bezierProgress(t,.47,1,curves.settle);
  const reframe=bezierProgress(t,.295,.50,curves.mechanism);
  const yaw0=Math.atan2(1.7,1.35),yaw1=Math.atan2(1.1,1.8),yaw2=Math.atan2(1.35,1.85),yaw3=Math.atan2(1.15,1.8);
  const yaw=yaw0+(yaw1-yaw0)*push-.025*glide-(yaw1-.025+yaw2)*turn+(yaw3+yaw2)*orbit;
  const pitch0=Math.atan2(.45,Math.hypot(1.7,1.35)),pitch1=Math.atan2(.28,Math.hypot(1.1,1.8));
  const pitch=pitch0+(pitch1-pitch0)*push+.012*glide+.073*turn+.108*orbit;
  const dir=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
  const close=mobile?.31:.27;
  const zoom=1-(1-close)*push-.012*glide+(1-close+.012)*dolly+(mobile?0:.05)*orbit;
  const roll=-.30+.12*push+.03*glide+.15*turn-(mobile?1.2:.24)*orbit;
  const detail=push*(1-bezierProgress(t,.23,.46,curves.mechanism));
  const screenX=(mobile?.08:.28)*detail,screenY=mobile?0:.18*detail+.03*orbit;
  // Pan already carries the move through the macro; the left arc starts later.
  const pan=bezierProgress(t,.08,.30,curves.pan)*(1-bezierProgress(t,.30,.50,curves.mechanism));
  return {dir,roll,zoom,focus:push*(1-reframe),screenX,screenY,pan};
}
