// NOTIFICACIONES AL IPHONE (costo cero)
// 1) Notificación local de la PWA: cuando termina una exportación en el dispositivo. En iPhone requiere
//    iOS 16.4+ y la app instalada en la pantalla de inicio; solo funciona mientras la app está abierta o recién cerrada.
// 2) ntfy.sh (gratis, sin cuenta): el notebook de Kaggle/Colab avisa al terminar o fallar aunque la PWA esté cerrada.
//    El nombre del tema actúa como contraseña: se genera aleatorio y largo. Nunca se envían avisos por copias.

const KEY = 'yoha.ntfy.topic';
export function getTopic() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
export function newTopic() {
  const a = new Uint8Array(15); crypto.getRandomValues(a);
  const t = 'yoha-' + [...a].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  try { localStorage.setItem(KEY, t); } catch { /* */ }
  return t;
}
export function setTopic(t) { if (/^[A-Za-z0-9_-]{12,64}$/.test(t)) { localStorage.setItem(KEY, t); return true; } return false; }

export async function enableLocal() {
  if (!('Notification' in window)) throw new Error('Este navegador no admite notificaciones. En iPhone, instala la app en la pantalla de inicio (iOS 16.4 o superior).');
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('Permiso de notificaciones denegado.');
  return true;
}
export async function local(title, body, tag = 'yoha') {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) await reg.showNotification(title, { body, tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png' });
    else new Notification(title, { body, tag });
    return true;
  } catch { return false; }
}
/** Envío a ntfy.sh (si hay tema configurado). Solo producción lista / error crítico / detenida. */
export async function push(message, { title = 'Yoha Video', priority = 'default', tags = 'clapper' } = {}) {
  const topic = getTopic();
  if (!topic) return false;
  const r = await fetch(`https://ntfy.sh/${topic}`, { method: 'POST', body: message, headers: { Title: title, Priority: priority, Tags: tags } });
  return r.ok;
}
export const MESSAGES = {
  ready: '🎬 Yoha Video: tu producción está lista para revisar.',
  error: '⚠️ Yoha Video: ocurrió un error crítico en tu producción.',
  stopped: '⏸️ Yoha Video: la producción se detuvo antes de terminar.',
};
export async function notifyAll(kind, detail = '') {
  const msg = MESSAGES[kind] + (detail ? `\n${detail}` : '');
  const a = await local('Yoha Video', msg, `yoha-${kind}`);
  const b = await push(msg, { priority: kind === 'ready' ? 'default' : 'high', tags: kind === 'ready' ? 'clapper' : 'warning' }).catch(() => false);
  return { local: a, push: b };
}
