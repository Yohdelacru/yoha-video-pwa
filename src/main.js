import './style.css';
import { unzipSync, strFromU8 } from 'fflate';
import { ASPECTS, RESOLUTIONS, MOTIONS, exportVideo, itemDuration, probe, loadEngine } from './engine.js';
import { kv, files as fileStore, characters as charStore, uid } from './store.js';
import { GENRES, STYLES, planFromIdea, assistantPrompt, importScript, productionPackage, emptyProduction } from './planner.js';
import * as yt from './youtube.js';
import { applyEditorCommand } from './commands.js';
import { checkTimeline, isBlocked } from './language.js';
import { notifyAll } from './notify.js';
import { initStudio } from './studio.js';

const VERSION = '2.0.0';
let studio = null;
const $ = (id) => document.getElementById(id);
const fmt = (s) => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const toast = (msg) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200); };
const setStatus = (el, msg, kind = '') => { el.textContent = msg; el.className = `status ${kind}`; };
const MAX_TOTAL_MB = 600;

// ────────────────────────── Estado del proyecto ──────────────────────────
const state = {
  items: [],          // {id, kind, name, fileId, inS, outS, duration, dur, speed, title, subtitle, motion, keepAudio, hasAudio, thumb}
  settings: { aspect: '16:9', short: 720, fill: 'blur', quality: 'fast', clipVol: 1, musicVol: 0.35, narrVol: 1, narrDelay: 0, burnSubs: true },
  musicId: null, narrId: null,
  lastExport: null,
};
const blobs = new Map(); // fileId -> File/Blob en memoria
const urls = new Map();
const urlFor = (id) => { if (!urls.has(id) && blobs.has(id)) urls.set(id, URL.createObjectURL(blobs.get(id))); return urls.get(id); };

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => kv.set('project', { items: state.items, settings: state.settings, musicId: state.musicId, narrId: state.narrId }).catch(() => toast('No se pudo guardar el proyecto en este dispositivo.')), 400);
}
async function storeFile(file) {
  const id = uid();
  blobs.set(id, file);
  try { await fileStore.set(id, file); } catch { toast('Almacenamiento local lleno: el archivo se usará, pero no se recordará al recargar.'); }
  return id;
}
async function getFile(id) {
  if (!id) return null;
  if (blobs.has(id)) return blobs.get(id);
  const b = await fileStore.get(id).catch(() => null);
  if (b) blobs.set(id, b);
  return b;
}

// ────────────────────────── Pestañas ──────────────────────────
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== `tab-${name}`));
  if (name === 'youtube') refreshYoutube();
  if (name === 'produccion') renderCast();
  history.replaceState(null, '', `#${name}`);
  studio?.onShow(name);
  window.scrollTo(0, 0);
}

// ────────────────────────── Entrada de archivos ──────────────────────────
function thumbOf(file, kind) {
  return new Promise((resolve) => {
    if (kind === 'image') { const img = new Image(); img.onload = () => resolve(draw(img, img.naturalWidth, img.naturalHeight)); img.onerror = () => resolve(''); img.src = URL.createObjectURL(file); return; }
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
    v.onseeked = () => resolve(draw(v, v.videoWidth, v.videoHeight));
    v.onerror = () => resolve('');
    setTimeout(() => resolve(''), 6000);
  });
  function draw(src, w, h) {
    const c = document.createElement('canvas'); const s = 160 / Math.max(w, h || 1);
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    try { return c.toDataURL('image/jpeg', 0.7); } catch { return ''; }
  }
}
function mediaMeta(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata'; v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => resolve({ duration: Number.isFinite(v.duration) ? v.duration : null });
    v.onerror = () => resolve({ duration: null });
    setTimeout(() => resolve({ duration: null }), 6000);
  });
}

async function addFiles(list, extra = []) {
  const arr = [...list];
  const total = arr.reduce((n, f) => n + f.size, 0) / 1048576;
  if (total > MAX_TOTAL_MB) return setStatus($('addStatus'), `Demasiado grande (${total.toFixed(0)} MB). Usa menos de ${MAX_TOTAL_MB} MB a la vez.`, 'err');
  let added = 0;
  for (const [i, f] of arr.entries()) {
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip') { await importZip(f); continue; }
    const kind = f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(f.name) ? 'video' : null;
    if (!kind) { toast(`${f.name}: tipo no admitido`); continue; }
    setStatus($('addStatus'), `Leyendo ${f.name}…`);
    const fileId = await storeFile(f);
    let meta = kind === 'video' ? await mediaMeta(f) : { duration: null };
    let hasAudio = kind === 'video' ? null : false;
    if (kind === 'video' && !meta.duration) {
      // El reproductor del navegador no lo reconoce (p. ej. HEVC/MOV): se analiza con FFmpeg.wasm.
      try {
        setStatus($('addStatus'), `Analizando ${f.name} con el motor de video…`);
        await loadEngine((m) => setStatus($('addStatus'), m));
        const p = await probe(f);
        if (!p.hasVideo || !p.duration) { toast(`${f.name}: no contiene video legible.`); blobs.delete(fileId); continue; }
        meta = { duration: p.duration }; hasAudio = p.hasAudio;
      } catch { toast(`${f.name}: no se pudo leer. Prueba con MP4 (H.264).`); continue; }
    }
    const ex = extra[i] || {};
    state.items.push({
      id: uid(), kind, name: f.name, fileId, thumb: await thumbOf(f, kind),
      duration: meta.duration ?? (ex.seconds || 5), inS: 0, outS: meta.duration ?? (ex.seconds || 5), dur: 4, speed: 1,
      title: ex.title || '', subtitle: ex.subtitle || '', motion: kind === 'image' ? 'zoom-in' : 'none', keepAudio: true, hasAudio,
    });
    added++;
  }
  setStatus($('addStatus'), added ? `${added} elemento(s) agregado(s).` : '', 'ok');
  renderTimeline(); persist();
}

