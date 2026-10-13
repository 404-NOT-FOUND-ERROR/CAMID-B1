const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'screenshots', 'reveal-cinema');
const {build} = createRequire(path.join(root, 'package.json'))('esbuild');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = createRequire(process.execPath)('playwright')); }
const url = process.env.CAMID_URL || 'http://127.0.0.1:4189/#home';
const probe = '\nwindow.__cine={meshes,camera,controls,renderer,scene,v3,Box3:THREE.Box3,Matrix4:THREE.Matrix4,seek:seekShot,shot,seconds:REVEAL_SECONDS};';
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const movement = (a, b) => Math.hypot(distance(a.eye, b.eye), distance(a.target, b.target));
const compact = ({parts, ...frame}) => frame;
const seek = async (page, progress) => {
  await page.evaluate(value => __cine.seek(value), progress);
  await page.waitForTimeout(60);
};

// Measure rendered vertices and camera poses, independently of the authored rail.
const sample = page => page.evaluate(() => {
  const d = __cine;
  d.scene.updateMatrixWorld(true);
  d.camera.updateMatrixWorld(true);
  d.renderer.render(d.scene, d.camera);
  let minimumDepth = Infinity, left = Infinity, right = -Infinity, top = -Infinity, bottom = Infinity;
  for (const mesh of d.meshes.filter(mesh => mesh.visible)) {
    const view = new d.Matrix4().multiplyMatrices(d.camera.matrixWorldInverse, mesh.matrixWorld);
    const projection = new d.Matrix4().multiplyMatrices(d.camera.projectionMatrix, view);
    const vertices = mesh.geometry.attributes.position, a = view.elements, b = projection.elements;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      minimumDepth = Math.min(minimumDepth, -(a[2] * x + a[6] * y + a[10] * z + a[14]));
      const w = b[3] * x + b[7] * y + b[11] * z + b[15];
      const px = (b[0] * x + b[4] * y + b[8] * z + b[12]) / w;
      const py = (b[1] * x + b[5] * y + b[9] * z + b[13]) / w;
      left = Math.min(left, px); right = Math.max(right, px);
      top = Math.max(top, py); bottom = Math.min(bottom, py);
    }
  }
  const canvas = d.renderer.domElement, gl = canvas.getContext('webgl2');
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let visiblePixels = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 10) visiblePixels++;
  const center = d.shot.geometry.closedCenter;
  const relative = d.camera.position.clone().sub(center);
  const lens = d.meshes.find(mesh => /Glass/.test(mesh.userData.path || mesh.name));
  const lensCenter = new d.Box3().setFromObject(lens).getCenter(d.v3(0, 0, 0));
  const parts = CAMID_STATE.revealParts;
  const viewport=document.querySelector('#viewport').getBoundingClientRect();
  const chaptersTop=document.querySelector('.shot-chapters').getBoundingClientRect().top;
  const cta=document.querySelector('.shot-finale').getBoundingClientRect();
  const lensScreen=lensCenter.clone().project(d.camera);
  const lensPixel={x:viewport.left+(lensScreen.x+1)*viewport.width/2,y:viewport.top+(1-lensScreen.y)*viewport.height/2};
  return {
    progress: d.shot.progress, eye: d.camera.position.toArray(), target: d.controls.target.toArray(),
    closedCenter: center.toArray(), distance: relative.length(), yaw: Math.atan2(relative.x, -relative.z),
    pitch: Math.atan2(relative.y, Math.hypot(relative.x, relative.z)), lensDistance: lensCenter.distanceTo(d.camera.position),
    minimumDepth, visiblePixels, bounds: {left, right, top, bottom}, safetyRetreat: d.shot.safetyRetreat ?? null,
    releasedParts: parts.filter(part => part.amount > .01).length, maximumRelease: Math.max(...parts.map(part => part.amount)),
    productBottom:viewport.top+(1-bottom)*viewport.height/2,chaptersTop,
    lensOverlapsFinale:lensPixel.x>=cta.left&&lensPixel.x<=cta.right&&lensPixel.y>=cta.top&&lensPixel.y<=cta.bottom,parts
  };
});
const safe = (frame, label) => {
  assert(frame.visiblePixels > 1000, `No visible product at ${label}`);
  assert(frame.minimumDepth > .075, `Near plane crosses product geometry at ${label}: ${frame.minimumDepth}`);
};
const contained = (frame, label) => {
  const b = frame.bounds;
  assert(b.left >= -.99 && b.right <= .99 && b.bottom >= -.99 && b.top <= .99, `Final parts leave the viewport at ${label}`);
};

