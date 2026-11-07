// Planificador IDEA → GUION → PERSONAJES → ESCENAS → VOCES.
// Sin IA de pago: genera una estructura editable con plantillas por género, y un "prompt" para que
// cualquier asistente gratuito (o YOHA AI) devuelva el guion en el formato JSON que YOHA importa.

export const GENRES = {
  pelicula: { label: 'Película', beats: ['Presentación del mundo y del protagonista', 'Incidente que cambia todo', 'Primer obstáculo', 'Punto de no retorno', 'Crisis', 'Clímax', 'Resolución'], camera: ['plano general lento', 'plano medio con travelling', 'primer plano emotivo', 'cámara en mano', 'contrapicado dramático', 'plano secuencia', 'gran plano general al atardecer'] },
  novela: { label: 'Novela / telenovela', beats: ['Presentación de la familia y el secreto', 'Encuentro de los protagonistas', 'Conflicto amoroso', 'Revelación', 'Confrontación', 'Consecuencias', 'Gancho para el próximo capítulo'], camera: ['plano medio interior cálido', 'plano y contraplano', 'primer plano con lágrimas contenidas', 'travelling por la sala', 'zoom lento al rostro', 'plano detalle de manos', 'primer plano final congelado'] },
  serie: { label: 'Serie (capítulo)', beats: ['Recapitulación', 'Nuevo problema del capítulo', 'Investigación', 'Giro', 'Clímax del capítulo', 'Cierre y cliffhanger'], camera: ['montaje rápido', 'plano medio', 'cámara en mano', 'plano detalle', 'plano general nocturno', 'primer plano y corte a negro'] },
  animacion: { label: 'Animación', beats: ['Mundo colorido y protagonista', 'Deseo del protagonista', 'Aventura', 'Problema', 'Trabajo en equipo', 'Final feliz'], camera: ['plano general colorido', 'plano medio expresivo', 'seguimiento lateral', 'picado divertido', 'plano de grupo', 'alejamiento final'] },
  documental: { label: 'Documental', beats: ['Pregunta central', 'Contexto e historia', 'Testimonios / datos', 'Problema o tensión', 'Hallazgos', 'Conclusión y llamado'], camera: ['toma aérea establecedora', 'plano medio de entrevista', 'material de apoyo en detalle', 'cámara lenta', 'time-lapse', 'plano general final'] },
  animales: { label: 'Animales / naturaleza', beats: ['Hábitat al amanecer', 'Presentación del animal', 'Búsqueda de alimento', 'Peligro o desafío', 'Cuidado de las crías', 'Atardecer en el hábitat'], camera: ['toma aérea del paisaje', 'teleobjetivo a distancia', 'cámara lenta', 'nivel del suelo', 'primer plano del rostro', 'silueta al atardecer'] },
  comercial: { label: 'Comercial publicitario', beats: ['Gancho visual (3 s)', 'Problema del cliente', 'Producto o servicio como solución', 'Beneficios clave', 'Prueba social', 'Llamado a la acción y marca'], camera: ['macro del producto', 'plano medio de la persona', 'giro 360 del producto', 'uso real en contexto', 'sonrisas y resultado', 'logo con fondo limpio'] },
  videoclip: { label: 'Videoclip musical', beats: ['Intro atmosférica', 'Verso 1', 'Pre-coro', 'Coro', 'Verso 2', 'Puente', 'Coro final'], camera: ['silueta a contraluz', 'plano medio del artista', 'cámara giratoria', 'cortes al ritmo', 'travelling con luces', 'cámara lenta', 'gran plano general'] },
  narrada: { label: 'Historia narrada', beats: ['Había una vez…', 'El deseo', 'El viaje', 'La prueba', 'El cambio', 'Moraleja'], camera: ['ilustración amplia', 'plano medio', 'paneo por el paisaje', 'primer plano', 'luz cálida', 'alejamiento final'] },
  otro: { label: 'Otro', beats: ['Inicio', 'Desarrollo', 'Momento clave', 'Cierre'], camera: ['plano general', 'plano medio', 'primer plano', 'plano final'] },
};

export const STYLES = {
  cinematografico: 'cinematic film still, natural skin texture, soft key light, shallow depth of field, 35mm, color graded',
  realista: 'photorealistic, natural lighting, detailed environment, realistic motion',
  animacion3d: '3D animated film style, soft global illumination, expressive characters',
  animacion2d: '2D hand-drawn animation style, clean lines, vibrant colors',
  documental: 'documentary footage, natural light, handheld realism',
  anime: 'anime style, cel shading, dynamic composition',
};

export function emptyProduction() {
  return { version: 1, app: 'yoha-video', idea: '', genre: 'pelicula', style: 'cinematografico', aspect: '16:9', targetSeconds: 60, language: 'es', characters: [], scenes: [] };
}

