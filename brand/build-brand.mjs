// Genera la identidad de YDC Entertainment Virales (diseño original) con Chromium + FFmpeg.
// Uso: node brand/build-brand.mjs  → public/brand/*
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';

const OUT = 'public/brand';
mkdirSync(OUT, { recursive: true });
const FONT_DIR = process.env.FONT_DIR || '/usr/share/fonts/truetype/google-fonts';
const font = (f) => (existsSync(path.join(FONT_DIR, f)) ? readFileSync(path.join(FONT_DIR, f)).toString('base64') : '');
const CSS = `@font-face{font-family:P;font-weight:700;src:url(data:font/ttf;base64,${font('Poppins-Bold.ttf')})}
@font-face{font-family:P;font-weight:400;src:url(data:font/ttf;base64,${font('Poppins-Regular.ttf')})}
@font-face{font-family:P;font-weight:300;src:url(data:font/ttf;base64,${font('Poppins-Light.ttf')})}
*{box-sizing:border-box}body{margin:0;overflow:hidden;font-family:P,system-ui,sans-serif;color:#fff}`;
const MARK = readFileSync('brand/logo-mark.svg', 'utf8');
const GOLD = 'linear-gradient(135deg,#FFE7A3,#E8B54A 45%,#A8741E)';
const wordmark = (size) => `<div style="text-align:center;line-height:1"><div style="font-weight:700;font-size:${size}px;letter-spacing:.12em;background:${GOLD};-webkit-background-clip:text;color:transparent">YDC</div><div style="font-weight:300;font-size:${size * 0.28}px;letter-spacing:.55em;margin-top:${size * 0.08}px;padding-left:.55em">ENTERTAINMENT</div><div style="font-weight:700;font-size:${size * 0.24}px;letter-spacing:.7em;margin-top:${size * 0.1}px;padding-left:.7em;color:#E8B54A">VIRALES</div></div>`;
const bg = `background:radial-gradient(120% 90% at 50% 30%,#1B2A55 0%,#0B1230 45%,#05070F 100%)`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(name, w, h, html, { transparent = false, type = 'png' } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>${CSS}</style>${html}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, name), omitBackground: transparent, type, ...(type === 'jpeg' ? { quality: 92 } : {}) });
}

// Logo y perfil (800×800; YouTube lo recorta en círculo)
await shot('ydc-logo.png', 1024, 1024, `<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center">${MARK.replace('<svg ', '<svg width="1000" height="1000" ')}</div>`, { transparent: true });
await shot('ydc-perfil-800.png', 800, 800, `<div style="width:800px;height:800px;${bg};display:flex;align-items:center;justify-content:center">${MARK.replace('<svg ', '<svg width="690" height="690" ')}</div>`);
// Marca de agua de YouTube (150×150, se recomienda fondo transparente)
await shot('ydc-marca-agua-150.png', 150, 150, `<div style="width:150px;height:150px;display:flex;align-items:center;justify-content:center;opacity:.92">${MARK.replace('<svg ', '<svg width="146" height="146" ')}</div>`, { transparent: true });
// Portada (2560×1440; zona segura central 1546×423 visible en todos los dispositivos)
await shot('ydc-portada-2560x1440.png', 2560, 1440, `<div style="width:2560px;height:1440px;${bg};position:relative;overflow:hidden">
  <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 118px,rgba(232,181,74,.05) 118px 120px)"></div>
  <div style="position:absolute;left:0;right:0;top:640px;height:4px;background:${GOLD};opacity:.25"></div>
  <div style="position:absolute;left:507px;top:508px;width:1546px;height:423px;display:flex;align-items:center;justify-content:center;gap:56px">
    ${MARK.replace('<svg ', '<svg width="330" height="330" ')}
    <div><div style="font-weight:700;font-size:150px;letter-spacing:.1em;line-height:1;background:${GOLD};-webkit-background-clip:text;color:transparent">YDC</div>
    <div style="font-weight:300;font-size:46px;letter-spacing:.5em;margin-top:6px">ENTERTAINMENT</div>
    <div style="font-weight:700;font-size:40px;letter-spacing:.62em;margin-top:10px;color:#E8B54A">VIRALES</div>
    <div style="font-weight:400;font-size:38px;margin-top:22px;color:#fff;opacity:.85">Novelas · Series · Historias originales</div></div>
  </div></div>`);
