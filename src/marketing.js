// YOHA MARKETING GLOBAL IA — campañas orgánicas (sin publicidad pagada). Nada se publica sin aprobación.
export const PLATFORMS = { youtube: 'YouTube', shorts: 'YouTube Shorts', instagram: 'Instagram Reels', tiktok: 'TikTok', facebook: 'Facebook' };

// Herramientas gratuitas reales (sin tarjeta). Límites y condiciones cambian: verificarlas antes de usarlas.
export const FREE_TOOLS = [
  { name: 'YouTube Studio', use: 'Programar publicaciones, estrenos, pantallas finales, tarjetas, subtítulos y analíticas', cost: 'Gratis' },
  { name: 'Biblioteca de audio de YouTube', use: 'Música y efectos con licencia para tus videos', cost: 'Gratis (revisa si pide atribución)' },
  { name: 'Meta Business Suite', use: 'Programar publicaciones en Facebook e Instagram', cost: 'Gratis' },
  { name: 'Programador de TikTok (web)', use: 'Programar videos desde tiktok.com', cost: 'Gratis' },
  { name: 'Google Trends', use: 'Comparar intereses de búsqueda por país', cost: 'Gratis' },
  { name: 'Comunidad de YouTube y comentarios fijados', use: 'Encuestas, avances y llamados a la acción', cost: 'Gratis' },
];

const tagify = (s) => '#' + String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9ñÑ ]/g, '').split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');

/** Textos por plataforma a partir de la producción (original, sin promesas de viralidad). */
export function campaignCopy(prod, { brand = 'YDC Entertainment Virales', episode = null } = {}) {
  const t = prod.title || 'Nuevo estreno';
  const ep = episode ? ` | Capítulo ${episode}` : '';
  const hook = prod.scenes?.find((s) => (s.dialogue || []).length)?.dialogue[0]?.text || prod.synopsis?.split('.')[0] || '';
  const tags = [tagify(brand), tagify(t), '#Novela', '#RepublicaDominicana', '#Drama', '#Estreno'].slice(0, 6);
  return {
    youtube: { title: `${t}${ep}`.slice(0, 100), description: `${prod.synopsis || ''}\n\n🎬 Una producción original de ${brand}.\n🔔 Suscríbete y activa la campanita para no perderte el próximo capítulo.\n\n${tags.join(' ')}\n\nEste video contiene escenas creadas con inteligencia artificial.`.slice(0, 4900), tags: [brand, t, 'novela', 'drama', 'historia original'] },
    shorts: { title: `${hook ? `"${hook.slice(0, 60)}"` : t} #Shorts`.slice(0, 100), description: `Avance de «${t}». Capítulo completo en el canal ${brand}. ${tags.slice(0, 4).join(' ')}` },
    instagram: { caption: `${hook ? `«${hook}»\n\n` : ''}${t}${ep} ya disponible en YouTube 🎬\nEnlace en la bio.\n\n${tags.join(' ')}` },
    tiktok: { caption: `${hook ? `${hook} 😱 ` : ''}¿Qué harías tú? ${t} completo en YouTube. ${tags.slice(0, 5).join(' ')}`.slice(0, 2200) },
    facebook: { post: `🎬 Estreno: ${t}${ep}\n${prod.synopsis || ''}\n\nMíralo completo en nuestro canal de YouTube ${brand}. ¿Qué crees que pasará en el próximo capítulo? Déjanos tu comentario 👇` },
  };
}

/** Calendario editorial: propone fechas (sin publicar nada) — p.ej. 3 por semana a una hora fija. */
export function proposeCalendar({ start = new Date(), weeks = 4, perWeek = 3, hour = 19, productionId = null, title = '' }) {
  const days = perWeek >= 5 ? [1, 2, 3, 4, 5] : perWeek === 4 ? [1, 2, 4, 5] : perWeek === 3 ? [1, 3, 5] : perWeek === 2 ? [2, 5] : [4];
  const out = []; const d = new Date(start); d.setHours(hour, 0, 0, 0);
  for (let i = 0; out.length < weeks * perWeek && i < weeks * 7 + 7; i++) {
    const x = new Date(d); x.setDate(d.getDate() + i + 1);
    if (days.includes(x.getDay())) {
      const n = out.length;
      out.push({ id: `cal-${x.getTime()}`, date: x.toISOString(), platform: n % perWeek === 0 ? 'youtube' : n % 2 ? 'shorts' : 'instagram', productionId, text: n % perWeek === 0 ? `Estreno: ${title}` : `Avance / clip de ${title}`, status: 'propuesto' });
    }
  }
  return out;
}

/** Tráiler o Short promocional: toma el arranque de cada clip (sin regenerar nada) y cierra con "Muy pronto". */
export function trailerItems(items, { seconds = 20, per = 2.2, endTitle = 'MUY PRONTO · YDC Entertainment Virales' } = {}) {
  const vids = items.filter((i) => i.kind === 'video' || i.kind === 'image');
  if (!vids.length) return [];
  const n = Math.max(1, Math.min(vids.length, Math.floor(seconds / per + 1e-6)));
  const step = vids.length / n;
  const out = [];
  for (let k = 0; k < n; k++) {
    const it = structuredClone(vids[Math.floor(k * step)]);
    if (it.kind === 'video') { const len = (it.outS ?? it.duration) - (it.inS || 0); const mid = (it.inS || 0) + Math.max(0, len / 2 - per / 2); it.inS = mid; it.outS = Math.min(it.duration ?? mid + per, mid + per); }
    else it.dur = per;
    it.title = k === n - 1 ? endTitle : ''; it.subtitle = '';
    it.speed = 1;
    out.push(it);
  }
  return out;
}
