// DIRECTOR CINEMATOGRÁFICO IA — una instrucción → producción completa y editable.
// En el navegador NO hay un modelo de lenguaje: aquí se interpreta la instrucción, se arma la
// estructura (sinopsis base, reparto, escenarios, escenas, planos, dirección, música, efectos) y se
// prepara el encargo exacto para el guionista IA gratuito (Qwen2.5-7B en el notebook, o cualquier
// asistente). Los diálogos completos los escribe ese guionista; nada se inventa como "terminado".
import { uid } from './store.js';

// ───────────── Vocabulario ─────────────
const NUM_WORDS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cuarentaicinco: 45, cincuenta: 50, sesenta: 60, noventa: 90 };
const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');
const num = (tok) => (/^\d+$/.test(tok) ? Number(tok) : NUM_WORDS[tok.replace(/[^a-zñ]/g, '')] ?? null);

export const FORMATS = {
  novela: { label: 'Novelita / telenovela', genre: 'drama romántico', clipSec: 5 },
  serie: { label: 'Serie (capítulo)', genre: 'drama', clipSec: 5 },
  pelicula: { label: 'Película corta', genre: 'drama', clipSec: 5 },
  romance: { label: 'Historia romántica', genre: 'romance', clipSec: 5 },
  suspenso: { label: 'Suspenso y misterio', genre: 'suspenso', clipSec: 5 },
  comedia: { label: 'Comedia', genre: 'comedia', clipSec: 4 },
  drama: { label: 'Drama', genre: 'drama', clipSec: 5 },
  documental: { label: 'Documental', genre: 'documental', clipSec: 6 },
  comercial: { label: 'Comercial', genre: 'publicidad', clipSec: 4 },
  empresarial: { label: 'Publicidad empresarial', genre: 'corporativo', clipSec: 5 },
  musical: { label: 'Video musical', genre: 'musical', clipSec: 4 },
  educativo: { label: 'Contenido educativo', genre: 'educativo', clipSec: 6 },
  infantil: { label: 'Historia infantil', genre: 'infantil', clipSec: 5 },
  motivacional: { label: 'Video motivacional', genre: 'motivacional', clipSec: 5 },
  short: { label: 'YouTube Short / Reel / TikTok', genre: 'viral', clipSec: 4 },
};
const FORMAT_KEYS = [
  [/short|reel|tiktok/, 'short'], [/novel|telenovel/, 'novela'], [/serie|capitulo|temporada/, 'serie'], [/pelicula|corto ?metraje|film/, 'pelicula'],
  [/documental/, 'documental'], [/comercial|anuncio/, 'comercial'], [/empresa|corporativ|negocio/, 'empresarial'], [/video ?musical|videoclip|cancion/, 'musical'],
  [/educativ|clase|tutorial|explica/, 'educativo'], [/infantil|niños|ninos|cuento/, 'infantil'], [/motivacion|inspirador/, 'motivacional'],
  [/comedia|chistos|humor/, 'comedia'], [/suspenso|misterio|thriller/, 'suspenso'], [/romant|romance|amor/, 'romance'], [/drama/, 'drama'],
];
const THEMES = ['romance', 'traicion', 'suspenso', 'misterio', 'venganza', 'secreto', 'familia', 'comedia', 'accion', 'celos', 'herencia', 'redencion', 'amistad', 'superacion', 'peligro'];

