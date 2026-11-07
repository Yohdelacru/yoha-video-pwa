// EDITOR INTELIGENTE POR CONVERSACIÓN (reglas en español, sin servicios externos).
// Cada orden modifica SOLO lo necesario y marca como "modificadas" las escenas afectadas,
// para que el notebook regenere únicamente esas escenas (no todo el proyecto).
import { EMOTIONS, MUSIC_MOODS, autoDirect } from './director.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');
const ORD = { primera: 1, primer: 1, uno: 1, segunda: 2, dos: 2, tercera: 3, tres: 3, cuarta: 4, cuatro: 4, quinta: 5, cinco: 5, sexta: 6, seis: 6, septima: 7, siete: 7, octava: 8, ocho: 8, novena: 9, nueve: 9, decima: 10, diez: 10 };
const EMO_WORDS = [
  [/llor|llant/, 'llanto'], [/sonri/, 'feliz'], [/ria|reir|carcaj/, 'risa'], [/enoj|enfad|furios|rabia/, 'enfado'], [/sorprend|asombr/, 'sorpresa'],
  [/triste|deprim/, 'triste'], [/miedo|asust/, 'miedo'], [/enamor|amor/, 'amor'], [/celos/, 'celos'], [/decidid|firme/, 'determinacion'], [/feliz|alegr|content/, 'feliz'],
];
const MOOD_WORDS = [[/dramat/, 'dramatica'], [/romant/, 'romantica'], [/suspens|misterio|tension/, 'suspenso'], [/alegr|feliz|movid/, 'alegre'], [/triste|melanc/, 'triste'], [/epic/, 'epica'], [/comic|graciosa|divertid/, 'comedia'], [/neutr|suave/, 'neutra']];
const VOICES_ES = ['ef_dora', 'em_alex', 'em_santa'];

/**
 * Aplica una orden a la producción. Devuelve { prod, applied[], understood, touched[] }.
 * ctx.sceneId = escena seleccionada en pantalla ("esa escena", "ese personaje").
 */
