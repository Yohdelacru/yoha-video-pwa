// YOHA VIDEO · Panel ejecutivo de YDC Entertainment Virales
// Secciones: Panel, Crear video (Director IA), Producción (obra), Mis producciones, Mis series, Radar Viral,
// Protección, Marketing, Revenue, Yoha Bank, Calendario, Pendientes de aprobación, Publicados, Configuración.
// Todo se guarda automáticamente en el dispositivo (IndexedDB). Nada se publica ni se envía sin aprobación.
import { col, characters as charStore, files as fileStore, kv, audit, sha256Blob, uid, storageEstimate } from './store.js';
import { buildProduction, estimate, writerBrief, importWriterJson, productionPackage, scenePlan, FORMATS, EMOTIONS, GESTURES, MOVES, MUSIC_MOODS, CAMERAS, autoDirect } from './director.js';
import { applyProductionCommand, PRODUCTION_EXAMPLES } from './commands.js';
import { checkProduction, isBlocked, CLEAN_POLICY } from './language.js';
import * as yt from './youtube.js';
import * as ins from './insights.js';
import * as mk from './marketing.js';
import * as nt from './notify.js';
import * as pr from './productora.js';
import { exportVideo } from './engine.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function qualityReport(p) {
  const vi = p.cloud?.video_info; if (!vi) return '';
  const au = vi.audio, cf = vi.calidad_facial || {};
  const filas = [];
  if (au) filas.push(`<li>${au.ok ? '✅' : '❌'} Audio: ${au.lineas_audibles}/${au.lineas} líneas audibles · Whisper entiende ${Math.round((au.coincidencia || 0) * 100)} %</li>`);
  for (const x of cf.labios || []) filas.push(`<li>👄 ${esc(x.plano)}: ${x.escucha ? `escucha · boca en reposo ${x.apertura_silencio ?? '—'}` : `correlación boca↔voz ${x.correlacion_antes ?? '—'} → ${x.correlacion_despues ?? '—'}`}</li>`);
  const planos = [];
  for (const sc of p.scenes) (scenePlan(sc) || Array.from({ length: sc.shots || 1 }, () => ({}))).forEach((pl, k) => planos.push({ sc, k, pl }));
  const fila = ({ sc, k, pl }) => {
    const n = `e${String(sc.n).padStart(3, '0')}_p${String(k + 1).padStart(2, '0')}_`;
    const r = Object.entries(cf.rostros || {}).find(([name]) => name.startsWith(n))?.[1];
    const est = r ? (r.aprobado ? '✅' : '⚠️') : '·';
    return `<li>${est} Escena ${sc.n} · plano ${k + 1} ${pl.encuadre ? `(${esc(pl.encuadre)}${pl.foco ? ` de ${esc(pl.foco)}` : ''})` : ''}${r ? ` · identidad ${r.identidad_media ?? '—'}${r.problemas?.length ? ` · ${esc(r.problemas.join(', '))}` : ''}` : ''}
      <button class="secondary small" data-rehacer="${esc(sc.id)}:${k}">↺ Rehacer este plano</button>${sc.rehacer?.[k] ? ` <span class="small muted">(pedido ${sc.rehacer[k]})</span>` : ''}</li>`;
  };
  return `<details class="small" ${p.cloud?.estado === 'error' ? 'open' : ''}><summary>Control de calidad (real, medido en el video)</summary><ul>${filas.join('')}${planos.map(fila).join('')}</ul>
    <p class="muted small">«Rehacer este plano» regenera SOLO ese plano en el próximo envío; los aprobados se conservan.</p>
    ${p.cloud?.video && p.cloud?.estado !== 'lista' ? '<button id="obCloudPeek" class="secondary">👁 Ver el video para revisarlo (no aprobado)</button><div id="obPeek"></div>' : ''}
    <button id="obFacesBtn" class="secondary">🪪 Rostros oficiales de los personajes</button></details>`;
}
const cloudText = (c) => [c.mensaje && c.mensaje.startsWith(pr.STATES[c.estado] || '¬') ? '' : pr.STATES[c.estado] || c.estado, c.mensaje, c.planos_total ? `${c.planos_hechos || 0}/${c.planos_total} planos` : '', c.actualizado ? `actualizado ${dt(c.actualizado)}` : ''].filter(Boolean).join(' · ');
const dt = (s) => (s ? new Date(s).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const STATUS = { borrador: ['Borrador', 'warn'], en_revision: ['En revisión', 'warn'], cambios_solicitados: ['Cambios solicitados', 'warn'], aprobado: ['Aprobado', 'ok'], rechazado: ['Rechazado', 'no'], publicado: ['Publicado', 'ok'] };
const tag = (st) => { const [l, k] = STATUS[st] || [st, 'warn']; return `<span class="tag ${k}">${l}</span>`; };
const PIPE = ['Idea', 'Guion', 'Personajes', 'Escenarios', 'Diálogos', 'Escenas', 'Dirección', 'Visual (IA)', 'Actuación', 'Voces', 'Música', 'Efectos', 'Montaje', 'Subtítulos', 'Exportación'];

const productions = col('productions');
const seriesCol = col('series');
const calendar = col('calendar');
const guardian = col('guardian');
const published = col('published');
const auditCol = col('audit');

export async function initStudio(hooks) {
  const S = { current: null, publishContext: null, chars: [], radar: null };
  const toast = hooks.toast;
  const refreshChars = async () => (S.chars = await charStore.all().catch(() => []));
  await refreshChars();
  const status = (id, msg, kind = '') => { const el = $(id); if (el) { el.textContent = msg; el.className = `status ${kind}`; } };
  const copy = async (text, statusId) => { try { await navigator.clipboard.writeText(text); status(statusId, 'Copiado al portapapeles.', 'ok'); } catch { prompt('Copia el texto:', text); } };
  const download = (name, data, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000); };
  const channelOptions = () => { const l = yt.savedChannels(); return l.length ? l.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}${yt.isConnected(c.id) ? '' : ' (reconectar)'}</option>`).join('') : '<option value="">— conecta un canal en Configuración —</option>'; };
  const needChannel = (sel) => { const id = $(sel)?.value; if (!id) throw new Error('Conecta un canal de YouTube en Configuración → Canales.'); return id; };

  async function saveProd(p, label) {
    if (label) {
      const snap = structuredClone({ ...p, versions: undefined });
      p.versions = [{ id: uid(), at: new Date().toISOString(), label, snap }, ...(p.versions || [])].slice(0, 30);
    }
    await productions.put(p);
    return p;
  }

  // ───────────── PANEL ─────────────
  async function renderPanel() {
    const ps = await productions.all();
    const pend = ps.filter((p) => p.status === 'en_revision').length;
    const pub = (await published.all()).length;
    const ser = (await seriesCol.all()).length;
    const tiles = [
      ['director', '🎬', 'Crear video', 'Una instrucción → producción completa'], ['producciones', '🎞', 'Mis producciones', `${ps.length} producciones`], ['series', '📺', 'Mis series', `${ser} series`],
      ['editor', '✂️', 'Editor IA', 'Montaje y órdenes por texto'], ['personajes', '🎭', 'Personajes', `${S.chars.length} en la biblia`], ['radar', '📡', 'Radar Viral IA', 'Tendencias y 5 ideas originales'],
      ['guardian', '🛡', 'Protección de mis videos', 'Panel silencioso'], ['marketing', '📣', 'Marketing Global', 'Campañas orgánicas'], ['revenue', '📈', 'Yoha Revenue IA', 'Camino al Programa de Socios'],
      ['bank', '🏦', 'Yoha Bank', 'Informativo · USD y RD$'], ['calendario', '🗓', 'Calendario editorial', 'Plan de publicaciones'], ['aprobaciones', '✅', 'Pendientes de aprobación', pend ? `<b>${pend} esperando tu revisión</b>` : 'Nada pendiente'],
      ['publicados', '▶️', 'Videos publicados', `${pub} publicados`], ['config', '⚙️', 'Configuración', 'Canales, avisos, marca, respaldo'],
    ];
    $('tab-panel').innerHTML = `<div class="hero"><img src="./brand/ydc-logo.png" alt="" width="72" height="72" onerror="this.remove()"><div><h1>YDC Entertainment Virales</h1><p class="muted">Yoha Video · productora audiovisual inteligente · costo cero</p></div></div>
      <div class="tiles">${tiles.map(([t, i, n, d]) => `<button class="tile" data-go="${t}"><span class="ti-ico">${i}</span><b>${n}</b><small>${d}</small></button>`).join('')}</div>
      <p class="muted small">Flujo obligatorio: CREAR → REVISAR → APROBAR → PUBLICAR. Ningún video, campaña o reclamación sale sin tu aprobación.</p>`;
    $('tab-panel').querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => hooks.showTab(b.dataset.go)));
  }

  // ───────────── CREAR VIDEO (Director IA) ─────────────
  async function renderDirector(prefill = '') {
    const ser = await seriesCol.all();
    $('tab-director').innerHTML = `<div class="card">
      <h2>🎬 Director cinematográfico IA</h2>
      <p class="muted">Escribe una sola instrucción. Yoha Video arma la producción: sinopsis, reparto con memoria, escenarios, escenas y planos, dirección de cámara y actuación, música, voces y montaje. Cada etapa es editable.</p>
      <label>Tu instrucción<textarea id="dirText" rows="4" placeholder="Créame una novelita dominicana de veinte minutos, con cinco personajes, romance, traición, suspenso y un final que motive a ver el próximo capítulo">${esc(prefill)}</textarea></label>
      <div class="chips">${['Créame una novelita dominicana de veinte minutos, con cinco personajes, romance, traición, suspenso y un final que motive a ver el próximo capítulo', 'Un short vertical de 45 segundos con dos personajes y un final sorpresa', 'Un comercial de 30 segundos para Madera y Café, cocinas y closets a medida', 'Una historia infantil de 3 minutos sobre una tortuguita valiente', 'Un documental de 5 minutos sobre el café de Jarabacoa'].map((e) => `<button class="chip" data-ex="${esc(e)}">${esc(e.slice(0, 48))}…</button>`).join('')}</div>
      <div class="row wrap"><label>Serie (opcional)<select id="dirSeries"><option value="">— Producción independiente —</option>${ser.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select></label>
      <label class="check"><input id="dirReuse" type="checkbox" checked> Reutilizar personajes guardados</label></div>
      <button id="dirGo" class="primary big">Dirigir producción</button>
      <p id="dirStatus" class="status"></p>
      <p class="small"><button class="ghost small" id="dirOld">Plantilla rápida por género (modo anterior)</button></p>
      <details><summary>¿Qué hace la IA y qué no?</summary><p class="muted small">En el navegador se interpreta la instrucción y se arma la estructura completa. El <b>guion y los diálogos completos</b> los escribe un modelo abierto gratuito (Qwen2.5-7B, Apache-2.0) en el notebook de Kaggle/Colab, o cualquier asistente gratuito con el encargo que Yoha prepara. Los <b>videos, voces y labios</b> se generan en el notebook con GPU gratuita. Nada se marca como terminado sin haberse generado.</p></details>
    </div>`;
    $('dirOld').onclick = () => hooks.showTab('produccion');
    $('tab-director').querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => ($('dirText').value = b.dataset.ex)));
    $('dirGo').onclick = async () => {
      const text = $('dirText').value.trim();
      if (text.length < 10) return status('dirStatus', 'Escribe una instrucción más completa.', 'err');
      const seriesId = $('dirSeries').value || null;
      const series = seriesId ? await seriesCol.get(seriesId) : null;
      let library = [];
      if ($('dirReuse').checked) library = series ? S.chars.filter((c) => series.cast.includes(c.id)) : [];
      const episode = series ? (await productions.all()).filter((p) => p.seriesId === seriesId).length + 1 : null;
      const p = buildProduction(text, { library, seriesId, episode });
      for (const c of p.newCharacters) await charStore.put({ ...c, createdBy: 'director', updatedAt: new Date().toISOString() });
      delete p.newCharacters;
      if (series) {
        p.title = `${series.title} · Capítulo ${episode}`;
        const prev = (await productions.all()).filter((x) => x.seriesId === seriesId).sort((a, b) => (a.episode || 0) - (b.episode || 0)).pop();
        if (prev?.recap) p.synopsis = `Viene de: ${prev.recap}\n${p.synopsis}`;
        series.cast = [...new Set([...(series.cast || []), ...p.characters])];
        await seriesCol.put(series);
      }
      await saveProd(p, 'Creada por el Director IA');
      await audit('produccion.creada', { id: p.id, title: p.title });
      await refreshChars(); hooks.renderChars?.();
      openObra(p.id);
    };
  }

  // ───────────── OBRA (espacio de trabajo de una producción) ─────────────
  async function openObra(id) { S.current = id; hooks.showTab('obra'); }
  async function renderObra() {
    const p = S.current && (await productions.get(S.current));
    if (!p) { $('tab-obra').innerHTML = '<p class="empty">Elige una producción en «Mis producciones».</p>'; return; }
    await refreshChars();
    const cast = S.chars.filter((c) => p.characters.includes(c.id));
    const est = estimate(p);
    const lang = checkProduction(p);
    const blocked = isBlocked(lang, p.allowStrongLanguage);
    const scripted = p.scenes.filter((s) => s.status === 'guion_listo' || (s.dialogue || []).length || s.narration).length;
    const done = { Idea: true, Guion: scripted === p.scenes.length, Personajes: cast.length > 0, Escenarios: true, 'Diálogos': p.scenes.some((s) => (s.dialogue || []).length), Escenas: true, 'Dirección': true, 'Actuación': p.scenes.some((s) => Object.keys(s.acting || {}).length), Música: Boolean(p.music?.mood), Exportación: Boolean(p.videoHash), 'Visual (IA)': Boolean(p.clipsImported), Voces: Boolean(p.voicesImported), Montaje: Boolean(p.videoHash), Subtítulos: Boolean(p.videoHash), Efectos: p.scenes.some((s) => s.sfx) };
    const charName = (cid) => cast.find((c) => c.id === cid)?.name || '—';
    const gpu = pr.gpuEstimate(productionPackage(p, S.chars, {}), p.modelo || 'wan2.2-5b');
    $('tab-obra').innerHTML = `
    <div class="card">
      <div class="row wrap" style="justify-content:space-between"><h2 style="margin:0">${esc(p.title)}</h2><div>${tag(p.status)} ${p.seriesId ? `<span class="pill">Capítulo ${p.episode}</span>` : ''}</div></div>
      <div class="pipe">${PIPE.map((x) => `<span class="${done[x] ? 'ok' : ''}">${done[x] ? '✓' : '○'} ${x}</span>`).join('')}</div>
      <div class="row wrap">
        <label>Título<input id="obTitle" value="${esc(p.title)}" maxlength="120"></label>
        <label>Formato<select id="obAspect">${['16:9', '9:16', '1:1', '4:5'].map((a) => `<option ${a === p.aspect ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>Estilo<select id="obStyle">${['cinematografico', 'realista', 'animacion3d', 'animacion2d', 'documental'].map((a) => `<option ${a === p.style ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>Idiomas<select id="obLang"><option value="es" ${p.languages.length === 1 ? 'selected' : ''}>Español</option><option value="es,en" ${p.languages.includes('en') ? 'selected' : ''}>Español + inglés (doblaje)</option></select></label>
      </div>
      <label>Sinopsis<textarea id="obSyn" rows="3">${esc(p.synopsis)}</textarea></label>
      <label>Resumen para el próximo capítulo (continuidad)<textarea id="obRecap" rows="2" placeholder="Qué pasó y qué quedó abierto">${esc(p.recap || '')}</textarea></label>
      <div class="row wrap"><button id="obSave" class="secondary">Guardar cambios</button><button id="obDup" class="ghost small">Duplicar</button></div>
      <p class="muted small">${est.shots} planos (~${Math.round(p.durationSec / 60 * 10) / 10} min) · por generar: ${est.dirtyShots} · GPU estimada ≈ ${est.gpuHours} h (${est.kaggleWeeks} semanas de cuota de Kaggle). Supuesto: ${esc(est.assumption)}.</p>
    </div>

    <div class="card">
      <h2>💬 Editor por conversación</h2>
      <div class="cmdbar"><input id="obCmd" placeholder="«Cambia la escena 4: …», «Haz que la protagonista llore en la escena 5», «Pon música más dramática»…"><button id="obCmdGo" class="primary">Aplicar</button></div>
      <div class="chips">${PRODUCTION_EXAMPLES.map((e) => `<button class="chip" data-cmd="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      <p id="obCmdStatus" class="status"></p>
      <p class="muted small">Solo se modifica lo necesario: las escenas tocadas quedan marcadas «modificadas» y el notebook regenera únicamente esas.</p>
    </div>

    <div class="card">
      <h2>✍️ Guion (guionista IA gratuito)</h2>
      <p class="muted small">1) Copia el encargo · 2) pégalo en el notebook (celda «Director IA», Qwen2.5-7B gratis) o en tu asistente gratuito · 3) pega aquí la respuesta JSON.</p>
      <div class="row wrap"><button id="obBrief" class="secondary">Copiar encargo del guion</button><button id="obBriefDl" class="ghost small">Descargar encargo .txt</button></div>
      <textarea id="obPaste" rows="4" placeholder='{"title":"…","scenes":[…]}'></textarea>
      <button id="obImport" class="secondary">Importar guion</button>
      <p id="obScriptStatus" class="status"></p>
    </div>

    <div class="card">
      <h2>🗣 Lenguaje</h2>
      <p class="small">${esc(CLEAN_POLICY)}</p>
      ${lang.length ? `<p class="status ${blocked ? 'err' : ''}">${lang.length} aviso(s): ${lang.slice(0, 6).map((f) => `${esc(f.where)} «${esc(f.word)}» (${f.severity})`).join('; ')}</p>` : '<p class="status ok">Sin malas palabras.</p>'}
      <label class="check"><input id="obStrong" type="checkbox" ${p.allowStrongLanguage ? 'checked' : ''}> Autorizo lenguaje fuerte SOLO en esta producción</label>
    </div>

    <div id="obScenes"></div>

    <div class="card" id="obCloud">
      <h2>🎬 Producir la novela con IA (gratis)</h2>
      <p class="small">Envía esta producción a <b>Kaggle</b> (GPU gratuita) por medio de tu repositorio privado. Allí la IA escribe los diálogos que falten, genera cada escena en video, crea las voces y los subtítulos; después se monta el capítulo con la intro, la marca de agua y el cierre YDC. Al terminar queda en <b>Pendientes de aprobación</b>: nada se publica sin ti.</p>
      <p class="muted small">Con tiempos medidos en GPU T4: ${gpu.planos} planos · ~${gpu.horas} h de GPU · ${gpu.sesiones} sesión(es) de Kaggle · ${gpu.semanas} semana(s) de cuota gratuita (~30 h por semana). Siempre con primeros planos en los diálogos, labios sincronizados (MuseTalk), control de rostros y voces verificadas.</p>
      <div class="row wrap"><label>Calidad<select id="obCq"><option value="cine" selected>Cine (máxima calidad)</option><option value="alta">Alta</option><option value="normal">Normal</option><option value="borrador">Borrador (prueba rápida)</option></select></label>
        <label>Modelo de video<select id="obModel">${Object.entries(pr.MODELOS).map(([k, v]) => `<option value="${k}" ${(p.modelo || 'wan2.2-5b') === k ? 'selected' : ''}>${esc(v.nombre)} · ~${v.min} min/plano</option>`).join('')}</select></label></div>
      <div class="row wrap"><button id="obCloudGo" class="primary">🎬 ${p.cloud ? 'Producir de nuevo (solo cambios)' : 'Producir novela con IA'}</button><button id="obCloudChk" class="secondary" ${p.cloud ? '' : 'hidden'}>↻ Actualizar estado</button><button id="obCloudGet" class="primary" ${p.cloud?.estado === 'lista' ? '' : 'hidden'}>⬇ Traer el video y enviarlo a revisión</button></div>
      <p id="obCloudStatus" class="status ${p.cloud?.estado === 'error' ? 'err' : p.cloud?.estado === 'lista' ? 'ok' : ''}">${p.cloud ? esc(cloudText(p.cloud)) : ''}</p>
      ${qualityReport(p)}
      <div id="obFaces"></div>
    </div>

    <div class="card">
      <h2>🎵 Música, voces y montaje</h2>
      <div class="row wrap"><label>Música general<select id="obMusic">${Object.entries(MUSIC_MOODS).map(([k, v]) => `<option value="${k}" ${p.music?.mood === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <p class="muted small">La música debe tener licencia (Biblioteca de audio de YouTube o propia); se agrega en el Editor. Las voces se generan con Kokoro en el notebook usando la voz de cada personaje: ${cast.map((c) => `${esc(c.name)} (${esc(c.voice)}${p.languages.includes('en') ? ` / ${esc(c.voiceEn || 'af_heart')}` : ''})`).join(', ')}.</p>
      <h3>Paquete para el notebook</h3>
      <label class="check"><input id="obPhotos" type="checkbox"> Incluir fotos de referencia autorizadas</label>
      <div class="row wrap"><button id="obPkgAll" class="primary">⬇ Producción completa</button><button id="obPkgDirty" class="secondary">⬇ Solo escenas modificadas</button><button id="obMarkClean" class="ghost small">Marcar todo como generado</button></div>
      <p class="muted small">El notebook devuelve <i>yoha_clips.zip</i> (clips, voces, lip-sync opcional, subtítulos ES/EN). Ábrelo en el Editor, agrega intro/cierre YDC y música, exporta y pulsa «Enviar a revisión».</p>
      <div class="row wrap"><button id="obToEditor" class="secondary">Ir al Editor</button><button id="obToReview" class="secondary">Enviar el último video exportado a revisión</button></div>
    </div>

    <div class="card"><h2>🕘 Historial de versiones</h2><div id="obVersions">${(p.versions || []).map((v) => `<div class="row"><span class="small">${dt(v.at)} · ${esc(v.label)}</span><button class="small ghost" data-restore="${v.id}">Restaurar</button></div>`).join('') || '<p class="muted small">Sin versiones.</p>'}</div></div>`;

    // Escenas con controles de actuación
    $('obScenes').innerHTML = p.scenes.map((s) => `
      <div class="scene" data-sid="${s.id}">
        <h3><span>Escena ${s.n} · ${esc(s.title)}</span><span>${s.dirty ? '<span class="tag warn">modificada</span>' : '<span class="tag ok">generada</span>'} <span class="pill">${s.shots} planos · ${s.seconds} s</span></span></h3>
        <div class="row wrap"><label>Lugar<input data-k="location" value="${esc(s.location)}"></label><label>Momento<select data-k="time">${['día', 'atardecer', 'noche'].map((x) => `<option ${x === s.time ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Cámara<select data-k="camera">${[...new Set([s.camera, ...CAMERAS])].map((x) => `<option ${x === s.camera ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
        <label>Qué se ve<textarea data-k="description" rows="2">${esc(s.description)}</textarea></label>
        <div class="acting">${s.characters.map((cid) => { const a = s.acting?.[cid] || {}; return `<div class="act" data-cid="${cid}"><b>🎭 ${esc(charName(cid))}</b>
          <select data-a="emotion">${Object.keys(EMOTIONS).map((x) => `<option ${x === a.emotion ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <select data-a="gesture">${Object.keys(GESTURES).map((x) => `<option ${x === a.gesture ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <select data-a="move">${Object.keys(MOVES).map((x) => `<option ${x === a.move ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`; }).join('')}</div>
        <label>Narración<textarea data-k="narration" rows="1">${esc(s.narration)}</textarea></label>
        <label>Diálogos (Nombre: texto)<textarea data-k="dialogue" rows="${Math.max(2, (s.dialogue || []).length)}">${esc((s.dialogue || []).map((d) => `${charName(d.character)}: ${d.text}`).join('\n'))}</textarea></label>
        <div class="row wrap"><label>Música<select data-k="musicMood">${Object.entries(MUSIC_MOODS).map(([k, v]) => `<option value="${k}" ${k === s.musicMood ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Efectos<input data-k="sfx" value="${esc(s.sfx)}" placeholder="lluvia, puerta, tráfico…"></label><label>Planos<input data-k="shots" type="number" min="1" max="40" value="${s.shots}"></label></div>
        <button class="small ghost" data-regen="${s.id}">↻ Regenerar solo esta escena (otra semilla)</button>
      </div>`).join('');

    // Eventos
    const reload = async (label) => { await saveProd(p, label); renderObra(); };
    $('obSave').onclick = async () => { Object.assign(p, { title: $('obTitle').value.trim() || p.title, aspect: $('obAspect').value, style: $('obStyle').value, languages: $('obLang').value.split(','), synopsis: $('obSyn').value, recap: $('obRecap').value }); await reload('Edición manual'); toast('Guardado'); };
    $('obDup').onclick = async () => { const c = { ...structuredClone(p), id: uid(), title: `${p.title} (copia)`, status: 'borrador', approvals: [], videoHash: null, videoFileId: null, versions: [] }; await saveProd(c, 'Duplicada'); openObra(c.id); };
    $('obStrong').onchange = async (e) => { p.allowStrongLanguage = e.target.checked; await audit('lenguaje.autorizacion', { id: p.id, allow: p.allowStrongLanguage }); await reload(e.target.checked ? 'Lenguaje fuerte autorizado (solo esta producción)' : 'Lenguaje limpio'); };
    $('obMusic').onchange = async (e) => { p.music = { ...(p.music || {}), mood: e.target.value }; await saveProd(p); };
    const runCmd = async (text) => {
      const r = applyProductionCommand(p, text, S.chars, { sceneId: S.focusScene });
      if (!r.understood) return status('obCmdStatus', 'No entendí la orden. Prueba con uno de los ejemplos.', 'err');
      Object.assign(p, r.prod);
      for (const c of S.chars) if (r.prod.voiceChanges?.some((v) => v.character === c.id)) await charStore.put(c);
      await saveProd(p, `Orden: ${text.slice(0, 60)}`);
      await renderObra();
      status('obCmdStatus', '✔ ' + r.applied.join(' · '), 'ok');
    };
    $('obCmdGo').onclick = () => runCmd($('obCmd').value);
    $('obCmd').onkeydown = (e) => e.key === 'Enter' && runCmd($('obCmd').value);
    $('tab-obra').querySelectorAll('[data-cmd]').forEach((b) => (b.onclick = () => { $('obCmd').value = b.dataset.cmd; $('obCmd').focus(); }));
    $('obBrief').onclick = () => copy(writerBrief(p, S.chars), 'obScriptStatus');
    $('obBriefDl').onclick = () => download(`encargo-guion-${p.id.slice(0, 6)}.txt`, writerBrief(p, S.chars), 'text/plain;charset=utf-8');
    $('obImport').onclick = async () => {
      try { const n = importWriterJson($('obPaste').value, p); Object.assign(p, n); await reload('Guion importado'); status('obScriptStatus', 'Guion importado con dirección automática de actuación.', 'ok'); }
      catch (e) { status('obScriptStatus', e.message, 'err'); }
    };
    $('obPkgAll').onclick = () => download(`yoha-produccion-${p.id.slice(0, 6)}.json`, JSON.stringify(productionPackage(p, S.chars, { includePhotos: $('obPhotos').checked }), null, 2), 'application/json');
    $('obPkgDirty').onclick = () => download(`yoha-cambios-${p.id.slice(0, 6)}.json`, JSON.stringify(productionPackage(p, S.chars, { includePhotos: $('obPhotos').checked, onlyDirty: true }), null, 2), 'application/json');
    $('obCloudGo').onclick = async () => {
      const cfg = await pr.getConfig();
      if (!pr.isConfigured(cfg)) { status('obCloudStatus', 'Primero conecta la Productora en Configuración → «Productora IA (Kaggle)».', 'err'); return; }
      if (blocked) { status('obCloudStatus', 'Hay lenguaje no permitido. Corrígelo o autorízalo solo para esta producción.', 'err'); return; }
      if (!confirm(`¿Producir «${p.title}» con IA en Kaggle?\n\nEstimación: ~${gpu.horas} h de GPU gratuita. Costo: US$0.\nTe avisaremos cuando esté lista para revisar. Nada se publica sin tu aprobación.`)) return;
      try {
        status('obCloudStatus', 'Enviando a la Productora…');
        const pkg = productionPackage(p, S.chars, { includePhotos: $('obPhotos').checked });
        p.modelo = $('obModel').value;
        await pr.sendProduction(cfg, pkg, { ntfy: nt.getTopic() || '', calidad: $('obCq').value, modelo: p.modelo, intento: (p.cloud?.intento || 0) + 1 });
        p.cloud = { estado: 'en_cola', mensaje: 'Enviada. La Productora la lanza en Kaggle en 1–3 minutos.', enviado: new Date().toISOString(), intento: (p.cloud?.intento || 0) + 1 };
        Object.assign(p, { stage: 'produccion' });
        await audit('productora.enviada', { id: p.id, calidad: $('obCq').value });
        await saveProd(p, 'Enviada a la Productora IA (Kaggle)');
        renderObra();
      } catch (e) { status('obCloudStatus', e.message, 'err'); }
    };
    $('obCloudChk').onclick = async () => {
      const cfg = await pr.getConfig();
      try {
        status('obCloudStatus', 'Consultando…');
        const st = await pr.getStatus(cfg, p.id);
        if (st) p.cloud = { ...p.cloud, ...st };
        const last = p.cloud?.pedidoRevision ? Date.parse(p.cloud.pedidoRevision) : 0;
        if ((!st || ['generando', 'en_cola'].includes(st.estado)) && Date.now() - last > 10 * 60 * 1000) {
          await pr.requestCheck(cfg, p.id); p.cloud.pedidoRevision = new Date().toISOString();
        }
        await saveProd(p); renderObra();
      } catch (e) { status('obCloudStatus', e.message, 'err'); }
    };
    $('obCloudGet').onclick = async () => {
      const cfg = await pr.getConfig();
      try {
        status('obCloudStatus', 'Descargando el video final…');
        const inf = p.cloud.video_info || {};
        const blob = await pr.downloadFinal(cfg, p.cloud.video, inf, undefined, (i, n) => status('obCloudStatus', `Descargando el video final (parte ${i} de ${n})…`));
        let srt = null;
        try { const r = await pr.downloadVideo(cfg, p.cloud.video.replace(/novela\.mp4$/, 'subtitulos_es.srt')); srt = await r.text(); } catch { /* opcional */ }
        p.scenes.forEach((x) => (x.dirty = false)); p.clipsImported = true; await saveProd(p, 'Video de la Productora recibido');
        await sendToReview({ blob, width: inf.ancho, height: inf.alto, duration: inf.duracion, srt }, p.id);
      } catch (e) { status('obCloudStatus', e.message, 'err'); }
    };
    document.querySelectorAll('[data-rehacer]').forEach((b) => (b.onclick = async () => {
      const [sid, k] = b.dataset.rehacer.split(':'); const sc = p.scenes.find((x) => x.id === sid); if (!sc) return;
      sc.rehacer = { ...(sc.rehacer || {}), [k]: ((sc.rehacer || {})[k] || 0) + 1 }; sc.dirty = true;
      await saveProd(p, `Plano ${Number(k) + 1} de la escena ${sc.n} marcado para rehacer`); await renderObra();
      status('obCloudStatus', `Plano ${Number(k) + 1} de la escena ${sc.n} marcado. Pulsa «Producir de nuevo (solo cambios)»: se regenera solo ese plano.`);
    }));
    if ($('obCloudPeek')) $('obCloudPeek').onclick = async () => {
      const cfg = await pr.getConfig();
      try {
        status('obCloudStatus', 'Descargando para revisión…');
        const blob = await pr.downloadFinal(cfg, p.cloud.video, p.cloud.video_info || {});
        $('obPeek').innerHTML = `<video controls playsinline src="${URL.createObjectURL(blob)}" style="width:100%;margin-top:8px"></video><p class="small muted">Solo para revisión: no pasa a aprobación mientras el control de calidad lo bloquee.</p>`;
        status('obCloudStatus', cloudText(p.cloud));
      } catch (e) { status('obCloudStatus', e.message, 'err'); }
    };
    if ($('obFacesBtn')) $('obFacesBtn').onclick = async () => {
      const cfg = await pr.getConfig(); const box = $('obFaces');
      try {
        box.innerHTML = '<p class="small">Buscando los rostros generados…</p>';
        const dir = `producciones/${p.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}/referencias`;
        const names = (await pr.listDir(cfg, dir)).filter((n) => n.endsWith('.png'));
        if (!names.length) { box.innerHTML = '<p class="small muted">Aún no hay rostros generados para esta producción.</p>'; return; }
        const items = await Promise.all(names.map(async (n) => ({ n, url: URL.createObjectURL(new Blob([await pr.downloadVideo(cfg, `${dir}/${n}`)], { type: 'image/png' })) })));
        box.innerHTML = `<p class="small">Elige el rostro OFICIAL de cada personaje (se usará en todas las escenas y capítulos):</p><div class="row wrap">${items.map((x) => {
          const cid = S.chars.find((c) => x.n.replace('.png', '').endsWith(`_${c.id}`) || x.n === `${c.id}.png`)?.id;
          return `<figure style="width:150px"><img src="${x.url}" style="width:150px;border-radius:8px"><figcaption class="small">${esc(x.n)}</figcaption>${cid ? `<button class="secondary small" data-oficial="${esc(cid)}" data-url="${x.url}">Oficial de ${esc(S.chars.find((c) => c.id === cid)?.name || cid)}</button>` : ''}</figure>`;
        }).join('')}</div>`;
        box.querySelectorAll('[data-oficial]').forEach((b) => (b.onclick = async () => {
          const img = new Image(); img.src = b.dataset.url; await img.decode();
          const k = Math.min(1, 512 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const bytes = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88))).arrayBuffer());
          await pr.setOfficialFace(cfg, b.dataset.oficial, bytes); await audit('rostro.oficial', { personaje: b.dataset.oficial });
          b.textContent = '✅ Fijado como oficial'; b.disabled = true;
        }));
      } catch (e) { box.innerHTML = `<p class="status err">${esc(e.message)}</p>`; }
    };
    $('obMarkClean').onclick = async () => { p.scenes.forEach((s) => (s.dirty = false)); p.clipsImported = true; await reload('Clips generados'); };
    $('obToEditor').onclick = () => hooks.showTab('editor');
    $('obToReview').onclick = () => sendToReview(hooks.editorState.lastExport, p.id);
    $('obVersions').querySelectorAll('[data-restore]').forEach((b) => (b.onclick = async () => {
      const v = p.versions.find((x) => x.id === b.dataset.restore);
      if (!v || !confirm(`¿Restaurar la versión del ${dt(v.at)}? La actual queda guardada en el historial.`)) return;
      await saveProd(p, 'Antes de restaurar');
      Object.assign(p, structuredClone(v.snap), { versions: p.versions });
      await reload(`Restaurada: ${v.label}`);
    }));
    $('obScenes').querySelectorAll('.scene').forEach((el) => {
      const s = p.scenes.find((x) => x.id === el.dataset.sid);
      el.addEventListener('focusin', () => (S.focusScene = s.id));
      el.addEventListener('change', async (e) => {
        const k = e.target.dataset.k, a = e.target.dataset.a;
        if (a) { const cid = e.target.closest('.act').dataset.cid; s.acting = s.acting || {}; s.acting[cid] = { ...(s.acting[cid] || {}), [a]: e.target.value }; }
        else if (k === 'dialogue') { s.dialogue = e.target.value.split('\n').map((l) => /^([^:]+):\s*(.+)$/.exec(l.trim())).filter(Boolean).map((m) => ({ character: cast.find((c) => c.name.toLowerCase() === m[1].trim().toLowerCase())?.id || '', text: m[2] })); autoDirect(s); }
        else if (k === 'shots') { s.shots = Math.max(1, Number(e.target.value) || 1); s.seconds = s.shots * 5; p.durationSec = p.scenes.reduce((n, x) => n + x.seconds, 0); }
        else if (k) s[k] = e.target.value;
        if (k !== 'musicMood' && k !== 'narration') { s.dirty = true; s.version = (s.version || 1) + 1; }
        await saveProd(p);
      });
    });
    $('obScenes').querySelectorAll('[data-regen]').forEach((b) => (b.onclick = async () => { const s = p.scenes.find((x) => x.id === b.dataset.regen); s.seed += 7919; s.dirty = true; await reload(`Regenerar escena ${s.n}`); }));
  }

  // ───────────── MIS PRODUCCIONES ─────────────
  async function renderProducciones() {
    const ps = (await productions.all()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    $('tab-producciones').innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">🎞 Mis producciones</h2><button class="primary small" data-new>+ Nueva</button></div>
      ${ps.length ? `<table class="tbl"><tr><th>Título</th><th>Formato</th><th>Duración</th><th>Estado</th><th></th></tr>${ps.map((p) => `<tr><td><b>${esc(p.title)}</b><br><small class="muted">${dt(p.updatedAt)}</small></td><td>${esc(p.formatLabel)}</td><td>${Math.round(p.durationSec / 6) / 10} min</td><td>${tag(p.status)}</td><td><button class="small secondary" data-open="${p.id}">Abrir</button> <button class="small danger" data-del="${p.id}">✕</button></td></tr>`).join('')}</table>` : '<p class="empty">Aún no hay producciones. Empieza en «Crear video».</p>'}</div>`;
    const t = $('tab-producciones');
    t.querySelector('[data-new]').onclick = () => hooks.showTab('director');
    t.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openObra(b.dataset.open)));
    t.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { const p = await productions.get(b.dataset.del); if (p && confirm(`¿Eliminar «${p.title}» de este dispositivo?`)) { await productions.del(p.id); await audit('produccion.eliminada', { id: p.id, title: p.title }); renderProducciones(); } }));
  }

  // ───────────── MIS SERIES ─────────────
  async function renderSeries() {
    const list = await seriesCol.all();
    const ps = await productions.all();
    $('tab-series').innerHTML = `<div class="card"><h2>📺 Mis series</h2>
      <div class="row wrap"><label>Título<input id="srTitle" placeholder="Secretos de la Capital"></label><label>Género<select id="srGenre">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label></div>
      <label>Premisa<textarea id="srLog" rows="2" placeholder="De qué trata la serie"></textarea></label>
      <button id="srNew" class="primary">Crear serie</button></div>
      ${list.map((s) => { const eps = ps.filter((p) => p.seriesId === s.id).sort((a, b) => (a.episode || 0) - (b.episode || 0)); const cast = S.chars.filter((c) => (s.cast || []).includes(c.id)); return `<div class="card" data-ser="${s.id}">
        <h2>${esc(s.title)} <span class="pill">Temporada ${s.season || 1}</span></h2><p class="muted">${esc(s.logline)}</p>
        <div class="row wrap"><label>Mundo / escenario<textarea data-f="world" rows="2">${esc(s.bible?.world || '')}</textarea></label><label>Tono y reglas<textarea data-f="tone" rows="2">${esc(s.bible?.tone || 'Lenguaje limpio; drama familiar con humor; cada capítulo termina en gancho')}</textarea></label></div>
        <h3>Reparto fijo</h3><div class="chips">${S.chars.map((c) => `<label><input type="checkbox" data-cast="${c.id}" ${cast.includes(c) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('') || '<span class="muted small">Sin personajes.</span>'}</div>
        <h3>Capítulos</h3>${eps.map((e) => `<div class="row"><span>Cap. ${e.episode}: <b>${esc(e.title)}</b> ${tag(e.status)}</span><button class="small secondary" data-open="${e.id}">Abrir</button></div><p class="muted small">${esc(e.recap || 'Sin resumen todavía (escríbelo en la producción para dar continuidad).')}</p>`).join('') || '<p class="muted small">Sin capítulos.</p>'}
        <label>Próximo capítulo — ¿qué pasa?<textarea data-next rows="2" placeholder="Continuación: Rosaura confronta a Luz María en la boda…"></textarea></label>
        <div class="row wrap"><button class="primary small" data-ep>+ Crear capítulo ${eps.length + 1}</button><button class="secondary small" data-bible>⬇ Biblia de producción</button><label class="small">Temporada <input type="number" min="1" max="20" value="${s.season || 1}" data-f="season" style="width:80px;display:inline"></label></div>
      </div>`; }).join('')}`;
    $('srNew').onclick = async () => { const title = $('srTitle').value.trim(); if (!title) return toast('Escribe el título de la serie.'); await seriesCol.put({ id: uid(), title, genre: $('srGenre').value, logline: $('srLog').value.trim(), season: 1, cast: [], bible: {} }); renderSeries(); };
    $('tab-series').querySelectorAll('[data-ser]').forEach((card) => {
      const sid = card.dataset.ser;
      const get = () => seriesCol.get(sid);
      card.addEventListener('change', async (e) => {
        const s = await get();
        if (e.target.dataset.cast) s.cast = e.target.checked ? [...new Set([...(s.cast || []), e.target.dataset.cast])] : s.cast.filter((x) => x !== e.target.dataset.cast);
        if (e.target.dataset.f === 'season') s.season = Number(e.target.value) || 1;
        else if (e.target.dataset.f) s.bible = { ...(s.bible || {}), [e.target.dataset.f]: e.target.value };
        await seriesCol.put(s);
      });
      card.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openObra(b.dataset.open)));
      card.querySelector('[data-ep]').onclick = async () => {
        const s = await get();
        const what = card.querySelector('[data-next]').value.trim() || 'Continuación con un nuevo conflicto';
        const eps = (await productions.all()).filter((p) => p.seriesId === sid);
        const instruction = `${FORMATS[s.genre]?.label || 'Serie'}: ${s.title}. ${what}. Duración similar al capítulo anterior, con ${Math.max(2, (s.cast || []).length)} personajes y un final que motive a ver el próximo capítulo`;
        const p = buildProduction(instruction, { library: S.chars.filter((c) => (s.cast || []).includes(c.id)), seriesId: sid, episode: eps.length + 1 });
        for (const c of p.newCharacters) await charStore.put(c);
        delete p.newCharacters;
        const prev = eps.sort((a, b) => (a.episode || 0) - (b.episode || 0)).pop();
        p.title = `${s.title} · Capítulo ${eps.length + 1}`; p.season = s.season || 1;
        p.synopsis = `${prev?.recap ? `Viene de: ${prev.recap}\n` : ''}${what}`;
        if (prev) { p.durationSec = prev.durationSec; p.aspect = prev.aspect; p.style = prev.style; }
        s.cast = [...new Set([...(s.cast || []), ...p.characters])];
        await seriesCol.put(s);
        for (const c of S.chars.filter((x) => p.characters.includes(x.id))) { c.episodes = [...new Set([...(c.episodes || []), `${s.title} T${p.season}E${p.episode}`])]; await charStore.put(c); }
        await saveProd(p, `Capítulo ${p.episode} creado (continuidad)`);
        await audit('serie.capitulo', { serie: sid, episode: p.episode });
        await refreshChars();
        openObra(p.id);
      };
      card.querySelector('[data-bible]').onclick = async () => {
        const s = await get();
        const eps = (await productions.all()).filter((p) => p.seriesId === sid).sort((a, b) => (a.episode || 0) - (b.episode || 0));
        const cast = S.chars.filter((c) => (s.cast || []).includes(c.id));
        const txt = `BIBLIA DE PRODUCCIÓN — ${s.title}\nYDC Entertainment Virales · Yoha Video\n\nPremisa: ${s.logline}\nMundo: ${s.bible?.world || '—'}\nTono y reglas: ${s.bible?.tone || '—'}\n\nPERSONAJES\n${cast.map((c) => `• ${c.name} (${c.role || '—'})\n  Apariencia: ${c.appearance}\n  Vestuario: ${c.wardrobe || '—'}\n  Personalidad: ${c.personality || '—'}\n  Historia: ${c.history || '—'}\n  Relaciones: ${(c.relations || []).map((r) => `${r.name || cast.find((x) => x.id === r.with)?.name || r.with} — ${r.type}`).join('; ') || '—'}\n  Voz: ${c.voice}${c.voiceEn ? ` / EN ${c.voiceEn}` : ''} · Semilla ${c.seed}\n  Episodios: ${(c.episodes || []).join(', ') || '—'}`).join('\n')}\n\nCAPÍTULOS\n${eps.map((e) => `Cap. ${e.episode} — ${e.title} [${STATUS[e.status]?.[0] || e.status}]\n  ${e.synopsis}\n  Resumen: ${e.recap || '—'}`).join('\n')}\n`;
        download(`biblia-${s.title.replace(/\W+/g, '-')}.txt`, txt, 'text/plain;charset=utf-8');
      };
    });
  }

  // ───────────── RADAR VIRAL ─────────────
  async function renderRadar() {
    $('tab-radar').innerHTML = `<div class="card"><h2>📡 Radar Viral IA</h2>
      <p class="muted small">Fuente autorizada: lista oficial «Más populares» de la API de YouTube, con tu canal conectado (1 unidad de cuota por consulta). Analiza patrones; no copia títulos ni material y no promete viralidad.</p>
      <div class="row wrap"><label>Canal<select id="rdCh">${channelOptions()}</select></label><label>País<select id="rdReg">${Object.entries(ins.REGIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Categoría<select id="rdCat">${Object.entries(ins.CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>Mínimo de vistas<select id="rdMin"><option value="0">Todas</option><option value="1000000">1 millón+</option><option value="5000000">5 millones+</option></select></label></div>
      <button id="rdGo" class="primary">Analizar tendencias</button><p id="rdStatus" class="status"></p></div><div id="rdOut"></div>`;
    $('rdGo').onclick = async () => {
      try {
        status('rdStatus', 'Consultando YouTube…');
        const vids = await ins.fetchTrending(needChannel('rdCh'), { region: $('rdReg').value, category: $('rdCat').value });
        S.radar = ins.analyzeTrends(vids, { minViews: Number($('rdMin').value) });
        if (!S.radar) return status('rdStatus', 'No hay videos con ese filtro.', 'err');
        status('rdStatus', `${S.radar.count} videos analizados (${ins.REGIONS[$('rdReg').value]}).`, 'ok');
        showRadar(S.radar);
      } catch (e) { status('rdStatus', e.message, 'err'); }
    };
    if (S.radar) showRadar(S.radar);
  }
  function showRadar(a) {
    $('rdOut').innerHTML = `<div class="grid2"><div class="card"><h3>Patrones</h3><table class="tbl">
      <tr><td>Vistas (mediana)</td><td>${ins.fmtNum(a.medianViews)}</td></tr><tr><td>Me gusta / vistas</td><td>${a.likeRate} %</td></tr><tr><td>Comentarios por 1.000 vistas</td><td>${a.commentRate}</td></tr>
      <tr><td>Largo del título (mediana)</td><td>${a.medianTitleLength} caracteres</td></tr><tr><td>Títulos con pregunta / números / emoji / MAYÚSCULAS</td><td>${a.titlePatterns.pregunta}% / ${a.titlePatterns.numeros}% / ${a.titlePatterns.emoji}% / ${a.titlePatterns.mayusculas}%</td></tr>
      <tr><td>Duración</td><td>${Object.entries(a.durationBuckets).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td></tr><tr><td>Hora de publicación más común</td><td>${a.bestUtcHour}:00 UTC (${(a.bestUtcHour + 20) % 24}:00 hora RD)</td></tr>
      <tr><td>Idiomas</td><td>${a.languages.slice(0, 4).map(([l, n]) => `${l}: ${n}`).join(' · ')}</td></tr></table>
      <h3>Más vistos</h3>${a.top.slice(0, 6).map((v) => `<div class="row small"><img src="${esc(v.thumb)}" alt="" width="80" style="border-radius:6px"><span>${esc(v.title)}<br><span class="muted">${esc(v.channel)} · ${ins.fmtNum(v.views)} vistas · ${Math.round(v.seconds / 60)} min</span></span></div>`).join('')}</div>
      <div class="card"><h3>Temas en tendencia → ideas originales</h3>${a.topKeywords.slice(0, 5).map((k) => `<details><summary>${esc(k.word)} <span class="muted small">(${ins.fmtNum(k.views)} vistas acumuladas)</span></summary>${ins.originalIdeas(k.word, a).map((i) => `<div class="idea"><b>${esc(i.title)}</b><button class="small primary" data-create="${esc(i.instruction)}">CREAR MI VERSIÓN ORIGINAL</button></div>`).join('')}<p class="muted small">Ideas originales basadas en el tema; no garantizan visualizaciones.</p></details>`).join('')}</div></div>`;
    $('rdOut').querySelectorAll('[data-create]').forEach((b) => (b.onclick = async () => { await renderDirector(b.dataset.create); hooks.showTab('director'); $('dirText').value = b.dataset.create; }));
  }

  // ───────────── PROTECCIÓN (Guardián digital) ─────────────
  async function renderGuardian() {
    const found = (await guardian.all()).sort((a, b) => b.similarity - a.similarity);
    const groups = ['nuevo', 'en_revision', 'reclamacion_preparada', 'descartado'];
    const label = { nuevo: 'Nuevo', en_revision: 'En revisión', reclamacion_preparada: 'Reclamación preparada (no enviada)', descartado: 'Descartado' };
    $('tab-guardian').innerHTML = `<div class="card"><h2>🛡 Protección de mis videos</h2>
      <p class="muted small">Panel silencioso: no envía avisos ni reclamaciones. Busca en YouTube posibles reutilizaciones de tus videos (cada búsqueda gasta 100 unidades de tu cuota diaria gratuita). No puede encontrar todas las copias de internet; la similitud es un indicio, revisa siempre los videos.</p>
      <div class="row wrap"><label>Canal<select id="gdCh">${channelOptions()}</select></label><button id="gdLoad" class="secondary">Cargar mis videos</button></div>
      <div id="gdMine"></div><p id="gdStatus" class="status"></p></div>
      <div class="card"><h2>Posibles coincidencias (${found.length})</h2>
      ${found.length ? `<table class="tbl"><tr><th>Original</th><th>Posible coincidencia</th><th>Plataforma / cuenta</th><th>Similitud</th><th>Estado</th><th></th></tr>${found.map((m) => `<tr><td>${esc(m.originalTitle)}</td><td><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a></td><td>${esc(m.platform)} · ${esc(m.account)}</td><td>${Math.round(m.similarity * 100)} %<br><small class="muted">título ${m.evidence.titleSim} · miniatura ${m.evidence.thumbSim ?? 'n/d'}</small></td>
        <td><select data-st="${esc(m.id)}">${groups.map((g) => `<option value="${g}" ${g === m.status ? 'selected' : ''}>${label[g]}</option>`).join('')}</select></td><td><button class="small secondary" data-claim="${esc(m.id)}">Preparar reclamación</button></td></tr>`).join('')}</table>` : '<p class="muted small">Sin resultados guardados.</p>'}
      <pre id="gdClaim" class="claim" hidden></pre></div>`;
    $('gdLoad').onclick = async () => {
      try {
        const ch = needChannel('gdCh');
        status('gdStatus', 'Cargando…');
        const { videos } = await ins.myVideos(ch, 25);
        $('gdMine').innerHTML = videos.map((v) => `<div class="row small"><img src="${esc(v.thumb)}" width="80" alt="" style="border-radius:6px"><span style="flex:1">${esc(v.title)}</span><button class="small secondary" data-scan="${v.id}">Buscar posibles copias</button></div>`).join('') || '<p class="muted">El canal no tiene videos.</p>';
        status('gdStatus', `${videos.length} videos.`, 'ok');
        $('gdMine').querySelectorAll('[data-scan]').forEach((b) => (b.onclick = async () => {
          try {
            b.disabled = true; status('gdStatus', 'Buscando (100 unidades de cuota)…');
            const v = videos.find((x) => x.id === b.dataset.scan);
            const res = await ins.scanForCopies(ch, v, v.channelId);
            for (const m of res) { const old = await guardian.get(m.id); await guardian.put(old ? { ...m, status: old.status } : m); }
            await audit('guardian.busqueda', { video: v.id, resultados: res.length });
            status('gdStatus', `${res.length} posible(s) coincidencia(s) guardada(s) en silencio.`, 'ok');
            renderGuardian();
          } catch (e) { status('gdStatus', e.message, 'err'); b.disabled = false; }
        }));
      } catch (e) { status('gdStatus', e.message, 'err'); }
    };
    $('tab-guardian').querySelectorAll('[data-st]').forEach((s) => (s.onchange = async () => { const m = await guardian.get(s.dataset.st); m.status = s.value; await guardian.put(m); await audit('guardian.estado', { id: m.id, status: m.status }); }));
    $('tab-guardian').querySelectorAll('[data-claim]').forEach((b) => (b.onclick = async () => {
      const m = await guardian.get(b.dataset.claim);
      const el = $('gdClaim'); el.hidden = false; el.textContent = ins.claimDraft(m);
      m.status = 'reclamacion_preparada'; await guardian.put(m); await audit('guardian.borrador_reclamacion', { id: m.id });
    }));
  }

  // ───────────── MARKETING ─────────────
  async function renderMarketing() {
    const ps = await productions.all();
    $('tab-marketing').innerHTML = `<div class="card"><h2>📣 Yoha Marketing Global IA</h2>
      <p class="muted small">Campañas orgánicas, sin publicidad pagada. Los textos se preparan aquí y tú decides si los publicas.</p>
      <label>Producción<select id="mkProd">${ps.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('') || '<option value="">— crea una producción —</option>'}</select></label>
      <button id="mkGo" class="primary">Preparar campaña</button><div id="mkOut"></div></div>
      <div class="grid2"><div class="card"><h2>🎞 Tráiler / Short promocional</h2><p class="muted small">Toma los mejores segundos de la línea de tiempo del Editor (sin regenerar nada) y crea un video vertical con «MUY PRONTO».</p>
        <div class="row wrap"><label>Duración<select id="mkTrSec"><option value="15">15 s</option><option value="20" selected>20 s</option><option value="30">30 s</option></select></label><label>Formato<select id="mkTrAsp"><option value="9:16">Vertical 9:16</option><option value="16:9">Horizontal 16:9</option></select></label></div>
        <button id="mkTrailer" class="secondary">Crear tráiler</button><progress id="mkTrProg" max="100" value="0" hidden></progress><p id="mkTrStatus" class="status"></p><video id="mkTrVideo" controls playsinline hidden style="width:100%;border-radius:12px"></video><a id="mkTrDl" class="btn secondary" hidden download="ydc-trailer.mp4">⬇ Descargar tráiler</a></div>
      <div class="card"><h2>🖼 Miniatura 1280×720</h2><p class="muted small">Usa un fotograma del último video exportado, tu título y el emblema YDC.</p>
        <label>Texto grande<input id="mkThTitle" maxlength="40" placeholder="¡ME TRAICIONÓ!"></label><label>Etiqueta<input id="mkThTag" maxlength="20" value="CAPÍTULO 1"></label><label>Segundo del video<input id="mkThSec" type="number" min="0" step="0.5" value="2"></label>
        <button id="mkThumb" class="secondary">Crear miniatura</button><canvas id="mkCanvas" width="1280" height="720" style="width:100%;border-radius:12px;margin-top:8px" hidden></canvas><a id="mkThDl" class="btn secondary" hidden download="ydc-miniatura.jpg">⬇ Descargar miniatura</a><p id="mkThStatus" class="status"></p></div></div>
      <div class="card"><h2>Herramientas gratuitas</h2><table class="tbl"><tr><th>Herramienta</th><th>Para qué</th><th>Costo</th></tr>${mk.FREE_TOOLS.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.use)}</td><td>${esc(t.cost)}</td></tr>`).join('')}</table><p class="muted small">Condiciones y límites cambian: revísalos antes de usarlos. Nunca uses seguidores o vistas compradas.</p></div>`;
    $('mkGo').onclick = async () => {
      const p = await productions.get($('mkProd').value); if (!p) return;
      const c = mk.campaignCopy(p, { episode: p.episode });
      $('mkOut').innerHTML = Object.entries(c).map(([k, v]) => `<div class="scene"><h3>${mk.PLATFORMS[k]}</h3>${Object.entries(v).map(([f, txt]) => `<label>${f}<textarea rows="${f === 'description' || f === 'post' || f === 'caption' ? 4 : 1}">${esc(Array.isArray(txt) ? txt.join(', ') : txt)}</textarea></label>`).join('')}<button class="small secondary" data-copy>Copiar</button></div>`).join('') + `<div class="row wrap"><button id="mkCal" class="secondary">Proponer calendario (4 semanas)</button></div>`;
      $('mkOut').querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => navigator.clipboard?.writeText([...b.parentElement.querySelectorAll('textarea')].map((t) => t.value).join('\n\n')).then(() => toast('Copiado'))));
      $('mkCal').onclick = async () => { for (const e of mk.proposeCalendar({ productionId: p.id, title: p.title })) await calendar.put(e); toast('Calendario propuesto (pendiente de tu aprobación).'); hooks.showTab('calendario'); };
    };
    $('mkTrailer').onclick = async () => {
      try {
        const st = hooks.editorState;
        if (!st.items.length) throw new Error('Primero arma la línea de tiempo en el Editor.');
        const items = mk.trailerItems(st.items, { seconds: Number($('mkTrSec').value) });
        for (const it of items) { it.file = await hooks.getFile(it.fileId); if (!it.file) throw new Error('Falta un archivo del Editor.'); }
        $('mkTrProg').hidden = false;
        const res = await exportVideo({ items, aspect: $('mkTrAsp').value, short: 540, fill: 'blur', clipVol: 0.6, music: await hooks.getFile(st.musicId), musicVol: 0.5, onProgress: (v) => ($('mkTrProg').value = v), onStatus: (m) => status('mkTrStatus', m) });
        const url = URL.createObjectURL(res.blob);
        $('mkTrVideo').src = url; $('mkTrVideo').hidden = false; $('mkTrDl').href = url; $('mkTrDl').hidden = false;
        S.trailer = res;
        status('mkTrStatus', `Tráiler listo: ${res.width}×${res.height}, ${res.duration.toFixed(1)} s.`, 'ok');
      } catch (e) { status('mkTrStatus', e.message, 'err'); }
    };
    $('mkThumb').onclick = async () => {
      try {
        const exp = hooks.editorState.lastExport;
        if (!exp) throw new Error('Exporta un video en el Editor primero.');
        const blob = await makeThumbnail(exp.url, Number($('mkThSec').value) || 0, $('mkThTitle').value, $('mkThTag').value);
        $('mkThDl').href = URL.createObjectURL(blob); $('mkThDl').hidden = false;
        S.thumbnail = blob;
        status('mkThStatus', `Miniatura lista (${Math.round(blob.size / 1024)} KB; YouTube admite hasta 2 MB).`, 'ok');
      } catch (e) { status('mkThStatus', e.message, 'err'); }
    };
  }
  async function makeThumbnail(videoUrl, sec, title, label) {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = videoUrl;
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('El navegador no pudo leer el video para la miniatura.')); });
    v.currentTime = Math.min(sec, Math.max(0, v.duration - 0.1)); await new Promise((r) => (v.onseeked = r));
    const c = $('mkCanvas'); c.hidden = false; const ctx = c.getContext('2d');
    const s = Math.max(1280 / v.videoWidth, 720 / v.videoHeight);
    ctx.drawImage(v, (1280 - v.videoWidth * s) / 2, (720 - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
    const g = ctx.createLinearGradient(0, 0, 1280, 0); g.addColorStop(0, 'rgba(5,7,15,.9)'); g.addColorStop(0.6, 'rgba(5,7,15,.25)'); g.addColorStop(1, 'rgba(5,7,15,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
    ctx.font = '800 96px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 24; ctx.textBaseline = 'top';
    const words = (title || '').toUpperCase().split(' '); let line = '', y = 170; const lines = [];
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > 700 && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line);
    lines.slice(0, 3).forEach((l, i) => { ctx.fillStyle = i === lines.length - 1 ? '#E8B54A' : '#fff'; ctx.fillText(l, 60, y); y += 104; });
    ctx.shadowBlur = 0;
    if (label) { ctx.font = '800 36px system-ui, sans-serif'; const w = ctx.measureText(label).width + 44; ctx.fillStyle = '#E8B54A'; ctx.fillRect(60, 620, w, 60); ctx.fillStyle = '#070B18'; ctx.fillText(label, 82, 632); }
    const logo = new Image(); logo.src = './brand/ydc-logo.png'; await logo.decode().catch(() => {}); if (logo.naturalWidth) ctx.drawImage(logo, 1120, 30, 130, 130);
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  }

  // ───────────── REVENUE ─────────────
  async function renderRevenue() {
    const man = (await kv.get('revenueManual').catch(() => null)) || { subs: 0, watchHours12m: 0, shortsViews90d: 0, uploads90d: 0 };
    const draw = (d, src) => {
      const pr = ins.yppProgress(d);
      const bar = (pct, lbl) => `<div class="bar"><span style="width:${pct}%"></span></div><small class="muted">${lbl}</small>`;
      return `<div class="grid2"><div class="card"><h3>${ins.YPP.full.label}</h3>${pr.full.eligible ? '<p class="status ok">Cumples los requisitos (confírmalo en YouTube Studio).</p>' : ''}
        ${bar(pr.full.subs, `Suscriptores: ${ins.fmtNum(d.subs)} / ${ins.fmtNum(1000)}`)}${bar(pr.full.hours, `Horas de reproducción (12 meses): ${ins.fmtNum(d.watchHours12m)} / ${ins.fmtNum(4000)}`)}<p class="muted small">o</p>${bar(pr.full.shorts, `Vistas de Shorts (90 días): ${ins.fmtNum(d.shortsViews90d)} / 10 M`)}</div>
        <div class="card"><h3>${ins.YPP.fan.label}</h3>${bar(pr.fan.subs, `Suscriptores: ${ins.fmtNum(d.subs)} / 500`)}${bar(pr.fan.uploads, `Videos públicos (90 días): ${d.uploads90d} / 3`)}${bar(pr.fan.hours, `Horas (12 meses): ${ins.fmtNum(d.watchHours12m)} / ${ins.fmtNum(3000)}`)}<p class="muted small">o</p>${bar(pr.fan.shorts, `Vistas de Shorts: ${ins.fmtNum(d.shortsViews90d)} / 3 M`)}</div></div>
        <p class="muted small">Fuente de los datos: ${src}. ${esc(ins.YPP.note2027)}</p>`;
    };
    $('tab-revenue').innerHTML = `<div class="card"><h2>📈 Yoha Revenue IA</h2><p class="muted small">Datos reales solo con tu canal conectado (y «incluir analíticas» para horas e ingresos). Nunca se prometen ingresos.</p>
      <div class="row wrap"><label>Canal<select id="rvCh">${channelOptions()}</select></label><button id="rvGo" class="primary">Cargar datos del canal</button></div><p id="rvStatus" class="status"></p>
      <details><summary>Introducir datos a mano (de YouTube Studio)</summary><div class="row wrap"><label>Suscriptores<input id="rvSubs" type="number" value="${man.subs}"></label><label>Horas 12 meses<input id="rvHours" type="number" value="${man.watchHours12m}"></label><label>Vistas Shorts 90 días<input id="rvShorts" type="number" value="${man.shortsViews90d}"></label><label>Videos públicos 90 días<input id="rvUp" type="number" value="${man.uploads90d}"></label></div><button id="rvManual" class="secondary small">Calcular</button></details></div>
      <div id="rvOut">${draw(man, 'datos introducidos a mano')}</div>`;
    $('rvManual').onclick = async () => { const d = { subs: +$('rvSubs').value || 0, watchHours12m: +$('rvHours').value || 0, shortsViews90d: +$('rvShorts').value || 0, uploads90d: +$('rvUp').value || 0 }; await kv.set('revenueManual', d); $('rvOut').innerHTML = draw(d, 'datos introducidos a mano'); };
    $('rvGo').onclick = async () => {
      try {
        status('rvStatus', 'Consultando YouTube…');
        const r = await ins.channelReport(needChannel('rvCh'));
        S.report = r;
        const d = { subs: r.subs, watchHours12m: r.analytics?.watchHours12m ?? man.watchHours12m, shortsViews90d: r.analytics?.shortsViews90d ?? man.shortsViews90d, uploads90d: r.uploads90d };
        const risks = ins.monetizationRisks({ videos: r.videos, productions: await productions.all() });
        $('rvOut').innerHTML = draw(d, r.analytics ? 'YouTube Data API + Analytics API (oficial)' : 'YouTube Data API (oficial); horas a mano') +
          `<div class="card"><h3>${esc(r.title)}</h3><p>${ins.fmtNum(r.subs)} suscriptores${r.hiddenSubs ? ' (ocultos)' : ''} · ${ins.fmtNum(r.views)} vistas totales · ${r.videoCount} videos</p>
          ${r.revenue ? `<p>Ingresos estimados por YouTube (30 días): <b>${ins.money(r.revenue.last30dUSD)}</b> <span class="muted small">(${esc(r.revenue.kind)})</span></p>` : '<p class="muted small">Ingresos: no disponibles (el canal no está monetizado o no autorizaste las analíticas).</p>'}
          <h3>Rendimiento por video</h3><table class="tbl"><tr><th>Video</th><th>Vistas</th><th>Me gusta</th><th>Comentarios</th></tr>${r.videos.slice(0, 20).map((v) => `<tr><td>${esc(v.title)}</td><td>${ins.fmtNum(v.views)}</td><td>${ins.fmtNum(v.likes)}</td><td>${ins.fmtNum(v.comments)}</td></tr>`).join('')}</table>
          <h3>Riesgos de monetización</h3><ul>${risks.map((x) => `<li class="small">${esc(x)}</li>`).join('')}</ul>
          <h3>Patrocinios y licencias</h3><p class="small muted">Creator Partnerships de YouTube (antes BrandConnect) se habilita según elegibilidad. Para licenciar tus novelas, guarda contratos y derechos de cada personaje, voz y música. Yoha no negocia ni firma por ti.</p>
          ${r.errors.length ? `<p class="status err small">${r.errors.map(esc).join(' · ')}</p>` : ''}</div>`;
        status('rvStatus', 'Datos cargados.', 'ok');
      } catch (e) { status('rvStatus', e.message, 'err'); }
    };
  }

  // ───────────── YOHA BANK (informativo) ─────────────
  async function renderBank() {
    const b = (await kv.get('bank').catch(() => null)) || { rate: '', goalUSD: 100, rpm: 1.5, views: 100000, confirmed: [], payments: [] };
    const save = () => kv.set('bank', b);
    const draw = () => {
      const sim = ins.simulate({ views: b.views, rpmUSD: b.rpm, rateDOP: Number(b.rate) });
      const conf = b.confirmed.reduce((n, x) => n + x.usd, 0), paid = b.payments.reduce((n, x) => n + x.usd, 0);
      const est = S.report?.revenue?.last30dUSD ?? null;
      const rd = (usd) => (Number(b.rate) > 0 && usd !== null ? ins.money(usd * Number(b.rate), 'DOP') : 'indica la tasa');
      const month = new Date().toISOString().slice(0, 7);
      const monthConf = b.confirmed.filter((x) => x.month === month).reduce((n, x) => n + x.usd, 0);
      $('bkOut').innerHTML = `<div class="bank">
        <div class="bcard real"><small>MIS GANANCIAS · pagos recibidos (reales)</small><b>${ins.money(paid)}</b><span>${rd(paid)}</span></div>
        <div class="bcard"><small>INGRESOS CONFIRMADOS (según tu informe de AdSense/YouTube)</small><b>${ins.money(conf)}</b><span>${rd(conf)}</span></div>
        <div class="bcard"><small>INGRESOS ESTIMADOS por YouTube (30 días)</small><b>${est === null ? '—' : ins.money(est)}</b><span>${est === null ? 'carga Revenue con analíticas' : rd(est)}</span></div>
        <div class="bcard"><small>MIS VISUALIZACIONES</small><b>${S.report ? ins.fmtNum(S.report.views) : '—'}</b><span>${S.report ? `${ins.fmtNum(S.report.subs)} suscriptores` : 'carga Revenue'}</span></div>
        <div class="bcard sim"><small>SIMULACIÓN (no es dinero real)</small><b>${ins.money(sim.usd)}</b><span>${sim.dop === null ? 'indica la tasa' : ins.money(sim.dop, 'DOP')}</span></div>
        <div class="bcard"><small>MI META MENSUAL</small><b>${ins.money(monthConf)} / ${ins.money(b.goalUSD)}</b><div class="bar"><span style="width:${Math.min(100, (monthConf / (b.goalUSD || 1)) * 100)}%"></span></div><span>${ins.viewsForGoal({ goalUSD: b.goalUSD, rpmUSD: b.rpm }) ? `≈ ${ins.fmtNum(ins.viewsForGoal({ goalUSD: b.goalUSD, rpmUSD: b.rpm }))} vistas monetizadas con RPM ${b.rpm}` : ''}</span></div></div>
        <h3>Pagos recibidos</h3>${b.payments.map((x, i) => `<div class="row small"><span>${esc(x.date)} · ${ins.money(x.usd)} · ${esc(x.ref)}</span><button class="small ghost" data-delp="${i}">✕</button></div>`).join('') || '<p class="muted small">Sin registros.</p>'}
        <h3>Ingresos confirmados por mes</h3>${b.confirmed.map((x, i) => `<div class="row small"><span>${esc(x.month)} · ${ins.money(x.usd)} · ${esc(x.source)}</span><button class="small ghost" data-delc="${i}">✕</button></div>`).join('') || '<p class="muted small">Sin registros.</p>'}`;
      $('bkOut').querySelectorAll('[data-delp]').forEach((x) => (x.onclick = () => { b.payments.splice(+x.dataset.delp, 1); save(); draw(); }));
      $('bkOut').querySelectorAll('[data-delc]').forEach((x) => (x.onclick = () => { b.confirmed.splice(+x.dataset.delc, 1); save(); draw(); }));
    };
    $('tab-bank').innerHTML = `<div class="card"><h2>🏦 Yoha Bank</h2><p class="muted small">Pantalla informativa. Yoha Bank no guarda dinero, no reemplaza AdSense y no hace transferencias. Separa simulaciones, estimados de YouTube, ingresos confirmados y pagos reales.</p>
      <div class="row wrap"><label>Tasa RD$ por US$ <input id="bkRate" type="number" step="0.01" value="${esc(b.rate)}" placeholder="consúltala en bancentral.gov.do"></label><label>Meta mensual (US$)<input id="bkGoal" type="number" value="${b.goalUSD}"></label></div>
      <h3>Simulador de ingresos</h3><div class="row wrap"><label>Visualizaciones<input id="bkViews" type="number" value="${b.views}"></label><label>RPM estimado (US$ por 1.000 vistas)<input id="bkRpm" type="number" step="0.1" value="${b.rpm}"></label></div>
      <p class="muted small">El RPM varía por país, tema y época; usa el de tu YouTube Studio cuando lo tengas.</p>
      <details><summary>Registrar ingreso confirmado o pago recibido</summary><div class="row wrap"><label>Mes<input id="bkCm" type="month"></label><label>US$<input id="bkCu" type="number" step="0.01"></label><button id="bkCadd" class="secondary small">+ Confirmado</button></div>
      <div class="row wrap"><label>Fecha de pago<input id="bkPd" type="date"></label><label>US$<input id="bkPu" type="number" step="0.01"></label><label>Referencia<input id="bkPr" placeholder="AdSense nov."></label><button id="bkPadd" class="secondary small">+ Pago</button></div></details>
      <div id="bkOut"></div></div>`;
    [['bkRate', 'rate'], ['bkGoal', 'goalUSD'], ['bkViews', 'views'], ['bkRpm', 'rpm']].forEach(([id, k]) => ($(id).oninput = () => { b[k] = k === 'rate' ? $(id).value : Number($(id).value) || 0; save(); draw(); }));
    $('bkCadd').onclick = () => { const usd = Number($('bkCu').value); if (!$('bkCm').value || !(usd > 0)) return toast('Indica mes y monto.'); b.confirmed.push({ month: $('bkCm').value, usd, source: 'manual' }); save(); draw(); };
    $('bkPadd').onclick = () => { const usd = Number($('bkPu').value); if (!$('bkPd').value || !(usd > 0)) return toast('Indica fecha y monto.'); b.payments.push({ date: $('bkPd').value, usd, ref: $('bkPr').value.slice(0, 60) }); save(); draw(); };
    draw();
  }

  // ───────────── CALENDARIO ─────────────
  async function renderCalendario() {
    const items = (await calendar.all()).sort((a, b) => a.date.localeCompare(b.date));
    const ps = await productions.all();
    $('tab-calendario').innerHTML = `<div class="card"><h2>🗓 Calendario editorial</h2><p class="muted small">Plan de publicaciones. Nada se publica automáticamente: cada fecha requiere tu aprobación y la publicación se hace desde «Pendientes».</p>
      <div class="row wrap"><label>Fecha<input id="caDate" type="datetime-local"></label><label>Plataforma<select id="caPl">${Object.entries(mk.PLATFORMS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>Producción<select id="caProd"><option value="">—</option>${ps.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select></label></div>
      <label>Nota<input id="caText" maxlength="200"></label><button id="caAdd" class="secondary">+ Agregar</button></div>
      <div class="card">${items.length ? `<table class="tbl"><tr><th>Fecha</th><th>Plataforma</th><th>Contenido</th><th>Estado</th><th></th></tr>${items.map((e) => `<tr><td>${dt(e.date)}</td><td>${mk.PLATFORMS[e.platform] || e.platform}</td><td>${esc(e.text)}<br><small class="muted">${esc(ps.find((p) => p.id === e.productionId)?.title || '')}</small></td><td><select data-cst="${e.id}">${['propuesto', 'aprobado', 'publicado', 'cancelado'].map((s) => `<option ${s === e.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td><button class="small ghost" data-cdel="${e.id}">✕</button></td></tr>`).join('')}</table>` : '<p class="muted">Sin publicaciones planificadas. Puedes proponerlas desde Marketing.</p>'}</div>`;
    $('caAdd').onclick = async () => { if (!$('caDate').value) return toast('Elige la fecha.'); await calendar.put({ id: uid(), date: new Date($('caDate').value).toISOString(), platform: $('caPl').value, productionId: $('caProd').value || null, text: $('caText').value || 'Publicación', status: 'propuesto' }); renderCalendario(); };
    $('tab-calendario').querySelectorAll('[data-cst]').forEach((s) => (s.onchange = async () => { const e = await calendar.get(s.dataset.cst); e.status = s.value; await calendar.put(e); await audit('calendario.estado', { id: e.id, status: e.status }); }));
    $('tab-calendario').querySelectorAll('[data-cdel]').forEach((b) => (b.onclick = async () => { await calendar.del(b.dataset.cdel); renderCalendario(); }));
  }

  // ───────────── REVISIÓN / APROBACIÓN ─────────────
  async function sendToReview(exp, prodId = null) {
    if (!exp?.blob) { toast('Primero exporta el video en el Editor.'); hooks.showTab('editor'); return; }
    const ps = (await productions.all()).filter((p) => p.status !== 'publicado');
    let id = prodId;
    if (!id) {
      const opts = ps.map((p, i) => `${i + 1}. ${p.title}`).join('\n');
      const ans = prompt(`¿A qué producción pertenece este video?\n${opts}\n\nEscribe el número, o deja vacío para crear «Video del editor».`, ps.length ? '1' : '');
      if (ans === null) return;
      const n = Number(ans);
      if (n >= 1 && n <= ps.length) id = ps[n - 1].id;
      else { const p = buildProduction('Video independiente de 1 minuto'); delete p.newCharacters; p.characters = []; p.title = `Video del editor ${new Date().toLocaleDateString('es-DO')}`; p.scenes = []; await saveProd(p, 'Creada desde el Editor'); id = p.id; }
    }
    const p = await productions.get(id);
    const hash = await sha256Blob(exp.blob);
    const fileId = `video-${p.id}-${hash.slice(0, 12)}`;
    await fileStore.set(fileId, exp.blob);
    Object.assign(p, { videoFileId: fileId, videoHash: hash, videoInfo: { width: exp.width, height: exp.height, duration: exp.duration, size: exp.blob.size }, status: 'en_revision', stage: 'revision' });
    if (exp.srt) p.srt = exp.srt;
    await saveProd(p, 'Enviada a revisión');
    await audit('revision.enviada', { id: p.id, hash });
    toast('Enviado a «Pendientes de aprobación».');
    hooks.showTab('aprobaciones');
  }

  async function renderAprobaciones() {
    const ps = (await productions.all()).filter((p) => ['en_revision', 'aprobado', 'cambios_solicitados'].includes(p.status));
    $('tab-aprobaciones').innerHTML = `<div class="card"><h2>✅ Pendientes de aprobación</h2><p class="muted small">CREAR → REVISAR → APROBAR → PUBLICAR. La aprobación queda registrada con la huella (SHA-256) del archivo exacto: si el video cambia, hay que aprobarlo de nuevo.</p></div>
      ${ps.map((p) => `<div class="card" data-ap="${p.id}"><div class="row wrap" style="justify-content:space-between"><h2 style="margin:0">${esc(p.title)}</h2>${tag(p.status)}</div>
        <video data-vid controls playsinline style="width:100%;max-height:50vh;border-radius:12px;background:#000"></video>
        <p class="muted small">${p.videoInfo ? `${p.videoInfo.width}×${p.videoInfo.height} · ${Math.round(p.videoInfo.duration)} s · ${(p.videoInfo.size / 1048576).toFixed(1)} MB · huella ${p.videoHash.slice(0, 12)}…` : 'Sin video'}</p>
        ${(() => { const l = checkProduction(p); return l.length ? `<p class="status ${isBlocked(l, p.allowStrongLanguage) ? 'err' : ''}">Lenguaje: ${l.map((f) => `«${esc(f.word)}»`).join(', ')}${isBlocked(l, p.allowStrongLanguage) ? ' — bloquea la aprobación' : ''}</p>` : ''; })()}
        <label>Nota (opcional)<input data-note maxlength="300" placeholder="Qué cambiar o por qué"></label>
        <div class="row wrap"><button class="primary" data-act="aprobado" disabled>APROBAR Y PUBLICAR</button><button class="secondary" data-act="cambios_solicitados" disabled>SOLICITAR MODIFICACIONES</button><button class="danger" data-act="rechazado" disabled>RECHAZAR</button></div>
        <details><summary>Historial de aprobaciones</summary>${(p.approvals || []).map((a) => `<p class="small">${dt(a.at)} · <b>${esc(a.action)}</b> ${a.note ? `· ${esc(a.note)}` : ''} · ${a.videoHash?.slice(0, 10) || ''}</p>`).join('') || '<p class="muted small">—</p>'}</details></div>`).join('') || '<div class="card"><p class="empty">Nada pendiente. Exporta un video en el Editor y pulsa «Enviar a revisión».</p></div>'}`;
    for (const card of $('tab-aprobaciones').querySelectorAll('[data-ap]')) {
      const p = await productions.get(card.dataset.ap);
      const blob = p.videoFileId ? await fileStore.get(p.videoFileId) : null;
      if (blob) card.querySelector('[data-vid]').src = URL.createObjectURL(blob);
      card.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
        const action = b.dataset.act, note = card.querySelector('[data-note]').value.trim();
        if (!blob) return toast('No se encuentra el video en este dispositivo.');
        if (action === 'aprobado' && isBlocked(checkProduction(p), p.allowStrongLanguage)) return toast('Corrige el lenguaje antes de aprobar.');
        if (action === 'aprobado' && (await publishedHashes()).includes(p.videoHash)) return toast('Este mismo video ya fue publicado.');
        if (action !== 'aprobado' && !note && action === 'cambios_solicitados') return toast('Escribe qué modificaciones quieres.');
        const hash = await sha256Blob(blob);
        if (hash !== p.videoHash) return toast('El archivo no coincide con el enviado a revisión.');
        const entry = { id: uid(), at: new Date().toISOString(), action, note, videoHash: hash };
        p.approvals = [...(p.approvals || []), entry];
        p.status = action;
        await saveProd(p, `Revisión: ${action}`);
        await audit(`aprobacion.${action}`, { id: p.id, hash, note });
        if (action === 'aprobado') await startPublish(p, blob, entry);
        else renderAprobaciones();
      }));
      card.querySelectorAll('[data-act]').forEach((b) => (b.disabled = false));  // activos solo cuando ya responden
      card.dataset.ready = '1';
    }
  }
  async function startPublish(p, blob, approval) {
    S.publishContext = { productionId: p.id, title: p.title, blob, hash: p.videoHash, approval };
    const c = mk.campaignCopy(p, { episode: p.episode });
    hooks.showTab('youtube');
    $('ytTitle').value = c.youtube.title; $('ytDesc').value = c.youtube.description; $('ytTags').value = c.youtube.tags.join(', ');
    $('ytPrivacy').value = 'private'; $('ytSynthetic').checked = true; $('ytConfirm').checked = false;
    $('ytProdState').textContent = `Publicando «${p.title}» (aprobado ${dt(approval.at)}). Privacidad inicial: privado — cámbiala si quieres.`;
    hooks.refreshYoutube();
  }
  async function publishedHashes() { return (await published.all()).map((x) => x.hash); }
  async function recordPublished(ctx, r, channelId, meta) {
    const p = await productions.get(ctx.productionId);
    await published.put({ id: r.id, productionId: ctx.productionId, title: meta.title, hash: ctx.hash, channelId, channelTitle: yt.savedChannels().find((c) => c.id === channelId)?.title, privacy: r.status?.privacyStatus, publishAt: meta.publishAt, at: new Date().toISOString() });
    if (p) { p.status = 'publicado'; p.youtubeId = r.id; await saveProd(p, 'Publicada en YouTube'); }
    await audit('youtube.publicado', { videoId: r.id, productionId: ctx.productionId, hash: ctx.hash, channelId });
    if (S.thumbnail) yt.setThumbnail(channelId, r.id, S.thumbnail).then(() => toast('Miniatura aplicada.')).catch((e) => toast(`Miniatura: ${e.message}`));
    S.publishContext = null;
  }

  // ───────────── PUBLICADOS ─────────────
  async function renderPublicados() {
    const list = (await published.all()).sort((a, b) => b.at.localeCompare(a.at));
    $('tab-publicados').innerHTML = `<div class="card"><h2>▶️ Videos publicados</h2>${list.length ? `<table class="tbl"><tr><th>Video</th><th>Canal</th><th>Publicado</th><th>Estadísticas</th></tr>${list.map((v) => `<tr><td><a href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a><br><small class="muted">${esc(v.privacy)}${v.publishAt ? ` · programado ${dt(v.publishAt)}` : ''}</small></td><td>${esc(v.channelTitle)}</td><td>${dt(v.at)}</td><td data-stats="${esc(v.id)}" data-ch="${esc(v.channelId)}"><button class="small secondary">Ver</button></td></tr>`).join('')}</table>` : '<p class="muted">Todavía no se ha publicado ningún video desde Yoha Video.</p>'}</div>`;
    $('tab-publicados').querySelectorAll('[data-stats]').forEach((td) => (td.querySelector('button').onclick = async () => {
      try { const r = await yt.read(td.dataset.ch, `videos?part=statistics,status&id=${td.dataset.stats}`); const s = r.items?.[0]?.statistics || {}; td.textContent = `${ins.fmtNum(+s.viewCount)} vistas · ${ins.fmtNum(+s.likeCount)} me gusta · ${ins.fmtNum(+s.commentCount)} comentarios · ${r.items?.[0]?.status?.privacyStatus || ''}`; }
      catch (e) { td.textContent = e.message; }
    }));
  }

  // ───────────── CONFIGURACIÓN ─────────────
  async function renderConfig() {
    const est = await storageEstimate();
    const prc = await pr.getConfig();
    const log = (await auditCol.all()).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
    const brand = [['ydc-logo.png', 'Logotipo (transparente)'], ['ydc-perfil-800.png', 'Foto de perfil 800×800'], ['ydc-portada-2560x1440.png', 'Portada 2560×1440'], ['ydc-portada-zona-segura.png', 'Guía de zona segura'], ['ydc-marca-agua-150.png', 'Marca de agua 150×150'], ['ydc-plantilla-miniatura.png', 'Plantilla de miniatura'], ['ydc-intro-5s-1080p.mp4', 'Intro animada 5 s'], ['ydc-cierre-20s-1080p.mp4', 'Cierre / pantalla final 20 s']];
    $('tab-config').innerHTML = `<div class="grid2"><div class="card"><h2>▶️ Canales de YouTube</h2><p class="muted small">OAuth oficial de Google: Yoha nunca pide ni guarda tu contraseña. Cada canal se conecta por separado y sus datos no se mezclan.</p><button id="cfYt" class="primary">Configurar y conectar canales</button></div>
      <div class="card"><h2>🔔 Notificaciones al iPhone</h2>
        <p class="small"><b>1. Aviso de la app</b> (al terminar una exportación en este dispositivo). En iPhone: instala Yoha Video en la pantalla de inicio (iOS 16.4+), ábrela desde allí y activa.</p><button id="cfLocal" class="secondary">Activar avisos de la app</button>
        <p class="small" style="margin-top:12px"><b>2. Avisos del notebook con la app cerrada</b> — gratis con la app <b>ntfy</b> (App Store), sin cuenta. Suscríbete a este tema:</p>
        <div class="row"><input id="cfTopic" value="${esc(nt.getTopic())}" placeholder="sin tema"><button id="cfNew" class="secondary small">Generar</button></div>
        <div class="row wrap"><button id="cfCopy" class="ghost small">Copiar tema</button><button id="cfTest" class="secondary small">Enviar prueba</button></div>
        <p class="muted small">El tema funciona como contraseña: no lo compartas. Solo se envían: producción lista, error crítico y producción detenida. Nunca avisos por copias.</p><p id="cfStatus" class="status"></p></div></div>
      <div class="card"><h2>🎬 Productora IA (Kaggle)</h2>
        <p class="small">Conecta tu repositorio <b>privado</b> para producir novelas en la GPU gratuita de Kaggle desde la app. El token se guarda solo en este dispositivo (no va en respaldos ni en el código).</p>
        <div class="row wrap"><label>Repositorio privado<input id="cfPrRepo" value="${esc(prc.repo)}"></label><label>Token de GitHub<input id="cfPrTok" type="password" autocomplete="off" placeholder="${prc.token ? '•••••• guardado (escribe para cambiarlo)' : 'github_pat_…'}"></label></div>
        <div class="row wrap"><button id="cfPrSave" class="primary">Guardar y probar conexión</button><button id="cfPrDel" class="ghost small">Olvidar token</button></div>
        <p id="cfPrStatus" class="status ${prc.token ? 'ok' : ''}">${prc.token ? 'Token guardado en este dispositivo.' : 'Sin conectar.'}</p>
        <details><summary class="small">Cómo crear el token (2 minutos)</summary><ol class="small">
          <li>github.com → tu foto → <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</b>.</li>
          <li>Nombre: «Yoha Productora». Vencimiento: 90 días. <b>Repository access → Only select repositories →</b> ${esc(prc.repo.split('/')[1] || 'tu repositorio')}.</li>
          <li><b>Permissions → Repository permissions → Contents: Read and write</b>. Nada más.</li>
          <li><b>Generate token</b>, cópialo y pégalo aquí. GitHub no lo vuelve a mostrar.</li></ol>
          <p class="muted small">La Productora también necesita tu token de Kaggle guardado como secreto <b>KAGGLE_API_TOKEN</b> en ese repositorio (Settings → Secrets and variables → Actions).</p></details></div>
      <div class="grid2"><div class="card"><h2>🎨 Identidad YDC Entertainment Virales</h2>${brand.map(([f, l]) => `<div class="row small"><span style="flex:1">${l}</span><a class="btn ghost small" href="./brand/${f}" download>⬇</a></div>`).join('')}
        <p class="muted small">La foto de perfil de YouTube no puede ser animada: la animación se usa como intro de los videos.</p></div>
      <div class="card"><h2>💾 Respaldo</h2><p class="muted small">Todo se guarda automáticamente en este dispositivo${est ? ` (${(est.used / 1048576).toFixed(0)} MB usados de ~${(est.quota / 1073741824).toFixed(1)} GB)` : ''}. Descarga un respaldo para moverlo a otro equipo.</p>
        <div class="row wrap"><button id="cfBackup" class="secondary">⬇ Respaldo (sin videos)</button><label class="filebtn secondary">Restaurar respaldo<input id="cfRestore" type="file" accept="application/json" hidden></label></div>
        <h3>🗣 Lenguaje</h3><p class="small">${esc(CLEAN_POLICY)}</p></div></div>
      <div class="card"><h2>📜 Registro de acciones</h2>${log.map((l) => `<p class="small">${dt(l.at)} · <b>${esc(l.action)}</b> <span class="muted">${esc(JSON.stringify(l.detail).slice(0, 120))}</span></p>`).join('') || '<p class="muted small">Sin acciones registradas.</p>'}</div>`;
    $('cfYt').onclick = () => hooks.showTab('youtube');
    $('cfPrSave').onclick = async () => {
      try {
        const tok = $('cfPrTok').value.trim();
        const c = await pr.setConfig({ repo: $('cfPrRepo').value, token: tok || prc.token });
        status('cfPrStatus', 'Probando…');
        const r = await pr.testConnection(c);
        await audit('productora.conectada', { repo: r.repo });
        status('cfPrStatus', `✔ Conectada a ${r.repo}${r.private ? ' (privado)' : ' ⚠ el repositorio es público: tus guiones serían visibles'}.`, r.private ? 'ok' : 'err');
        $('cfPrTok').value = '';
      } catch (e) { status('cfPrStatus', e.message, 'err'); }
    };
    $('cfPrDel').onclick = async () => { await pr.setConfig({ repo: $('cfPrRepo').value, token: '' }); status('cfPrStatus', 'Token eliminado de este dispositivo.', 'ok'); };
    $('cfLocal').onclick = async () => { try { await nt.enableLocal(); await nt.local('Yoha Video', 'Avisos activados ✔'); status('cfStatus', 'Avisos de la app activados.', 'ok'); } catch (e) { status('cfStatus', e.message, 'err'); } };
    $('cfNew').onclick = () => { $('cfTopic').value = nt.newTopic(); status('cfStatus', 'Tema nuevo generado. Suscríbete a él en la app ntfy y pégalo en el notebook.', 'ok'); };
    $('cfTopic').onchange = () => status('cfStatus', nt.setTopic($('cfTopic').value.trim()) ? 'Tema guardado.' : 'Tema inválido (12–64 letras, números, - o _).', nt.getTopic() ? 'ok' : 'err');
    $('cfCopy').onclick = () => copy(nt.getTopic(), 'cfStatus');
    $('cfTest').onclick = async () => { try { const ok = await nt.push('🎬 Yoha Video: prueba de notificación.'); status('cfStatus', ok ? 'Prueba enviada a ntfy.' : 'Configura primero un tema.', ok ? 'ok' : 'err'); } catch (e) { status('cfStatus', `No se pudo enviar: ${e.message}`, 'err'); } };
    $('cfBackup').onclick = async () => {
      const data = { format: 'yoha-backup', version: 2, at: new Date().toISOString(), productions: (await productions.all()).map((p) => ({ ...p, versions: (p.versions || []).slice(0, 5) })), series: await seriesCol.all(), characters: await charStore.all(), calendar: await calendar.all(), guardian: await guardian.all(), published: await published.all(), bank: await kv.get('bank'), audit: await auditCol.all() };
      download(`yoha-respaldo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
    };
    $('cfRestore').onchange = async (e) => {
      try {
        const d = JSON.parse(await e.target.files[0].text());
        if (d.format !== 'yoha-backup') throw new Error('No es un respaldo de Yoha Video.');
        if (!confirm('¿Restaurar? Se agregan/actualizan los datos del respaldo; no se borra nada.')) return;
        for (const p of d.productions || []) await productions.put(p);
        for (const s of d.series || []) await seriesCol.put(s);
        for (const c of d.characters || []) await charStore.put(c);
        for (const x of d.calendar || []) await calendar.put(x);
        for (const x of d.guardian || []) await guardian.put(x);
        for (const x of d.published || []) await published.put(x);
        if (d.bank) await kv.set('bank', d.bank);
        await audit('respaldo.restaurado', { productions: (d.productions || []).length });
        await refreshChars(); hooks.renderChars?.();
        status('cfStatus', 'Respaldo restaurado.', 'ok');
      } catch (err) { toast(err.message); }
    };
  }

  const renders = { panel: renderPanel, director: () => renderDirector($('dirText')?.value || ''), obra: renderObra, producciones: renderProducciones, series: renderSeries, radar: renderRadar, guardian: renderGuardian, marketing: renderMarketing, revenue: renderRevenue, bank: renderBank, calendario: renderCalendario, aprobaciones: renderAprobaciones, publicados: renderPublicados, config: renderConfig };
  const api = {
    onShow: (name) => { if (name === 'personajes') refreshChars(); renders[name]?.().catch?.((e) => console.error(e)); },
    sendToReview, publishedHashes, recordPublished, openObra,
    get publishContext() { return S.publishContext; },
    _test: { productions, seriesCol, calendar, guardian, published, S },
  };
  return api;
}