// Nombres y escenarios por región (originales y genéricos)
const NAMES_DO = { f: ['Yaritza', 'Rosaura', 'Altagracia', 'Mariel', 'Dahiana', 'Yokasta', 'Wendy', 'Luz María'], m: ['Ramón', 'Wilfredo', 'Yunior', 'Rafael', 'Danilo', 'Eddy', 'Franklin', 'Manuel'] };
const NAMES = { f: ['Elena', 'Sofía', 'Valeria', 'Camila', 'Lucía', 'Isabel'], m: ['Andrés', 'Mateo', 'Gabriel', 'Diego', 'Tomás', 'Julián'] };
const PLACES_DO = ['casa familiar en un barrio de Santo Domingo, patio con matas de mango', 'colmado de esquina con luces de neón y bachata de fondo', 'Malecón de Santo Domingo al atardecer', 'calles empedradas de la Zona Colonial', 'finca cafetalera en Jarabacoa entre neblina', 'playa de Samaná con palmeras', 'oficina moderna en la avenida Winston Churchill', 'hospital de noche, pasillo con luz fría'];
const PLACES = ['casa familiar con sala acogedora', 'café de barrio', 'oficina moderna', 'parque al atardecer', 'calle de la ciudad de noche', 'casa de campo', 'playa', 'hospital de noche'];
const ROLES = [
  { role: 'protagonista', sex: 'f', arc: 'busca amor y justicia; descubre un secreto que lo cambia todo', personality: 'noble, valiente, terca cuando se trata de su familia' },
  { role: 'interés amoroso', sex: 'm', arc: 'oculta parte de su pasado; tiene que elegir entre su familia y el amor', personality: 'encantador, reservado, leal' },
  { role: 'antagonista', sex: 'f', arc: 'traiciona por ambición y celos', personality: 'elegante, calculadora, resentida' },
  { role: 'confidente', sex: 'm', arc: 'mejor amigo que sabe más de lo que dice', personality: 'divertido, observador, protector' },
  { role: 'figura familiar', sex: 'f', arc: 'guarda el secreto de la familia desde hace años', personality: 'sabia, firme, cariñosa' },
  { role: 'rival', sex: 'm', arc: 'compite por la misma herencia o el mismo amor', personality: 'impulsivo, orgulloso' },
  { role: 'aliada inesperada', sex: 'f', arc: 'aparece para ayudar a cambio de algo', personality: 'misteriosa, astuta' },
];
const LOOKS = {
  f: ['woman in her late 20s, warm brown skin, long curly dark hair, expressive brown eyes', 'woman in her 30s, light brown skin, straight black hair in a bun, elegant features', 'woman in her 60s, dark skin, short gray curly hair, kind eyes, reading glasses', 'woman in her 20s, olive skin, wavy chestnut hair, freckles'],
  m: ['man in his early 30s, tan skin, short black fade haircut, trimmed beard', 'man in his late 20s, dark brown skin, close-cropped hair, bright smile', 'man in his 40s, light skin, salt-and-pepper hair, strong jaw', 'young man in his 20s, mixed-race, curly hair, athletic build'],
};
const WARDROBE = { f: ['white linen dress and gold hoop earrings', 'navy blazer over a silk blouse', 'floral house dress and an apron', 'denim jacket and sneakers'], m: ['light blue guayabera shirt', 'dark suit with an open collar', 'white t-shirt and a baseball cap', 'leather jacket'] };

// Estructura dramática por formato (beats). El final de serie/novela siempre termina en gancho.
const STRUCTURES = {
  default: ['Presentación del mundo y los personajes', 'Deseo o problema de la protagonista', 'Primer encuentro / chispa', 'Complicación', 'Traición o revelación', 'Confrontación', 'Clímax emocional', 'Consecuencias', 'Gancho final'],
  short: ['Gancho en los primeros 2 segundos', 'Giro inesperado', 'Remate y llamado a seguir el canal'],
  comercial: ['Gancho visual', 'Problema del cliente', 'Solución: el producto o servicio', 'Beneficios', 'Llamado a la acción con la marca'],
  documental: ['Pregunta central', 'Contexto', 'Testimonios y datos', 'Tensión', 'Hallazgos', 'Conclusión'],
  educativo: ['Pregunta que engancha', 'Explicación paso a paso', 'Ejemplo', 'Error común', 'Resumen y reto'],
  musical: ['Intro atmosférica', 'Verso', 'Coro', 'Puente', 'Coro final'],
  infantil: ['Había una vez', 'El deseo', 'La aventura', 'El problema', 'Trabajo en equipo', 'Final feliz y enseñanza'],
  motivacional: ['El punto más bajo', 'La decisión', 'El esfuerzo', 'El obstáculo', 'La victoria', 'Mensaje final'],
};

