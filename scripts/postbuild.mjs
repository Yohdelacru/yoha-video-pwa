// Tras compilar: genera la lista de precache del service worker y bloquea la publicación si hay secretos.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const dist = 'dist';
const all = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : all.push(p); } })(dist);

// 1) Escaneo de secretos y datos sensibles en todo lo que se publicará
const patterns = [
  [/sk-[A-Za-z0-9]{20,}/, 'clave OpenAI'], [/r8_[A-Za-z0-9]{20,}/, 'token Replicate'], [/sk_live_[A-Za-z0-9]+|rk_live_[A-Za-z0-9]+/, 'clave Stripe'],
  [/AIza[0-9A-Za-z_-]{35}/, 'clave API de Google'], [/GOCSPX-[A-Za-z0-9_-]+/, 'secreto OAuth de Google'], [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, 'token GitHub'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clave privada'], [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'token Slack'], [/postgres(ql)?:\/\/[^\s'"]+:[^\s'"@]+@/, 'cadena de base de datos'],
  [/hf_[A-Za-z0-9]{30,}/, 'token Hugging Face'], [/@gmail\.com/i, 'correo personal'],
];
const problems = [];
for (const f of all) {
  if (/\.(wasm|png|jpg|ico)$/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  for (const [re, label] of patterns) if (re.test(text)) problems.push(`${f}: posible ${label}`);
}
const forbidden = all.filter((f) => /(^|\/)\.env|\.pem$|\.key$|id_rsa/.test(f));
problems.push(...forbidden.map((f) => `${f}: archivo sensible`));
if (problems.length) { console.error('❌ Publicación bloqueada:\n' + problems.join('\n')); process.exit(1); }

// 2) Service worker con lista de precache y versión por contenido
const shell = all.filter((f) => !/ffmpeg-core\.wasm$|\.ipynb$|\.map$|sw\.js$|brand\/.*\.mp4$|portada|plantilla|perfil/.test(f)).map((f) => './' + path.relative(dist, f).split(path.sep).join('/'));
const hash = createHash('sha256');
for (const f of all) if (!/sw\.js$/.test(f)) hash.update(readFileSync(f));
const version = hash.digest('hex').slice(0, 12);
const sw = readFileSync(path.join(dist, 'sw.js'), 'utf8').replace('__VERSION__', version).replace("'__PRECACHE__'", JSON.stringify(['./', ...shell.filter((s) => s !== './index.html'), './index.html']));
writeFileSync(path.join(dist, 'sw.js'), sw);
const bytes = all.reduce((n, f) => n + statSync(f).size, 0);
console.log(`✔ Sin secretos detectados en ${all.length} archivos (${(bytes / 1048576).toFixed(1)} MB). SW versión ${version}, ${shell.length} archivos en precache.`);
