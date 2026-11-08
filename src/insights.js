// RADAR VIRAL IA · GUARDIÁN DIGITAL IA · YOHA REVENUE IA · YOHA BANK
// Solo fuentes autorizadas: la API oficial de YouTube con TU permiso OAuth (cuota gratuita de Google).
// Las funciones de análisis son puras (sin red) para poder probarlas con datos de ejemplo.
import * as yt from './youtube.js';

// ───────────── utilidades ─────────────
export function isoDurationToSec(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}
const STOP = new Set('el la los las un una unos unas de del y o en a al que con por para es su sus lo le se mi tu me te no si ya mas más muy como cuando este esta esto ese esa the a an of and or in on at to for is are be my your i you it this that with from vs ft feat official video oficial'.split(' '));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s) => norm(s).replace(/[^a-z0-9ñ#\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
const median = (a) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
// RD usa coma para miles y punto decimal (igual que en-US); es-DO en algunos navegadores no agrupa 4 cifras
export const fmtNum = (n) => new Intl.NumberFormat('en-US', { notation: n >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n || 0);

// ───────────── RADAR VIRAL ─────────────
export const REGIONS = { DO: 'República Dominicana', US: 'Estados Unidos', MX: 'México', CO: 'Colombia', ES: 'España', PR: 'Puerto Rico', AR: 'Argentina', VE: 'Venezuela', PA: 'Panamá' };
export const CATEGORIES = { '': 'Todas', 1: 'Cine y animación', 10: 'Música', 22: 'Personas y blogs', 23: 'Comedia', 24: 'Entretenimiento', 27: 'Educación', 26: 'Estilo y consejos' };

/** Videos más populares por país (videos.list chart=mostPopular, 1 unidad de cuota por llamada). */
export async function fetchTrending(channelId, { region = 'DO', category = '', max = 50 } = {}) {
  const q = new URLSearchParams({ part: 'snippet,statistics,contentDetails', chart: 'mostPopular', regionCode: region, maxResults: String(max) });
  if (category) q.set('videoCategoryId', category);
  const r = await yt.read(channelId, `videos?${q}`);
  return (r.items || []).map(toVideo);
}
export function toVideo(v) {
  return {
    id: v.id, title: v.snippet?.title || '', channel: v.snippet?.channelTitle || '', channelId: v.snippet?.channelId, publishedAt: v.snippet?.publishedAt,
    lang: v.snippet?.defaultAudioLanguage || v.snippet?.defaultLanguage || '', tags: v.snippet?.tags || [], thumb: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
    seconds: isoDurationToSec(v.contentDetails?.duration), views: +v.statistics?.viewCount || 0, likes: +v.statistics?.likeCount || 0, comments: +v.statistics?.commentCount || 0,
  };
}

/** Análisis de patrones (títulos, duración, temas, participación, hora). No predice viralidad. */
export function analyzeTrends(videos, { minViews = 0 } = {}) {
  const list = videos.filter((v) => v.views >= minViews);
  if (!list.length) return null;
  const kw = new Map();
  for (const v of list) for (const w of new Set([...words(v.title), ...v.tags.slice(0, 10).flatMap(words)])) kw.set(w, (kw.get(w) || 0) + v.views);
  const topKeywords = [...kw].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w, views]) => ({ word: w, views }));
  const durations = list.map((v) => v.seconds);
  const buckets = { 'Short (≤3 min)': 0, '3–10 min': 0, '10–20 min': 0, '20+ min': 0 };
  for (const d of durations) buckets[d <= 180 ? 'Short (≤3 min)' : d <= 600 ? '3–10 min' : d <= 1200 ? '10–20 min' : '20+ min']++;
  const t = list.map((v) => v.title);
  const pct = (f) => Math.round((t.filter(f).length / t.length) * 100);
  const hours = new Array(24).fill(0); list.forEach((v) => v.publishedAt && hours[new Date(v.publishedAt).getUTCHours()]++);
  return {
    count: list.length,
    medianViews: median(list.map((v) => v.views)),
    likeRate: +(median(list.map((v) => (v.views ? v.likes / v.views : 0))) * 100).toFixed(2),
    commentRate: +(median(list.map((v) => (v.views ? v.comments / v.views : 0))) * 1000).toFixed(2),
    medianTitleLength: median(t.map((x) => x.length)),
    titlePatterns: { pregunta: pct((x) => /\?/.test(x)), numeros: pct((x) => /\d/.test(x)), mayusculas: pct((x) => /\b[A-ZÁÉÍÓÚÑ]{4,}\b/.test(x)), emoji: pct((x) => /\p{Extended_Pictographic}/u.test(x)), separador: pct((x) => /[|–\-:]/.test(x)) },
    durationBuckets: buckets, medianSeconds: median(durations),
    topKeywords,
    bestUtcHour: hours.indexOf(Math.max(...hours)),
    languages: Object.entries(list.reduce((m, v) => { const l = (v.lang || '?').slice(0, 2); m[l] = (m[l] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]),
    top: [...list].sort((a, b) => b.views - a.views).slice(0, 10),
  };
}

/**
 * Cinco ideas ORIGINALES por tendencia: toman el tema (palabra clave), nunca títulos, personajes ni material ajeno.
 * Cada idea es una instrucción lista para el Director IA ("CREAR MI VERSIÓN ORIGINAL").
 */
export function originalIdeas(keyword, analysis) {
  const k = keyword.replace(/^#/, '');
  const shortFirst = analysis && analysis.durationBuckets['Short (≤3 min)'] > analysis.count / 2;
  const ideas = [
    { title: `Novelita: un secreto sobre «${k}» divide a una familia dominicana`, instruction: `Créame una novelita dominicana de 8 minutos, con cuatro personajes, sobre un secreto relacionado con ${k}, con romance, traición y un final que motive a ver el próximo capítulo` },
    { title: `Short de 45 s: «¿Qué harías tú?» con ${k}`, instruction: `Crea un short vertical de 45 segundos con dos personajes y un dilema moral sobre ${k}; gancho en los primeros 2 segundos y final sorpresa` },
    { title: `Comedia de barrio: ${k} se sale de control en el colmado`, instruction: `Haz una comedia dominicana de 3 minutos con tres personajes en un colmado, donde ${k} provoca una confusión divertida, lenguaje limpio` },
    { title: `Mini documental: la verdad detrás de ${k}`, instruction: `Crea un documental de 5 minutos, narrado, que explique de forma original y verificada el fenómeno de ${k}, con datos y conclusión` },
    { title: `Historia motivacional inspirada en ${k}`, instruction: `Crea un video motivacional de 2 minutos con un personaje que supera un obstáculo relacionado con ${k}, narración emotiva y final inspirador` },
  ];
  if (shortFirst) ideas.unshift(ideas.splice(1, 1)[0]);
  return ideas.map((i) => ({ ...i, keyword: k, note: 'Idea original basada en el tema, no en el contenido de otros creadores. No garantiza visualizaciones.' }));
}

// ───────────── GUARDIÁN DIGITAL ─────────────
/** Lista los videos subidos por el canal propio (uploads playlist). */
export async function myVideos(channelId, max = 25) {
  const ch = await yt.read(channelId, 'channels?part=contentDetails,statistics,snippet&mine=true');
  const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return { channel: ch.items?.[0], videos: [] };
  const pl = await yt.read(channelId, `playlistItems?part=contentDetails&maxResults=${max}&playlistId=${uploads}`);
  const ids = (pl.items || []).map((i) => i.contentDetails.videoId).join(',');
  const vids = ids ? await yt.read(channelId, `videos?part=snippet,statistics,contentDetails,status&id=${ids}`) : { items: [] };
  return { channel: ch.items?.[0], videos: (vids.items || []).map((v) => ({ ...toVideo(v), privacy: v.status?.privacyStatus })) };
}

export function titleSimilarity(a, b) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
/** Similitud combinada (0–1): título, duración y, si es posible, miniatura (dHash). Es un indicio, no una prueba. */
export function matchScore(orig, cand, thumbSim = null) {
  const t = titleSimilarity(orig.title, cand.title);
  const d = orig.seconds && cand.seconds ? 1 - Math.min(1, Math.abs(orig.seconds - cand.seconds) / Math.max(orig.seconds, cand.seconds)) : 0;
  const parts = [[t, 0.5], [d, 0.2]];
  if (thumbSim !== null) parts.push([thumbSim, 0.3]);
  const w = parts.reduce((s, [, x]) => s + x, 0);
  return +(parts.reduce((s, [v, x]) => s + v * x, 0) / w).toFixed(2);
}
/** Busca posibles reutilizaciones en YouTube (search.list = 100 unidades por búsqueda; cuota diaria limitada). */
export async function scanForCopies(channelId, original, ownChannelId) {
  const q = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '15', q: words(original.title).slice(0, 6).join(' ') || original.title });
  const s = await yt.read(channelId, `search?${q}`);
  const ids = (s.items || []).map((i) => i.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const vids = await yt.read(channelId, `videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}`);
  const out = [];
  for (const v of (vids.items || []).map(toVideo)) {
    if (v.id === original.id || v.channelId === ownChannelId) continue;
    let thumbSim = null;
    try { thumbSim = await thumbSimilarity(original.thumb, v.thumb); } catch { thumbSim = null; }
    const score = matchScore(original, v, thumbSim);
    if (score >= 0.45) out.push({
      id: `${original.id}:${v.id}`, originalId: original.id, originalTitle: original.title, platform: 'YouTube', account: v.channel, url: `https://www.youtube.com/watch?v=${v.id}`,
      title: v.title, thumb: v.thumb, similarity: score, evidence: { titleSim: +titleSimilarity(original.title, v.title).toFixed(2), duration: [original.seconds, v.seconds], thumbSim, publishedAt: v.publishedAt },
      status: 'nuevo', foundAt: new Date().toISOString(),
    });
  }
  return out.sort((a, b) => b.similarity - a.similarity);
}
async function dhash(url) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement('canvas'); c.width = 9; c.height = 8;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data; // falla si la imagen no permite CORS → se omite
  const g = (x, y) => d[(y * 9 + x) * 4] * 0.3 + d[(y * 9 + x) * 4 + 1] * 0.59 + d[(y * 9 + x) * 4 + 2] * 0.11;
  const bits = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(g(x, y) > g(x + 1, y) ? 1 : 0);
  return bits;
}
async function thumbSimilarity(a, b) {
  if (!a || !b) return null;
  const [x, y] = await Promise.all([dhash(a), dhash(b)]);
  return 1 - x.reduce((s, v, i) => s + (v !== y[i]), 0) / 64;
}
/** Borrador de reclamación: NO se envía. YouTube exige que la titular la presente en su formulario oficial. */
export function claimDraft(match, owner = 'YDC Entertainment Virales') {
  return `BORRADOR (no enviado) — Solicitud de retiro por derechos de autor
Titular: ${owner}
Obra original: «${match.originalTitle}» — https://www.youtube.com/watch?v=${match.originalId}
Contenido presuntamente infractor: «${match.title}» de la cuenta «${match.account}» — ${match.url}
Evidencia recopilada: similitud de título ${match.evidence.titleSim}, duración ${match.evidence.duration.join(' s vs ')} s${match.evidence.thumbSim !== null ? `, miniatura ${match.evidence.thumbSim}` : ''}. Indicador combinado: ${match.similarity}.
Antes de enviar: mira ambos videos completos y confirma que se usó tu material sin permiso (no basta con un título parecido). Las reclamaciones falsas pueden tener consecuencias legales.
Formulario oficial de YouTube: https://www.youtube.com/copyright_complaint_form`;
}

// ───────────── REVENUE ─────────────
// Requisitos según fuentes públicas a nov. 2026 (verifícalos siempre en YouTube Studio → Ganar dinero).
export const YPP = {
  full: { label: 'Programa de Socios (ingresos por anuncios)', subs: 1000, watchHours: 4000, shortsViews: 10_000_000 },
  fan: { label: 'Nivel de financiación por fans (membresías, Super Thanks)', subs: 500, uploads90: 3, watchHours: 3000, shortsViews: 3_000_000 },
  note2027: 'Desde el 1 de febrero de 2027 los nuevos solicitantes del nivel de anuncios necesitarán 8,000 horas o 20 millones de vistas de Shorts (según anuncios publicados; confírmalo en YouTube).',
};
export function yppProgress({ subs = 0, watchHours12m = 0, shortsViews90d = 0, uploads90d = 0 }) {
  const p = (v, goal) => Math.min(100, Math.round((v / goal) * 100));
  return {
    full: { subs: p(subs, YPP.full.subs), hours: p(watchHours12m, YPP.full.watchHours), shorts: p(shortsViews90d, YPP.full.shortsViews), eligible: subs >= 1000 && (watchHours12m >= 4000 || shortsViews90d >= 10e6) },
    fan: { subs: p(subs, YPP.fan.subs), uploads: p(uploads90d, 3), hours: p(watchHours12m, YPP.fan.watchHours), shorts: p(shortsViews90d, YPP.fan.shortsViews), eligible: subs >= 500 && uploads90d >= 3 && (watchHours12m >= 3000 || shortsViews90d >= 3e6) },
  };
}
const ymd = (d) => d.toISOString().slice(0, 10);
/** Datos reales del canal: estadísticas públicas + Analytics (si se autorizó). */
export async function channelReport(channelId) {
  const { channel, videos } = await myVideos(channelId, 50);
  const st = channel?.statistics || {};
  const out = { title: channel?.snippet?.title, subs: +st.subscriberCount || 0, hiddenSubs: Boolean(st.hiddenSubscriberCount), views: +st.viewCount || 0, videoCount: +st.videoCount || 0, videos, analytics: null, revenue: null, errors: [] };
  const now = new Date(); const y1 = new Date(now - 365 * 864e5); const d90 = new Date(now - 90 * 864e5);
  out.uploads90d = videos.filter((v) => v.privacy === 'public' && new Date(v.publishedAt) >= d90).length;
  if (yt.hasAnalytics(channelId)) {
    try {
      const a = await yt.analytics(channelId, { startDate: ymd(y1), endDate: ymd(now), metrics: 'views,estimatedMinutesWatched,subscribersGained' });
      const [views, minutes, subsGained] = a.rows?.[0] || [0, 0, 0];
      out.analytics = { views12m: views, watchHours12m: Math.round(minutes / 60), subsGained12m: subsGained, note: 'Horas totales de los últimos 365 días; YouTube cuenta solo horas públicas de videos largos para el Programa de Socios.' };
      const s = await yt.analytics(channelId, { startDate: ymd(d90), endDate: ymd(now), metrics: 'views', filters: 'creatorContentType==SHORTS' }).catch(() => null);
      out.analytics.shortsViews90d = s?.rows?.[0]?.[0] ?? null;
    } catch (e) { out.errors.push(e.message); }
    try {
      const r = await yt.analytics(channelId, { startDate: ymd(new Date(now - 30 * 864e5)), endDate: ymd(now), metrics: 'estimatedRevenue,estimatedAdRevenue,cpm,playbackBasedCpm', currency: 'USD' });
      out.revenue = { last30dUSD: r.rows?.[0]?.[0] ?? 0, adUSD: r.rows?.[0]?.[1] ?? 0, cpm: r.rows?.[0]?.[2] ?? null, kind: 'estimado por YouTube (no es pago confirmado)' };
    } catch (e) { out.errors.push(`Ingresos: ${e.message} (solo disponible para canales monetizados)`); }
  }
  return out;
}
export function monetizationRisks({ videos = [], productions = [] }) {
  const r = [];
  if (productions.some((p) => p.allowStrongLanguage)) r.push('Hay producciones con lenguaje fuerte autorizado: pueden recibir anuncios limitados.');
  if (productions.some((p) => (p.scenes || []).some((s) => /music|musica/i.test(s.sfx || '')))) r.push('Revisa que toda la música tenga licencia (Biblioteca de audio de YouTube o propia).');
  r.push('Contenido IA realista: declara el contenido sintético al publicar (YouTube lo exige para material realista alterado).');
  r.push('Evita contenido repetitivo o producido en masa sin aporte original: YouTube puede considerarlo "contenido no auténtico" y no monetizarlo.');
  if (videos.length && videos.filter((v) => v.privacy === 'public').length < 3) r.push('Pocos videos públicos: publica con constancia para cumplir los requisitos.');
  return r;
}

// ───────────── YOHA BANK (informativo) ─────────────
/** Simulación: ingresos = vistas / 1000 × RPM. No es dinero real. */
export function simulate({ views = 0, rpmUSD = 0, rateDOP = 0 }) {
  const usd = (Math.max(0, views) / 1000) * Math.max(0, rpmUSD);
  return { usd: +usd.toFixed(2), dop: rateDOP > 0 ? +(usd * rateDOP).toFixed(2) : null };
}
export function viewsForGoal({ goalUSD = 0, rpmUSD = 0 }) { return rpmUSD > 0 ? Math.ceil((goalUSD / rpmUSD) * 1000) : null; }
export const money = (v, cur = 'USD') => (v === null || v === undefined || Number.isNaN(v) ? '—' : new Intl.NumberFormat('es-DO', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v));