export const EMOTIONS = { neutral: 'calm neutral expression', feliz: 'smiling warmly, happy', risa: 'laughing naturally', triste: 'sad, glossy eyes', llanto: 'crying, tears running down the cheeks', enfado: 'angry, furrowed brow, clenched jaw', sorpresa: 'surprised, eyes wide open, mouth slightly open', miedo: 'afraid, tense, looking around', amor: 'loving gaze, soft smile', celos: 'jealous, narrowed eyes, arms crossed', determinacion: 'determined, steady gaze' };
export const GESTURES = { ninguno: '', asiente: 'nods slowly', niega: 'shakes head', manos: 'gestures with both hands while talking', abrazo: 'hugs the other person', señala: 'points at someone', cubre_rostro: 'covers face with hands', toma_mano: 'holds the other person\'s hand', brazos_cruzados: 'crosses arms' };
export const MOVES = { quieto: '', camina: 'walks slowly toward the camera', entra: 'enters the room through the door', se_va: 'turns and walks away', se_sienta: 'sits down', se_levanta: 'stands up abruptly', gira: 'turns to face the other character', corre: 'runs' };
export const CAMERAS = ['wide establishing shot, slow dolly in', 'medium shot, gentle handheld', 'close-up, shallow depth of field', 'over-the-shoulder shot', 'slow push-in on the face', 'low angle dramatic shot', 'tracking shot following the character', 'two-shot, static camera'];
export const MUSIC_MOODS = { romantica: 'Romántica (bachata/bolero suave)', dramatica: 'Dramática (cuerdas, piano)', suspenso: 'Suspenso (pulsos graves)', alegre: 'Alegre (merengue/pop)', triste: 'Triste (piano lento)', epica: 'Épica (orquestal)', comedia: 'Comedia (pizzicato)', neutra: 'Neutra de fondo' };

// ───────────── Interpretación de la instrucción ─────────────
export function parseInstruction(text) {
  const t = norm(text);
  const toks = t.split(/[^a-z0-9ñ]+/).filter(Boolean);
  let minutes = null, seconds = null, chars = null;
  for (let i = 0; i < toks.length; i++) {
    const n = num(toks[i]);
    const next = toks[i + 1] || '', next2 = toks[i + 2] || '';
    if (n == null) continue;
    if (/^(minuto|minutos|min)$/.test(next)) minutes = n;
    if (/^(segundo|segundos|seg|s)$/.test(next)) seconds = n;
    if (/^(personaje|personajes|actores|protagonistas)$/.test(next) || /^(personaje|personajes)$/.test(next2)) chars = n;
    if (/^(hora|horas)$/.test(next)) minutes = n * 60;
  }
  if (/media hora/.test(t)) minutes = 30;
  const format = FORMAT_KEYS.find(([re]) => re.test(t))?.[1] || 'pelicula';
  const themes = THEMES.filter((w) => t.includes(w.replace('traicion', 'traici')));
  const dominican = /dominican|santo domingo|santiago|quisqueya|\brd\b|samana|punta cana|bachata|merengue/.test(t);
  const cliffhanger = /proximo capitulo|siguiente capitulo|gancho|cliffhanger|continuara|ver el proximo/.test(t);
  const vertical = /short|reel|tiktok|vertical|historia de instagram|stories/.test(t);
  const english = /ingles|english|doblad|doblaje|bilingue/.test(t);
  const durationSec = Math.max(10, Math.min(3 * 3600, seconds ?? (minutes ? minutes * 60 : format === 'short' ? 45 : format === 'comercial' ? 30 : 180)));
  return { text, format, themes, dominican, cliffhanger, vertical, english, durationSec, characters: Math.max(1, Math.min(7, chars ?? (format === 'short' || format === 'comercial' ? 2 : 4))) };
}

function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }

