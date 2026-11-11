// PRODUCTORA IA — envía la producción a la GPU gratuita de Kaggle a través de un repositorio PRIVADO de GitHub
// (GitHub Actions lanza el notebook, reanuda sesiones y monta el video final). Costo US$0.
// El token de GitHub se guarda SOLO en este dispositivo (IndexedDB); nunca en el código ni en respaldos.
import { kv } from './store.js';

const API = 'https://api.github.com';
const KEY = 'productora';
export const DEFAULTS = { repo: 'Yohdelacru/Yoha-video-studio', branch: 'producciones', token: '' };
export const STATES = {
  en_cola: 'En cola', generando: 'Generando escenas en Kaggle', montando: 'Montando el video final',
  lista: 'Lista para revisar', error: 'Error', reintentar: 'Reintentando',
};
// Minutos de GPU MEDIDOS por plano de ~5 s en T4 (pruebas reales del 9–10 nov 2026, calidad Cine) y sesiones de 11 h.
export const MODELOS = {
  'wan2.2-5b': { nombre: 'Wan 2.2 (mejor imagen, rostros desde referencia)', min: 120 },
  'wan2.1-1.3b': { nombre: 'Wan 2.1 (más rápido, rostros menos estables)', min: 52 },
};
export const MIN_POR_PLANO = MODELOS['wan2.2-5b'].min;

export async function getConfig() { return { ...DEFAULTS, ...((await kv.get(KEY)) || {}) }; }
export async function setConfig(c) {
  const v = { repo: String(c.repo || DEFAULTS.repo).trim(), branch: DEFAULTS.branch, token: String(c.token || '').trim() };
  if (!/^[\w.-]+\/[\w.-]+$/.test(v.repo)) throw new Error('Repositorio inválido. Formato: usuario/repositorio.');
  await kv.set(KEY, v); return v;
}
export const isConfigured = (c) => Boolean(c?.token && c?.repo);

const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const enc = (path) => path.split('/').map(encodeURIComponent).join('/');

