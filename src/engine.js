// Motor de exportación YOHA VIDEO — FFmpeg.wasm en el navegador (sin servidor, sin costo).
// Estrategia por segmentos: cada clip/imagen se normaliza (tamaño, fps, audio estéreo 48 kHz),
// se concatenan sin recodificar y al final se mezclan música y narración.
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export const FPS = 30;
export const ASPECTS = {
  '16:9': { label: 'Horizontal 16:9', ratio: [16, 9] },
  '9:16': { label: 'Vertical 9:16', ratio: [9, 16] },
  '1:1': { label: 'Cuadrado 1:1', ratio: [1, 1] },
};
export const RESOLUTIONS = { 360: '360p · rápida', 540: '540p', 720: '720p · recomendada', 1080: '1080p · lenta (Full HD)' };

/** Dimensiones pares para H.264. `short` = lado corto. */
export function outputSize(aspect, short) {
  const [a, b] = ASPECTS[aspect].ratio;
  const even = (n) => Math.round(n / 2) * 2;
  return a >= b ? { w: even((short * a) / b), h: short } : { w: short, h: even((short * b) / a) };
}

let ffmpeg = null;
let loading = null;
let logTail = [];

export async function loadEngine(onStatus) {
  if (ffmpeg) return ffmpeg;
  if (loading) return loading;
  loading = (async () => {
    const f = new FFmpeg();
    f.on('log', ({ message }) => { logTail.push(message); if (logTail.length > 80) logTail.shift(); });
    onStatus?.('Descargando el motor de video (≈31 MB, solo la primera vez)…');
    const base = new URL('./ffmpeg/', document.baseURI).href;
    await f.load({ coreURL: base + 'ffmpeg-core.js', wasmURL: base + 'ffmpeg-core.wasm' });
    ffmpeg = f;
    return f;
  })();
  try { return await loading; } finally { loading = null; }
}

const extOf = (name, fallback) => (/\.([a-z0-9]{2,4})$/i.exec(name || '')?.[1] || fallback).toLowerCase();
const sec = (s) => Math.max(0, s).toFixed(3);

/** Lee la duración y si hay audio usando el log de FFmpeg (-i sin salida). */
export async function probe(file) {
  const f = await loadEngine();
  const name = `probe.${extOf(file.name, 'mp4')}`;
  await f.writeFile(name, await fetchFile(file));
  logTail = [];
  await f.exec(['-hide_banner', '-i', name]).catch(() => {});
  await f.deleteFile(name).catch(() => {});
  const text = logTail.join('\n');
  const d = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(text);
  const dims = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(text);
  return {
    duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null,
    hasAudio: /Stream #.*Audio:/.test(text),
    hasVideo: /Stream #.*Video:/.test(text),
    width: dims ? +dims[1] : null,
    height: dims ? +dims[2] : null,
  };
}

/** Superposición transparente con título (arriba/centro) y subtítulo (abajo), dibujada con Canvas. */
export async function makeOverlay({ title, subtitle, w, h, watermark = null }) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const wrap = (text, size, maxW) => {
    ctx.font = `700 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    const lines = []; let line = '';
    for (const word of text.trim().split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = word; } else line = t;
    }
    if (line) lines.push(line);
    return lines.slice(0, 4);
  };
  const short = Math.min(w, h);
  if (title?.trim()) {
    const size = Math.round(short * 0.085);
    const lines = wrap(title, size, w * 0.86);
    const lh = size * 1.22, total = lines.length * lh;
    let y = h * 0.42 - total / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = size * 0.35; ctx.shadowOffsetY = size * 0.06;
    ctx.fillStyle = '#fff';
    for (const l of lines) { ctx.fillText(l, w / 2, y); y += lh; }
    ctx.shadowColor = 'transparent';
  }
  if (subtitle?.trim()) {
    const size = Math.round(short * 0.05);
    const lines = wrap(subtitle, size, w * 0.88);
    const lh = size * 1.25, pad = size * 0.45;
    const boxH = lines.length * lh + pad * 2;
    const y0 = h - boxH - h * 0.06;
    ctx.font = `700 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    const maxLine = Math.max(...lines.map((l) => ctx.measureText(l).width));
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect((w - maxLine) / 2 - pad * 1.4, y0, maxLine + pad * 2.8, boxH);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, w / 2, y0 + pad + i * lh));
  }
  if (watermark) {
    // Marca de agua en la esquina inferior derecha (12 % del lado corto, 70 % de opacidad)
    const size = Math.round(short * 0.12), m = Math.round(short * 0.03);
    ctx.globalAlpha = 0.7; ctx.drawImage(watermark, w - size - m, subtitle?.trim() ? m : h - size - m, size, size); ctx.globalAlpha = 1;
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo dibujar el texto'))), 'image/png'));
}

