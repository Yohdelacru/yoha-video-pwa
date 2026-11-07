// YouTube Data API v3 desde el navegador con Google Identity Services (OAuth 2.0, modelo de token).
// - Sin client secret: el "Client ID" de una aplicación web es público por diseño.
// - Los tokens de acceso viven solo en memoria (caducan en ~1 hora) y nunca se guardan ni se envían a terceros.
// - Nada se publica sin revisión y confirmación explícita del usuario. Privacidad por defecto: privado.

const GIS = 'https://accounts.google.com/gsi/client';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
// Opcional: analíticas e ingresos (solo lectura). Los ingresos solo existen si el canal ya está monetizado.
const ANALYTICS_SCOPES = 'https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/yt-analytics-monetary.readonly';
const tokens = new Map(); // channelId -> { token, expiresAt }

export function getClientId() { try { return localStorage.getItem('yoha.yt.clientId') || ''; } catch { return ''; } }
export function setClientId(v) { try { localStorage.setItem('yoha.yt.clientId', v.trim()); } catch { /* sin almacenamiento */ } }
export function savedChannels() { try { return JSON.parse(localStorage.getItem('yoha.yt.channels') || '[]'); } catch { return []; } }
function saveChannels(list) { try { localStorage.setItem('yoha.yt.channels', JSON.stringify(list)); } catch { /* */ } }
export function forgetChannel(id) { tokens.delete(id); saveChannels(savedChannels().filter((c) => c.id !== id)); }
export const isConnected = (id) => { const t = tokens.get(id); return Boolean(t && t.expiresAt > Date.now() + 60_000); };

let gisLoad = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoad) return gisLoad;
  gisLoad = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = GIS; s.async = true; s.onload = () => res(); s.onerror = () => { gisLoad = null; rej(new Error('No se pudo cargar el inicio de sesión de Google.')); };
    document.head.appendChild(s);
  });
  return gisLoad;
}

function requestToken(hint, scopes = SCOPES) {
  const clientId = getClientId();
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Configura primero tu Client ID de OAuth (termina en .apps.googleusercontent.com).');
  return new Promise((res, rej) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: scopes, prompt: 'select_account consent', hint,
      callback: (r) => (r.error ? rej(new Error(`Google: ${r.error_description || r.error}`)) : res(r)),
      error_callback: (e) => rej(new Error(e?.type === 'popup_closed' ? 'Cerraste la ventana de Google.' : `Google: ${e?.message || e?.type}`)),
    });
    client.requestAccessToken();
  });
}

async function api(path, token, init = {}) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || `YouTube respondió ${r.status}`);
  return body;
}

/** Conecta un canal (cada canal = una autorización; para varias cuentas o cuentas de marca repite). */
export async function connectChannel({ analytics = false } = {}) {
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(getClientId())) throw new Error('Configura primero tu Client ID de OAuth (termina en .apps.googleusercontent.com).');
  await loadGis();
  const t = await requestToken(undefined, analytics ? `${SCOPES} ${ANALYTICS_SCOPES}` : SCOPES);
  const me = await api('channels?part=snippet&mine=true', t.access_token);
  const ch = me.items?.[0];
  if (!ch) throw new Error('Esta cuenta de Google no tiene un canal de YouTube.');
  tokens.set(ch.id, { token: t.access_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000, analytics: analytics && /yt-analytics/.test(t.scope || '') });
  const list = savedChannels().filter((c) => c.id !== ch.id);
  list.push({ id: ch.id, title: ch.snippet.title, thumb: ch.snippet.thumbnails?.default?.url || '' });
  saveChannels(list);
  return ch;
}

export async function revoke(id) {
  const t = tokens.get(id);
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t.token, () => {});
  forgetChannel(id);
}

/** Valida los metadatos antes de subir. */
export function validateMeta(m) {
  const errs = [];
  if (!m.title?.trim()) errs.push('Falta el título.');
  if ((m.title || '').length > 100) errs.push('El título admite máximo 100 caracteres.');
  if (/[<>]/.test(m.title || '') || /[<>]/.test(m.description || '')) errs.push('YouTube no admite los caracteres < y > en título o descripción.');
  if ((m.description || '').length > 5000) errs.push('La descripción admite máximo 5000 caracteres.');
  if (m.madeForKids === null || m.madeForKids === undefined) errs.push('Indica si el video es para niños (obligatorio por ley COPPA).');
  if (m.publishAt) {
    if (m.privacyStatus !== 'private') errs.push('Para programar, la privacidad debe ser "Privado" (YouTube lo publica en la fecha elegida).');
    if (new Date(m.publishAt).getTime() < Date.now() + 15 * 60_000) errs.push('La fecha programada debe ser al menos 15 minutos en el futuro.');
  }
  return errs;
}

