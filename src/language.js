// Lenguaje limpio por defecto. Cada producción empieza bloqueando groserías; solo se permiten
// si la propietaria lo autoriza para ESA producción (la autorización no se hereda).
const WORDS = [
  // español (incluye variantes dominicanas y latinoamericanas comunes)
  'mierda', 'carajo', 'coño', 'joder', 'puta', 'puto', 'putas', 'putos', 'pendejo', 'pendeja', 'cabron', 'cabrón', 'cabrona',
  'chingar', 'chingada', 'chingado', 'verga', 'huevon', 'huevón', 'maricon', 'maricón', 'gilipollas', 'culero', 'culo', 'mamaguevo', 'mamagüevo',
  'maldito', 'maldita', 'hijueputa', 'hijo de puta', 'hdp', 'carajito de mierda', 'come mierda', 'comemierda', 'diablo', 'jodido', 'jodida', 'singar', 'singao', 'cuero',
  // inglés
  'fuck', 'fucking', 'fucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'damn', 'goddamn', 'dick', 'pussy', 'motherfucker', 'cunt', 'crap', 'whore', 'slut',
];
// Términos con uso neutro frecuente que no se bloquean solos (evitar falsos positivos)
const SOFT = new Set(['diablo', 'cuero', 'maldito', 'maldita', 'damn', 'crap', 'culo']);

// Quita acentos pero conserva la ñ ("coño" ≠ "cono")
const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');
const RE = WORDS.map((w) => ({ w, soft: SOFT.has(w), re: new RegExp(`(^|[^a-zñ])${norm(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-zñ])`, 'i') }));

/** Devuelve las palabras problemáticas encontradas (graves y leves). */
export function checkText(text) {
  const t = norm(text);
  const hits = [];
  const seen = new Set();
  for (const { w, soft, re } of RE) if (re.test(t) && !seen.has(norm(w))) { seen.add(norm(w)); hits.push({ word: w, severity: soft ? 'leve' : 'grave' }); }
  return hits;
}

/** Revisa todos los textos de una producción: título, sinopsis, diálogos, narraciones y subtítulos. */
export function checkProduction(prod) {
  const found = [];
  const add = (where, text) => { for (const h of checkText(text)) found.push({ where, ...h }); };
  add('Título', prod.title);
  add('Sinopsis', prod.synopsis);
  (prod.scenes || []).forEach((s, i) => {
    add(`Escena ${i + 1} · título`, s.title);
    add(`Escena ${i + 1} · narración`, s.narration);
    (s.dialogue || []).forEach((d, j) => add(`Escena ${i + 1} · diálogo ${j + 1}`, d.text));
    if (s.dialogueEn) s.dialogueEn.forEach((d, j) => add(`Escena ${i + 1} · diálogo EN ${j + 1}`, d.text));
  });
  return found;
}

/** Revisa títulos y subtítulos de la línea de tiempo del editor. */
export function checkTimeline(items) {
  const found = [];
  items.forEach((it, i) => {
    for (const h of checkText(it.title)) found.push({ where: `Elemento ${i + 1} · título`, ...h });
    for (const h of checkText(it.subtitle)) found.push({ where: `Elemento ${i + 1} · subtítulo`, ...h });
  });
  return found;
}

/** ¿Se puede continuar? Las palabras graves bloquean salvo autorización expresa de esa producción. */
export function isBlocked(found, allowStrong) {
  if (allowStrong) return false;
  return found.some((f) => f.severity === 'grave');
}

export const CLEAN_POLICY = 'Lenguaje limpio: se escribe sin groserías. Para permitir lenguaje fuerte en una producción concreta, autorízalo en esa producción; no se aplica a las demás.';
