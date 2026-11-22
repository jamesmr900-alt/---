// Сборка библиотеки КСС data/photometry.json из папки с файлами .ldt / .ies (вложенные папки тоже).
// Артикул определяется по имени файла (или по названию светильника внутри файла).
// Запуск: node scripts/build_photometry.mjs <папка> [--merge]
import fs from 'fs'; import path from 'path';
const root = new URL('..', import.meta.url).pathname;
const mod = { exports: {} }; new Function('module', 'exports', 'window', fs.readFileSync(root + 'js/engine.js', 'utf8'))(mod, mod.exports, undefined);
const MT = mod.exports; MT.setCatalog(JSON.parse(fs.readFileSync(root + 'data/catalog.json', 'utf8')));
const dir = process.argv[2]; if (!dir) { console.log('укажите папку'); process.exit(1); }
const out = root + 'data/photometry.json';
if (process.argv.includes('--merge') && fs.existsSync(out)) MT.setPhotometry(JSON.parse(fs.readFileSync(out, 'utf8')));
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(ldt|ies)$/i.test(f)) files.push(p); } })(dir);
let ok = 0; const miss = [], bad = [];
for (const f of files) {
  try { const t = new TextDecoder('windows-1251').decode(fs.readFileSync(f)), ph = MT.parsePhotometry(t, f), a = MT.articleFromName(path.basename(f)) || MT.articleFromName(ph.name);
    if (a) { MT.addPhotometry(a, ph, path.basename(f)); ok++; } else miss.push(path.basename(f)); }
  catch (e) { bad.push(path.basename(f) + ': ' + e.message); }
}
const lib = MT.photometry; for (const k in lib) delete lib[k]._curve;
fs.writeFileSync(out, JSON.stringify(lib));
console.log(`файлов: ${files.length}, в библиотеке: ${Object.keys(lib).length} (добавлено ${ok}), без артикула: ${miss.length}, ошибок: ${bad.length}`);
if (miss.length) fs.writeFileSync(root + 'data/photometry_unmatched.txt', miss.join('\n'));
if (bad.length) console.log(bad.slice(0, 10).join('\n'));
