#!/bin/sh
# Обновляет метку версии у скриптов и стилей, чтобы браузеры не показывали старую версию после обновления сайта.
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d%H%M)
for f in index.html tools.html; do
  sed -i -E "s#(src=\"js/[a-z0-9-]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g; s#(href=\"css/app\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#window\.ASSET_V = '[0-9]*'#window.ASSET_V = '$V'#" $f
done
echo "версия $V"
