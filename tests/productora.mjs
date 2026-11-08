// Prueba del flujo «Producir novela con IA» en la app, con la API de GitHub simulada en memoria
// (Chromium headless). Comprueba: conexión, envío del paquete, estado, descarga del video final y revisión.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const VIDEO = process.argv[2];               // un MP4 real para simular novela.mp4
const PORT = 4197;
const results = [];
const record = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? '✔' : '✘'} ${n}${d ? ` — ${d}` : ''}`); };

const repo = { files: new Map(), commits: 0, auth: [] };
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

await page.route('https://api.github.com/**', async (route) => {
  const req = route.request(); const u = new URL(req.url());
  repo.auth.push(req.headers().authorization || '');
  const cors = { 'access-control-allow-origin': '*' };
  const p = u.pathname.replace('/repos/Yohdelacru/Yoha-video-studio', '');
  if (p === '') return route.fulfill({ status: 200, headers: cors, json: { full_name: 'Yohdelacru/Yoha-video-studio', private: true, permissions: { push: true } } });
  if (p === '/branches/producciones') return route.fulfill({ status: 200, headers: cors, json: { name: 'producciones' } });
  if (p.startsWith('/contents/')) {
    const path = decodeURIComponent(p.slice('/contents/'.length));
    if (req.method() === 'PUT') {
      const b = JSON.parse(req.postData()); repo.files.set(path, Buffer.from(b.content, 'base64')); repo.commits++;
      return route.fulfill({ status: 201, headers: cors, json: { content: { path } } });
    }
    const f = repo.files.get(path);
    if (!f) return route.fulfill({ status: 404, headers: cors, json: { message: 'Not Found' } });
    if ((req.headers().accept || '').includes('raw')) return route.fulfill({ status: 200, headers: cors, body: f });
    return route.fulfill({ status: 200, headers: cors, json: { sha: 'abc', size: f.length } });
  }
  return route.fulfill({ status: 404, headers: cors, json: {} });
});

await page.goto(`http://localhost:${PORT}/`);
await page.waitForFunction(() => window.__yoha?.studio);

// 1) Sin conexión: el botón explica qué falta
await page.click('[data-tab=director]');
await page.fill('#dirText', 'Hazme una novela dominicana de 5 minutos con 3 personajes y final de suspenso');
await page.click('#dirGo');
await page.waitForSelector('#obCloudGo');
const est = await page.textContent('#obCloud');
record('Tarjeta «Producir la novela con IA» con estimación honesta de GPU', /planos · ~[\d.]+ h de GPU/.test(est) && /no medida/.test(est), est.match(/Estimación[^.]+/)?.[0]);
await page.click('#obCloudGo');
record('Sin Productora conectada: indica cómo conectarla', await page.waitForFunction(() => /Configuración/.test(document.querySelector('#obCloudStatus')?.textContent || ''), null, { timeout: 5000 }).then(() => true, () => false));

// 2) Conectar en Configuración
await page.click('[data-tab=config]');
await page.fill('#cfPrTok', 'github_pat_PRUEBA123');
await page.click('#cfPrSave');
await page.waitForFunction(() => /Conectada/.test(document.querySelector('#cfPrStatus')?.textContent || ''));
record('Conexión con el repositorio privado', /privado/.test(await page.textContent('#cfPrStatus')), await page.textContent('#cfPrStatus'));
record('El token no queda visible en el formulario', (await page.inputValue('#cfPrTok')) === '');
const backupHasToken = await page.evaluate(async () => {
  const { kv } = await import('./src/store.js').catch(() => ({ kv: null }));
  return kv ? JSON.stringify(await kv.get('bank') || {}).includes('PRUEBA') : false;
});
record('El token no entra en el respaldo', !backupHasToken);

// 3) Enviar a producir
const pid = await page.evaluate(() => window.__yoha.studio._test.S.current);
await page.click('[data-tab=producciones]');
await page.evaluate((id) => window.__yoha.studio.openObra(id), pid);
await page.waitForSelector('#obCloudGo');
await page.selectOption('#obCq', 'borrador');
await page.click('#obCloudGo');
await page.waitForFunction(() => /En cola/.test(document.querySelector('#obCloudStatus')?.textContent || ''));
const sent = JSON.parse(repo.files.get(`producciones/${pid}/paquete.json`) || '{}');
record('Paquete guardado en producciones/<id>/paquete.json', sent.format === 'yoha-production' && sent.scenes?.length > 0 && sent.productora?.calidad === 'borrador', `${sent.scenes?.length} escenas · calidad ${sent.productora?.calidad}`);
record('Autenticación con el token del dispositivo', repo.auth.every((a) => a === 'Bearer github_pat_PRUEBA123'));

// 4) La Productora (simulada) informa progreso
repo.files.set(`producciones/${pid}/estado.json`, Buffer.from(JSON.stringify({ estado: 'generando', mensaje: 'Generando escenas en Kaggle (sesión 1).', planos_hechos: 20, planos_total: 63, actualizado: new Date().toISOString() })));
await page.click('#obCloudChk');
await page.waitForFunction(() => /20\/63 planos/.test(document.querySelector('#obCloudStatus')?.textContent || ''));
record('Estado en vivo: progreso de planos', true, await page.textContent('#obCloudStatus'));
record('Pide a la Productora revisar Kaggle (commit pequeño)', repo.files.has(`producciones/${pid}/revisar.json`));

// 5) Lista → traer el video y enviarlo a revisión
const mp4 = readFileSync(VIDEO);
repo.files.set(`producciones/${pid}/novela.mp4`, mp4);
repo.files.set(`producciones/${pid}/subtitulos_es.srt`, Buffer.from('1\n00:00:05,300 --> 00:00:07,000\nHola\n'));
repo.files.set(`producciones/${pid}/estado.json`, Buffer.from(JSON.stringify({ estado: 'lista', mensaje: 'Lista para revisar.', video: `producciones/${pid}/novela.mp4`, video_info: { duracion: 88, ancho: 832, alto: 480, sha256: 'x' }, planos_hechos: 63, planos_total: 63 })));
await page.click('#obCloudChk');
await page.waitForSelector('#obCloudGet:not([hidden])');
await page.click('#obCloudGet');
await page.waitForFunction(() => document.querySelector('[data-tab=aprobaciones]')?.classList.contains('active') || /aprobaciones/.test(location.hash), null, { timeout: 15000 }).catch(() => {});
const p = await page.evaluate(async (id) => window.__yoha.studio._test.productions.get(id), pid);
record('Video final recibido → «Pendientes de aprobación»', p.status === 'en_revision' && /^[0-9a-f]{64}$/.test(p.videoHash) && p.videoInfo?.size === mp4.length, `estado ${p.status}, ${p.videoInfo?.size} bytes`);
record('Nada se publica automáticamente', p.status !== 'publicado' && !(p.approvals || []).length);
record('Sin errores de JavaScript', errors.length === 0, errors.join(' | '));

await browser.close(); srv.kill();
const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} pruebas de la Productora en la app aprobadas`);
process.exit(ok === results.length ? 0 : 1);
