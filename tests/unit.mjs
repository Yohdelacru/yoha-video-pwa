// Pruebas unitarias de la lógica (Node, sin red). Datos de ejemplo claramente sintéticos.
import assert from 'node:assert/strict';
globalThis.crypto ??= (await import('node:crypto')).webcrypto;
globalThis.localStorage ??= { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); } };
const ins = await import('../src/insights.js');
const yt = await import('../src/youtube.js');
const mk = await import('../src/marketing.js');
const lang = await import('../src/language.js');
const dir = await import('../src/director.js');
const results = [];
const t = (name, fn) => { try { fn(); results.push([name, 'APROBADA']); console.log('✔', name); } catch (e) { results.push([name, 'FALLIDA', e.message]); console.log('✖', name, e.message); } };

const fixture = [
  { id: 'a', snippet: { title: '¿Qué harías tú? La novia descubre la verdad 😱', channelTitle: 'Canal A', publishedAt: '2026-11-01T23:00:00Z', tags: ['novela', 'drama'] }, statistics: { viewCount: '3200000', likeCount: '120000', commentCount: '8000' }, contentDetails: { duration: 'PT58S' } },
  { id: 'b', snippet: { title: 'NOVELA completa: herencia y traición | Capítulo 1', channelTitle: 'Canal B', publishedAt: '2026-11-02T23:30:00Z', tags: ['novela', 'herencia'] }, statistics: { viewCount: '1500000', likeCount: '40000', commentCount: '3000' }, contentDetails: { duration: 'PT21M10S' } },
  { id: 'c', snippet: { title: 'Bachata en vivo 2026', channelTitle: 'Canal C', publishedAt: '2026-11-03T15:00:00Z', tags: ['bachata'] }, statistics: { viewCount: '900000', likeCount: '30000', commentCount: '1000' }, contentDetails: { duration: 'PT4M2S' } },
].map(ins.toVideo);