// ───────────── Construcción de la producción ─────────────
export function buildProduction(instruction, { library = [], seriesId = null, episode = null } = {}) {
  const p = parseInstruction(instruction);
  const fmt = FORMATS[p.format];
  const names = p.dominican ? NAMES_DO : NAMES;
  const places = p.dominican ? PLACES_DO : PLACES;
  // Reparto: reutiliza personajes guardados (memoria permanente) y completa con nuevos
  const cast = [];
  const reuse = library.slice(0, p.characters);
  for (const c of reuse) cast.push({ ...c, isNew: false });
  const bySex = { f: 0, m: 0 };
  for (let i = cast.length; i < p.characters; i++) {
    const r = ROLES[i % ROLES.length];
    const k = bySex[r.sex]++;
    cast.push({
      id: uid(), isNew: true, name: pick(names[r.sex], k * 3 + 1), role: r.role, appearance: pick(LOOKS[r.sex], k), wardrobe: pick(WARDROBE[r.sex], k),
      voice: r.sex === 'f' ? 'ef_dora' : i % 2 ? 'em_alex' : 'em_santa', voiceEn: r.sex === 'f' ? 'af_heart' : 'am_michael', seed: 1000 + i * 101,
      personality: r.personality, history: r.arc, relations: [], emotions: 'neutral', photos: [], consent: null,
    });
  }
  // Relaciones básicas entre el reparto
  const rel = (a, b, type) => a && b && a.relations?.push?.({ with: b.id, type });
  rel(cast[0], cast[1], 'amor'); rel(cast[1], cast[0], 'amor'); rel(cast[2], cast[0], 'rivalidad / traición'); rel(cast[3], cast[0], 'amistad'); rel(cast[4], cast[0], 'familia');

  const beats = STRUCTURES[p.format] || STRUCTURES[{ comercial: 'comercial', empresarial: 'comercial', documental: 'documental', educativo: 'educativo', musical: 'musical', infantil: 'infantil', motivacional: 'motivacional' }[p.format]] || STRUCTURES.default;
  const clip = fmt.clipSec;
  const totalShots = Math.max(beats.length, Math.round(p.durationSec / clip));
  // Escenas = beats (expandidos si la duración es larga); planos = clips de ~5 s que generará la IA
  const sceneCount = Math.max(beats.length, Math.min(60, Math.round(totalShots / 8)));
  const scenes = [];
  for (let i = 0; i < sceneCount; i++) {
    const beat = beats[Math.min(beats.length - 1, Math.floor((i * beats.length) / sceneCount))];
    const isLast = i === sceneCount - 1;
    const shotsHere = Math.max(1, Math.round(totalShots / sceneCount));
    const inScene = [cast[i % cast.length], cast[(i + 1) % cast.length]].filter((c, k, a) => c && a.indexOf(c) === k).slice(0, p.characters > 1 ? 2 : 1);
    const mood = /traici|revelac|confront|clímax|climax/i.test(beat) ? 'dramatica' : /chispa|encuentro|amor/i.test(beat) ? 'romantica' : /gancho|complicac|tensión/i.test(beat) ? 'suspenso' : p.format === 'comedia' ? 'comedia' : p.format === 'infantil' ? 'alegre' : 'neutra';
    const acting = {};
    inScene.forEach((c, k) => { acting[c.id] = { emotion: mood === 'dramatica' ? (k ? 'enfado' : 'llanto') : mood === 'romantica' ? 'amor' : mood === 'suspenso' ? 'sorpresa' : 'neutral', gesture: k ? 'ninguno' : 'manos', move: k === 0 && i === 0 ? 'entra' : 'quieto' }; });
    scenes.push({
      id: `e${i + 1}`, n: i + 1, title: isLast && (p.cliffhanger || ['novela', 'serie'].includes(p.format)) ? 'Gancho final: revelación que obliga a ver el próximo capítulo' : beat,
      location: pick(places, i), time: i % 3 === 2 ? 'noche' : i % 3 === 1 ? 'atardecer' : 'día',
      description: `${beat}${p.themes.length ? ` (${p.themes.join(', ')})` : ''}. ${inScene.map((c) => c.name).join(' y ')} en ${pick(places, i)}.`.slice(0, 600),
      characters: inScene.map((c) => c.id), acting,
      camera: pick(CAMERAS, i), musicMood: mood, sfx: '', narration: '', dialogue: [], dialogueEn: [],
      shots: shotsHere, seconds: shotsHere * clip, seed: 2000 + i * 37, version: 1, dirty: true, status: 'pendiente_guion',
    });
  }
  const title = suggestTitle(p);
  return {
    id: uid(), kind: 'production', format: p.format, formatLabel: fmt.label, title, instruction,
    synopsis: `${fmt.label} de ${Math.round(p.durationSec / 60) || 1} min${p.themes.length ? ` con ${p.themes.join(', ')}` : ''}${p.dominican ? ', ambientada en República Dominicana' : ''}. ${cast[0] ? `${cast[0].name} (${cast[0].role})` : 'La protagonista'} ${cast[0]?.history || ''}.${p.cliffhanger ? ' Termina con un gancho para el próximo capítulo.' : ''} (Sinopsis base: el guionista IA la reescribe.)`,
    durationSec: p.durationSec, aspect: p.vertical ? '9:16' : '16:9', resolution: '720p', style: 'cinematografico',
    languages: p.english ? ['es', 'en'] : ['es'], allowStrongLanguage: false,
    characters: cast.map((c) => c.id), newCharacters: cast.filter((c) => c.isNew).map(({ isNew, ...c }) => c),
    scenes, music: { mood: scenes[0]?.musicMood || 'neutra', fileId: null }, seriesId, episode,
    status: 'borrador', stage: 'estructura', approvals: [], versions: [], createdAt: new Date().toISOString(),
    parsed: p,
  };
}