async function importZip(file) {
  setStatus($('addStatus'), `Abriendo ${file.name}…`);
  let entries;
  try { entries = unzipSync(new Uint8Array(await file.arrayBuffer())); } catch { return setStatus($('addStatus'), 'El .zip está dañado o no es válido.', 'err'); }
  const names = Object.keys(entries).filter((n) => !n.startsWith('__MACOSX'));
  const manifestName = names.find((n) => /(^|\/)manifest\.json$/i.test(n));
  let manifest = null;
  if (manifestName) { try { manifest = JSON.parse(strFromU8(entries[manifestName])); } catch { toast('manifest.json ilegible; se importan los videos en orden alfabético.'); } }
  const base = manifestName ? manifestName.replace(/manifest\.json$/i, '') : '';
  const clips = manifest?.clips?.length ? manifest.clips : names.filter((n) => /\.(mp4|webm)$/i.test(n) && !/narration|final/i.test(n)).sort().map((n) => ({ file: n.slice(base.length) }));
  const vids = []; const extra = [];
  for (const c of clips) {
    const data = entries[base + c.file] || entries[c.file];
    if (!data) continue;
    vids.push(new File([data], c.file.split('/').pop(), { type: 'video/mp4' }));
    extra.push({ title: c.title || '', subtitle: c.subtitle || c.narration || '', seconds: c.seconds });
  }
  if (!vids.length) return setStatus($('addStatus'), 'El .zip no contiene clips MP4.', 'err');
  await addFiles(vids, extra);
  const narrName = manifest?.narration && (entries[base + manifest.narration] ? base + manifest.narration : manifest.narration);
  if (narrName && entries[narrName]) {
    const nf = new File([entries[narrName]], 'narracion.wav', { type: 'audio/wav' });
    await setNarration(nf);
    toast('Narración del notebook agregada.');
  }
  setStatus($('addStatus'), `Importados ${vids.length} clips IA${manifest?.generator ? ` (${manifest.generator})` : ''}.`, 'ok');
}

const drop = $('drop');
$('addFiles').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => e.dataTransfer?.files?.length && addFiles(e.dataTransfer.files));

// ────────────────────────── Línea de tiempo ──────────────────────────
function totalDuration() { return state.items.reduce((s, it) => s + itemDuration(it), 0); }
function renderTimeline() {
  const ol = $('timeline');
  ol.innerHTML = '';
  $('emptyTl').hidden = state.items.length > 0;
  $('totalDur').textContent = fmt(totalDuration());
  state.items.forEach((it, idx) => {
    const li = document.createElement('li');
    li.className = 'ti'; li.dataset.id = it.id;
    const d = itemDuration(it);
    li.innerHTML = `
      <span class="handle" aria-label="Arrastrar para reordenar" title="Arrastrar">☰</span>
      ${it.thumb ? `<img class="thumb" src="${it.thumb}" alt="">` : '<div class="thumb"></div>'}
      <div class="meta"><b>${idx + 1}. ${esc(it.name)}</b><small>${it.kind === 'image' ? '🖼 Imagen' : '🎞 Video'} · ${fmt(d)}${it.title ? ' · T' : ''}${it.subtitle ? ' · CC' : ''}</small></div>
      <div class="acts"><button data-act="up" aria-label="Subir">↑</button><button data-act="down" aria-label="Bajar">↓</button><button data-act="dup" aria-label="Duplicar">⧉</button><button data-act="del" aria-label="Eliminar">✕</button></div>
      <details><summary>Editar</summary><div class="ed"></div></details>`;
    li.querySelector('.acts').addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act; if (!act) return;
      const i = state.items.findIndex((x) => x.id === it.id);
      if (act === 'up' && i > 0) [state.items[i - 1], state.items[i]] = [state.items[i], state.items[i - 1]];
      if (act === 'down' && i < state.items.length - 1) [state.items[i + 1], state.items[i]] = [state.items[i], state.items[i + 1]];
      if (act === 'dup') state.items.splice(i + 1, 0, { ...structuredClone(it), id: uid() });
      if (act === 'del') state.items.splice(i, 1);
      renderTimeline(); persist();
    });
    li.querySelector('details').addEventListener('toggle', (e) => { if (e.target.open) renderEditor(li.querySelector('.ed'), it, li); });
    setupDrag(li, li.querySelector('.handle'));
    ol.appendChild(li);
  });
}