t('Radar: duración ISO 8601', () => { assert.equal(ins.isoDurationToSec('PT21M10S'), 1270); assert.equal(ins.isoDurationToSec('PT58S'), 58); assert.equal(ins.isoDurationToSec('P1DT1H'), 90000); });
t('Radar: análisis de patrones', () => {
  const a = ins.analyzeTrends(fixture);
  assert.equal(a.count, 3); assert.equal(a.medianViews, 1500000);
  assert.equal(a.topKeywords[0].word, 'novela');
  assert.equal(a.titlePatterns.pregunta, 33); assert.equal(a.bestUtcHour, 23);
  assert.equal(ins.analyzeTrends(fixture, { minViews: 1e6 }).count, 2);
});
t('Radar: 5 ideas originales por tendencia (sin copiar títulos)', () => {
  const ideas = ins.originalIdeas('novela', ins.analyzeTrends(fixture));
  assert.equal(ideas.length, 5);
  for (const i of ideas) for (const v of fixture) assert.ok(!i.title.includes(v.title));
  assert.ok(ideas.every((i) => /no garantizan|No garantiza/.test(i.note)));
});
t('Guardián: similitud combinada y borrador que no se envía', () => {
  const o = { id: 'X', title: 'Amor y Traición en la Capital Capítulo 1', seconds: 600 };
  const copy = { title: 'Amor y Traición en la Capital cap 1 COMPLETO', seconds: 598 };
  const other = { title: 'Receta de mangú fácil', seconds: 300 };
  assert.ok(ins.matchScore(o, copy) > 0.7); assert.ok(ins.matchScore(o, other) < 0.3);
  const d = ins.claimDraft({ originalId: 'X', originalTitle: o.title, title: copy.title, account: 'otro', url: 'https://www.youtube.com/watch?v=Y', similarity: 0.8, evidence: { titleSim: 0.8, duration: [600, 598], thumbSim: null } });
  assert.match(d, /BORRADOR \(no enviado\)/); assert.match(d, /copyright_complaint_form/);
});
t('Revenue: progreso al Programa de Socios', () => {
  const p = ins.yppProgress({ subs: 620, watchHours12m: 3100, shortsViews90d: 0, uploads90d: 4 });
  assert.equal(p.full.eligible, false); assert.equal(p.fan.eligible, true); assert.equal(p.full.subs, 62);
  assert.equal(ins.yppProgress({ subs: 1200, watchHours12m: 0, shortsViews90d: 11e6 }).full.eligible, true);
});
t('Bank: simulación separada y conversión', () => {
  assert.deepEqual(ins.simulate({ views: 100000, rpmUSD: 2, rateDOP: 60 }), { usd: 200, dop: 12000 });
  assert.equal(ins.simulate({ views: 1000, rpmUSD: 1.5, rateDOP: 0 }).dop, null);
  assert.equal(ins.viewsForGoal({ goalUSD: 100, rpmUSD: 2 }), 50000);
});
t('Publicación: exige aprobación del mismo archivo y bloquea duplicados', () => {
  const approval = { action: 'aprobado', videoHash: 'h1' };
  assert.throws(() => yt.assertPublishable({ approval: null, videoHash: 'h1', confirmed: true }), /aprobación/);
  assert.throws(() => yt.assertPublishable({ approval, videoHash: 'h2', confirmed: true }), /cambió/);
  assert.throws(() => yt.assertPublishable({ approval, videoHash: 'h1', publishedHashes: ['h1'], confirmed: true }), /duplicados/);
  assert.throws(() => yt.assertPublishable({ approval, videoHash: 'h1', confirmed: false }), /confirmación/);
  yt.assertPublishable({ approval, videoHash: 'h1', publishedHashes: [], confirmed: true });
});
t('YouTube: metadatos (privado por defecto, contenido sintético, programación)', () => {
  assert.ok(yt.validateMeta({ title: 'A', madeForKids: null }).some((e) => /niños/.test(e)));
  assert.ok(yt.validateMeta({ title: 'A', madeForKids: false, publishAt: new Date(Date.now() + 864e5).toISOString(), privacyStatus: 'public' }).some((e) => /Privado/.test(e)));
  const m = yt.buildMetadata({ title: 'T', madeForKids: false, synthetic: true });
  assert.equal(m.status.privacyStatus, 'private'); assert.equal(m.status.containsSyntheticMedia, true);
});
t('Marketing: calendario y tráiler', () => {
  const c = mk.proposeCalendar({ start: new Date('2026-11-06T12:00:00'), weeks: 2, perWeek: 3, title: 'X' });
  assert.equal(c.length, 6); assert.ok(c.every((e) => e.status === 'propuesto'));
  const items = [{ kind: 'video', inS: 0, outS: 10, duration: 10 }, { kind: 'image', dur: 4 }, { kind: 'video', inS: 2, outS: 8, duration: 8 }];
  const tr = mk.trailerItems(items, { seconds: 6.6, per: 2.2 });
  assert.equal(tr.length, 3); assert.ok(Math.abs(tr[0].outS - tr[0].inS - 2.2) < 0.01); assert.match(tr.at(-1).title, /MUY PRONTO/);
});
t('Lenguaje limpio: ñ, falsos positivos y autorización por producción', () => {
  assert.equal(lang.checkText('un cono de helado').length, 0);
  assert.equal(lang.checkText('qué coño').length, 1);
  const p = { title: 'x', scenes: [{ title: '', dialogue: [{ text: 'eres un pendejo' }] }] };
  assert.equal(lang.isBlocked(lang.checkProduction(p), false), true);
  assert.equal(lang.isBlocked(lang.checkProduction(p), true), false);
});
t('Director: números en palabras, formatos y estimación honesta', () => {
  const p = dir.parseInstruction('Hazme un documental de media hora sobre el cacao');
  assert.equal(p.durationSec, 1800); assert.equal(p.format, 'documental');
  const prod = dir.buildProduction('Una novela de 2 minutos con tres personajes');
  assert.equal(prod.newCharacters.length, 3); assert.equal(prod.durationSec, 120);
  assert.ok(dir.estimate(prod).assumption.includes('estimación'));
});
const failed = results.filter((r) => r[1] === 'FALLIDA').length;
console.log(`\n${results.length - failed}/${results.length} pruebas unitarias aprobadas`);
process.exitCode = failed ? 1 : 0;
