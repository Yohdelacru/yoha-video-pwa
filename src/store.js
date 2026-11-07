// Almacenamiento local en el dispositivo (IndexedDB). Nada se envía a servidores.
const DB = 'yoha-video', VER = 2;
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      if (!db.objectStoreNames.contains('characters')) db.createObjectStore('characters', { keyPath: 'id' });
      // v2: colecciones genéricas (producciones, series, calendario, guardián, banco, auditoría…)
      if (!db.objectStoreNames.contains('docs')) { const d = db.createObjectStore('docs', { keyPath: 'key' }); d.createIndex('col', 'col'); }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Almacenamiento lleno o no disponible'));
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const kv = {
  get: (k) => tx('kv', 'readonly', (s) => req(s.get(k))),
  set: (k, v) => tx('kv', 'readwrite', (s) => { s.put(v, k); }),
};
export const files = {
  get: (id) => tx('files', 'readonly', (s) => req(s.get(id))),
  set: (id, blob) => tx('files', 'readwrite', (s) => { s.put(blob, id); }),
  del: (id) => tx('files', 'readwrite', (s) => { s.delete(id); }),
  keys: () => tx('files', 'readonly', (s) => req(s.getAllKeys())),
};
export const characters = {
  all: () => tx('characters', 'readonly', (s) => req(s.getAll())),
  put: (c) => tx('characters', 'readwrite', (s) => { s.put(c); }),
  del: (id) => tx('characters', 'readwrite', (s) => { s.delete(id); }),
};
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
export async function storageEstimate() {
  try { const e = await navigator.storage?.estimate(); return e ? { used: e.usage || 0, quota: e.quota || 0 } : null; } catch { return null; }
}

/** Colección de documentos: col('productions').put({id,...}) */
export function col(name) {
  return {
    all: () => tx('docs', 'readonly', (s) => req(s.index('col').getAll(name))).then((rows) => rows.map((r) => r.doc)),
    get: (id) => tx('docs', 'readonly', (s) => req(s.get(`${name}:${id}`))).then((r) => r?.doc ?? null),
    put: (doc) => tx('docs', 'readwrite', (s) => { s.put({ key: `${name}:${doc.id}`, col: name, doc: { ...doc, updatedAt: new Date().toISOString() } }); }),
    del: (id) => tx('docs', 'readwrite', (s) => { s.delete(`${name}:${id}`); }),
  };
}

/** Registro de acciones importantes (aprobaciones, publicaciones, reclamaciones preparadas…). */
export async function audit(action, detail = {}) {
  const entry = { id: uid(), at: new Date().toISOString(), action, detail };
  try { await col('audit').put(entry); } catch { /* best effort */ }
  return entry;
}

export async function sha256Blob(blob) {
  const buf = await blob.arrayBuffer();
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
