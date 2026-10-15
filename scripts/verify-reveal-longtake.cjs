const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const root = path.resolve(__dirname, '..');
const runFile = promisify(execFile);
const defaultBaseline = path.join(root, 'reveal-longtake-baseline');
const baselineRevision = process.env.CAMID_LONGTAKE_BASELINE_REV || '7238d3bc22307aa92d0bff518c52d43a39f11cd9';
const out = path.join(root, 'screenshots', 'reveal-longtake');
const {build} = createRequire(path.join(root, 'package.json'))('esbuild');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = createRequire(process.execPath)('playwright')); }
const probe = '\nwindow.__long={meshes,camera,controls,renderer,scene,v3,Box3:THREE.Box3,seek:seekShot,shot,seconds:REVEAL_SECONDS};';
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const magnitude = vector => Math.hypot(...vector);
const distance = (a, b) => magnitude(subtract(a, b));
const times = (start, end, intervals) => Array.from({length: intervals + 1}, (_, i) => start + (end - start) * i / intervals);

async function loadBaseline() {
  const localExists = await fs.stat(defaultBaseline).then(stat => stat.isDirectory()).catch(error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  const directory = process.env.CAMID_LONGTAKE_BASELINE || (!process.env.CAMID_LONGTAKE_BASELINE_REV && localExists ? defaultBaseline : null);
  if (directory) {
    const absolute = path.resolve(directory);
    const [app, timeline] = await Promise.all(['app.js', 'reveal-timeline.js'].map(file => fs.readFile(path.join(absolute, 'src', file), 'utf8')));
    return {app, timeline, origin: {directory: absolute}};
  }
  const readRevision = async file => {
    try {
      const {stdout} = await runFile('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, 'show', `${baselineRevision}:src/${file}`], {
        cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true
      });
      return stdout;
    } catch (error) {
      throw new Error(`Cannot read baseline ${baselineRevision}:src/${file}. Ensure this revision exists locally, or set CAMID_LONGTAKE_BASELINE to a directory containing src/app.js and src/reveal-timeline.js.`, {cause: error});
    }
  };
  const [app, timeline] = await Promise.all(['app.js', 'reveal-timeline.js'].map(readRevision));
  return {app, timeline, origin: {revision: baselineRevision}};
}

async function bundle(version, baseline) {
  const source = version === 'before' ? baseline.app : await fs.readFile(path.join(root, 'src', 'app.js'), 'utf8');
  const plugins = version === 'before' ? [{
    name: 'baseline-timeline',
    setup(builder) {
      builder.onResolve({filter: /^\.\/reveal-timeline\.js$/}, () => ({path: 'reveal-timeline.js', namespace: 'baseline'}));
      builder.onLoad({filter: /.*/, namespace: 'baseline'}, () => ({contents: baseline.timeline, loader: 'js', resolveDir: path.join(root, 'src')}));
    }
  }] : [];
  return (await build({
    stdin: {contents: source + probe, resolveDir: path.join(root, 'src')},
    bundle: true, format: 'iife', write: false, plugins
  })).outputFiles[0].text;
}

// Sample actual camera matrices and geometry, without inspecting authored handles.
const sample = (page, progress) => page.evaluate(value => {
  const d = __long;
  d.seek(value);
  d.scene.updateMatrixWorld(true);
  d.camera.updateMatrixWorld(true);
  const center = pattern => {
    const mesh = d.meshes.find(mesh => pattern.test(mesh.userData.path || mesh.name));
    return new d.Box3().setFromObject(mesh).getCenter(d.v3(0, 0, 0)).project(d.camera);
  };
  const glass = center(/Glass/), lensCase = center(/Box 4001/);
  const closedProjection = d.shot.geometry.closedPoints.map(point => point.clone().project(d.camera));
  const width = Math.max(...closedProjection.map(point => point.x)) - Math.min(...closedProjection.map(point => point.x));
  const relative = d.camera.position.clone().sub(d.shot.geometry.closedCenter);
  return {
    progress: d.shot.progress, seconds: d.seconds,
    eye: d.camera.position.toArray(), target: d.controls.target.toArray(),
    pitch: Math.atan2(relative.y, Math.hypot(relative.x, relative.z)),
    glass: [glass.x, glass.y], lensCase: [lensCase.x, lensCase.y], closedScreenWidth: width,
    // Subtraction removes common framing motion; normalize both axes to product width in pixels.
    parallax: [(glass.x - lensCase.x) / width, (glass.y - lensCase.y) / (width * d.camera.aspect)]
  };
}, progress);

