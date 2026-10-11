import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';

const port = 4190,
  base = `http://127.0.0.1:${port}`,
  frames = 'test-results/frames';
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });
await mkdir('docs/assets', { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
let browser;
const pad = (n) => String(n).padStart(4, '0');
function gif(name, fps, width) {
  const input = `${frames}/${name}-%04d.png`;
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      String(fps),
      '-i',
      input,
      '-vf',
      `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
      `docs/assets/${name}.gif`,
    ],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) throw Error(`ffmpeg failed for ${name}`);
}
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + '/demo/')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/demo/');
  await page.waitForFunction(() => window.laserStencilDemo?.ready());
  const demo = (patch) => page.evaluate((p) => window.laserStencilDemo.set(p), patch);
  const stage = page.locator('#stage');
  const heroClip = () =>
    page.evaluate(() => {
      const r = document.querySelector('#stage .sheet').getBoundingClientRect();
      const s = document.querySelector('#stage').getBoundingClientRect();
      const x = Math.max(s.left, r.left - 40),
        y = Math.max(s.top, r.top - 40);
      return {
        x,
        y,
        width: Math.min(s.right, r.right + 40) - x,
        height: Math.min(s.bottom, r.bottom + 90) - y,
      };
    });
  let clip;
  const heroShot = (path) => page.screenshot({ path, clip, animations: 'allow' });

  // 1. The problem and the fix: pieces fall out, then bridges hold them.
  await demo({ text: 'GOOD VIBES', margin: 6, size: 40, view: 'after', highlight: false });
  await page.setViewportSize({ width: 1000, height: 900 });
  let n = 0;
  const still = async (count) => {
    for (let i = 0; i < count; i++) await heroShot(`${frames}/hero-${pad(n++)}.png`);
  };
  await page.locator('.workbench').scrollIntoViewIfNeeded();
  await demo({ view: 'before' });
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  clip = await heroClip();
  for (let t = 0; t <= 2600; t += 1000 / 15) {
    await page.evaluate(
      (time) => document.getAnimations().forEach((a) => (a.currentTime = time)),
      t,
    );
    await heroShot(`${frames}/hero-${pad(n++)}.png`);
  }
  await still(8);
  await demo({ view: 'after', highlight: true });
  await still(14);
  await demo({ highlight: false });
  await still(16);
  gif('hero', 15, 760);
  await page.setViewportSize({ width: 1200, height: 900 });

  // 2. Any text, any font, live.
  n = 0;
  await demo({ text: '', view: 'after', highlight: true, font: 'ArchivoBlack-Regular.ttf' });
  const shot = async (hold) => {
    for (let i = 0; i < hold; i++)
      await page.locator('.workbench').screenshot({ path: `${frames}/live-${pad(n++)}.png` });
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const [text, font] of [
    ['B', 'ArchivoBlack-Regular.ttf'],
    ['BO', 'ArchivoBlack-Regular.ttf'],
    ['BOA', 'ArchivoBlack-Regular.ttf'],
    ['BOAR', 'ArchivoBlack-Regular.ttf'],
    ['BOARD', 'ArchivoBlack-Regular.ttf'],
  ]) {
    await demo({ text, font });
    await shot(2);
  }
  await shot(4);
  await demo({ font: 'AlfaSlabOne-Regular.ttf' });
  await shot(6);
  await demo({ font: 'RubikMonoOne-Regular.ttf' });
  await shot(6);
  for (const width of [2, 2.5, 3]) {
    await demo({ width });
    await shot(2);
  }
  await shot(3);
  await demo({ direction: 'horizontal' });
  await shot(6);
  await demo({ direction: 'auto', bridges: 3 });
  await shot(6);
  await demo({ direction: 'vertical', bridges: 2, width: 1.5, font: 'ArchivoBlack-Regular.ttf' });
  await shot(6);
  gif('live', 4, 1000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await browser?.close();
  server.kill();
}
