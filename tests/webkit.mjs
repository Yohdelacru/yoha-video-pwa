// Prueba con el motor de Safari (WebKit, el mismo de iPhone) en un iPhone 13 emulado.
// Se ejecuta en GitHub Actions: npx playwright install --with-deps webkit && node tests/webkit.mjs
import { webkit, devices } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
const MEDIA = process.env.MEDIA || './test-media';
const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let ok = true;
const check = (name, cond, extra = '') => { console.log(`${cond ? '✔' : '✖'} [WebKit/iPhone] ${name}${extra ? ' — ' + extra : ''}`); ok &&= cond; };
try {
  await page.goto('http://localhost:4174/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__yoha?.studio, null, { timeout: 30000 });
  check('Carga y panel', (await page.locator('#tab-panel .tile').count()) === 14);
  await page.click('[data-tab=director]');
  await page.fill('#dirText', 'Un short vertical de 30 segundos con dos personajes y un final sorpresa');
  await page.click('#dirGo');
  await page.waitForSelector('#tab-obra .scene', { timeout: 20000 });
  check('Director IA', true);
  await page.click('[data-tab=editor]');
  await page.setInputFiles('#addFiles', [path.join(MEDIA, 'photo.jpg'), path.join(MEDIA, 'clip_h.mp4')]);
  await page.waitForFunction(() => window.__yoha.state.items.length === 2, null, { timeout: 120000 });
  await page.selectOption('#res', '360');
  await page.click('#exportBtn');
  await page.waitForSelector('#result:not([hidden])', { timeout: 900000 });
  const info = await page.textContent('#resultInfo');
  check('Exportación MP4 con FFmpeg.wasm en WebKit', /640×360|640x360/.test(info), info);
  const reg = await page.evaluate(async () => Boolean(await navigator.serviceWorker?.getRegistration()));
  check('Service worker registrado', reg);
  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (e) { check('Ejecución', false, e.message); }
finally { await browser.close(); server.kill(); process.exitCode = ok ? 0 : 1; }
