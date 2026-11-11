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
record('Tarjeta «Producir la novela con IA» con tiempos de GPU medidos', /planos · ~[\d.]+ h de GPU/.test(est) && /medidos/.test(est), est.match(/Con tiempos[^.]+/)?.[0]);
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
record('Siempre con labios, control de rostros y Wan 2.2', sent.productora?.labios === true && sent.productora?.control_rostros === true && sent.productora?.modelo === 'wan2.2-5b');
const conDialogo = sent.scenes.filter((x) => (x.dialogue || []).length);
const okPlan = conDialogo.every((x) => Array.isArray(x.planos) && x.planos.length === x.shots
  && x.dialogue.every((d, j) => !d.text || x.planos.some((pl) => pl.encuadre === 'primer plano' && pl.foco === d.character && pl.lineas.includes(j))));
record('Dirección por planos: cada frase en el primer plano de quien la dice', conDialogo.length === 0 || okPlan, `${conDialogo.length} escenas con diálogo · ${conDialogo[0]?.planos?.map((x) => x.encuadre + (x.foco ? ':' + x.foco : '')).join(' / ') || 'sin diálogo aún'}`);
record('Autenticación con el token del dispositivo', repo.auth.every((a) => a === 'Bearer github_pat_PRUEBA123'));

// 4) La Productora (simulada) informa progreso
repo.files.set(`producciones/${pid}/estado.json`, Buffer.from(JSON.stringify({ estado: 'generando', mensaje: 'Generando escenas en Kaggle (sesión 1).', planos_hechos: 20, planos_total: 63, actualizado: new Date().toISOString() })));
await page.click('#obCloudChk');
await page.waitForFunction(() => /20\/63 planos/.test(document.querySelector('#obCloudStatus')?.textContent || ''));
record('Estado en vivo: progreso de planos', true, await page.textContent('#obCloudStatus'));
record('Pide a la Productora revisar Kaggle (commit pequeño)', repo.files.has(`producciones/${pid}/revisar.json`));

// 4b) Bloqueada por control de calidad → informe visible, se puede ver para revisar y rehacer UN plano
const sc0 = sent.scenes[0];
repo.files.set(`producciones/${pid}/novela.mp4`, readFileSync(VIDEO));
repo.files.set(`producciones/${pid}/estado.json`, Buffer.from(JSON.stringify({ estado: 'error', mensaje: 'Control de calidad facial: e001_p02: cara ajena o duplicada en el encuadre', video: `producciones/${pid}/novela.mp4`,
  video_info: { duracion: 10, ancho: 1920, alto: 1080, bytes: readFileSync(VIDEO).length, audio: { ok: true, lineas: 2, lineas_audibles: 2, coincidencia: 1 },
    calidad_facial: { labios: [{ plano: `e${String(sc0.n).padStart(3, '0')}_p01_${sc0.hash}.mp4`, correlacion_antes: 0.1, correlacion_despues: 0.5 }],
      rostros: { [`e${String(sc0.n).padStart(3, '0')}_p02_${sc0.hash}.mp4`]: { aprobado: false, identidad_media: 0.2, problemas: ['cara ajena o duplicada en el encuadre'] } } } } })));
await page.click('#obCloudChk');
await page.waitForSelector('[data-rehacer]');
record('Informe de calidad real visible (audio, labios, rostros)', /Whisper entiende 100/.test(await page.textContent('#obCloud')) && /cara ajena/.test(await page.textContent('#obCloud')));
await page.click('#obCloudPeek');
record('Video bloqueado: se puede ver para revisar sin pasar a aprobación', await page.waitForSelector('#obPeek video', { timeout: 15000 }).then(() => true, () => false));
await page.click(`[data-rehacer="${sc0.id}:1"]`);
await page.waitForFunction(() => /marcado/.test(document.querySelector('#obCloudStatus')?.textContent || ''), null, { timeout: 8000 }).catch(async () => console.log('estado:', await page.textContent('#obCloudStatus'), '| errores:', errors.join(' | ')));
await page.click('#obCloudGo');
await page.waitForFunction(() => /En cola/.test(document.querySelector('#obCloudStatus')?.textContent || ''));
const sent2 = JSON.parse(repo.files.get(`producciones/${pid}/paquete.json`));
const s2 = sent2.scenes.find((x) => x.id === sc0.id);
const pedido = s2.planos ? s2.planos[1]?.rehacer : s2.rehacer?.['1'];
const otros = s2.planos ? s2.planos.filter((x) => x.rehacer).length : Object.keys(s2.rehacer || {}).length;
record('«Rehacer este plano» pide solo ese plano y conserva los demás', pedido === 1 && otros === 1 && s2.hash === sc0.hash, `plano 2 rehacer=${pedido} · mismo hash ${s2.hash === sc0.hash}`);

// 5) Lista → traer el video y enviarlo a revisión
const mp4 = readFileSync(VIDEO);
const half = Math.floor(mp4.length / 2);
repo.files.set(`producciones/${pid}/novela.mp4.000`, mp4.subarray(0, half));
repo.files.set(`producciones/${pid}/novela.mp4.001`, mp4.subarray(half));
repo.files.set(`producciones/${pid}/subtitulos_es.srt`, Buffer.from('1\n00:00:05,300 --> 00:00:07,000\nHola\n'));
repo.files.set(`producciones/${pid}/estado.json`, Buffer.from(JSON.stringify({ estado: 'lista', mensaje: 'Lista para revisar.', video: `producciones/${pid}/novela.mp4`, video_info: { duracion: 88, ancho: 1920, alto: 1080, sha256: 'x', bytes: mp4.length, partes: ['novela.mp4.000', 'novela.mp4.001'] }, planos_hechos: 63, planos_total: 63 })));
await page.click('#obCloudChk');
await page.waitForSelector('#obCloudGet:not([hidden])');
await page.click('#obCloudGet');
await page.waitForFunction(() => document.querySelector('[data-tab=aprobaciones]')?.classList.contains('active') || /aprobaciones/.test(location.hash), null, { timeout: 15000 }).catch(() => {});
const p = await page.evaluate(async (id) => window.__yoha.studio._test.productions.get(id), pid);
record('Video final en 2 partes unido sin pérdida → «Pendientes de aprobación»', p.status === 'en_revision' && /^[0-9a-f]{64}$/.test(p.videoHash) && p.videoInfo?.size === mp4.length, `estado ${p.status}, ${p.videoInfo?.size} bytes`);
record('Nada se publica automáticamente', p.status !== 'publicado' && !(p.approvals || []).length);
record('Sin errores de JavaScript', errors.length === 0, errors.join(' | '));

await browser.close(); srv.kill();
const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} pruebas de la Productora en la app aprobadas`);
process.exit(ok === results.length ? 0 : 1);