function trajectory(frames) {
  const points = frames.map(frame => frame.eye), chord = subtract(points.at(-1), points[0]);
  const chordLength = magnitude(chord);
  assert(chordLength > 1e-6, 'Release path endpoints coincide');
  const arcLength = points.slice(1).reduce((sum, point, i) => sum + distance(point, points[i]), 0);
  const bow = Math.max(...points.map(point => {
    const relative = subtract(point, points[0]), projection = dot(relative, chord) / (chordLength * chordLength);
    return magnitude(relative.map((value, i) => value - chord[i] * projection));
  }));
  const pitches = frames.map(frame => frame.pitch);
  return {
    arcLength, chordLength, arcToChord: arcLength / chordLength, bow, bowToChord: bow / chordLength,
    minimumPitch: Math.min(...pitches), maximumPitch: Math.max(...pitches), pitchRange: Math.max(...pitches) - Math.min(...pitches),
    samples: frames
  };
}

function parallax(frames) {
  const points = frames.map(frame => frame.parallax);
  let diameter = 0;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) diameter = Math.max(diameter, distance(points[i], points[j]));
  const range = axis => Math.max(...points.map(point => point[axis])) - Math.min(...points.map(point => point[axis]));
  return {
    diameter, horizontalRange: range(0), verticalRange: range(1), endpointDifference: distance(points[0], points.at(-1)),
    travelledDifference: points.slice(1).reduce((sum, point, i) => sum + distance(point, points[i]), 0), samples: frames
  };
}

(async () => {
  await fs.mkdir(out, {recursive: true});
  const baseline = await loadBaseline();
  const bundles = {before: await bundle('before', baseline), after: await bundle('after', baseline)};
  const browser = await chromium.launch({headless: true, executablePath: process.env.CAMID_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const report = {passed: false, baseline: baseline.origin, windows: {macro: [.07, .22], release: [.40, .725], internalMotion: [.03, .97]}, errors: []};
  try {
    for (const version of ['before', 'after']) {
      const page = await browser.newPage({viewport: {width: 1440, height: 900}});
      page.on('pageerror', error => report.errors.push(`${version}: ${error.message}`));
      await page.route('**/assets/app.js', route => route.fulfill({contentType: 'text/javascript', body: bundles[version]}));
      await page.goto(process.env.CAMID_URL || 'http://127.0.0.1:4189/#home');
      await page.waitForFunction(() => window.CAMID_STATE?.ready);
      await page.waitForTimeout(1400);
      await page.locator('#hero-explosion').click();
      await page.evaluate(() => __long.seek(0));
      await page.waitForTimeout(1400);
      const macro = [], release = [], interior = [];
      for (const t of times(.07, .22, 30)) macro.push(await sample(page, t));
      for (const t of times(.40, .725, 65)) release.push(await sample(page, t));
      for (const t of times(.03, .97, 94)) interior.push(await sample(page, t));
      const velocities = interior.slice(1).map((frame, i) => ({
        progress: (frame.progress + interior[i].progress) / 2,
        eyeSpeed: distance(frame.eye, interior[i].eye) / ((frame.progress - interior[i].progress) * frame.seconds)
      }));
      assert(velocities.every(frame => Number.isFinite(frame.eyeSpeed) && frame.eyeSpeed > 1e-6), `${version}: internal camera segment stops`);
      const saved = await sample(page, .17);
      await sample(page, .81);
      const repeated = await sample(page, .17);
      assert.deepEqual(repeated, saved, `${version}: camera or projection depends on seeking history`);
      report[version] = {
        macro: parallax(macro), release: trajectory(release),
        internalMotion: {minimumEyeSpeed: Math.min(...velocities.map(frame => frame.eyeSpeed)), maximumEyeSpeed: Math.max(...velocities.map(frame => frame.eyeSpeed)), samples: velocities},
        deterministicSeeking: true
      };
      await page.close();
    }
    const before = report.before, after = report.after;
    report.gains = {
      bowToChord: after.release.bowToChord / before.release.bowToChord,
      arcToChord: after.release.arcToChord / before.release.arcToChord,
      pitchRange: after.release.pitchRange / before.release.pitchRange,
      macroParallaxDiameter: after.macro.diameter / before.macro.diameter,
      macroParallaxVerticalRange: after.macro.verticalRange / before.macro.verticalRange
    };
    assert(after.release.bowToChord > before.release.bowToChord * 1.5, 'Release rail has not gained a clearly stronger spatial bend');
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify({passed: true, gains: report.gains, before: {arcToChord: before.release.arcToChord, bowToChord: before.release.bowToChord}, after: {arcToChord: after.release.arcToChord, bowToChord: after.release.bowToChord}, errors: report.errors}, null, 2));
  } catch (error) {
    report.failure = error.stack || String(error);
    throw error;
  } finally {
    await fs.writeFile(path.join(out, 'comparison.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