const MOTION = {
  none: null,
  'zoom-in': (n) => `z='1+0.15*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
  'zoom-out': (n) => `z='1.15-0.15*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
  'pan-right': (n) => `z='1.12':x='(iw-iw/zoom)*on/${n}':y='ih/2-(ih/zoom/2)'`,
  'pan-left': (n) => `z='1.12':x='(iw-iw/zoom)*(1-on/${n})':y='ih/2-(ih/zoom/2)'`,
};
export const MOTIONS = { none: 'Sin movimiento', 'zoom-in': 'Acercar', 'zoom-out': 'Alejar', 'pan-right': 'Paneo →', 'pan-left': 'Paneo ←' };

/** Filtro de encuadre: "blur" = fondo difuminado (ideal al cambiar de horizontal a vertical); "black" = barras; "cover" = llenar recortando. */
function frameFilter(input, out, w, h, fill) {
  if (fill === 'cover') return `${input}scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1${out}`;
  if (fill === 'black') return `${input}scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1${out}`;
  const sw = Math.max(16, Math.round(w / 10 / 2) * 2), sh = Math.max(16, Math.round(h / 10 / 2) * 2);
  return `${input}split=2[fgsrc][bgsrc];[bgsrc]scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh},boxblur=4:2,scale=${w}:${h},setsar=1[bg];` +
    `[fgsrc]scale=${w}:${h}:force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2${out}`;
}

/** Duración efectiva de un elemento de la línea de tiempo. */
export function itemDuration(it) {
  if (it.kind === 'image') return Math.max(0.5, +it.dur || 4);
  const end = it.outS ?? it.duration ?? 0;
  return Math.max(0.2, end - (it.inS || 0)) / (it.speed || 1);
}

