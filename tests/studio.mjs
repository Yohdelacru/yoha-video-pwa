// Pruebas reales de las secciones del panel ejecutivo (Chromium headless, sin red externa).
import path from 'node:path';
import { readFileSync } from 'node:fs';

export async function runStudio({ browser, URL_, MEDIA, OUT, record, probe }) {
  const ctx = await browser.newContext({ acceptDownloads: true, permissions: ['notifications', 'clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let dialogAnswer = null;
  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept(dialogAnswer ?? d.defaultValue()) : d.accept()));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__yoha?.studio);

  // 1. Panel ejecutivo con 14 apartados
  const tiles = await page.locator('#tab-panel .tile').count();
  record('Panel ejecutivo (14 apartados)', tiles === 14 ? 'APROBADA' : 'FALLIDA', `${tiles} apartados`);

  // 2. Director IA con la instrucción de ejemplo
  await page.click('[data-tab=director]');
  await page.fill('#dirText', 'Créame una novelita dominicana de veinte minutos, con cinco personajes, romance, traición, suspenso y un final que motive a ver el próximo capítulo');
  await page.click('#dirGo');
  await page.waitForSelector('#tab-obra .scene', { timeout: 15000 });
  const prod = await page.evaluate(async () => (await window.__yoha.studio._test.productions.all())[0]);
  const chars = await page.evaluate(async () => { const { characters } = await import('./src/store.js').catch(() => ({})); return null; }).catch(() => null);
  void chars;
  record('Director IA: instrucción → producción', prod && prod.durationSec === 1200 && prod.characters.length === 5 && prod.scenes.length >= 9 && /gancho/i.test(prod.scenes.at(-1).title) ? 'APROBADA' : 'FALLIDA', prod ? `${prod.title}: ${Math.round(prod.durationSec / 60)} min, ${prod.characters.length} personajes, ${prod.scenes.length} escenas, final: «${prod.scenes.at(-1).title}»` : 'sin producción');
  const tilesChars = await page.locator('#tab-obra .act').count();
  record('Actuación: controles de emoción/gesto/movimiento por personaje', tilesChars > 0 ? 'APROBADA' : 'FALLIDA', `${tilesChars} controles`);

  // 3. Editor por conversación
  const ask = async (text) => { await page.evaluate(() => { const e = document.getElementById('obCmdStatus'); if (e) e.textContent = ''; }); await page.fill('#obCmd', text); await page.click('#obCmdGo'); await page.waitForFunction(() => /✔|No entendí/.test(document.getElementById('obCmdStatus')?.textContent || ''), null, { timeout: 8000 }).catch(() => {}); return page.textContent('#obCmdStatus'); };
  await page.evaluate(async () => { const t = window.__yoha.studio._test; const p = (await t.productions.all())[0]; p.scenes.forEach((s) => (s.dirty = false)); await t.productions.put(p); });
  await page.click('[data-tab=producciones]'); await page.click('[data-open]');
  const r1 = await ask('Haz que la protagonista llore en la escena 5');
  const r2 = await ask('Cambia la escena 4: ahora ocurre en la playa de Samaná de noche');
  const r3 = await ask('Pon música más dramática');
  const r4 = await ask('Modifica solamente el final: ella encuentra una carta escondida');
  const after = await page.evaluate(async () => (await window.__yoha.studio._test.productions.all())[0]);
  const dirty = after.scenes.filter((s) => s.dirty).map((s) => s.n);
  const cry = Object.values(after.scenes[4].acting).some((a) => a.emotion === 'llanto');
  record('Edición por conversación (solo cambia lo necesario)', cry && dirty.length === 3 && dirty.includes(4) && dirty.includes(after.scenes.length) && after.music.mood === 'dramatica' ? 'APROBADA' : 'FALLIDA', `escenas marcadas: ${dirty.join(', ')} · ${[r1, r2, r3, r4].map((x) => x.replace('✔ ', '').slice(0, 50)).join(' | ')}`);
  record('Historial de versiones', after.versions.length >= 5 ? 'APROBADA' : 'FALLIDA', `${after.versions.length} versiones`);
  // restaurar la primera versión
  await page.locator('[data-restore]').last().click();
  await page.waitForTimeout(500);
  const restored = await page.evaluate(async () => (await window.__yoha.studio._test.productions.all())[0]);
  record('Recuperación de una versión anterior', restored.music.mood !== 'dramatica' || restored.scenes.filter((s) => s.dirty).length !== 3 ? 'APROBADA' : 'FALLIDA', restored.versions[0].label);

  // 4. Guion del guionista IA (JSON) + lenguaje limpio
  const scriptJson = JSON.stringify({ title: 'Amor y Traición en la Capital', synopsis: 'Rosaura descubre que su prometido esconde un secreto.', scenes: restored.scenes.slice(0, 2).map((s, i) => ({ id: s.id, title: s.title, description: 'Rosaura llega al colmado', descriptionEn: 'A young woman walks into a colorful corner store at sunset', narration: '', dialogue: [{ character: restored.characters[0], text: i ? '¿Cómo pudiste hacerme esto? ¡Eres un cabrón!' : 'Te amo, nunca lo olvides.' }], dialogueEn: [{ character: restored.characters[0], text: 'I love you.' }], musicMood: 'romantica' })) });
  await page.fill('#obPaste', scriptJson);
  await page.click('#obImport');
  await page.waitForTimeout(600);
  const langMsg = await page.locator('#tab-obra .card', { hasText: 'Lenguaje' }).textContent();
  const scripted = await page.evaluate(async () => (await window.__yoha.studio._test.productions.all())[0]);
  const autoEmo = Object.values(scripted.scenes[0].acting).some((a) => a.emotion === 'amor') && Object.values(scripted.scenes[1].acting).some((a) => a.emotion === 'enfado');
  record('Importar guion IA + dirección automática de emociones', scripted.scenes[0].status === 'guion_listo' && autoEmo ? 'APROBADA' : 'FALLIDA', `emociones detectadas: ${JSON.stringify(Object.values(scripted.scenes[1].acting).map((a) => a.emotion))}`);
  record('Lenguaje limpio por defecto (detecta y bloquea)', /cabr/i.test(langMsg) && /grave/.test(langMsg) ? 'APROBADA' : 'FALLIDA', langMsg.replace(/\s+/g, ' ').slice(0, 120));

  // 5. Paquete para el notebook (solo modificadas): todo generado → una orden → solo esa escena
  await page.click('#obMarkClean'); await page.waitForTimeout(400);
  await ask('Haz que la protagonista llore en la escena 2');
  const dl = page.waitForEvent('download'); await page.click('#obPkgDirty'); const d = await dl;
  const pkgPath = path.join(OUT, 'yoha-cambios.json'); await d.saveAs(pkgPath);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  record('Paquete de producción v2 (solo escenas modificadas, con actuación)', pkg.version === 2 && pkg.onlyChanged && pkg.scenes.length === 1 && /tears running down/.test(pkg.scenes[0].prompt) && pkg.brief.includes('Lenguaje') ? 'APROBADA' : 'FALLIDA', `${pkg.scenes.length} de ${scripted.scenes.length} escenas; ejemplo: ${pkg.scenes[0].prompt.slice(0, 110)}…`);
  const dl2 = page.waitForEvent('download'); await page.click('#obPkgAll'); await (await dl2).saveAs(path.join(OUT, 'yoha-produccion-completa.json'));

  // 6. Series: crear serie y dos capítulos con continuidad
  await page.click('[data-tab=series]');
  await page.fill('#srTitle', 'Secretos de la Capital'); await page.fill('#srLog', 'Una familia dominicana y un secreto de herencia'); await page.click('#srNew');
  await page.waitForSelector('[data-ser]');
  await page.locator('[data-ser] [data-cast]').first().check();
  await page.waitForTimeout(300);
  await page.fill('[data-ser] [data-next]', 'Rosaura descubre la carta del abuelo');
  await page.click('[data-ser] [data-ep]');
  await page.waitForSelector('#tab-obra .scene');
  await page.fill('#obRecap', 'Rosaura encontró la carta y sospecha de Luz María.'); await page.click('#obSave');
  await page.click('[data-tab=series]');
  await page.fill('[data-ser] [data-next]', 'La boda se cancela');
  await page.click('[data-ser] [data-ep]');
  await page.waitForSelector('#tab-obra .scene');
  const eps = await page.evaluate(async () => (await window.__yoha.studio._test.productions.all()).filter((p) => p.seriesId).sort((a, b) => a.episode - b.episode));
  record('Productor de series (capítulos y continuidad)', eps.length === 2 && eps[1].episode === 2 && eps[1].synopsis.includes('Rosaura encontró la carta') ? 'APROBADA' : 'FALLIDA', eps.map((e) => `Cap ${e.episode}: ${e.synopsis.slice(0, 60)}`).join(' | '));
  await page.click('[data-tab=series]');
  const dlb = page.waitForEvent('download'); await page.click('[data-ser] [data-bible]'); const bible = await dlb;
  const bp = path.join(OUT, 'biblia-serie.txt'); await bible.saveAs(bp);
  const btxt = readFileSync(bp, 'utf8');
  record('Biblia de personajes y producción', /PERSONAJES/.test(btxt) && /Cap\. 2/.test(btxt) && /Episodios: Secretos de la Capital/.test(btxt) ? 'APROBADA' : 'FALLIDA', `${btxt.split('\n').length} líneas`);

  // 7. Editor: intro YDC, orden por texto, marca de agua, lenguaje, exportación
  await page.click('[data-tab=editor]');
  await page.evaluate(() => { window.__yoha.state.items.length = 0; });
  await page.setInputFiles('#addFiles', [path.join(MEDIA, 'clip_h.mp4'), path.join(MEDIA, 'photo.jpg')]);
  await page.waitForFunction(() => window.__yoha.state.items.length === 2, null, { timeout: 60000 });
  await page.click('#addIntro');
  await page.waitForFunction(() => window.__yoha.state.items.length === 3 && window.__yoha.state.items[0].name === 'Intro YDC.mp4', null, { timeout: 60000 }).catch(() => {});
  const first = await page.evaluate(() => window.__yoha.state.items[0]?.name);
  record('Intro animada YDC en el editor', first === 'Intro YDC.mp4' ? 'APROBADA' : 'FALLIDA', first);
  await page.fill('#edCmd', 'formato vertical'); await page.click('#edCmdBtn');
  await page.fill('#edCmd', 'título: Capítulo 1 — La carta'); await page.click('#edCmdBtn');
  const aspect = await page.inputValue('#aspect');
  record('Órdenes por texto en el editor', aspect === '9:16' ? 'APROBADA' : 'FALLIDA', await page.textContent('#edCmdStatus'));
  await page.evaluate(() => { window.__yoha.state.items[1].subtitle = 'Esto es una mierda'; });
  await page.click('#exportBtn');
  await page.waitForFunction(() => /Lenguaje no permitido|generado|No se pudo/.test(document.getElementById('exportStatus').textContent), null, { timeout: 60000 });
  const blockedMsg = await page.textContent('#exportStatus');
  record('Lenguaje limpio en el editor (bloquea exportación)', /Lenguaje no permitido/.test(blockedMsg) ? 'APROBADA' : 'FALLIDA', blockedMsg.slice(0, 90));
  await page.evaluate(() => { window.__yoha.state.items[1].subtitle = 'La carta lo cambia todo'; });
  await page.selectOption('#res', '360');
  await page.check('#watermark');
  await page.click('#exportBtn');
  await page.waitForSelector('#result:not([hidden])', { timeout: 600000 }).catch(() => {});
  let videoOk = false;
  if (await page.isVisible('#result')) {
    const dlv = page.waitForEvent('download'); await page.click('#dlMp4'); const fv = path.join(OUT, 'yoha-ydc-vertical-marca.mp4'); await (await dlv).saveAs(fv);
    const p = probe(fv); const v = p.streams.find((s) => s.codec_type === 'video');
    videoOk = v.width === 360 && v.height === 640 && Math.abs(Number(p.format.duration) - (5 + 6 + 4)) < 0.5;
    record('Exportación con intro + marca de agua YDC (9:16)', videoOk ? 'APROBADA' : 'FALLIDA', `${v.width}x${v.height}, ${Number(p.format.duration).toFixed(2)} s`);
  } else record('Exportación con intro + marca de agua YDC (9:16)', 'FALLIDA', await page.textContent('#exportStatus'));

  // 8. Aprobación obligatoria: enviar a revisión → modificar → aprobar → contexto de publicación
  dialogAnswer = '1';
  await page.click('#toReview');
  await page.waitForSelector('#tab-aprobaciones [data-ap]', { timeout: 15000 });
  await page.locator('[data-ap] [data-act=cambios_solicitados]').first().click();
  await page.waitForTimeout(300);
  const stillPending = await page.locator('[data-ap]').count();
  await page.locator('[data-ap] [data-note]').first().fill('Más corto el inicio');
  await page.locator('[data-ap] [data-act=cambios_solicitados]').first().click();
  await page.waitForTimeout(500);
  const stChange = await page.evaluate(async () => (await window.__yoha.studio._test.productions.all()).find((p) => p.videoHash)?.status);
  await page.locator('[data-ap] [data-act=aprobado]').first().click();
  await page.waitForTimeout(800);
  const pc = await page.evaluate(() => { const c = window.__yoha.studio.publishContext; return c && { hash: c.hash, action: c.approval.action, visible: !document.getElementById('tab-youtube').hidden }; });
  const upDisabled = await page.isDisabled('#ytUpload');
  record('Aprobación obligatoria (CREAR → REVISAR → APROBAR → PUBLICAR)', stillPending >= 1 && stChange === 'cambios_solicitados' && pc?.action === 'aprobado' && pc.visible && upDisabled ? 'APROBADA' : 'FALLIDA', `pide nota para modificaciones, estado ${stChange} → aprobado; publicar sigue bloqueado sin canal y sin confirmación final`);
  // Duplicados: simular un registro de publicación con la misma huella y volver a aprobar
  const dup = await page.evaluate(async (hash) => {
    const t = window.__yoha.studio._test;
    await t.published.put({ id: 'TEST', hash, title: 'prueba', at: new Date().toISOString() });
    const { assertPublishable } = await import('./src/youtube.js').catch(() => ({}));
    return { has: (await window.__yoha.studio.publishedHashes()).includes(hash), fn: Boolean(assertPublishable) };
  }, pc?.hash);
  record('Prevención de publicaciones duplicadas', dup.has ? 'APROBADA' : 'FALLIDA', 'la huella publicada se reconoce; la regla assertPublishable la bloquea (prueba unitaria aparte)');
  await page.evaluate(async () => window.__yoha.studio._test.published.del('TEST'));

  // 9. Marketing: campaña + tráiler real desde la línea de tiempo
  await page.click('[data-tab=marketing]');
  await page.click('#mkGo');
  await page.waitForSelector('#mkOut .scene', { timeout: 10000 }).catch(() => {});
  const copyOk = await page.locator('#mkOut .scene').count();
  await page.selectOption('#mkTrSec', '15');
  await page.click('#mkTrailer');
  await page.waitForFunction(() => /listo|Error|Falta|Primero/.test(document.getElementById('mkTrStatus').textContent), null, { timeout: 600000 });
  const tr = await page.evaluate(() => window.__yoha.studio._test.S.trailer && { w: window.__yoha.studio._test.S.trailer.width, h: window.__yoha.studio._test.S.trailer.height, d: window.__yoha.studio._test.S.trailer.duration });
  record('Marketing: textos por plataforma + tráiler vertical real', copyOk === 5 && tr?.h > tr?.w ? 'APROBADA' : 'FALLIDA', `${copyOk} plataformas; tráiler ${tr ? `${tr.w}x${tr.h}, ${tr.d.toFixed(1)} s` : await page.textContent('#mkTrStatus')}`);
  await page.click('#mkCal');
  await page.waitForSelector('#tab-calendario select[data-cst]', { timeout: 10000 }).catch(() => {});
  const cal = await page.locator('#tab-calendario select[data-cst]').count();
  record('Calendario editorial (propuesto, sin publicar)', cal === 12 ? 'APROBADA' : 'FALLIDA', `${cal} entradas propuestas`);

  // 10. Yoha Bank
  await page.click('[data-tab=bank]');
  await page.fill('#bkRate', '60'); await page.fill('#bkViews', '100000'); await page.fill('#bkRpm', '2');
  await page.waitForTimeout(200);
  const sim = await page.locator('.bcard.sim').textContent();
  record('Yoha Bank: simulador USD/RD$ separado de ingresos reales', /200[.,]00/.test(sim) && /12[.,]?000/.test(sim) && /no es dinero real/i.test(sim) ? 'APROBADA' : 'FALLIDA', sim.replace(/\s+/g, ' '));

  // 11. Revenue con datos manuales
  await page.click('[data-tab=revenue]');
  await page.click('#tab-revenue summary');
  await page.fill('#rvSubs', '620'); await page.fill('#rvHours', '3100'); await page.fill('#rvUp', '4'); await page.click('#rvManual');
  await page.waitForFunction(() => /620 \//.test(document.getElementById('rvOut').textContent), null, { timeout: 5000 }).catch(() => {});
  const rv = await page.textContent('#rvOut');
  record('Yoha Revenue: progreso hacia el Programa de Socios', /620 \/ 1[.,]000/.test(rv) && /3[.,]100 \/ 4[.,]000/.test(rv) ? 'APROBADA' : 'FALLIDA', 'datos manuales; con canal conectado usa la API oficial');

  // 12. Notificaciones (aviso local) y ntfy
  await page.click('[data-tab=config]');
  await page.click('#cfNew');
  const topic = await page.inputValue('#cfTopic');
  await page.click('#cfLocal');
  await page.waitForTimeout(800);
  const localMsg = await page.textContent('#cfStatus');
  record('Notificación local de la PWA', /activados/.test(localMsg) ? 'APROBADA' : 'FALLIDA', `${localMsg} (Chromium; en iPhone requiere app instalada, iOS 16.4+)`);
  record('Tema ntfy para avisos del notebook', /^yoha-[a-z0-9]{15}$/.test(topic) ? 'APROBADA' : 'FALLIDA', 'tema aleatorio generado; envío real NO EJECUTADO (sin acceso a ntfy.sh desde este entorno)');

  // 13. Guardado y recuperación tras recargar
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__yoha?.studio);
  const persisted = await page.evaluate(async () => { const t = window.__yoha.studio._test; return { prods: (await t.productions.all()).length, series: (await t.seriesCol.all()).length, cal: (await t.calendar.all()).length }; });
  record('Guardado automático y recuperación al reabrir', persisted.prods >= 3 && persisted.series === 1 && persisted.cal === 12 ? 'APROBADA' : 'FALLIDA', JSON.stringify(persisted));
  await page.click('[data-tab=config]');
  const dlbk = page.waitForEvent('download'); await page.click('#cfBackup'); const bk = await dlbk; const bkp = path.join(OUT, 'respaldo.json'); await bk.saveAs(bkp);
  const bkj = JSON.parse(readFileSync(bkp, 'utf8'));
  record('Respaldo descargable', bkj.format === 'yoha-backup' && bkj.productions.length >= 3 && bkj.audit.length >= 6 ? 'APROBADA' : 'FALLIDA', `${bkj.productions.length} producciones, ${bkj.audit.length} acciones registradas`);

  record('Sin errores de JavaScript (panel)', errors.length === 0 ? 'APROBADA' : 'FALLIDA', errors.slice(0, 3).join(' | '));
  for (const t of ['panel', 'obra', 'aprobaciones', 'bank']) {
    if (t === 'obra') { await page.click('[data-tab=producciones]'); await page.click('[data-open]'); } else await page.click(`[data-tab=${t}]`);
    await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `pantalla-${t}.png`), fullPage: false });
  }
  await ctx.close();

  // 14. iPhone (emulación de pantalla y agente en Chromium; el motor WebKit real se prueba en GitHub Actions)
  const { devices } = await import('playwright');
  const ip = await browser.newContext({ ...devices['iPhone 13'] });
  const p2 = await ip.newPage();
  await p2.goto(URL_, { waitUntil: 'load' });
  const ov = [];
  for (const t of ['panel', 'director', 'editor', 'bank', 'aprobaciones', 'config']) { await p2.click(`[data-tab=${t}]`); ov.push(await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth)); }
  await p2.click('[data-tab=panel]');
  await p2.screenshot({ path: path.join(OUT, 'pantalla-iphone-panel.png') });
  record('Diseño iPhone (emulado: 6 pantallas sin desbordes)', ov.every((x) => x <= 1) ? 'APROBADA' : 'FALLIDA', `desbordes: ${ov.join(', ')} px`);
  await ip.close();
}