(async () => {
  await fs.mkdir(out, {recursive: true});
  const source = await fs.readFile(path.join(root, 'src', 'app.js'), 'utf8');
  const bundle = (await build({stdin: {contents: source + probe, resolveDir: path.join(root, 'src')}, bundle: true, format: 'iife', write: false})).outputFiles[0].text;
  const browser = await chromium.launch({headless: true, executablePath: process.env.CAMID_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const errors = [], report = {passed: false, keyframes: {}, errors};
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/assets/app.js', route => route.fulfill({contentType: 'text/javascript', body: bundle}));
    await page.goto(url);
    await page.waitForFunction(() => window.CAMID_STATE?.ready);
    await page.waitForTimeout(1400);
    assert.equal(await page.evaluate(() => __cine.seconds), 15, 'Cinema reveal duration');
    await page.locator('#hero-explosion').click();
    await seek(page, 0);
    assert(await page.evaluate(() => Boolean(__cine.shot.rig && __cine.shot.geometry?.closedCenter)), 'World-space camera rig is missing');

    for (const [label, progress] of [
      ['01-opening', 0], ['02-macro-arrival', .07], ['03-continuing-pan', .18], ['04-dolly', .26],
      ['05-low-orbit', .32], ['06-shell-in-motion', .40], ['07-mechanism-release', .56],
      ['08-rising-orbit', .72], ['09-settling', .88], ['10-finale', 1]
    ]) {
      await seek(page, progress);
      if(progress===1)await page.waitForTimeout(850);
      const frame = await sample(page); safe(frame, label);
      report.keyframes[label] = compact(frame);
      await page.screenshot({path: path.join(out, `${label}.png`)});
    }
    contained(report.keyframes['10-finale'], 'desktop');
    assert(report.keyframes['10-finale'].productBottom<report.keyframes['10-finale'].chaptersTop-8,'Final parts cover the timeline');
    assert(!report.keyframes['10-finale'].lensOverlapsFinale,'The floating lens covers the exploration action');

    const frames = [];
    for (let i = 0; i <= 80; i++) {
      await seek(page, i / 80);
      const frame = await sample(page); safe(frame, `progress ${i / 80}`);
      frames.push(frame);
    }
    const speeds = frames.slice(1).map((frame, i) => ({
      progress: (frame.progress + frames[i].progress) / 2,
      eyeSpeed: distance(frame.eye, frames[i].eye) / (15 / 80),
      poseSpeed: movement(frame, frames[i]) / (15 / 80)
    }));
    const macro = speeds.filter(frame => frame.progress >= .07 && frame.progress <= .22);
    assert(macro.every(frame => frame.poseSpeed > 1e-4), 'Macro contains a stationary segment');
    const late = frames.filter(frame => frame.progress >= .28);
    const yawSteps = late.slice(1).map((frame, i) => Math.atan2(Math.sin(frame.yaw - late[i].yaw), Math.cos(frame.yaw - late[i].yaw)));
    assert(yawSteps.reduce((sum, step) => sum + step, 0) < -.2, 'The later camera never makes the left orbit');
    assert(Math.max(...yawSteps) < .012, 'The later camera reverses into a return orbit');
    const release = frames.filter(frame => frame.progress >= .35 && frame.progress <= .48);
    assert(release.some(frame => frame.releasedParts > 0), 'No shell separation during the dolly window');
    assert(release.at(-1).distance > release[0].distance * 1.01, 'Camera has stopped pulling away before the shell opens');
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const releaseSpeeds = speeds.filter(frame => frame.progress >= .28 && frame.progress <= .64);
    report.motion = {
      macroMeanEyeSpeed: mean(macro.map(frame => frame.eyeSpeed)),
      releaseMeanEyeSpeed: mean(releaseSpeeds.map(frame => frame.eyeSpeed)),
      releaseToMacroSpeedRatio: mean(releaseSpeeds.map(frame => frame.eyeSpeed)) / mean(macro.map(frame => frame.eyeSpeed)),
      peakEyeSpeed: Math.max(...speeds.map(frame => frame.eyeSpeed)), minimumMacroPoseSpeed: Math.min(...macro.map(frame => frame.poseSpeed)),
      laterYawTravel: yawSteps.reduce((sum, step) => sum + step, 0), largestLaterYawReversal: Math.max(0, ...yawSteps),
      dollyDuringRelease: {startDistance: release[0].distance, endDistance: release.at(-1).distance}, speeds
    };
    report.minimumAllPartDepth = Math.min(...frames.map(frame => frame.minimumDepth));
    report.maximumSafetyRetreat = Math.max(...frames.map(frame => frame.safetyRetreat || 0));
    report.frames = frames.map(compact);

    await seek(page, .24); const saved = await sample(page);
    await seek(page, .84); await seek(page, .24); const repeated = await sample(page);
    for (const field of ['eye', 'target', 'parts', 'bounds', 'minimumDepth']) assert.deepEqual(repeated[field], saved[field], `Seeking changes ${field}`);
    for (const [label, viewport] of [['11-mobile-finale', {width: 390, height: 844}], ['12-landscape-finale', {width: 844, height: 390}]]) {
      await page.setViewportSize(viewport); await page.waitForTimeout(500); await seek(page, 1);
      await page.waitForTimeout(850);
      const frame = await sample(page); safe(frame, label); contained(frame, label);
      report.keyframes[label] = compact(frame);
      await page.screenshot({path: path.join(out, `${label}.png`)});
    }
    assert.deepEqual(errors, []);
    Object.assign(report, {passed: true, continuousMacro: true, continuousVisibility: true, oneWayLaterOrbit: true, explosionDuringDolly: true, allPartNearPlaneSafety: true, deterministicSeeking: true, mobile: true});
    console.log(JSON.stringify({passed: true, minimumAllPartDepth: report.minimumAllPartDepth, maximumSafetyRetreat: report.maximumSafetyRetreat, releaseToMacroSpeedRatio: report.motion.releaseToMacroSpeedRatio, laterYawTravel: report.motion.laterYawTravel, errors}, null, 2));
  } catch (error) {
    report.failure = error.stack || String(error);
    throw error;
  } finally {
    await fs.writeFile(path.join(out, 'validation.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
