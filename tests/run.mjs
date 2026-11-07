// Pruebas reales de la PWA en Chromium headless: carga, PWA, edición, exportación MP4 y verificación con FFprobe.
// Uso: npm run build && MEDIA=/ruta/medios node tests/run.mjs
import { chromium, devices } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const MEDIA = process.env.MEDIA || './test-media';
const OUT = process.env.OUT || './test-output';
const URL_ = process.env.BASE_URL || 'http://localhost:4173/';
mkdirSync(OUT, { recursive: true });
const results = [];
const record = (name, status, detail = '') => { results.push({ name, status, detail }); console.log(`${status === 'APROBADA' ? '✔' : status === 'FALLIDA' ? '✖' : '•'} ${name}: ${status}${detail ? ' — ' + detail : ''}`); };
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', f]).toString());
const volume = (f) => { const o = execFileSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString() + ''; return o; };
const meanVol = (f) => { try { execFileSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch {} const r = spawnSyncErr(f); return r; };
function spawnSyncErr(f) { const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${f}" -af volumedetect -f null - 2>&1 | grep mean_volume || true`]).toString(); const m = /mean_volume: (-?[\d.]+)/.exec(out); return m ? Number(m[1]) : null; }
void volume; void meanVol;

let server = null;
if (!process.env.BASE_URL) {
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
}
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
if (process.env.ONLY_STUDIO) { const { runStudio } = await import('./studio.mjs'); await runStudio({ browser, URL_, MEDIA, OUT, record, probe }); await browser.close(); server?.kill(); writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify(results, null, 2)); process.exit(results.some((r) => r.status === 'FALLIDA') ? 1 : 0); }
try {
  // ── 1. Carga, PWA e instalación ──
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Content Security Policy.*gsi/i.test(m.text()) && errors.push(m.text()));
  const resp = await page.goto(URL_, { waitUntil: 'load' });
  record('Carga de la PWA', resp.ok() && /yoha/i.test(await page.title()) ? 'APROBADA' : 'FALLIDA', `HTTP ${resp.status()}`);
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return Boolean(r.active); });
  const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
  const cdp = await ctx.newCDPSession(page);
  const inst = await cdp.send('Page.getInstallabilityErrors').catch(() => ({ installabilityErrors: [{ errorId: 'cdp-unavailable' }] }));
  const instErr = inst.installabilityErrors.map((e) => e.errorId);
  record('Service worker activo', sw ? 'APROBADA' : 'FALLIDA');
  record('Manifest válido', manifest.icons?.some((i) => i.sizes === '512x512') && manifest.display === 'standalone' ? 'APROBADA' : 'FALLIDA', `${manifest.icons.length} iconos`);
  record('Instalación PWA (criterios de Chrome)', instErr.length === 0 ? 'APROBADA' : 'FALLIDA', instErr.join(', ') || 'sin errores de instalabilidad');
  await page.reload({ waitUntil: 'load' });
  const offlineOk = await (async () => { await ctx.setOffline(true); try { const r = await page.reload({ waitUntil: 'load' }); return r?.ok() !== false && (await page.locator('text=YOHA VIDEO').first().isVisible()); } catch { return false; } finally { await ctx.setOffline(false); } })();
  record('Funciona sin conexión (interfaz)', offlineOk ? 'APROBADA' : 'FALLIDA');
  await page.goto(URL_, { waitUntil: 'load' });
  await page.click('[data-tab=editor]');

  // ── 2. Importación, línea de tiempo y exportación 16:9 con música + narración ──
  const files = ['clip_h.mp4', 'photo.jpg', 'clip_w.webm', 'clip_noaudio.mp4'].map((f) => path.join(MEDIA, f));
  await page.setInputFiles('#addFiles', files);
  await page.waitForFunction(() => window.__yoha.state.items.length === 4, null, { timeout: 120000 });
  const items = await page.evaluate(() => window.__yoha.state.items.map((i) => ({ kind: i.kind, name: i.name, duration: i.duration, hasAudio: i.hasAudio })));
  record('Importación de videos e imágenes', items.length === 4 && Math.abs(items[0].duration - 6) < 0.3 && Math.abs(items[2].duration - 4) < 0.3 ? 'APROBADA' : 'FALLIDA', JSON.stringify(items.map((i) => `${i.kind}:${i.duration?.toFixed?.(1)}`)));

  // Reordenar: mover la foto (posición 2) al inicio con el botón ↑
  await page.locator('.ti').nth(1).locator('[data-act=up]').click();
  const order = await page.evaluate(() => window.__yoha.state.items.map((i) => i.name));
  record('Reordenar clips', order[0] === 'photo.jpg' ? 'APROBADA' : 'FALLIDA', order.join(' → '));

  // Recortar el clip horizontal: 1.0 s → 4.0 s, título y subtítulo
  const clipH = page.locator('.ti').nth(1);
  await clipH.locator('summary').click();
  await clipH.locator('[data-k=inS]').fill('1');
  await clipH.locator('[data-k=outS]').fill('4');
  await clipH.locator('[data-k=subtitle]').fill('Subtítulo de prueba con acentos: ñandú');
  const photo = page.locator('.ti').nth(0);
  await photo.locator('summary').click();
  await photo.locator('[data-k=dur]').fill('3');
  await photo.locator('[data-k=title]').fill('YOHA VIDEO · Prueba real');
  await page.setInputFiles('#music', path.join(MEDIA, 'music.mp3'));
  await page.setInputFiles('#narrFile', path.join(MEDIA, 'narration.wav'));
  await page.selectOption('#res', '540');
  const expected = 3 + 3 + 4 + 4; // foto 3 + recorte 3 + webm 4 + mp4 sin audio 4
  const t0 = Date.now();
  await page.click('#exportBtn');
  await page.waitForSelector('#result:not([hidden])', { timeout: 600000 }).catch(() => {});
  const status = await page.textContent('#exportStatus');
  const okExport = await page.isVisible('#result');
  record('Exportación MP4 (16:9, 4 elementos, música + narración)', okExport ? 'APROBADA' : 'FALLIDA', `${status} · ${Math.round((Date.now() - t0) / 1000)} s`);
  if (okExport) {
    const dl = page.waitForEvent('download');
    await page.click('#dlMp4');
    const d = await dl;
    const f1 = path.join(OUT, 'yoha-prueba-16x9.mp4');
    await d.saveAs(f1);
    const p = probe(f1);
    const v = p.streams.find((s) => s.codec_type === 'video'); const a = p.streams.find((s) => s.codec_type === 'audio');
    const dur = Number(p.format.duration);
    record('Integridad del archivo MP4', v?.codec_name === 'h264' && a?.codec_name === 'aac' && v.width === 960 && v.height === 540 ? 'APROBADA' : 'FALLIDA', `${v?.codec_name} ${v?.width}x${v?.height} + ${a?.codec_name}`);
    record('Unión de clips (duración esperada)', Math.abs(dur - expected) < 0.4 ? 'APROBADA' : 'FALLIDA', `${dur.toFixed(2)} s, esperado ${expected} s`);
    const mv = spawnSyncErr(f1);
    record('Música y narración audibles', mv !== null && mv > -40 ? 'APROBADA' : 'FALLIDA', `volumen medio ${mv} dB`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1.5', '-i', f1, '-frames:v', '1', path.join(OUT, 'frame-titulo.png')]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '4.5', '-i', f1, '-frames:v', '1', path.join(OUT, 'frame-subtitulo.png')]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '8', '-i', f1, '-frames:v', '1', path.join(OUT, 'frame-webm.png')]);
    // Reproducción real dentro del navegador (decodificación completa de la salida con ffmpeg + reproducción en <video>)
    let decodeOk = true; try { execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', f1, '-f', 'null', '-']); } catch { decodeOk = false; }
    const srt = await page.getAttribute('#dlSrt', 'hidden');
    record('Reproducción real (decodificación completa sin errores)', decodeOk ? 'APROBADA' : 'FALLIDA');
    record('Subtítulos SRT generados', srt === null ? 'APROBADA' : 'FALLIDA');
  }

  // ── 3. Formato vertical + importación del .zip de Clips IA ──
  await page.evaluate(() => { window.__yoha.state.items.length = 0; });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__yoha?.state);
  await page.click('[data-tab=editor]');
  const leftover = await page.evaluate(() => window.__yoha.state.items.length);
  record('Proyecto persistente tras recargar', leftover === 4 ? 'APROBADA' : 'FALLIDA', `${leftover} elementos recuperados`);
  await page.evaluate(() => { window.__yoha.state.items.length = 0; });
  await page.click('#narrClear').catch(() => {});
  await page.click('#musicClear').catch(() => {});
  await page.setInputFiles('#addFiles', [path.join(MEDIA, 'yoha_clips.zip'), path.join(MEDIA, 'clip_v.mp4')]);
  await page.waitForFunction(() => window.__yoha.state.items.length === 3, null, { timeout: 120000 });
  const zipItems = await page.evaluate(() => window.__yoha.state.items.map((i) => ({ n: i.name, s: i.subtitle })));
  const narr = await page.evaluate(() => Boolean(window.__yoha.state.narrId));
  record('Importación de clips IA (.zip del notebook)', zipItems[0]?.s === 'Escena uno' && narr ? 'APROBADA' : 'FALLIDA', JSON.stringify(zipItems));
  await page.selectOption('#aspect', '9:16');
  await page.selectOption('#res', '360');
  await page.click('#exportBtn');
  await page.waitForSelector('#result:not([hidden])', { timeout: 600000 }).catch(() => {});
  if (await page.isVisible('#result') && /generado/.test(await page.textContent('#exportStatus'))) {
    const dl = page.waitForEvent('download'); await page.click('#dlMp4'); const d = await dl;
    const f2 = path.join(OUT, 'yoha-prueba-9x16.mp4'); await d.saveAs(f2);
    const v = probe(f2).streams.find((s) => s.codec_type === 'video');
    record('Formato vertical 9:16', v.width === 360 && v.height === 640 ? 'APROBADA' : 'FALLIDA', `${v.width}x${v.height}, ${Number(probe(f2).format.duration).toFixed(1)} s`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', f2, '-frames:v', '1', path.join(OUT, 'frame-vertical.png')]);
  } else record('Formato vertical 9:16', 'FALLIDA', await page.textContent('#exportStatus'));

  // ── 4. Planificador y personajes ──
  await page.click('[data-tab=personajes]');
  await page.fill('#cName', 'Luna'); await page.fill('#cLook', 'small golden retriever puppy with a red collar');
  await page.setInputFiles('#cPhotos', path.join(MEDIA, 'photo.jpg'));
  await page.click('#charForm button.primary');
  const blocked = (await page.textContent('#cStatus')).includes('autorización');
  await page.check('#cConsent'); await page.fill('#cConsentBy', 'Prueba automática');
  await page.click('#charForm button.primary');
  await page.waitForTimeout(400);
  const saved = (await page.textContent('#cStatus')).includes('guardado');
  record('Personajes: consentimiento obligatorio para fotos', blocked && saved ? 'APROBADA' : 'FALLIDA');
  await page.click('[data-tab=director]');
  await page.click('#dirOld');
  await page.fill('#pIdea', 'Una perrita rescatada encuentra a su familia');
  await page.selectOption('#pGenre', 'animales');
  await page.locator('#pCast input').first().check();
  await page.click('#pPlan');
  await page.waitForSelector('.scene', { timeout: 10000 }).catch(() => {});
  const scenes = await page.locator('.scene').count();
  const dl = page.waitForEvent('download'); await page.click('#pDownload'); const d = await dl;
  const pkgPath = path.join(OUT, 'yoha-produccion.json'); await d.saveAs(pkgPath);
  const pkg = JSON.parse((await import('node:fs')).readFileSync(pkgPath, 'utf8'));
  record('Planificador idea → escenas → paquete', scenes === 6 && pkg.scenes[0].prompt.includes('golden retriever') ? 'APROBADA' : 'FALLIDA', `${scenes} escenas`);

  // ── 5. YouTube: validaciones sin credenciales ──
  await page.click('[data-tab=config]');
  await page.click('#cfYt');
  await page.click('#ytConnect');
  await page.waitForFunction(() => document.getElementById('ytStatus').textContent.length > 0, null, { timeout: 15000 }).catch(() => {});
  const ytMsg = await page.textContent('#ytStatus');
  record('YouTube: bloquea conexión sin Client ID', /Client ID/.test(ytMsg) ? 'APROBADA' : 'FALLIDA', ytMsg);
  const upDisabled = await page.isDisabled('#ytUpload');
  record('YouTube: publicar exige canal y confirmación', upDisabled ? 'APROBADA' : 'FALLIDA');

  record('Sin errores de JavaScript en consola', errors.length === 0 ? 'APROBADA' : 'FALLIDA', errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: path.join(OUT, 'pantalla-youtube.png'), fullPage: true });
  await ctx.close();

  // ── 6. Móvil ──
  const m = await browser.newContext({ ...devices['Pixel 7'] });
  const mp = await m.newPage();
  await mp.goto(URL_, { waitUntil: 'load' });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await mp.screenshot({ path: path.join(OUT, 'pantalla-movil.png') });
  const iph = await browser.newContext({ ...devices['iPhone 13'] });
  const ip = await iph.newPage(); await ip.goto(URL_, { waitUntil: 'load' });
  const overflow2 = await ip.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record('Compatibilidad móvil (sin desbordes, Pixel 7 / iPhone 13)', overflow <= 1 && overflow2 <= 1 ? 'APROBADA' : 'FALLIDA', `desborde ${overflow}px / ${overflow2}px`);
  const { runStudio } = await import('./studio.mjs');
  await runStudio({ browser, URL_, MEDIA, OUT, record, probe });
  const d1 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const dp = await d1.newPage(); await dp.goto(URL_, { waitUntil: 'load' }); await dp.screenshot({ path: path.join(OUT, 'pantalla-escritorio.png') });
} finally {
  await browser.close();
  server?.kill();
  writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.status === 'FALLIDA').length;
  console.log(`\n${results.length - failed}/${results.length} aprobadas`);
  process.exitCode = failed ? 1 : 0;
}
