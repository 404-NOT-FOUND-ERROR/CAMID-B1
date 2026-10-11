// Presentation choreography, not a simulation of the camera's kinematics.
// Everything is sampled from one time value so scrubbing and reversing agree.
export const REVEAL_SECONDS = 12;
export const smooth = t => { t = Math.max(0, Math.min(1, t)); return t*t*t*(t*(t*6-15)+10); };
export const interval = (t, start, end) => smooth((t-start)/(end-start));
export const phases = [
  {at:0, preview:.15, code:'01 / MATERIAL', title:'先看见，质感。', note:'微纹理壳体 · 赤红金属 · 光学玻璃', short:'质感'},
  {at:.19, preview:.34, code:'02 / THE OBJECT', title:'一台相机，一个整体。', note:'每个接缝，都通向里面的机械。', short:'整机'},
  {at:.35, preview:.50, code:'03 / UNDER THE SHELL', title:'让外壳，先退一步。', note:'外壳打开，三个子装配逐渐显露。', short:'开壳'},
  {at:.57, preview:.73, code:'04 / THE MECHANISM', title:'复杂，开始有了秩序。', note:'辊轴、齿轮、快门片，各自归于视野。', short:'展开'},
  {at:.84, preview:1, code:'05 / YOUR TURN', title:'一束光，如何成为照片？', note:'从这 46 个零件，开始寻找答案。', short:'探索'}
];
export const phaseAt = t => phases.findLastIndex(phase => t >= phase.at);
export function partReveal(name, family, t, layer = -1) {
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

// Camera poses interpolate with zero velocity at each editorial beat.
export function cameraCue(t, mobile, reduced) {
  const keys = reduced ? [
    {at:0,dir:[1.7,.45,-1.35],roll:-.30,zoom:1,focus:0},
    {at:1,dir:[1.7,.45,-1.35],roll:-.30,zoom:1,focus:0}
  ] : [
    {at:0,dir:[1.7,.45,-1.35],roll:-.30,zoom:1,focus:0},
    {at:.11,dir:[1.1,.28,-1.8],roll:-.18,zoom:mobile?.31:.27,focus:1},
    {at:.19,dir:[1.05,.29,-1.8],roll:-.15,zoom:mobile?.31:.27,focus:1},
    {at:.35,dir:[1.7,.48,-1.55],roll:-.12,zoom:1,focus:0},
    {at:.57,dir:[.45,.7,-1.9],roll:.12,zoom:1,focus:0},
    {at:.86,dir:[-1.15,.72,-1.8],roll:mobile?1.2:.32,zoom:mobile?1:1.05,focus:0},
    {at:1,dir:[-1.15,.72,-1.8],roll:mobile?1.2:.32,zoom:mobile?1:1.05,focus:0}
  ];
  const index = Math.max(0,keys.findLastIndex(k=>t>=k.at));
  const a=keys[index], b=keys[Math.min(index+1,keys.length-1)];
  const blend=a===b?0:interval(t,a.at,b.at), mix=(x,y)=>x+(y-x)*blend;
  // The detail sits towards the right, leaving the dark side of the frame for copy.
  const detail=interval(t,0,.11)*(1-interval(t,.19,.35));
  const screenX=reduced?0:(mobile?.14:.85)*detail;
  const screenY=reduced||mobile?0:.15*detail-.16*interval(t,.35,.86);
  return {dir:a.dir.map((v,i)=>mix(v,b.dir[i])),roll:mix(a.roll,b.roll),zoom:mix(a.zoom,b.zoom),focus:mix(a.focus,b.focus),screenX,screenY};
}