/** Archivo SRT a partir de los subtítulos de cada segmento. */
export function buildSrt(items) {
  const fmt = (t) => {
    const ms = Math.round(t * 1000);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  let t = 0, n = 0; const out = [];
  for (const it of items) {
    const d = itemDuration(it);
    if (it.subtitle?.trim()) out.push(`${++n}\n${fmt(t)} --> ${fmt(t + d)}\n${it.subtitle.trim()}\n`);
    t += d;
  }
  return out.join('\n');
}

/**
 * Exporta el proyecto a MP4 (H.264 + AAC).
 * items: [{kind:'video'|'image', file, inS, outS, dur, speed, title, subtitle, motion, keepAudio}]
 */
export async function exportVideo({ watermark = null, items, aspect, short, fill = 'blur', music, musicVol = 0.35, narration, narrationVol = 1, narrationDelay = 0, clipVol = 1, burnSubtitles = true, quality = 'fast', onProgress, onStatus, signal }) {
  if (!items.length) throw new Error('Agrega al menos un clip o imagen a la línea de tiempo.');
  const f = await loadEngine(onStatus);
  const { w, h } = outputSize(aspect, short);
  const preset = quality === 'better' ? 'veryfast' : 'ultrafast';
  const crf = quality === 'better' ? '23' : '26';
  const durations = items.map(itemDuration);
  const total = durations.reduce((a, b) => a + b, 0);
  const weights = [...durations, total * 0.25];
  const wTotal = weights.reduce((a, b) => a + b, 0);
  let done = 0, stageW = 0;
  const onProg = ({ time }) => {
    if (!stageW || !time || time < 0) return;
    const frac = Math.min(1, time / 1e6 / stageW);
    onProgress?.(Math.min(99, Math.round(((done + frac * stageW) / wTotal) * 100)));
  };
  f.on('progress', onProg);
  const temp = [];
  const write = async (name, data) => { temp.push(name); await f.writeFile(name, data instanceof Uint8Array ? data : await fetchFile(data)); };
  const run = async (args, label) => {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    logTail = [];
    const code = await f.exec(['-hide_banner', '-loglevel', 'error', '-stats', ...args]);
    if (code !== 0) throw new Error(`${label}: FFmpeg terminó con código ${code}. ${logTail.slice(-4).join(' ')}`);
  };
  const abort = () => f.terminate();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const segs = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i], d = durations[i];
      onStatus?.(`Procesando ${i + 1} de ${items.length}: ${it.name || it.file?.name || 'elemento'}…`);
      stageW = d;
      const inName = `in${i}.${extOf(it.file.name, it.kind === 'image' ? 'jpg' : 'mp4')}`;
      await write(inName, it.file);
      const args = [];
      const fc = [];
      if (it.kind === 'image') {
        args.push('-loop', '1', '-framerate', String(FPS), '-t', sec(d), '-i', inName);
        const m = MOTION[it.motion || 'none'];
        const frames = Math.max(1, Math.round(d * FPS));
        if (m) {
          // Escala previa al doble para un movimiento suave, luego zoompan al tamaño final.
          fc.push(`[0:v]scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},setsar=1,zoompan=${m(frames)}:d=1:s=${w}x${h}:fps=${FPS},trim=duration=${sec(d)},setpts=PTS-STARTPTS[base]`);
        } else {
          fc.push(frameFilter('[0:v]', '[framed]', w, h, fill));
          fc.push(`[framed]fps=${FPS},trim=duration=${sec(d)},setpts=PTS-STARTPTS[base]`);
        }
      } else {
        const speed = it.speed || 1;
        args.push('-ss', sec(it.inS || 0), '-t', sec(d * speed + 0.1), '-i', inName);
        fc.push(`[0:v]setpts=(PTS-STARTPTS)/${speed},fps=${FPS}[sp]`);
        fc.push(frameFilter('[sp]', '[framed]', w, h, fill));
        fc.push(`[framed]tpad=stop_mode=clone:stop_duration=1,trim=duration=${sec(d)},setpts=PTS-STARTPTS[base]`);
      }
      let vOut = '[base]';
      const hasText = it.title?.trim() || (burnSubtitles && it.subtitle?.trim()) || watermark;
      if (hasText) {
        const png = await makeOverlay({ title: it.title, subtitle: burnSubtitles ? it.subtitle : '', w, h, watermark });
        await write(`ov${i}.png`, png);
        args.push('-i', `ov${i}.png`);
        fc.push(`[base][1:v]overlay=0:0:format=auto,format=yuv420p[v]`);
        vOut = '[v]';
      } else {
        fc.push(`[base]format=yuv420p[v]`); vOut = '[v]';
      }
      const useClipAudio = it.kind === 'video' && it.keepAudio !== false && it.hasAudio && clipVol > 0;
      if (useClipAudio) {
        const speed = it.speed || 1;
        const tempo = [];
        let s = speed; while (s > 2) { tempo.push('atempo=2'); s /= 2; } while (s < 0.5) { tempo.push('atempo=0.5'); s /= 0.5; }
        if (Math.abs(s - 1) > 0.001) tempo.push(`atempo=${s.toFixed(3)}`);
        fc.push(`[0:a]asetpts=PTS-STARTPTS,${tempo.length ? tempo.join(',') + ',' : ''}aresample=48000,aformat=channel_layouts=stereo,volume=${clipVol},apad,atrim=duration=${sec(d)}[a]`);
      } else {
        // Fuente de silencio dentro del grafo (no requiere el dispositivo lavfi)
        fc.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${sec(d)}[a]`);
      }
      const out = `seg${i}.mp4`;
      temp.push(out);
      await run([...args, '-filter_complex', fc.join(';'), '-map', vOut, '-map', '[a]', '-r', String(FPS), '-c:v', 'libx264', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-t', sec(d), out], `Elemento ${i + 1}`);
      await f.deleteFile(inName).catch(() => {});
      segs.push(out);
      done += d;
    }

    onStatus?.('Uniendo clips…');
    const list = segs.map((s) => `file '${s}'`).join('\n');
    await write('list.txt', new TextEncoder().encode(list));
    await run(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', '-movflags', '+faststart', 'joined.mp4'], 'Unión');
    temp.push('joined.mp4');
    for (const s of segs) await f.deleteFile(s).catch(() => {});

    let finalName = 'joined.mp4';
    if (music || narration) {
      onStatus?.('Mezclando música y narración…');
      stageW = total * 0.25;
      const args = ['-i', 'joined.mp4'];
      const fc = ['[0:a]volume=1[a0]'];
      const mixes = ['[a0]'];
      let idx = 1;
      if (music) {
        const n = `music.${extOf(music.name, 'mp3')}`;
        await write(n, music);
        args.push('-stream_loop', '-1', '-i', n);
        const fadeStart = Math.max(0, total - 2);
        fc.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${musicVol},atrim=duration=${sec(total)},afade=t=in:d=1,afade=t=out:st=${sec(fadeStart)}:d=2[a${idx}]`);
        mixes.push(`[a${idx}]`); idx++;
      }
      if (narration) {
        const n = `narration.${extOf(narration.name, narration.type?.includes('webm') ? 'webm' : 'mp3')}`;
        await write(n, narration);
        args.push('-i', n);
        const delayMs = Math.round(narrationDelay * 1000);
        fc.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${narrationVol},adelay=${delayMs}|${delayMs}[a${idx}]`);
        mixes.push(`[a${idx}]`); idx++;
      }
      fc.push(`${mixes.join('')}amix=inputs=${mixes.length}:duration=first:normalize=0,alimiter=limit=0.95[aout]`);
      await run([...args, '-filter_complex', fc.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', sec(total), '-movflags', '+faststart', 'final.mp4'], 'Mezcla de audio');
      temp.push('final.mp4');
      finalName = 'final.mp4';
    }
    const data = await f.readFile(finalName);
    if (!data?.length) throw new Error('El archivo de salida está vacío.');
    onProgress?.(100);
    return { blob: new Blob([data.slice()], { type: 'video/mp4' }), width: w, height: h, duration: total, srt: buildSrt(items) };
  } catch (e) {
    if (signal?.aborted) { ffmpeg = null; throw new DOMException('Exportación cancelada', 'AbortError'); }
    throw e;
  } finally {
    signal?.removeEventListener('abort', abort);
    if (ffmpeg) {
      ffmpeg.off('progress', onProg);
      for (const n of temp) await ffmpeg.deleteFile(n).catch(() => {});
    }
  }
}