function suggestTitle(p) {
  const base = { novela: 'Corazones en Juego', serie: 'Secretos de Familia', pelicula: 'La Última Promesa', romance: 'Bajo el Mismo Cielo', suspenso: 'Lo Que Nadie Vio', comedia: 'Qué Lío en el Barrio', documental: 'Historias que Inspiran', comercial: 'Tu Mejor Decisión', empresarial: 'Construimos Futuro', musical: 'Ritmo del Alma', educativo: 'Aprende en 5 Minutos', infantil: 'La Aventura de Pipo', motivacional: 'Nunca Te Rindas', short: '¿Qué Harías Tú?', drama: 'Entre la Verdad y el Silencio' };
  return (p.dominican && ['novela', 'serie'].includes(p.format) ? 'Amor y Traición en la Capital' : base[p.format]) || 'Mi Producción YDC';
}

// ───────────── Estimaciones honestas ─────────────
/** Planos a generar y tiempo de GPU aproximado (supuesto explícito, no medido). */
export function estimate(prod, minPerClip = 10) {
  const shots = prod.scenes.reduce((s, x) => s + (x.shots || 1), 0);
  const dirty = prod.scenes.filter((s) => s.dirty).reduce((s, x) => s + (x.shots || 1), 0);
  const gpuMin = dirty * minPerClip;
  return { shots, dirtyShots: dirty, gpuHours: +(gpuMin / 60).toFixed(1), kaggleWeeks: +(gpuMin / 60 / 30).toFixed(2), assumption: `${minPerClip} min por clip de ~5 s en GPU T4 gratuita (estimación, no medida)` };
}

// ───────────── Dirección: texto final para el modelo de video ─────────────
export function actingCue(char, a) {
  if (!a) return '';
  return [EMOTIONS[a.emotion], GESTURES[a.gesture], MOVES[a.move]].filter(Boolean).join(', ');
}
export function shotPrompt(scene, chars, styleText) {
  const cast = scene.characters.map((id) => chars.find((c) => c.id === id)).filter(Boolean);
  const people = cast.map((c) => `${c.name}, ${c.appearance}${c.wardrobe ? `, wearing ${c.wardrobe}` : ''}${scene.acting?.[c.id] ? ` — ${actingCue(c, scene.acting[c.id])}` : ''}`).join('; ');
  const talking = (scene.dialogue || []).length ? ' The characters are having a conversation, lips moving naturally.' : '';
  return [`${scene.location}, ${scene.time === 'noche' ? 'night' : scene.time === 'atardecer' ? 'golden hour sunset light' : 'daylight'}`, scene.descriptionEn || scene.description, people && `Characters: ${people}`, `Camera: ${scene.camera}`, styleText].filter(Boolean).join('. ') + '.' + talking;
}