await shot('ydc-portada-zona-segura.png', 2560, 1440, `<div style="width:2560px;height:1440px;position:relative"><img src="data:image/png;base64,${readFileSync(path.join(OUT, 'ydc-portada-2560x1440.png')).toString('base64')}" style="position:absolute;inset:0"><div style="position:absolute;left:507px;top:508px;width:1546px;height:423px;outline:6px dashed #4ade80"></div><div style="position:absolute;left:520px;top:940px;font:700 40px P;color:#4ade80">Zona segura 1546×423 (visible en todos los dispositivos)</div></div>`);
// Plantilla de miniatura 1280×720
await shot('ydc-plantilla-miniatura.png', 1280, 720, `<div style="width:1280px;height:720px;${bg};position:relative">
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,7,15,.92) 0%,rgba(5,7,15,.4) 55%,transparent)"></div>
  <div style="position:absolute;left:60px;top:150px;width:720px;font-weight:700;font-size:92px;line-height:1.02;text-transform:uppercase;text-shadow:0 6px 24px #000">TU TÍTULO<br><span style="background:${GOLD};-webkit-background-clip:text;color:transparent">AQUÍ</span></div>
  <div style="position:absolute;left:60px;bottom:60px;padding:10px 22px;background:#E8B54A;color:#070B18;font-weight:700;font-size:34px;border-radius:10px">CAPÍTULO 1</div>
  <div style="position:absolute;right:40px;top:36px">${MARK.replace('<svg ', '<svg width="120" height="120" ')}</div></div>`);

// ───── Animaciones: se filman fotogramas JPEG (calidad 92) y se codifican a MP4 30 fps ─────
async function film(name, seconds, w, h, frameHtml, audioArgs, { animSeconds = seconds, fadeOut = 0 } = {}) {
  const fps = 30, n = Math.round(animSeconds * fps);
  // Tras la animación, el último fotograma se mantiene (tpad) y se funde a negro: sin filmar cuadros repetidos.
  const vf = `[0:v]tpad=stop_mode=clone:stop_duration=${seconds - animSeconds + 1}${fadeOut ? `,fade=t=out:st=${seconds - fadeOut}:d=${fadeOut}` : ''},trim=duration=${seconds},format=yuv420p[v]`;
  const tmp = path.join(OUT, `.${name}.tmp.mp4`);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...audioArgs.inputs, '-filter_complex', `${vf};${audioArgs.filter}`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', String(seconds), '-movflags', '+faststart', '-f', 'mp4', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>${CSS}</style><div id="root"></div>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  for (let i = 0; i < n; i++) {
    await page.evaluate(([html]) => { document.getElementById('root').innerHTML = html; }, [frameHtml(i / fps)]);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on('close', r));
  if (code !== 0) throw new Error(`ffmpeg ${name} terminó con ${code}`);
  renameSync(tmp, path.join(OUT, name));
}
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const clamp = (x) => Math.min(1, Math.max(0, x));

