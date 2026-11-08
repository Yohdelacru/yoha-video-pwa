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
// Minutos de GPU estimados por plano de ~5 s en T4 (estimación, no medida) y sesiones de 11 h.
export const MIN_POR_PLANO = 10;

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
export async function sendProduction(cfg, pkg, { ntfy = '', calidad = 'normal', marca = true, intento = 0 } = {}, fetchImpl) {
  const id = safeId(pkg.id);
  if (!id) throw new Error('La producción no tiene identificador.');
  const data = { ...pkg, productora: { ntfy, calidad, marca, intento, enviado: new Date().toISOString() } };
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

/** Descarga el video final (≤ 100 MB) desde el repositorio privado. */
export async function downloadVideo(cfg, path, fetchImpl) {
  const r = await gh(cfg, `/contents/${enc(path)}?ref=${enc(cfg.branch)}`, { accept: 'application/vnd.github.raw', fetchImpl });
  if (!r) throw new Error('El video todavía no está disponible.');
  return new Blob([await r.arrayBuffer()], { type: 'video/mp4' });
}

/** Estimación honesta de GPU (no medida): minutos por plano × planos; sesiones de 11 h y cuota semanal ~30 h. */
export function gpuEstimate(pkg) {
  const planos = (pkg.scenes || []).reduce((a, s) => a + Number(s.shots || 1), 0);
  const horas = (planos * MIN_POR_PLANO) / 60 + 0.5; // + instalación, guion y voces
  return { planos, horas: Math.round(horas * 10) / 10, sesiones: Math.max(1, Math.ceil(horas / 10.5)), semanas: Math.round((horas / 30) * 10) / 10 };
}
