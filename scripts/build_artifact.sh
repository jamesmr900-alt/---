#!/bin/sh
# Сборка версии для артефакта Claude (dist-artifact/): библиотеки — с CDN, разрешённых на claude.ai.
set -e
cd "$(dirname "$0")/.."
rm -rf dist-artifact && mkdir -p dist-artifact/js dist-artifact/css dist-artifact/data
cp index.html tools.html dist-artifact/ && cp css/app.css dist-artifact/css/ && cp data/catalog.json dist-artifact/data/
cp js/config.js js/agent-def.js js/engine.js js/ui.js js/viz3d.js dist-artifact/js/
X='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
P='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174'
sed -i "s#vendor/xlsx.full.min.js#$X#; s#vendor/pdf.min.js#$P/pdf.min.js#g; s#vendor/pdf.worker.min.js#$P/pdf.worker.min.js#g" dist-artifact/index.html dist-artifact/tools.html
sed -i "s#'../vendor/three.module.min.js'#'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm'#; s#'../vendor/OrbitControls.js'#'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js/+esm'#" dist-artifact/js/viz3d.js
grep -l vendor/ dist-artifact/*.html dist-artifact/js/*.js && { echo "остались ссылки на vendor/"; exit 1; } || echo "dist-artifact готов"
