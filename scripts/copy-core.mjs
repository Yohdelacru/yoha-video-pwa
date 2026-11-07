// Copia el núcleo FFmpeg.wasm (MIT/LGPL, gratuito) dentro del sitio para no depender de un CDN externo.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
const src = 'node_modules/@ffmpeg/core/dist/esm';
if (!existsSync(src)) { console.error('Falta @ffmpeg/core. Ejecuta npm install.'); process.exit(1); }
mkdirSync('public/ffmpeg', { recursive: true });
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) cpSync(`${src}/${f}`, `public/ffmpeg/${f}`);
console.log('FFmpeg core copiado a public/ffmpeg/');
