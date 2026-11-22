// Отмечает в data/catalog.json позиции, у которых есть фото в data/img (поле i: 1). Запуск: node scripts/mark_photos.mjs
import fs from 'fs';
const idx = JSON.parse(fs.readFileSync(new URL('../data/img/index.json', import.meta.url)));
const cat = JSON.parse(fs.readFileSync(new URL('../data/catalog.json', import.meta.url)));
let n = 0; for (const x of cat) { if (idx[x.a]) { x.i = 1; n++; } else delete x.i; }
fs.writeFileSync(new URL('../data/catalog.json', import.meta.url), JSON.stringify(cat));
console.log('с фото:', n);
