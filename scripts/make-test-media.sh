#!/usr/bin/env bash
# Medios sintéticos (sin derechos de terceros) para las pruebas automáticas.
set -euo pipefail
D=${1:-test-media}; mkdir -p "$D"; cd "$D"
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=s=1280x720:r=30:d=6" -f lavfi -i "sine=f=440:d=6" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest clip_h.mp4
ffmpeg -loglevel error -y -f lavfi -i "smptebars=s=720x1280:r=25:d=5" -f lavfi -i "sine=f=660:d=5" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest clip_v.mp4
ffmpeg -loglevel error -y -f lavfi -i "mandelbrot=s=1024x768:r=30" -t 4 -an -c:v libx264 -pix_fmt yuv420p clip_noaudio.mp4
ffmpeg -loglevel error -y -f lavfi -i "testsrc=s=640x480:r=24:d=4" -f lavfi -i "sine=f=300:d=4" -c:v libvpx-vp9 -b:v 600k -deadline realtime -c:a libopus -shortest clip_w.webm
ffmpeg -loglevel error -y -f lavfi -i "gradients=s=1600x1200:c0=0x0b132b:c1=0xe76f51:seed=3" -frames:v 1 photo.jpg
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.15*sin(2*PI*220*t)+0.1*sin(2*PI*330*t)':d=8" -ac 2 -c:a libmp3lame music.mp3
ffmpeg -loglevel error -y -f lavfi -i "sine=f=880:d=3,volume=0.5" -ac 1 narration.wav
python3 - <<'PY'
import zipfile, json
z = zipfile.ZipFile('yoha_clips.zip', 'w')
z.write('clip_h.mp4', 'yoha_clips/scene_01.mp4'); z.write('clip_noaudio.mp4', 'yoha_clips/scene_02.mp4'); z.write('narration.wav', 'yoha_clips/narration.wav')
z.writestr('yoha_clips/manifest.json', json.dumps({'format': 'yoha-clips', 'generator': 'test', 'clips': [{'file': 'scene_01.mp4', 'subtitle': 'Escena uno', 'seconds': 6}, {'file': 'scene_02.mp4', 'subtitle': 'Escena dos', 'seconds': 4}], 'narration': 'narration.wav'}))
z.close()
PY
echo "Medios de prueba en $D"
