const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createRequire} = require('node:module');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = createRequire(process.execPath)('playwright')); }
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'screenshots', 'reveal-cinema', 'handoff-validation.json');
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
const pose = page => page.evaluate(() => ({
  eye: CAMID_STATE.shot.camera, target: CAMID_STATE.shot.target,
  progress: CAMID_STATE.shot.progress, running: CAMID_STATE.shot.running
}));

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CAMID_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const report = {passed: false, observations: [], errors: []};
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(process.env.CAMID_URL || 'http://127.0.0.1:4189/#home');
    await page.waitForFunction(() => window.CAMID_STATE?.ready);
    await page.waitForTimeout(1400);
    const before = await pose(page);
    const rect = await page.locator('#viewport canvas').boundingBox();
    const x = rect.x + rect.width * .7, y = rect.y + rect.height * .5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - Math.min(110, rect.width * .2), y + 45, {steps: 5});
    await page.mouse.up();
    const dragged = await pose(page);
    assert(distance(before.eye, dragged.eye) > .01, 'The mouse drag did not rotate the product');
    // Start while the drag still has inertia; do not let it settle first.
    await page.locator('#hero-explosion').click();
    await page.waitForTimeout(1500);
    for (let attempt = 1; attempt <= 2; attempt++) {
      await page.locator('#shot-skip').click();
      const landed = await pose(page);
      assert.equal(landed.progress, 1);
      assert.equal(landed.running, false);
      let eyeDrift = 0, targetDrift = 0;
      for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(100);
        const current = await pose(page);
        eyeDrift = Math.max(eyeDrift, distance(current.eye, landed.eye));
        targetDrift = Math.max(targetDrift, distance(current.target, landed.target));
      }
      report.observations.push({attempt, eyeDrift, targetDrift});
      assert(eyeDrift < 1e-6 && targetDrift < 1e-6, `Final view drifts after handoff ${attempt}: eye=${eyeDrift}, target=${targetDrift}`);
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.stack || String(error);
    throw error;
  } finally {
    await fs.mkdir(path.dirname(out), {recursive: true});
    await fs.writeFile(out, JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