/** Detección automática de emoción a partir del diálogo (dirección automática; editable a mano). */
export function emotionFromLine(text) {
  const t = norm(text);
  if (/te amo|te quiero|mi amor|mi vida|cariño/.test(t)) return 'amor';
  if (/jaja|que gracioso|me muero de risa/.test(t)) return 'risa';
  if (/como pudiste|traidor|traidora|te odio|vete|largate|no te lo perdono/.test(t)) return 'enfado';
  if (/lo siento|perdon|perdoname|se murio|lo perdi|no puede ser/.test(t)) return /no puede ser/.test(t) ? 'sorpresa' : 'llanto';
  if (/que\?|como que|en serio|no lo puedo creer|imposible/.test(t)) return 'sorpresa';
  if (/tengo miedo|ayuda|alguien viene|nos van a/.test(t)) return 'miedo';
  if (/lo voy a lograr|no me rindo|vamos a|lo haremos/.test(t)) return 'determinacion';
  if (/gracias|que bueno|que alegria|felicidades/.test(t)) return 'feliz';
  return null;
}
export function autoDirect(scene) {
  for (const d of scene.dialogue || []) {
    const e = emotionFromLine(d.text);
    if (e && d.character) {
      scene.acting = scene.acting || {};
      scene.acting[d.character] = { ...(scene.acting[d.character] || { gesture: 'manos', move: 'quieto' }), emotion: e };
      d.emotion = e;
    }
  }
  return scene;
}

// ───────────── Guionista IA (gratuito) ─────────────
/** Encargo para el guionista: Qwen2.5-7B en el notebook o cualquier asistente gratuito. Devuelve JSON importable. */
export function writerBrief(prod, chars) {
  const cast = chars.filter((c) => prod.characters.includes(c.id)).map((c) => `- id "${c.id}": ${c.name}, ${c.role}. Personalidad: ${c.personality || '—'}. Historia: ${c.history || '—'}. Apariencia (inglés): ${c.appearance}. Vestuario: ${c.wardrobe || '—'}.`).join('\n');
  const scenes = prod.scenes.map((s) => `${s.n}. [${s.id}] ${s.title} — lugar: ${s.location}, ${s.time}; personajes: ${s.characters.map((id) => chars.find((c) => c.id === id)?.name || id).join(', ')}; ${s.seconds} s`).join('\n');
  return `Eres guionista profesional de ${prod.formatLabel} para el canal YDC Entertainment Virales.
Instrucción original: "${prod.instruction}"
Título de trabajo: ${prod.title}
Duración total: ${Math.round(prod.durationSec / 60)} minutos. Idioma: español${prod.languages.includes('en') ? ' (incluye además la traducción al inglés de cada diálogo en "dialogueEn")' : ''}.
REGLAS: historia 100% original (no copies obras existentes ni personajes famosos). ${prod.allowStrongLanguage ? 'Se permite lenguaje fuerte solo si la escena lo exige.' : 'Lenguaje limpio: SIN malas palabras ni groserías.'} Diálogos naturales y breves (cada plano dura ~5 s; máximo 2 líneas cortas por plano).
REPARTO (usa exactamente estos id):
${cast}
ESCALETA (respeta el id de cada escena; puedes mejorar títulos y descripciones):
${scenes}
Responde SOLO con JSON válido:
{"title":"","synopsis":"","scenes":[{"id":"e1","title":"","description":"qué se ve, en español","descriptionEn":"visual description in English for the video model: place, action, lighting, emotion","narration":"","dialogue":[{"character":"id","text":"","emotion":"neutral|feliz|risa|triste|llanto|enfado|sorpresa|miedo|amor|celos|determinacion"}],"dialogueEn":[{"character":"id","text":""}],"musicMood":"romantica|dramatica|suspenso|alegre|triste|epica|comedia|neutra","sfx":""}]}`;
}