export function buildMetadata(m) {
  const status = {
    privacyStatus: m.privacyStatus || 'private',
    selfDeclaredMadeForKids: Boolean(m.madeForKids),
    containsSyntheticMedia: Boolean(m.synthetic),
    embeddable: true,
  };
  if (m.publishAt) status.publishAt = new Date(m.publishAt).toISOString();
  return {
    snippet: { title: m.title.trim(), description: m.description || '', tags: (m.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 30), categoryId: m.categoryId || '22', defaultLanguage: 'es' },
    status,
  };
}

/** Llamada de solo lectura a la API de YouTube con el permiso del canal (datos de cada canal separados). */
export async function read(channelId, path) {
  const t = tokens.get(channelId);
  if (!t || t.expiresAt < Date.now() + 30_000) throw new Error('Conecta (o reconecta) el canal para consultar datos.');
  return api(path, t.token);
}
export const hasAnalytics = (id) => Boolean(tokens.get(id)?.analytics);
/** YouTube Analytics API v2 (solo lectura). */
export async function analytics(channelId, params) {
  const t = tokens.get(channelId);
  if (!t?.analytics) throw new Error('Reconecta el canal marcando «incluir analíticas» para ver tiempo de reproducción e ingresos.');
  const q = new URLSearchParams({ ids: 'channel==MINE', ...params });
  const r = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${q}`, { headers: { Authorization: `Bearer ${t.token}` } });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error?.message || `YouTube Analytics respondió ${r.status}`);
  return b;
}
/** Sube la miniatura personalizada (el canal debe tener verificadas las funciones intermedias). */
export async function setThumbnail(channelId, videoId, pngBlob) {
  const t = tokens.get(channelId);
  if (!t) throw new Error('Canal no conectado.');
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, { method: 'POST', headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': pngBlob.type || 'image/png' }, body: pngBlob });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error?.message || `No se pudo poner la miniatura (${r.status})`);
  return b;
}

/**
 * Regla de publicación (no se puede saltar desde la interfaz):
 * 1) aprobación expresa registrada para ESTE archivo (mismo hash SHA-256),
 * 2) ese archivo no se publicó antes (evita duplicados),
 * 3) confirmación final en el momento de publicar.
 */
export function assertPublishable({ approval, videoHash, publishedHashes = [], confirmed }) {
  if (!approval || approval.action !== 'aprobado') throw new Error('Este video no tiene tu aprobación. Apruébalo en «Pendientes de aprobación».');
  if (approval.videoHash !== videoHash) throw new Error('El video cambió después de aprobarlo. Vuelve a revisarlo y aprobarlo.');
  if (publishedHashes.includes(videoHash)) throw new Error('Este mismo video ya fue publicado. Se bloqueó para evitar duplicados.');
  if (!confirmed) throw new Error('Falta la confirmación final.');
}

/** Subida reanudable con progreso. Requiere confirmación explícita previa en la interfaz. */
export async function uploadVideo({ channelId, blob, meta, confirmed, onProgress, approval, videoHash, publishedHashes }) {
  assertPublishable({ approval, videoHash, publishedHashes, confirmed });
  const errs = validateMeta(meta);
  if (errs.length) throw new Error(errs.join(' '));
  const t = tokens.get(channelId);
  if (!t || t.expiresAt < Date.now() + 60_000) throw new Error('La sesión de este canal caducó. Pulsa "Reconectar".');
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify(buildMetadata(meta)),
  });
  if (!init.ok) { const b = await init.json().catch(() => ({})); throw new Error(b?.error?.message || `YouTube rechazó la subida (${init.status}).`); }
  const url = init.headers.get('Location');
  if (!url) throw new Error('YouTube no devolvió la dirección de subida.');
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', 'video/mp4');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    x.onload = () => { try { const b = JSON.parse(x.responseText); x.status < 300 ? res(b) : rej(new Error(b?.error?.message || `Error ${x.status}`)); } catch { rej(new Error(`Respuesta inesperada (${x.status})`)); } };
    x.onerror = () => rej(new Error('Se perdió la conexión durante la subida.'));
    x.send(blob);
  });
}