export function applyProductionCommand(prod0, text, chars, ctx = {}) {
  const prod = structuredClone(prod0);
  const t = norm(text);
  const applied = [];
  const touched = new Set();
  const sceneNum = (() => {
    const m = /escena\s+(\d+|[a-z]+)/.exec(t);
    if (m) return /^\d+$/.test(m[1]) ? Number(m[1]) : ORD[m[1]] ?? null;
    if (/\b(final|ultima escena|el cierre)\b/.test(t)) return prod.scenes.length;
    if (/\b(inicio|primera escena|el comienzo)\b/.test(t)) return 1;
    return null;
  })();
  const scene = sceneNum ? prod.scenes[sceneNum - 1] : prod.scenes.find((s) => s.id === ctx.sceneId) || null;
  const mark = (s, what) => { s.dirty = true; s.version = (s.version || 1) + 1; touched.add(s.id); if (what) applied.push(what); };
  const findChar = () => {
    const ids = scene ? scene.characters : prod.characters;
    const list = chars.filter((c) => prod.characters.includes(c.id));
    const named = list.find((c) => t.includes(norm(c.name)));
    if (named) return named;
    if (/(el|la|ese|esa) (personaje|protagonista)/.test(t) || /que (llore|sonria|se )/.test(t)) {
      if (/protagonista/.test(t)) return list.find((c) => c.role === 'protagonista') || list[0];
      return list.find((c) => ids.includes(c.id)) || list[0];
    }
    return null;
  };
  if (sceneNum && !scene) return { prod: prod0, applied: [`No existe la escena ${sceneNum} (hay ${prod.scenes.length}).`], understood: false, touched: [] };

  // 1) Emoción / actuación: "haz que el personaje llore", "que Rosaura sonría en la escena 3"
  const emo = EMO_WORDS.find(([re]) => re.test(t))?.[1];
  if (emo && /(haz que|que |ponl[ao]|hazl[ao]|quiero que)/.test(t)) {
    const c = findChar();
    const targets = scene ? [scene] : prod.scenes.filter((s) => s.id === ctx.sceneId);
    if (c && targets.length) {
      for (const s of targets) {
        if (!s.characters.includes(c.id)) s.characters.push(c.id);
        s.acting = s.acting || {};
        s.acting[c.id] = { gesture: 'ninguno', move: 'quieto', ...(s.acting[c.id] || {}), emotion: emo };
        mark(s, `${c.name}: ${emo} en la escena ${s.n} (${EMOTIONS[emo]})`);
      }
    } else applied.push('Indica la escena y el personaje, por ejemplo: «haz que Rosaura llore en la escena 4».');
  }

  // 2) Música: "pon música más dramática"
  if (/musica/.test(t)) {
    const mood = MOOD_WORDS.find(([re]) => re.test(t))?.[1];
    if (mood) {
      if (scene && sceneNum) { scene.musicMood = mood; applied.push(`Música de la escena ${scene.n}: ${MUSIC_MOODS[mood]}`); }
      else { prod.music = { ...(prod.music || {}), mood }; prod.scenes.forEach((s) => (s.musicMood = mood)); applied.push(`Música general: ${MUSIC_MOODS[mood]}`); }
    }
  }

  // 3) Voz: "cambia esa voz", "cambia la voz de Danilo a em_santa"
  if (/cambia(r)? (la |esa |su )?voz/.test(t)) {
    const c = findChar() || chars.find((x) => prod.characters.includes(x.id) && (scene?.dialogue || []).some((d) => d.character === x.id));
    if (c) {
      const explicit = VOICES_ES.find((v) => t.includes(v));
      const before = c.voice;
      c.voice = explicit || VOICES_ES[(VOICES_ES.indexOf(c.voice) + 1) % VOICES_ES.length];
      prod.voiceChanges = [...(prod.voiceChanges || []), { character: c.id, from: before, to: c.voice }];
      // Solo el audio de sus diálogos debe regenerarse, no el video
      prod.scenes.filter((s) => (s.dialogue || []).some((d) => d.character === c.id)).forEach((s) => { s.audioDirty = true; touched.add(s.id); });
      applied.push(`Voz de ${c.name}: ${before} → ${c.voice} (solo se regenera su audio)`);
      ctx.changedCharacter = c;
    } else applied.push('¿De qué personaje? Ej.: «cambia la voz de Danilo».');
  }

  // 4) Agregar diálogo: "agrega un diálogo de Rosaura: No te creo"
  const dlgN = /agreg[a-z]* (un |otro )?dialogo( de| para)? ?([^:]*):\s*(.+)$/.exec(t);
  const dlg = dlgN && [null, null, null, dlgN[3], text.slice(text.indexOf(':') + 1)];
  if (dlg || /agreg[a-z]* (un |otro )?dialogo/.test(t)) {
    const s = scene || prod.scenes.find((x) => x.id === ctx.sceneId) || prod.scenes[prod.scenes.length - 1];
    const who = dlg ? chars.find((c) => prod.characters.includes(c.id) && norm(dlg[3]).includes(norm(c.name))) || findChar() : findChar();
    const line = dlg ? dlg[4].trim() : '';
    if (s && line) {
      s.dialogue = [...(s.dialogue || []), { character: who?.id || s.characters[0] || '', text: line }];
      autoDirect(s);
      mark(s, `Diálogo agregado en la escena ${s.n}${who ? ` (${who.name})` : ''}: «${line}»`);
    } else applied.push('Escribe el diálogo después de dos puntos. Ej.: «agrega un diálogo de Rosaura en la escena 2: ¿Por qué me mentiste?»');
  }

  // 5) Duración: "haz el video más corto / más largo"
  if (/mas corto|acort|reduc[a-z]* la duracion|menos tiempo/.test(t)) {
    let removed = 0;
    for (const s of prod.scenes) if (s.shots > 1) { const cut = Math.max(1, Math.round(s.shots * 0.25)); s.shots -= cut; s.seconds = Math.round((s.seconds / (s.shots + cut)) * s.shots); removed += cut; touched.add(s.id); }
    prod.durationSec = prod.scenes.reduce((n, s) => n + s.seconds, 0);
    applied.push(removed ? `Video más corto: ${removed} planos menos, ahora ${Math.round(prod.durationSec / 60 * 10) / 10} min` : 'Ya está en el mínimo de planos por escena.');
  }
  if (/mas largo|alarg|mas tiempo|extiend/.test(t)) {
    for (const s of prod.scenes) { s.shots += 1; s.seconds += Math.round(s.seconds / Math.max(1, s.shots - 1)); s.dirty = true; touched.add(s.id); }
    prod.durationSec = prod.scenes.reduce((n, s) => n + s.seconds, 0);
    applied.push(`Video más largo: ahora ${Math.round(prod.durationSec / 60 * 10) / 10} min`);
  }

  // 6) Cambiar una escena o solo el final: "cambia la escena 4: ahora ocurre en la playa", "modifica solamente el final: ella descubre la carta"
  const change = /(cambia|modifica|reescribe)( solamente| solo)? (la escena \S+|el final|la ultima escena)[^:]*:\s*(.+)$/i.exec(norm(text)) && /:\s*(.+)$/.exec(text.normalize('NFC'));
  if (change && scene && !emo) {
    scene.description = change[1].trim();
    delete scene.descriptionEn;
    scene.status = 'modificada';
    mark(scene, `Escena ${scene.n} reescrita${/solamente|solo/.test(t) ? ' (solo esta escena se regenerará)' : ''}: «${scene.description.slice(0, 80)}»`);
  } else if (/(cambia|modifica|rehaz|regenera)( solamente| solo)? (la escena|el final)/.test(t) && scene && !emo && !/musica|voz/.test(t)) {
    scene.seed = (scene.seed || 1) + 7919;
    mark(scene, `Escena ${scene.n} marcada para regenerar con otra semilla`);
  }

  // 7) Estructura: eliminar / duplicar / mover
  const del = /elimina(r)? la escena\s+(\d+)/.exec(t);
  if (del) { const i = Number(del[2]) - 1; if (prod.scenes[i]) { prod.scenes.splice(i, 1); renumber(prod); applied.push(`Escena ${i + 1} eliminada`); } }
  const dup = /duplica(r)? la escena\s+(\d+)/.exec(t);
  if (dup) { const i = Number(dup[2]) - 1; const s = prod.scenes[i]; if (s) { const c = { ...structuredClone(s), id: `e${Date.now() % 1e7}`, seed: s.seed + 1, dirty: true }; prod.scenes.splice(i + 1, 0, c); renumber(prod); applied.push(`Escena ${i + 1} duplicada`); } }
  const mv = /mueve la escena\s+(\d+) (antes|despues) de la\s+(\d+)/.exec(t);
  if (mv) { const from = Number(mv[1]) - 1, to = Number(mv[3]) - 1; const [s] = prod.scenes.splice(from, 1); if (s) { let at = to - (from < to ? 1 : 0) + (mv[2] === 'despues' ? 1 : 0); prod.scenes.splice(Math.max(0, at), 0, s); renumber(prod); applied.push(`Escena ${from + 1} movida ${mv[2]} de la ${to + 1}`); } }

  // 8) Idiomas
  if (/(en|al) ingles|doblaje|doblar/.test(t)) { prod.languages = [...new Set([...(prod.languages || ['es']), 'en'])]; applied.push('Se preparará también versión en inglés (traducción y doblaje en el notebook)'); }

  return { prod, applied, understood: applied.length > 0, touched: [...touched] };
}