/** Importa el guion del guionista IA sin perder la estructura ni el resto de la producción. */
export function importWriterJson(text, prod) {
  const m = /\{[\s\S]*\}/.exec(text || '');
  if (!m) throw new Error('No encontré JSON en el texto.');
  const data = JSON.parse(m[0]);
  if (!Array.isArray(data.scenes)) throw new Error('El JSON no trae "scenes".');
  const ids = new Set(prod.characters);
  const next = structuredClone(prod);
  if (data.title) next.title = String(data.title).slice(0, 120);
  if (data.synopsis) next.synopsis = String(data.synopsis).slice(0, 3000);
  data.scenes.forEach((s, i) => {
    const target = next.scenes.find((x) => x.id === s.id) || next.scenes[i];
    if (!target) return;
    const clean = (arr) => (Array.isArray(arr) ? arr.slice(0, 30).map((d) => ({ character: ids.has(String(d.character)) ? String(d.character) : '', text: String(d.text || '').slice(0, 400), emotion: d.emotion ? String(d.emotion) : undefined })).filter((d) => d.text) : []);
    Object.assign(target, {
      title: s.title ? String(s.title).slice(0, 140) : target.title,
      description: s.description ? String(s.description).slice(0, 1500) : target.description,
      descriptionEn: s.descriptionEn ? String(s.descriptionEn).slice(0, 1500) : target.descriptionEn,
      narration: String(s.narration || '').slice(0, 1500), dialogue: clean(s.dialogue), dialogueEn: clean(s.dialogueEn),
      musicMood: MUSIC_MOODS[s.musicMood] ? s.musicMood : target.musicMood, sfx: String(s.sfx || '').slice(0, 200),
      status: 'guion_listo', dirty: true, version: (target.version || 1) + 1,
    });
    autoDirect(target);
  });
  next.stage = 'guion';
  return next;
}

// ───────────── Paquete para el notebook (v2) ─────────────
export const STYLE_TEXT = {
  cinematografico: 'cinematic film still, natural skin texture, soft key light, shallow depth of field, 35mm, color graded, telenovela production quality',
  realista: 'photorealistic, natural lighting, detailed environment, realistic motion',
  animacion3d: '3D animated film style, soft global illumination, expressive characters',
  animacion2d: '2D hand-drawn animation style, clean lines, vibrant colors',
  documental: 'documentary footage, natural light, handheld realism',
};
export function sceneHash(s) {
  const key = JSON.stringify([s.description, s.descriptionEn, s.location, s.time, s.camera, s.characters, s.acting, s.seed, s.shots]);
  let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function productionPackage(prod, chars, { includePhotos = false, onlyDirty = false } = {}) {
  const cast = chars.filter((c) => prod.characters.includes(c.id));
  const styleText = STYLE_TEXT[prod.style] || prod.style;
  return {
    format: 'yoha-production', version: 2, app: 'Yoha Video', brand: 'YDC Entertainment Virales', createdAt: new Date().toISOString(),
    id: prod.id, title: prod.title, synopsis: prod.synopsis, instruction: prod.instruction, brief: writerBrief(prod, chars), genre: prod.formatLabel, style: prod.style, styleText,
    aspect: prod.aspect, resolution: prod.resolution, languages: prod.languages, allowStrongLanguage: Boolean(prod.allowStrongLanguage), musicMood: prod.music?.mood,
    characters: cast.map((c) => ({ id: c.id, name: c.name, role: c.role, appearance: c.appearance, wardrobe: c.wardrobe, voice: c.voice, voiceEn: c.voiceEn || 'af_heart', seed: c.seed,
      references: includePhotos && c.consent?.given ? (c.photos || []).map((p) => p.dataUrl) : [], consent: (c.photos || []).length ? c.consent : null })),
    scenes: prod.scenes.filter((s) => !onlyDirty || s.dirty).map((s) => ({
      id: s.id, n: s.n, title: s.title, seconds: s.seconds, shots: s.shots, seed: s.seed, hash: sceneHash(s), characters: s.characters, acting: s.acting,
      location: s.location, time: s.time, camera: s.camera, description: s.description, descriptionEn: s.descriptionEn,
      prompt: shotPrompt(s, cast, styleText), narration: s.narration, dialogue: s.dialogue, dialogueEn: s.dialogueEn, musicMood: s.musicMood, sfx: s.sfx,
    })),
    onlyChanged: onlyDirty,
  };
}