/** Plan inicial con plantilla del género. Todo queda editable. */
export function planFromIdea({ idea, genre, style, targetSeconds, sceneCount, characters }) {
  const g = GENRES[genre] || GENRES.otro;
  const n = Math.max(1, Math.min(40, sceneCount || g.beats.length));
  const per = Math.max(3, Math.round((targetSeconds || 60) / n));
  const scenes = Array.from({ length: n }, (_, i) => {
    const beat = g.beats[Math.min(g.beats.length - 1, Math.floor((i * g.beats.length) / n))];
    const cast = characters.length ? [characters[i % characters.length].id] : [];
    return {
      id: `s${i + 1}`,
      title: beat,
      description: `${beat}: ${idea || 'describe aquí lo que se ve'}`,
      camera: g.camera[i % g.camera.length],
      characters: cast,
      narration: '',
      dialogue: [],
      seconds: per,
      seed: 1000 + i,
    };
  });
  return { ...emptyProduction(), idea, genre, style, targetSeconds, characters: characters.map((c) => c.id), scenes };
}

/** Texto final que recibe el modelo de video para una escena (personajes con descripción fija = continuidad). */
export function scenePrompt(scene, chars, style) {
  const cast = (scene.characters || []).map((id) => chars.find((c) => c.id === id)).filter(Boolean);
  const castText = cast.map((c) => `${c.name}: ${c.appearance}${c.wardrobe ? `, wearing ${c.wardrobe}` : ''}`).join('; ');
  return [scene.description, castText && `Characters: ${castText}`, scene.camera && `Camera: ${scene.camera}`, STYLES[style] || style].filter(Boolean).join('. ');
}

/** Instrucción para pegar en un asistente gratuito o en YOHA AI: devuelve el guion en JSON importable. */
export function assistantPrompt(prod, chars) {
  const cast = chars.filter((c) => prod.characters.includes(c.id)).map((c) => `- id "${c.id}": ${c.name} (${c.role || 'personaje'}). Apariencia: ${c.appearance}. Vestuario: ${c.wardrobe || '—'}.`).join('\n');
  return `Eres guionista y director de fotografía. Escribe el guion de un video de género "${GENRES[prod.genre]?.label || prod.genre}" de unos ${prod.targetSeconds} segundos, en español.
Idea: ${prod.idea}
Personajes disponibles (usa sus id exactos):
${cast || '- (sin personajes fijos)'}
Divide en escenas de 4 a 8 segundos (los modelos de video gratuitos generan clips cortos).
Responde SOLO con JSON válido, sin texto adicional, con esta forma:
{"scenes":[{"title":"","description":"descripción visual detallada en inglés: lugar, acción, iluminación, emoción","camera":"movimiento de cámara en inglés","characters":["id"],"narration":"texto de narración en español o vacío","dialogue":[{"character":"id","text":"línea en español"}],"seconds":5}]}`;
}

/** Acepta el JSON devuelto por el asistente, o un paquete completo de YOHA. */
export function importScript(text, prod) {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error('No encontré JSON en el texto pegado.');
  const data = JSON.parse(m[0]);
  const list = Array.isArray(data.scenes) ? data.scenes : null;
  if (!list?.length) throw new Error('El JSON no contiene "scenes".');
  const scenes = list.slice(0, 60).map((s, i) => ({
    id: `s${i + 1}`,
    title: String(s.title || `Escena ${i + 1}`).slice(0, 120),
    description: String(s.description || '').slice(0, 1500),
    camera: String(s.camera || '').slice(0, 200),
    characters: Array.isArray(s.characters) ? s.characters.map(String).filter((id) => prod.characters.includes(id)) : [],
    narration: String(s.narration || '').slice(0, 1500),
    dialogue: Array.isArray(s.dialogue) ? s.dialogue.slice(0, 20).map((d) => ({ character: String(d.character || ''), text: String(d.text || '').slice(0, 500) })) : [],
    seconds: Math.max(2, Math.min(10, Number(s.seconds) || 5)),
    seed: 1000 + i,
  }));
  return { ...prod, scenes };
}

/** Paquete de producción que lee el notebook de Kaggle/Colab. */
export function productionPackage(prod, chars, { includePhotos }) {
  const cast = chars.filter((c) => prod.characters.includes(c.id)).map((c) => ({
    id: c.id, name: c.name, role: c.role, appearance: c.appearance, wardrobe: c.wardrobe, voice: c.voice, seed: c.seed,
    references: includePhotos && c.consent?.given ? c.photos.map((p) => p.dataUrl) : [],
    consent: c.photos.length ? c.consent : null,
  }));
  return {
    format: 'yoha-production', version: 1, createdAt: new Date().toISOString(),
    idea: prod.idea, genre: prod.genre, style: prod.style, styleText: STYLES[prod.style] || prod.style, aspect: prod.aspect, language: prod.language,
    characters: cast,
    scenes: prod.scenes.map((s) => ({ ...s, prompt: scenePrompt(s, chars, prod.style) })),
  };
}