async function gh(cfg, path, { method = 'GET', body, accept = 'application/vnd.github+json', fetchImpl = fetch } = {}) {
  const r = await fetchImpl(`${API}/repos/${cfg.repo}${path}`, {
    method, cache: 'no-store',
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 404) return null;
  if (r.status === 401) throw new Error('GitHub rechazó el token (vencido o mal copiado).');
  if (r.status === 403) throw new Error('El token no tiene permiso «Contents: Read and write» sobre ese repositorio.');
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}.`);
  return r;
}

/** Comprueba token, acceso al repositorio privado y la rama de producciones. */
export async function testConnection(cfg, fetchImpl) {
  if (!isConfigured(cfg)) throw new Error('Falta el token de GitHub.');
  const repo = await gh(cfg, '', { fetchImpl });
  if (!repo) throw new Error(`No se encontró ${cfg.repo} o el token no tiene acceso a él.`);
  const info = await repo.json();
  if (info.permissions && !info.permissions.push) throw new Error('El token solo puede leer: dale «Contents: Read and write».');
  const br = await gh(cfg, `/branches/${enc(cfg.branch)}`, { fetchImpl });
  if (!br) throw new Error(`Falta la rama «${cfg.branch}» con la Productora en ${cfg.repo}.`);
  return { private: info.private, repo: info.full_name };
}

async function putFile(cfg, path, bytes, message, fetchImpl) {
  const cur = await gh(cfg, `/contents/${enc(path)}?ref=${enc(cfg.branch)}`, { fetchImpl });
  const sha = cur ? (await cur.json()).sha : undefined;
  await gh(cfg, `/contents/${enc(path)}`, { method: 'PUT', fetchImpl, body: { message, branch: cfg.branch, content: b64(bytes), ...(sha ? { sha } : {}) } });
}

const safeId = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);

/** Envía (o reenvía con cambios) la producción. La Productora solo regenera las escenas modificadas. */
export async function sendProduction(cfg, pkg, { ntfy = '', calidad = 'cine', marca = true, intento = 0, modelo = 'wan2.2-5b' } = {}, fetchImpl) {
  const id = safeId(pkg.id);
  if (!id) throw new Error('La producción no tiene identificador.');
  // Siempre con labios sincronizados, control de rostros y voces verificadas: sin ellos la Productora no deja la versión «lista».
  const data = { ...pkg, productora: { ntfy, calidad, marca, intento, modelo, voz: 'chatterbox', musica: true, labios: true, control_rostros: true, reintentos_rostro: 2, enviado: new Date().toISOString() } };
  await putFile(cfg, `producciones/${id}/paquete.json`, new TextEncoder().encode(JSON.stringify(data)), `Producir: ${String(pkg.title || id).slice(0, 60)}`, fetchImpl);
  return id;
}

/** Lee producciones/<id>/estado.json (lo escribe la Productora en GitHub Actions). */
export async function getStatus(cfg, id, fetchImpl) {
  const r = await gh(cfg, `/contents/${enc(`producciones/${safeId(id)}/estado.json`)}?ref=${enc(cfg.branch)}`, { accept: 'application/vnd.github.raw', fetchImpl });
  return r ? r.json() : null;
}

/** Pide a la Productora que revise ahora (un commit pequeño dispara el flujo; no requiere más permisos). */
export async function requestCheck(cfg, id, fetchImpl) {
  await putFile(cfg, `producciones/${safeId(id)}/revisar.json`, new TextEncoder().encode(JSON.stringify({ at: new Date().toISOString() })), 'Revisar estado', fetchImpl);
}

/** Lista los archivos de una carpeta del repositorio (rama de producciones). */
export async function listDir(cfg, path, fetchImpl) {
  const r = await gh(cfg, `/contents/${enc(path)}?ref=${enc(cfg.branch)}`, { fetchImpl });
  return r ? (await r.json()).filter((x) => x.type === 'file').map((x) => x.name) : [];
}

/** Fija la referencia OFICIAL de un personaje (personajes/<id>.jpg): la Productora la usa en todas las escenas y capítulos. */
export async function setOfficialFace(cfg, charId, jpegBytes, fetchImpl) {
  if (jpegBytes.length > 120_000) throw new Error('La referencia debe pesar 120 KB o menos.');
  await putFile(cfg, `personajes/${safeId(charId)}.jpg`, jpegBytes, `Rostro oficial: ${safeId(charId)}`, fetchImpl);
}

/** Descarga un archivo (≤ 100 MB) desde el repositorio privado. */
export async function downloadVideo(cfg, path, fetchImpl) {
  const r = await gh(cfg, `/contents/${enc(path)}?ref=${enc(cfg.branch)}`, { accept: 'application/vnd.github.raw', fetchImpl });
  if (!r) throw new Error('El video todavía no está disponible.');
  return new Blob([await r.arrayBuffer()], { type: 'video/mp4' });
}

/** Descarga el video final; si la Productora lo guardó en partes (límite de 100 MB de GitHub), las une sin pérdida. */
export async function downloadFinal(cfg, video, info = {}, fetchImpl, onProgress = () => {}) {
  const partes = info.partes?.length ? info.partes : [video.split('/').pop()];
  const dir = video.split('/').slice(0, -1).join('/');
  const blobs = [];
  for (const [i, nombre] of partes.entries()) { onProgress(i + 1, partes.length); blobs.push(await downloadVideo(cfg, `${dir}/${nombre}`, fetchImpl)); }
  const blob = new Blob(blobs, { type: 'video/mp4' });
  if (info.bytes && blob.size !== info.bytes) throw new Error('El video llegó incompleto. Inténtalo de nuevo.');
  return blob;
}

/** Estimación de GPU con tiempos MEDIDOS por plano; sesiones de 11 h y cuota semanal ~30 h (+ referencias, voces, labios y control). */
export function gpuEstimate(pkg, modelo = 'wan2.2-5b') {
  const planos = (pkg.scenes || []).reduce((a, s) => a + Number(s.shots || 1), 0);
  const horas = (planos * (MODELOS[modelo] || MODELOS['wan2.2-5b']).min) / 60 + 0.8;
  return { planos, horas: Math.round(horas * 10) / 10, sesiones: Math.max(1, Math.ceil(horas / 10.5)), semanas: Math.round((horas / 30) * 10) / 10 };
}
