# Yoha Video · IDC Entertainment — Estudio PWA gratuito (v2.0)

Aplicación web instalable (PWA) que **edita y exporta video en el propio dispositivo** con FFmpeg.wasm. No tiene servidor, no guarda secretos y no usa servicios de pago. Es el frontend público y seguro de YOHA VIDEO; el estudio completo (Next.js + PostgreSQL + workers) sigue en el repositorio privado.

**URL prevista:** `https://yohdelacru.github.io/yoha-video-pwa/` (solo se considera publicada cuando el flujo `verify` de GitHub Actions confirma HTTP 200).

## Qué hace (probado)
| Función | Estado |
|---|---|
| Subir videos (MP4, MOV, WEBM) e imágenes (JPG, PNG, WEBP) | ✅ |
| Unir, reordenar (arrastrar o ↑↓), duplicar y eliminar | ✅ |
| Recortar inicio/fin, velocidad 0.5×–2×, conservar o silenciar el audio del clip | ✅ |
| Imágenes con movimiento de cámara (acercar, alejar, paneos) | ✅ |
| Títulos y subtítulos dibujados + archivo `.srt` | ✅ |
| Música de fondo (bucle, fundidos, volumen) | ✅ |
| Narración: grabar con micrófono o subir audio, volumen y retraso | ✅ |
| Formato 16:9, 9:16, 1:1 con fondo difuminado, barras o recorte | ✅ |
| Exportar MP4 (H.264 + AAC) 360p–1080p, vista previa, descargar, compartir | ✅ |
| Proyecto guardado en el dispositivo (IndexedDB) | ✅ |
| Instalable, funciona sin conexión tras la primera visita | ✅ |
| Personajes reutilizables con consentimiento para fotos (Character Identity Engine) | ✅ continuidad aproximada |
| Planificador idea → guion → personajes → escenas → voces (plantillas + asistente externo) | ✅ sin IA propia |
| Importar `yoha_clips.zip` del notebook de IA (orden, subtítulos y narración) | ✅ |
| Publicar en YouTube con revisión (OAuth en el navegador, varios canales, privacidad, programación, audiencia, contenido sintético) | ⚙️ requiere tu Client ID; sin probar contra YouTube real |
| Generación de video con IA | ⚙️ notebook de Kaggle/Colab (GPU), no en el navegador |
| Automatización de publicaciones | ⛔ desactivada: necesita un worker que no existe en una PWA estática |

## Novedades v2.0 (IDC Entertainment)
Panel ejecutivo de 14 apartados: Crear video (Director IA), Mis producciones, Mis series, Editor IA, Personajes, Radar Viral IA, Protección de mis videos, Marketing Global, Yoha Revenue IA, Yoha Bank, Calendario editorial, Pendientes de aprobación, Videos publicados y Configuración. Identidad IDC (logo, portada, marca de agua, intro y cierre) en `public/brand/` (se regenera con `npm run brand`). Notebook v2: `public/notebook/YOHA_VIDEO_Kaggle_Colab_Gratis.ipynb`. El backend y los informes internos permanecen en el repositorio privado.

## Instalar en iPhone
1. Abre la dirección de la app en **Safari** (no en Chrome).
2. Toca **Compartir** (cuadrado con flecha) → **Agregar a pantalla de inicio** → **Agregar**.
3. Abre Yoha Video desde el ícono. Para avisos: Configuración → «Activar avisos de la app» (iOS 16.4 o superior).
4. Para avisos del notebook con la app cerrada: instala **ntfy** desde la App Store, toca «+» y suscríbete al tema que muestra Configuración.

## Desarrollo
```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ + escaneo de secretos (bloquea la compilación si encuentra claves)
bash scripts/make-test-media.sh test-media
node tests/unit.mjs                  # 11 pruebas de lógica
MEDIA=test-media node tests/run.mjs   # 49 pruebas reales en Chromium headless + FFprobe
MEDIA=test-media node tests/webkit.mjs # motor de Safari (iPhone), en GitHub Actions
```

## Publicar en GitHub Pages
1. Repositorio **público** `yoha-video-pwa` con el contenido de esta carpeta en la raíz.
2. Los flujos ya están en `.github/workflows/` (publicación, verificación de URL y pruebas con Chromium y WebKit).
3. *Settings → Pages → Source: GitHub Actions*.
4. Cada `push` a `main` compila, publica y verifica la URL.

## Seguridad
- CSP estricta: solo este sitio, Google (inicio de sesión y API de YouTube) y nada más.
- Sin client secret: el Client ID de OAuth de una app web es público por diseño. Los tokens viven en memoria y caducan en ~1 h.
- `scripts/postbuild.mjs` revisa todo `dist/` en busca de claves (OpenAI, Replicate, Stripe, Google, GitHub, Hugging Face, claves privadas, cadenas de base de datos, correos personales) y detiene la publicación si encuentra alguna.
- Las fotos y voces de personajes se quedan en el dispositivo; usar fotos exige declarar quién autoriza.

## Límites honestos
- El render ocurre en el dispositivo: en celulares usa 360p–720p y videos cortos. 1080p funciona pero es lento.
- El navegador procesa con un solo hilo (máxima compatibilidad con GitHub Pages, que no permite los encabezados para multihilo).
- La continuidad de rostros entre escenas generadas por IA es aproximada; el notebook la mide y marca escenas a revisar.