function renderEditor(box, it, li) {
  const isVid = it.kind === 'video';
  box.innerHTML = `
    ${isVid ? `<video src="${urlFor(it.fileId) || ''}" controls playsinline preload="metadata"></video>
      <div class="row"><label>Inicio (s)<input data-k="inS" type="number" step="0.1" min="0" value="${(+it.inS).toFixed(1)}"></label>
      <label>Fin (s)<input data-k="outS" type="number" step="0.1" min="0.2" value="${(+it.outS).toFixed(1)}"></label>
      <button type="button" data-set="in" class="secondary small">Inicio = aquí</button><button type="button" data-set="out" class="secondary small">Fin = aquí</button></div>
      <div class="row"><label>Velocidad<select data-k="speed">${[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => `<option ${v === it.speed ? 'selected' : ''} value="${v}">${v}x</option>`).join('')}</select></label>
      <label class="check"><input data-k="keepAudio" type="checkbox" ${it.keepAudio ? 'checked' : ''}> Conservar audio del clip</label></div>`
    : `<div class="row"><label>Duración (s)<input data-k="dur" type="number" step="0.5" min="0.5" max="60" value="${it.dur}"></label>
      <label>Movimiento<select data-k="motion">${Object.entries(MOTIONS).map(([k, v]) => `<option value="${k}" ${k === it.motion ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>`}
    <label>Título sobre el video<input data-k="title" maxlength="90" value="${esc(it.title)}"></label>
    <label>Subtítulo<textarea data-k="subtitle" rows="2" maxlength="300">${esc(it.subtitle)}</textarea></label>`;
  const video = box.querySelector('video');
  if (isVid && !blobs.has(it.fileId)) getFile(it.fileId).then(() => { if (video) video.src = urlFor(it.fileId) || ''; });
  box.addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (['inS', 'outS', 'dur', 'speed'].includes(k)) v = Number(v);
    if (k === 'inS') v = Math.max(0, Math.min(v, (it.outS || it.duration) - 0.2));
    if (k === 'outS') v = Math.max((it.inS || 0) + 0.2, Math.min(v, it.duration || v));
    it[k] = v;
    li.querySelector('.meta small').textContent = `${isVid ? '🎞 Video' : '🖼 Imagen'} · ${fmt(itemDuration(it))}${it.title ? ' · T' : ''}${it.subtitle ? ' · CC' : ''}`;
    $('totalDur').textContent = fmt(totalDuration());
    persist();
  });
  box.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
    const t = video?.currentTime || 0;
    if (b.dataset.set === 'in') it.inS = Math.min(t, it.outS - 0.2); else it.outS = Math.max(t, it.inS + 0.2);
    box.querySelector('[data-k=inS]').value = it.inS.toFixed(1); box.querySelector('[data-k=outS]').value = it.outS.toFixed(1);
    $('totalDur').textContent = fmt(totalDuration()); persist();
  }));
}

// Reordenar arrastrando (ratón y táctil) con Pointer Events
function setupDrag(li, handle) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    li.classList.add('dragging');
    let target = null;
    const move = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.ti');
      document.querySelectorAll('.ti.over').forEach((x) => x.classList.remove('over'));
      if (el && el !== li) { el.classList.add('over'); target = el; } else target = null;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      li.classList.remove('dragging'); document.querySelectorAll('.ti.over').forEach((x) => x.classList.remove('over'));
      if (target) {
        const from = state.items.findIndex((x) => x.id === li.dataset.id);
        const to = state.items.findIndex((x) => x.id === target.dataset.id);
        const [m] = state.items.splice(from, 1); state.items.splice(to, 0, m);
        renderTimeline(); persist();
      }
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  });
}

// ────────────────────────── Ajustes y audio ──────────────────────────
for (const [k, v] of Object.entries(ASPECTS)) $('aspect').add(new Option(v.label, k));
for (const [k, v] of Object.entries(RESOLUTIONS)) $('res').add(new Option(v, k));
function bindSetting(id, key, conv = (x) => x, out) {
  const el = $(id);
  el.addEventListener('input', () => {
    state.settings[key] = conv(el.type === 'checkbox' ? el.checked : el.value);
    if (out) $(out).textContent = `${Math.round(state.settings[key] * 100)}%`;
    persist();
  });
}
bindSetting('aspect', 'aspect'); bindSetting('res', 'short', Number); bindSetting('fill', 'fill'); bindSetting('quality', 'quality');
bindSetting('clipVol', 'clipVol', Number, 'clipVolOut'); bindSetting('musicVol', 'musicVol', Number, 'musicVolOut'); bindSetting('narrVol', 'narrVol', Number, 'narrVolOut');
bindSetting('narrDelay', 'narrDelay', Number); bindSetting('burnSubs', 'burnSubs');
function applySettingsToUI() {
  const s = state.settings;
  $('aspect').value = s.aspect; $('res').value = String(s.short); $('fill').value = s.fill; $('quality').value = s.quality;
  $('clipVol').value = s.clipVol; $('clipVolOut').textContent = `${Math.round(s.clipVol * 100)}%`;
  $('musicVol').value = s.musicVol; $('musicVolOut').textContent = `${Math.round(s.musicVol * 100)}%`;
  $('narrVol').value = s.narrVol; $('narrVolOut').textContent = `${Math.round(s.narrVol * 100)}%`;
  $('narrDelay').value = s.narrDelay; $('burnSubs').checked = s.burnSubs;
}

$('music').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  state.musicId = await storeFile(f); $('musicName').textContent = `🎵 ${f.name}`; $('musicClear').hidden = false; persist();
});
$('musicClear').addEventListener('click', () => { state.musicId = null; $('music').value = ''; $('musicName').textContent = 'Sin música'; $('musicClear').hidden = true; persist(); });

async function setNarration(file) {
  state.narrId = await storeFile(file);
  $('narrPreview').src = URL.createObjectURL(file); $('narrPreview').hidden = false; $('narrClear').hidden = false;
  $('narrStatus').textContent = `🎙️ ${file.name}`; persist();
}
$('narrFile').addEventListener('change', (e) => e.target.files[0] && setNarration(e.target.files[0]));
$('narrClear').addEventListener('click', () => { state.narrId = null; $('narrPreview').hidden = true; $('narrClear').hidden = true; $('narrStatus').textContent = 'Sin narración.'; persist(); });
let recorder = null;
$('recBtn').addEventListener('click', async () => {
  if (recorder?.state === 'recording') { recorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este navegador no permite grabar audio.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const mt = recorder.mimeType || 'audio/webm';
      setNarration(new File(chunks, `narracion.${mt.includes('mp4') ? 'm4a' : 'webm'}`, { type: mt }));
      $('recBtn').textContent = '● Grabar con el micrófono';
    };
    recorder.start();
    $('recBtn').textContent = '■ Detener grabación';
    $('narrStatus').textContent = 'Grabando… habla cerca del micrófono.';
  } catch { toast('Permiso de micrófono denegado.'); }
});

// ────────────────────────── Exportación ──────────────────────────
let abortCtl = null;
$('exportBtn').addEventListener('click', async () => {
  if (!state.items.length) return setStatus($('exportStatus'), 'Agrega al menos un video o una imagen.', 'err');
  const btn = $('exportBtn'); btn.disabled = true; $('cancelBtn').hidden = false;
  $('progress').hidden = false; $('progress').value = 0; $('result').hidden = true;
  abortCtl = new AbortController();
  const t0 = performance.now();
  try {
    await loadEngine((m) => setStatus($('exportStatus'), m));
    const items = [];
    for (const it of state.items) {
      const file = await getFile(it.fileId);
      if (!file) throw new Error(`Falta el archivo de "${it.name}". Vuelve a agregarlo.`);
      if (it.kind === 'video' && it.hasAudio === null) {
        setStatus($('exportStatus'), `Analizando ${it.name}…`);
        const p = await probe(file);
        it.hasAudio = p.hasAudio;
        if (p.duration && !it.duration) { it.duration = p.duration; it.outS = p.duration; }
      }
      items.push({ ...it, file });
    }
    const s = state.settings;
    const bad = checkTimeline(state.items);
    if (isBlocked(bad, s.allowStrong)) throw new Error(`Lenguaje no permitido (${bad.map((b) => `${b.where}: «${b.word}»`).join('; ')}). Corrígelo; el lenguaje limpio está activo por defecto.`);
    let watermark = null;
    if (s.watermark) { const img = new Image(); img.src = './brand/idc-marca-agua-150.png'; await img.decode().then(() => (watermark = img)).catch(() => toast('No se pudo cargar la marca de agua.')); }
    const res = await exportVideo({ watermark,
      items, aspect: s.aspect, short: s.short, fill: s.fill, quality: s.quality, clipVol: s.clipVol, burnSubtitles: s.burnSubs,
      music: await getFile(state.musicId), musicVol: s.musicVol,
      narration: await getFile(state.narrId), narrationVol: s.narrVol, narrationDelay: s.narrDelay,
      onProgress: (p) => { $('progress').value = p; },
      onStatus: (m) => setStatus($('exportStatus'), m),
      signal: abortCtl.signal,
    });
    if (state.lastExport?.url) URL.revokeObjectURL(state.lastExport.url);
    const url = URL.createObjectURL(res.blob);
    state.lastExport = { ...res, url, name: `yoha-video-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.mp4` };
    $('preview').src = url; $('dlMp4').href = url; $('dlMp4').download = state.lastExport.name;
    if (res.srt) { const su = URL.createObjectURL(new Blob([res.srt], { type: 'application/x-subrip' })); $('dlSrt').href = su; $('dlSrt').hidden = false; } else $('dlSrt').hidden = true;
    $('shareBtn').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([res.blob], 'v.mp4', { type: 'video/mp4' })] }));
    $('resultInfo').textContent = `${res.width}×${res.height} · ${fmt(res.duration)} · ${(res.blob.size / 1048576).toFixed(1)} MB · listo en ${Math.round((performance.now() - t0) / 1000)} s`;
    $('result').hidden = false;
    setStatus($('exportStatus'), '¡Video MP4 generado! Revísalo y descárgalo.', 'ok');
    persist();
    notifyAll('ready', `${fmt(res.duration)} · ${res.width}×${res.height}`).catch(() => {});
  } catch (e) {
    console.error(e);
    const msg = e?.name === 'AbortError' ? 'Exportación cancelada.' : /memory|OOM|Aborted\(\)/i.test(String(e?.message)) ? 'El dispositivo se quedó sin memoria. Usa una calidad menor o clips más cortos.' : `No se pudo generar el video: ${e?.message || e}`;
    setStatus($('exportStatus'), msg, 'err');
    if (e?.name !== 'AbortError') notifyAll('error', msg.slice(0, 140)).catch(() => {}); else notifyAll('stopped').catch(() => {});
  } finally {
    btn.disabled = false; $('cancelBtn').hidden = true; abortCtl = null;
  }
});
$('cancelBtn').addEventListener('click', () => abortCtl?.abort());
$('shareBtn').addEventListener('click', async () => {
  const e = state.lastExport; if (!e) return;
  try { await navigator.share({ files: [new File([e.blob], e.name, { type: 'video/mp4' })], title: 'YOHA VIDEO' }); } catch { /* cancelado */ }
});
$('toReview').addEventListener('click', () => studio.sendToReview(state.lastExport));
$('watermark').addEventListener('change', (e) => { state.settings.watermark = e.target.checked; persist(); });
async function addBrandClip(file, name) {
  try { const r = await fetch(`./brand/${file}`); if (!r.ok) throw new Error(); await addFiles([new File([await r.blob()], name, { type: 'video/mp4' })]); }
  catch { toast('No se pudo cargar el clip de marca.'); }
}
$('addIntro').addEventListener('click', async () => { await addBrandClip('idc-intro-5s-1080p.mp4', 'Intro IDC.mp4'); const it = state.items.pop(); if (it) { state.items.unshift(it); renderTimeline(); persist(); } });
$('addOutro').addEventListener('click', () => addBrandClip('idc-cierre-20s-1080p.mp4', 'Cierre IDC.mp4'));
function runEdCmd() {
  const r = applyEditorCommand(state, $('edCmd').value);
  if (r.understood) { setStatus($('edCmdStatus'), '✔ ' + r.applied.join(' · '), 'ok'); $('edCmd').value = ''; applySettingsToUI(); renderTimeline(); persist(); }
  else setStatus($('edCmdStatus'), 'No entendí la orden. Ejemplos: «haz el video más corto», «formato vertical», «título: Capítulo 1», «baja la música», «cámara lenta en el clip 2».', 'err');
}
$('edCmdBtn').addEventListener('click', runEdCmd);
$('edCmd').addEventListener('keydown', (e) => e.key === 'Enter' && runEdCmd());

// ────────────────────────── Personajes ──────────────────────────
let photoDraft = [];
async function renderChars() {
  const list = await charStore.all().catch(() => []);
  const box = $('charList');
  box.innerHTML = list.length ? '' : '<p class="empty">Todavía no hay personajes.</p>';
  for (const c of list.sort((a, b) => a.name.localeCompare(b.name))) {
    const el = document.createElement('div'); el.className = 'char';
    el.innerHTML = `${c.photos[0] ? `<img src="${c.photos[0].dataUrl}" alt="">` : '<img alt="">'}<div class="meta"><b>${esc(c.name)}</b><small>${esc(c.role || '')} · voz ${esc(c.voice)} · semilla ${c.seed}</small><small>${esc(c.appearance)}</small></div>
      <button class="small secondary" data-a="edit">Editar</button><button class="small danger" data-a="del">✕</button>`;
    el.addEventListener('click', async (e) => {
      const a = e.target.dataset.a;
      if (a === 'del' && confirm(`¿Eliminar a ${c.name} y sus fotos de este dispositivo?`)) { await charStore.del(c.id); renderChars(); }
      if (a === 'edit') fillCharForm(c);
    });
    box.appendChild(el);
  }
  return list;
}
function fillCharForm(c) {
  $('cId').value = c?.id || ''; $('cName').value = c?.name || ''; $('cRole').value = c?.role || ''; $('cLook').value = c?.appearance || '';
  $('cWardrobe').value = c?.wardrobe || ''; $('cVoice').value = c?.voice || 'ef_dora'; $('cSeed').value = c?.seed ?? Math.floor(Math.random() * 1e9);
  $('cPersonality').value = c?.personality || ''; $('cHistory').value = c?.history || ''; $('cEmotion').value = c?.emotions || 'neutral'; $('cVoiceEn').value = c?.voiceEn || 'af_heart';
  $('cRelations').value = (c?.relations || []).map((r) => `${r.name || r.with} — ${r.type}`).join('\n');
  $('cConsent').checked = Boolean(c?.consent?.given); $('cConsentBy').value = c?.consent?.by || '';
  photoDraft = c?.photos ? [...c.photos] : []; renderPhotoDraft();
}
function renderPhotoDraft() {
  const box = $('cPhotoList'); box.innerHTML = '';
  photoDraft.forEach((p, i) => {
    const fig = document.createElement('figure');
    fig.innerHTML = `<img src="${p.dataUrl}" alt=""><button type="button" aria-label="Quitar">✕</button>`;
    fig.querySelector('button').onclick = () => { photoDraft.splice(i, 1); renderPhotoDraft(); };
    box.appendChild(fig);
  });
}
const shrink = (file) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => { const s = Math.min(1, 768 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.88)); };
  img.onerror = () => rej(new Error('Imagen ilegible')); img.src = URL.createObjectURL(file);
});
$('cPhotos').addEventListener('change', async (e) => {
  for (const f of [...e.target.files].slice(0, 6 - photoDraft.length)) photoDraft.push({ name: f.name, dataUrl: await shrink(f) });
  e.target.value = ''; renderPhotoDraft();
});
$('cReset').addEventListener('click', () => fillCharForm(null));
$('charForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (photoDraft.length && (!$('cConsent').checked || !$('cConsentBy').value.trim())) return setStatus($('cStatus'), 'Para usar fotos debes confirmar la autorización e indicar quién la da.', 'err');
  const c = {
    id: $('cId').value || uid(), name: $('cName').value.trim(), role: $('cRole').value.trim(), appearance: $('cLook').value.trim(), wardrobe: $('cWardrobe').value.trim(),
    voice: $('cVoice').value, voiceEn: $('cVoiceEn').value, seed: Number($('cSeed').value) || Math.floor(Math.random() * 1e9), photos: photoDraft,
    personality: $('cPersonality').value.trim(), history: $('cHistory').value.trim(), emotions: $('cEmotion').value,
    relations: $('cRelations').value.split('\n').map((l) => /^(.+?)\s*[—–-]\s*(.+)$/.exec(l.trim())).filter(Boolean).map((m) => ({ name: m[1].trim(), type: m[2].trim() })),
    episodes: (await charStore.all().catch(() => [])).find((x) => x.id === $('cId').value)?.episodes || [],
    consent: photoDraft.length ? { given: true, by: $('cConsentBy').value.trim(), at: new Date().toISOString() } : null, updatedAt: new Date().toISOString(),
  };
  try { await charStore.put(c); setStatus($('cStatus'), `Personaje "${c.name}" guardado en este dispositivo.`, 'ok'); fillCharForm(null); renderChars(); }
  catch { setStatus($('cStatus'), 'No se pudo guardar (almacenamiento lleno).', 'err'); }
});

// ────────────────────────── Producción ──────────────────────────
let prod = emptyProduction();
for (const [k, v] of Object.entries(GENRES)) $('pGenre').add(new Option(v.label, k));
for (const k of Object.keys(STYLES)) $('pStyle').add(new Option(k.replace(/(\d)/, ' $1').replace(/^./, (c) => c.toUpperCase()), k));
async function renderCast() {
  const list = await charStore.all().catch(() => []);
  $('pCast').innerHTML = list.length ? list.map((c) => `<label><input type="checkbox" value="${c.id}" ${prod.characters.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('') : '<span class="muted small">Sin personajes.</span>';
  return list;
}
function readProdForm() {
  prod.idea = $('pIdea').value.trim(); prod.genre = $('pGenre').value; prod.style = $('pStyle').value; prod.aspect = $('pAspect').value;
  prod.targetSeconds = Number($('pSeconds').value) || 60;
  prod.characters = [...$('pCast').querySelectorAll('input:checked')].map((i) => i.value);
}
$('pGenre').addEventListener('change', () => { $('pScenes').value = GENRES[$('pGenre').value].beats.length; });
$('pPlan').addEventListener('click', async () => {
  readProdForm();
  if (!prod.idea) return setStatus($('pStatus'), 'Escribe tu idea primero.', 'err');
  const chars = (await charStore.all()).filter((c) => prod.characters.includes(c.id));
  prod = planFromIdea({ ...prod, sceneCount: Number($('pScenes').value), characters: chars });
  setStatus($('pStatus'), `Estructura creada: ${prod.scenes.length} escenas. Edítalas abajo.`, 'ok');
  renderScenes(); saveProd();
});
$('pCopyPrompt').addEventListener('click', async () => {
  readProdForm();
  if (!prod.idea) return setStatus($('pStatus'), 'Escribe tu idea primero.', 'err');
  const text = assistantPrompt(prod, await charStore.all());
  try { await navigator.clipboard.writeText(text); setStatus($('pStatus'), 'Instrucción copiada. Pégala en tu asistente IA gratuito (o YOHA AI) y luego pega aquí su respuesta.', 'ok'); }
  catch { $('pPaste').hidden = false; $('pPaste').value = text; setStatus($('pStatus'), 'Copia el texto del cuadro manualmente.'); }
});
$('pPasteBtn').addEventListener('click', () => { $('pPaste').hidden = false; $('pImport').hidden = false; $('pPaste').value = ''; $('pPaste').focus(); });
$('pImport').addEventListener('click', () => {
  readProdForm();
  try { prod = importScript($('pPaste').value, prod); setStatus($('pStatus'), `Guion importado: ${prod.scenes.length} escenas.`, 'ok'); renderScenes(); saveProd(); $('pPaste').hidden = true; $('pImport').hidden = true; }
  catch (e) { setStatus($('pStatus'), `No se pudo importar: ${e.message}`, 'err'); }
});
async function renderScenes() {
  const chars = await charStore.all().catch(() => []);
  const castChars = chars.filter((c) => prod.characters.includes(c.id));
  const box = $('pSceneList'); box.innerHTML = '';
  $('pExportCard').hidden = !prod.scenes.length;
  prod.scenes.forEach((s, i) => {
    const el = document.createElement('div'); el.className = 'scene';
    el.innerHTML = `<h3><span>Escena ${i + 1}</span><span class="pill">${s.seconds} s</span></h3>
      <label>Título<input data-k="title" value="${esc(s.title)}"></label>
      <label>Qué se ve (descripción visual)<textarea data-k="description" rows="2">${esc(s.description)}</textarea></label>
      <div class="row wrap"><label>Cámara<input data-k="camera" value="${esc(s.camera)}"></label><label>Segundos<input data-k="seconds" type="number" min="2" max="10" value="${s.seconds}"></label><label>Semilla<input data-k="seed" type="number" value="${s.seed}"></label></div>
      <div class="chips">${castChars.map((c) => `<label><input type="checkbox" data-cast="${c.id}" ${s.characters.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div>
      <label>Narración / voz en off<textarea data-k="narration" rows="2">${esc(s.narration)}</textarea></label>
      <label>Diálogos (una línea por intervención: Nombre: texto)<textarea data-k="dialogue" rows="2">${esc(s.dialogue.map((d) => `${chars.find((c) => c.id === d.character)?.name || d.character}: ${d.text}`).join('\n'))}</textarea></label>
      <div class="row"><button class="small ghost" data-a="up">↑</button><button class="small ghost" data-a="down">↓</button><button class="small danger" data-a="del">Eliminar escena</button></div>`;
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (e.target.dataset.cast) { const id = e.target.dataset.cast; s.characters = e.target.checked ? [...new Set([...s.characters, id])] : s.characters.filter((x) => x !== id); }
      else if (k === 'dialogue') s.dialogue = e.target.value.split('\n').map((l) => { const m = /^([^:]+):\s*(.+)$/.exec(l.trim()); if (!m) return null; const c = chars.find((x) => x.name.toLowerCase() === m[1].trim().toLowerCase()); return { character: c?.id || m[1].trim(), text: m[2] }; }).filter(Boolean);
      else if (k) s[k] = ['seconds', 'seed'].includes(k) ? Number(e.target.value) : e.target.value;
      saveProd();
    });
    el.addEventListener('click', (e) => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'up' && i > 0) [prod.scenes[i - 1], prod.scenes[i]] = [prod.scenes[i], prod.scenes[i - 1]];
      if (a === 'down' && i < prod.scenes.length - 1) [prod.scenes[i + 1], prod.scenes[i]] = [prod.scenes[i], prod.scenes[i + 1]];
      if (a === 'del') prod.scenes.splice(i, 1);
      renderScenes(); saveProd();
    });
    box.appendChild(el);
  });
}
const saveProd = () => kv.set('production', prod).catch(() => {});
const download = (name, data, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
$('pDownload').addEventListener('click', async () => {
  readProdForm();
  const chars = await charStore.all();
  const pkg = productionPackage(prod, chars, { includePhotos: $('pPhotos').checked });
  download('yoha-produccion.json', JSON.stringify(pkg, null, 2), 'application/json');
});
$('pScriptTxt').addEventListener('click', async () => {
  const chars = await charStore.all();
  const name = (id) => chars.find((c) => c.id === id)?.name || id;
  const txt = [`${prod.idea}\n`, ...prod.scenes.map((s, i) => `ESCENA ${i + 1} — ${s.title} (${s.seconds}s)\n${s.description}\nCámara: ${s.camera}\n${s.narration ? `NARRACIÓN: ${s.narration}\n` : ''}${s.dialogue.map((d) => `${name(d.character).toUpperCase()}: ${d.text}`).join('\n')}\n`)].join('\n');
  download('yoha-guion.txt', txt, 'text/plain;charset=utf-8');
});

// ────────────────────────── Clips IA ──────────────────────────
$('iaZip').addEventListener('change', async (e) => {
  const fl = [...e.target.files]; e.target.value = '';
  showTab('editor');
  await addFiles(fl);
  setStatus($('iaStatus'), 'Clips importados al Editor.', 'ok');
});

// ────────────────────────── YouTube ──────────────────────────
$('originHint').textContent = location.origin;
$('ytClientId').value = yt.getClientId();
$('ytSaveId').addEventListener('click', () => { yt.setClientId($('ytClientId').value); setStatus($('ytStatus'), 'Client ID guardado en este dispositivo.', 'ok'); refreshYoutube(); });
$('ytConnect').addEventListener('click', async () => {
  try { const ch = await yt.connectChannel({ analytics: $('ytAnalytics')?.checked }); setStatus($('ytStatus'), `Canal conectado: ${ch.snippet.title}`, 'ok'); refreshYoutube(); }
  catch (e) { setStatus($('ytStatus'), e.message, 'err'); }
});
function refreshYoutube() {
  const list = yt.savedChannels();
  $('ytChannels').innerHTML = list.length ? '' : '<p class="muted small">Sin canales conectados.</p>';
  const sel = $('ytChannel'); const prev = sel.value; sel.innerHTML = '';
  for (const c of list) {
    const on = yt.isConnected(c.id);
    const el = document.createElement('div'); el.className = 'char';
    el.innerHTML = `${c.thumb ? `<img src="${esc(c.thumb)}" alt="">` : '<img alt="">'}<div class="meta"><b>${esc(c.title)}</b><small>${on ? '<span class="tag ok">Conectado</span>' : '<span class="tag warn">Requiere reconectar</span>'}</small></div>
      <button class="small secondary" data-a="re">Reconectar</button><button class="small danger" data-a="rm">Quitar</button>`;
    el.addEventListener('click', async (e) => {
      if (e.target.dataset.a === 're') $('ytConnect').click();
      if (e.target.dataset.a === 'rm') { await yt.revoke(c.id); refreshYoutube(); }
    });
    $('ytChannels').appendChild(el);
    sel.add(new Option(`${c.title}${on ? '' : ' (reconectar)'}`, c.id));
  }
  if (prev) sel.value = prev;
  const ctx = studio?.publishContext;
  $('ytVideoState').innerHTML = ctx ? `Video aprobado: <b>${esc(ctx.title)}</b> · ${(ctx.blob.size / 1048576).toFixed(1)} MB · aprobado el ${new Date(ctx.approval.at).toLocaleString()}` : 'No hay un video aprobado seleccionado. Ve a «Pendientes de aprobación».';
  updateUploadBtn();
}
function ytMeta() {
  const kids = document.querySelector('input[name=ytKids]:checked')?.value;
  return { title: $('ytTitle').value, description: $('ytDesc').value, tags: $('ytTags').value, privacyStatus: $('ytPrivacy').value, publishAt: $('ytPublishAt').value || null, madeForKids: kids === undefined ? null : kids === 'yes', synthetic: $('ytSynthetic').checked };
}
function updateUploadBtn() {
  $('ytUpload').disabled = !(studio?.publishContext && $('ytChannel').value && $('ytConfirm').checked);
}
['ytConfirm', 'ytChannel'].forEach((id) => $(id).addEventListener('change', updateUploadBtn));
$('ytPublishAt').addEventListener('change', () => { if ($('ytPublishAt').value) $('ytPrivacy').value = 'private'; });
$('ytUpload').addEventListener('click', async () => {
  const meta = ytMeta();
  const errs = yt.validateMeta(meta);
  if (errs.length) return setStatus($('ytUpStatus'), errs.join(' '), 'err');
  if (!confirm(`¿Publicar "${meta.title}" en ${$('ytChannel').selectedOptions[0]?.text} como ${meta.privacyStatus}${meta.publishAt ? `, programado para ${new Date(meta.publishAt).toLocaleString()}` : ''}?`)) return;
  $('ytUpload').disabled = true; $('ytProgress').hidden = false;
  try {
    const ctx = studio.publishContext;
    if (!ctx) throw new Error('Abre la publicación desde «Pendientes de aprobación».');
    const r = await yt.uploadVideo({ channelId: $('ytChannel').value, blob: ctx.blob, meta, confirmed: $('ytConfirm').checked, approval: ctx.approval, videoHash: ctx.hash, publishedHashes: await studio.publishedHashes(), onProgress: (p) => ($('ytProgress').value = p) });
    await studio.recordPublished(ctx, r, $('ytChannel').value, meta);
    $('ytUpStatus').innerHTML = `<span class="ok">Subido ✔</span> <a href="https://youtu.be/${esc(r.id)}" target="_blank" rel="noopener">youtu.be/${esc(r.id)}</a> · estado: ${esc(r.status?.privacyStatus)}`;
    $('ytConfirm').checked = false;
  } catch (e) { setStatus($('ytUpStatus'), e.message, 'err'); }
  finally { updateUploadBtn(); }
});

// ────────────────────────── Ayuda / estado ──────────────────────────
const CAPS = [
  ['Editor: unir, reordenar, recortar, velocidad, títulos, subtítulos, música, narración, formatos, MP4', 'ok', 'Probado en navegador (FFmpeg.wasm)'],
  ['Intro, cierre y marca de agua IDC', 'ok', 'Diseño original incluido'],
  ['Director IA: una instrucción → producción estructurada', 'ok', 'Reglas en el navegador; guion completo con Qwen2.5-7B en el notebook'],
  ['Editor por conversación (producción y editor)', 'ok', 'Reglas en español; marca solo escenas modificadas'],
  ['Personajes con memoria, biblia de series, capítulos y continuidad', 'ok', 'Guardado en el dispositivo'],
  ['Lenguaje limpio por defecto', 'ok', 'Autorización solo por producción'],
  ['Aprobación obligatoria y bloqueo de duplicados', 'ok', 'Huella SHA-256 del archivo aprobado'],
  ['Guardado automático, versiones y respaldo', 'ok', 'IndexedDB + archivo de respaldo'],
  ['Generación de video, voces ES/EN y subtítulos con IA', 'warn', 'Notebook Kaggle/Colab con GPU gratuita — no verificado en GPU'],
  ['Labios sincronizados (LatentSync)', 'warn', 'Experimental en el notebook — no verificado'],
  ['YouTube: conectar, publicar, miniatura, estadísticas', 'warn', 'Requiere tu Client ID de Google — no verificado contra YouTube'],
  ['Radar Viral, Protección, Revenue', 'warn', 'API oficial con tu canal conectado — lógica probada con datos de ejemplo'],
  ['Yoha Bank y simulador', 'ok', 'Informativo; datos reales solo con permisos'],
  ['Notificaciones al iPhone', 'warn', 'App instalada (iOS 16.4+) y ntfy gratis — no verificado en iPhone real'],
  ['Producción automática con la app cerrada', 'no', 'Necesita un worker; la GPU gratuita requiere iniciar el notebook a mano'],
  ['Conexión directa con YOHA AI', 'no', 'Sin acceso a su código; puente por JSON de guion'],
  ['4K nativo', 'no', 'Solo escalado en el notebook'],
];
$('capTable').innerHTML = `<table class="tbl">${CAPS.map(([a, s, n]) => `<tr><td>${a}</td><td><span class="tag ${s}">${s === 'ok' ? 'Funciona' : s === 'warn' ? 'Con requisitos' : 'Pendiente'}</span></td><td class="muted">${n}</td></tr>`).join('')}</table>`;
$('ver').textContent = VERSION;

// ────────────────────────── Instalación PWA ──────────────────────────
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('installBtn').hidden = false; });
$('installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installBtn').hidden = true; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e)));
}

// ────────────────────────── Arranque ──────────────────────────
(async function boot() {
  try {
    const saved = await kv.get('project');
    if (saved?.items) {
      state.items = saved.items; state.settings = { ...state.settings, ...saved.settings };
      state.musicId = saved.musicId; state.narrId = saved.narrId;
      if (state.musicId && await getFile(state.musicId)) { $('musicName').textContent = '🎵 Música guardada'; $('musicClear').hidden = false; } else state.musicId = null;
      const n = state.narrId && await getFile(state.narrId);
      if (n) { $('narrPreview').src = URL.createObjectURL(n); $('narrPreview').hidden = false; $('narrClear').hidden = false; $('narrStatus').textContent = '🎙️ Narración guardada'; } else state.narrId = null;
      const ok = [];
      for (const it of state.items) if (await getFile(it.fileId)) ok.push(it);
      state.items = ok;
    }
    const p = await kv.get('production');
    if (p?.scenes) { prod = p; $('pIdea').value = p.idea; $('pGenre').value = p.genre; $('pStyle').value = p.style; $('pAspect').value = p.aspect; $('pSeconds').value = p.targetSeconds; renderScenes(); }
  } catch { /* primer uso o almacenamiento no disponible */ }
  applySettingsToUI(); renderTimeline(); renderChars(); fillCharForm(null);
  const tab = (location.hash || '').slice(1);
  studio = await initStudio({ showTab, addFiles, getFile, storeFile, toast, refreshYoutube, renderChars, editorState: state });
  showTab(['panel', 'director', 'obra', 'producciones', 'series', 'editor', 'personajes', 'radar', 'guardian', 'marketing', 'revenue', 'bank', 'calendario', 'aprobaciones', 'publicados', 'config', 'produccion', 'ia', 'youtube', 'ayuda'].includes(tab) ? tab : 'panel');
  $('watermark').checked = Boolean(state.settings.watermark);
  window.__yoha = { state, version: VERSION, studio }; // para pruebas automáticas
})();
