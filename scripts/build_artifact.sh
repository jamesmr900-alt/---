#!/bin/sh
# Сборка версии для артефакта Claude (dist-artifact/): весь сайт, кроме фото каталога
# (фото берутся с сайта на Vercel). В артефакте ассистент работает через аккаунт Claude открывшего — без ключа API.
set -e
cd "$(dirname "$0")/.."
rm -rf dist-artifact && mkdir -p dist-artifact
git ls-files index.html tools.html css js vendor data | grep -v '^data/img/' | grep -v '\.txt$' | while read f; do mkdir -p "dist-artifact/$(dirname "$f")"; cp "$f" "dist-artifact/$f"; done
# фото каталога — с сайта на Vercel
for h in dist-artifact/index.html dist-artifact/tools.html; do
  sed -i "s#<head>#<head><script>window.MT_IMG_BASE='https://barsikiss.vercel.app/';</script>#" "$h"
done
# xlsx — с CDN (файл содержит байты, которые хостинг артефактов не принимает как текст)
sed -i "s#vendor/xlsx.full.min.js[^\"]*#https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js#" dist-artifact/index.html dist-artifact/tools.html
rm -f dist-artifact/vendor/xlsx.full.min.js
echo "dist-artifact готов: $(find dist-artifact -type f | wc -l) файлов, $(du -sh dist-artifact | cut -f1)"