function renumber(prod) { prod.scenes.forEach((s, i) => { s.n = i + 1; }); prod.durationSec = prod.scenes.reduce((n, s) => n + s.seconds, 0); }

export const PRODUCTION_EXAMPLES = [
  'Cambia la escena 4: ahora ocurre en la playa de Samaná de noche',
  'Haz que la protagonista llore en la escena 5',
  'Cambia la voz de Danilo',
  'Pon música más dramática',
  'Agrega un diálogo de Rosaura en la escena 2: ¿Por qué me mentiste?',
  'Haz el video más corto',
  'Modifica solamente el final: ella encuentra una carta escondida',
  'Mueve la escena 3 antes de la 2',
  'Prepáralo también en inglés',
];

// ───────────── Órdenes para el EDITOR de video (línea de tiempo del navegador) ─────────────
/** state = { items, settings, musicId, narrId }. Modifica en el sitio y devuelve lo aplicado. */
export function applyEditorCommand(state, text) {
  const t = norm(text);
  const applied = [];
  const items = state.items;
  const pick = () => { const m = /(clip|elemento|escena)\s+(\d+)/.exec(t); return m ? items[Number(m[2]) - 1] : null; };
  if (/mas corto|acort|reduc/.test(t)) {
    let saved = 0;
    for (const it of items) {
      if (it.kind === 'image') { const nd = Math.max(1, +(it.dur * 0.75).toFixed(1)); saved += it.dur - nd; it.dur = nd; }
      else { const len = (it.outS ?? it.duration) - (it.inS || 0); const cut = len * 0.25; if (len - cut >= 0.5) { it.inS = +(it.inS + cut / 2).toFixed(2); it.outS = +(it.outS - cut / 2).toFixed(2); saved += cut; } }
    }
    applied.push(`Video más corto: −${saved.toFixed(1)} s (recorte del 25 % en cada elemento)`);
  }
  const fmt = /vertical|9:16|tiktok|reel|short/.test(t) ? '9:16' : /cuadrad|1:1/.test(t) ? '1:1' : /horizontal|16:9|youtube normal/.test(t) ? '16:9' : null;
  if (fmt && /formato|vertical|horizontal|cuadrad/.test(t)) { state.settings.aspect = fmt; applied.push(`Formato ${fmt}`); }
  const title = /(?:t[ií]tulo|title)\s*[:=]\s*(.+)$/i.exec(text.normalize('NFC'));
  if (title) { const it = pick() || items[0]; if (it) { it.title = title[1].trim(); applied.push(`Título «${it.title}» en el elemento ${items.indexOf(it) + 1}`); } }
  const sub = /subt[ií]tulo\s*[:=]\s*(.+)$/i.exec(text.normalize('NFC'));
  if (sub) { const it = pick() || items[0]; if (it) { it.subtitle = sub[1].trim(); applied.push(`Subtítulo en el elemento ${items.indexOf(it) + 1}`); } }
  if (/baja (la )?musica|musica mas baja/.test(t)) { state.settings.musicVol = Math.max(0, +(state.settings.musicVol - 0.1).toFixed(2)); applied.push(`Música al ${Math.round(state.settings.musicVol * 100)} %`); }
  if (/sube (la )?musica|musica mas alta/.test(t)) { state.settings.musicVol = Math.min(1, +(state.settings.musicVol + 0.1).toFixed(2)); applied.push(`Música al ${Math.round(state.settings.musicVol * 100)} %`); }
  if (/quita (la )?musica|sin musica/.test(t)) { state.musicId = null; applied.push('Música quitada'); }
  if (/sin (el )?audio original|silencia (los )?clips/.test(t)) { state.settings.clipVol = 0; applied.push('Audio original silenciado'); }
  if (/sin movimiento/.test(t)) { items.forEach((i) => { if (i.kind === 'image') i.motion = 'none'; }); applied.push('Fotos sin movimiento'); }
  else if (/movimiento|zoom|camara/.test(t) && !/lenta/.test(t)) { const m = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left']; items.filter((i) => i.kind === 'image').forEach((i, k) => (i.motion = m[k % 4])); applied.push('Movimiento de cámara en las fotos'); }
  if (/camara lenta|mas lento/.test(t)) { const it = pick(); (it ? [it] : items.filter((i) => i.kind === 'video')).forEach((i) => (i.speed = 0.5)); applied.push('Cámara lenta (0.5×)'); }
  if (/mas rapido|acelera/.test(t)) { const it = pick(); (it ? [it] : items.filter((i) => i.kind === 'video')).forEach((i) => (i.speed = 1.5)); applied.push('Más rápido (1.5×)'); }
  const del = /(elimina|quita|borra) (el )?(clip|elemento)\s+(\d+)/.exec(t);
  if (del) { const i = Number(del[4]) - 1; if (items[i]) { items.splice(i, 1); applied.push(`Elemento ${i + 1} eliminado`); } }
  if (/marca de agua/.test(t)) { state.settings.watermark = !/sin|quita/.test(t); applied.push(state.settings.watermark ? 'Marca de agua IDC activada' : 'Marca de agua desactivada'); }
  return { applied, understood: applied.length > 0 };
}