// Intro 5 s: destello de lente, el emblema gira y se asienta, aparece el nombre
const introFrame = (t) => {
  const a = ease(t / 1.6), b = ease((t - 1.3) / 1.2), out = clamp((t - 4.4) / 0.6);
  const rays = Array.from({ length: 12 }, (_, i) => `<div style="position:absolute;left:960px;top:430px;width:1400px;height:3px;transform-origin:0 50%;transform:rotate(${i * 30 + t * 18}deg);background:linear-gradient(90deg,rgba(255,231,163,${0.35 * (1 - b)}),transparent)"></div>`).join('');
  return `<div style="width:1920px;height:1080px;${bg};position:relative;overflow:hidden;opacity:${1 - out}">
    ${rays}
    <div style="position:absolute;left:0;right:0;top:${430 - 4}px;height:8px;background:${GOLD};filter:blur(6px);transform:scaleX(${clamp(t / 0.6) * (1 - b)});opacity:.8"></div>
    <div style="position:absolute;left:${960 - 220}px;top:${430 - 220 - 40 * b}px;width:440px;height:440px;transform:scale(${0.4 + 0.6 * a}) rotate(${(1 - a) * -120}deg);opacity:${a}">${MARK.replace('<svg ', '<svg width="440" height="440" ')}</div>
    <div style="position:absolute;left:0;right:0;top:${720 + 30 * (1 - b)}px;opacity:${b}">${wordmark(120)}</div>
    <div style="position:absolute;left:0;right:0;top:960px;text-align:center;font-weight:300;font-size:30px;letter-spacing:.4em;color:#E8B54A;opacity:${clamp((t - 2.6) / 0.8)}">PRESENTA</div>
  </div>`;
};
// Sonido original sintetizado: golpe grave + brillo + pad dorado
const introAudio = { inputs: ['-f', 'lavfi', '-t', '5', '-i', "aevalsrc='0.55*sin(2*PI*(55+30*exp(-4*t))*t)*exp(-2.2*t)+0.12*sin(2*PI*880*t)*exp(-6*t)*gt(t,1.3)+0.08*(sin(2*PI*220*t)+sin(2*PI*277.2*t)+sin(2*PI*329.6*t))*(1-exp(-1.5*t))*exp(-0.45*t)':s=48000:c=stereo"], filter: '[1:a]aecho=0.8:0.6:120|240:0.3|0.2,afade=t=out:st=4.2:d=0.8,alimiter=limit=0.9[a]' };
await film('ydc-intro-5s-1080p.mp4', 5, 1920, 1080, introFrame, introAudio);

// Cierre 20 s (pantalla final de YouTube: espacio para video sugerido y botón de suscripción)
const outroFrame = (t) => {
  const a = ease(t / 1.2), out = 0;
  return `<div style="width:1920px;height:1080px;${bg};position:relative;overflow:hidden;opacity:${1 - out}">
    <div style="position:absolute;left:0;right:0;top:${70 + 20 * (1 - a)}px;opacity:${a};text-align:center;font-weight:700;font-size:64px">¿Te gustó? <span style="background:${GOLD};-webkit-background-clip:text;color:transparent">Hay más historias</span></div>
    <div style="position:absolute;left:180px;top:300px;width:820px;height:461px;border:3px solid rgba(232,181,74,.6);border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:30px;color:rgba(255,255,255,.55);opacity:${a}">Espacio para el próximo capítulo</div>
    <div style="position:absolute;left:1240px;top:${330}px;width:360px;height:360px;border-radius:50%;border:3px solid rgba(232,181,74,.6);display:flex;align-items:center;justify-content:center;opacity:${a}">${MARK.replace('<svg ', '<svg width="300" height="300" ')}</div>
    <div style="position:absolute;left:1180px;top:730px;width:480px;text-align:center;font-weight:700;font-size:40px;letter-spacing:.08em;opacity:${a}">SUSCRÍBETE</div>
    <div style="position:absolute;left:0;right:0;bottom:60px;opacity:${a}">${wordmark(56)}</div>
  </div>`;
};
const outroAudio = { inputs: ['-f', 'lavfi', '-t', '20', '-i', "aevalsrc='0.09*(sin(2*PI*196*t)+sin(2*PI*246.9*t)+sin(2*PI*293.7*t))*(0.6+0.4*sin(2*PI*0.25*t))*(1-exp(-t))':s=48000:c=stereo"], filter: '[1:a]aecho=0.8:0.5:300:0.3,afade=t=in:d=1.5,afade=t=out:st=18:d=2[a]' };
await film('ydc-cierre-20s-1080p.mp4', 20, 1920, 1080, outroFrame, outroAudio, { animSeconds: 1.5, fadeOut: 0.8 });
await browser.close();
for (const f of ['ydc-intro-5s-1080p.mp4', 'ydc-cierre-20s-1080p.mp4']) {
  const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path.join(OUT, f)]).toString());
  console.log(f, p.streams.map((s) => `${s.codec_name} ${s.width || ''}x${s.height || ''}`).join(' + '), Number(p.format.duration).toFixed(2) + ' s');
}
rmSync(path.join(OUT, '.tmp'), { force: true, recursive: true });
console.log('✔ Identidad YDC en', OUT);
