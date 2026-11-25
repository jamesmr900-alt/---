/* Распознавание чертежа (PDF дизайн-проекта) без нейросети:
   • текст страницы с координатами (с учётом поворота листа);
   • образцы условных обозначений — автоматически из экспликации/условных обозначений или вручную рамкой;
   • поиск таких же значков на плане (нормированная корреляция, 4 поворота, грубый поиск + уточнение) — в Web Worker;
   • помещения: номера в кружках + экспликация помещений, зоны — «ближайшее помещение» по пути в обход стен;
   • рамки ЭУИ: значки, стоящие вплотную друг к другу, — одна рамка, число значков = число постов. */
(function () {
  'use strict';
  const S = {};

  /* ---------- PDF ---------- */
  S.open = async file => { const lib = await MTUI.loadPdfJs(); return lib.getDocument({ data: await file.arrayBuffer() }).promise; };
  /** Текстовые элементы в экранных координатах (scale) и строки текста. */
  /** Текст из PDF с «кракозябрами» (кириллица cp1251, прочитанная как Latin-1: «Âåäîìîñòü») — перекодировать. */
  const CP = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';
  S.fixText = t => { if (!/[\u00C0-\u00FF]{2,}/.test(t) || /[\u0400-\u04FF]/.test(t)) return t;
    return t.replace(/[\u00A8\u00B8\u00C0-\u00FF]/g, c => { const o = c.charCodeAt(0); return o === 0xA8 ? 'Ё' : o === 0xB8 ? 'ё' : CP[o - 0xC0]; }); };
  S.pageItems = async (doc, n, scale = 1) => {
    const lib = await MTUI.loadPdfJs(), pg = await doc.getPage(n), vp = pg.getViewport({ scale }), tc = await pg.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = lib.Util.transform(vp.transform, it.transform), fs = Math.hypot(t[2], t[3]) || 10 * scale;
      items.push({ s: S.fixText(it.str.trim()), x: t[4], y: t[5], w: (it.width || 0) * scale, h: fs, rot: Math.round(Math.atan2(t[1], t[0]) * 180 / Math.PI) });
    }
    return { items, W: vp.width, H: vp.height };
  };
  S.linesOf = items => {
    const m = new Map();
    for (const it of items) { const k = Math.round(it.y / (3 * (it.h / 10 || 1))); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, its]) => { its.sort((a, b) => a.x - b.x); let s = '', x = -1e9; for (const it of its) { s += (it.x - x > it.h * 0.8 ? '   ' : ' ') + it.s; x = it.x + it.w; } return { s: s.trim(), items: its, y: its[0].y, x: its[0].x }; });
  };
  S.title = items => { const big = items.filter(i => i.s.length > 6).sort((a, b) => b.h - a.h)[0]; return big ? S.linesOf(items).find(l => l.items.includes(big)).s : ''; };
  S.floorOf = text => { const m = String(text).match(/\((\d)\s*этаж\s*\)|(\d)\s*[-–]?\s*(?:го|й|ый|ого)?\s*этаж/i); if (m) return +(m[1] || m[2]); const w = String(text).match(/(перв|втор|трет|четв|пят)[а-я]*\s+этаж/i); return w ? ['перв', 'втор', 'трет', 'четв', 'пят'].indexOf(w[1].toLowerCase()) + 1 : 0; };
  S.render = async (doc, n, scale) => {
    const pg = await doc.getPage(n), vp = pg.getViewport({ scale }), cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise; return cv;
  };
  /** Серое изображение «чернил»: 0 — белое, 1 — чёрное. */
  S.ink = cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, g = new Float32Array(cv.width * cv.height);
    for (let i = 0; i < g.length; i++) g[i] = 1 - (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255; return { g, w: cv.width, h: cv.height }; };

  /* ---------- таблицы: экспликация механизмов / условные обозначения / экспликация помещений ---------- */
  const TYPE_RX = /(Выключател|Переключател|Мастер|Розетк|Рамк|Вентилятор|INT\b|Подвес|Бра(?![а-яё])|Торшер|Ночник|Панел|Даунлайт|Downlight|Терморегул|Датчик|Кнопк|Звонок|Диммер|Светорегул|USB|HDMI|Интернет|RJ45|Телефон|Компьют|Телевиз|Домофон|Заглушк|Подсветк|Светильник|Бра\b|Люстр|Спот|Трек|Шинопровод|Лент|LED|Прожектор|Торшер)/i;
  S.TYPE_RX = TYPE_RX;
  /** Строки таблицы обозначений: подпись (и количество, если есть) + место значка слева от подписи. */
  S.legendRows = (items, W) => {
    const lines = S.linesOf(items), rows = [];
    const head = items.find(i => /экспликац[а-я]*\s+механизм|спецификаци[а-я]*\s+розет/i.test(i.s)) || items.find(i => /экспликац[а-я]*\s+светильник|ведомост[а-я]*\s+(светильник|по\s+электрик|осветит)|спецификаци[а-я]*\s+(светильник|осветит)/i.test(i.s)) || items.find(i => /условные\s+обозначени/i.test(i.s));
    const near = i => !head || (i.y > head.y - head.h && i.y < head.y + head.h * 8 && Math.abs(i.x - head.x) < W * 0.35);
    const uo = items.find(i => /^УО$/i.test(i.s) && near(i)) || items.find(i => /^(обознач|усл\.?(\s|$)|усл\.?\s*об|2d|символ|изображ|знак)/i.test(i.s) && near(i));
    const qh = items.find(i => /^(кол|коли)/i.test(i.s) && (!head || (i.y > head.y - head.h && i.y < head.y + head.h * 8))), rightLim = qh ? qh.x - 2 : 1e9;
    for (const ln of lines) {
      for (let k = 0; k < ln.items.length; k++) {
        const it = ln.items[k]; if (!TYPE_RX.test(it.s) || /^(вывод|электровывод|э-вывод|кабель|короб|щит)/i.test(it.s) || /^[а-яё(]/.test(it.s) || /\+7|e-?mail|www\.|тел\.?\s*:|телефон\s*:/i.test(ln.s)) continue;
        if (head && (it.y < head.y - 2 || Math.abs(it.x - head.x) > W * 0.25)) continue;    // только в блоке обозначений
        if (qh && (it.x > rightLim || it.x < qh.x - W * 0.3)) continue;
        let label = it.s, j = k + 1, qty = null;
        while (j < ln.items.length && ln.items[j].x < rightLim && Math.abs(ln.items[j].y - it.y) < it.h * 0.35 && ln.items[j].x - (ln.items[j - 1].x + ln.items[j - 1].w) < it.h * 1.5 && !/^\d{1,4}$/.test(ln.items[j].s)) label += ' ' + ln.items[j++].s;
        for (; j < ln.items.length; j++) { if (qh && ln.items[j].x > qh.x + qh.w + it.h * 3) break; if (/^\d{1,4}$/.test(ln.items[j].s)) { qty = +ln.items[j].s; break; } }
        if (rows.some(r => Math.abs(r.y - it.y) < it.h * 0.5)) continue;
        // ячейка значка: колонка «УО / Усл. об. / 2D-символ» (слева или справа от подписи), иначе — слева от подписи
        let left = uo ? uo.x - it.h * 0.6 : it.x - it.h * 4.2, right = it.x - it.h * 0.25;
        if (uo && uo.x > it.x + it.h) { left = uo.x - it.h * 1.2; right = uo.x + Math.max(uo.w, it.h * 3) + it.h * 1.2; }
        // продолжение подписи на следующих строках («300 ММ ОТ ЧИСТОГО ПОЛА») — та же позиция, другая высота / вид
        let yb = it.y;
        for (let g = 0; g < 3; g++) { const nx = items.filter(o => o !== it && o.y > yb + it.h * 0.5 && o.y < yb + it.h * 1.9 && Math.abs(o.x - it.x) < it.h * 1.2 && (!qh || o.x < rightLim) && !TYPE_RX.test(o.s) && !/^\d{1,4}$/.test(o.s)).sort((a, b) => a.y - b.y)[0];
          if (!nx) break; const same = items.filter(o => Math.abs(o.y - nx.y) < it.h * 0.35 && o.x >= nx.x && o.x < (qh ? rightLim : nx.x + W * 0.2) && !/^\d{1,4}$/.test(o.s)).sort((a, b) => a.x - b.x);
          label += ' ' + same.map(o => o.s).join(' '); yb = nx.y; }
        rows.push({ label: label.replace(/\s+/g, ' ').trim(), qty, x: it.x, y: it.y, yb, h: it.h, icon: { x0: left, x1: right, y0: it.y - it.h * 1.25, y1: yb + it.h * 0.45 } });
        break;
      }
    }
    // окно значка по высоте — между серединами соседних строк (значок стоит по центру блока подписи, а подпись бывает в 2–3 строки)
    if (rows.length > 1) { rows.sort((a, b) => a.y - b.y); const cy = r => (r.y - r.h * 0.85 + r.yb + r.h * 0.15) / 2, cs = rows.map(cy), dd = cs.slice(1).map((c, i) => c - cs[i]).filter(d => d > 2).sort((a, b) => a - b), pitch = dd[dd.length >> 1];
      if (isFinite(pitch)) rows.forEach((r, i) => { const up = i ? (cs[i] - cs[i - 1]) / 2 : pitch / 2, dn = i < rows.length - 1 ? (cs[i + 1] - cs[i]) / 2 : pitch / 2; r.icon.y0 = cs[i] - Math.min(up, pitch * 0.75); r.icon.y1 = cs[i] + Math.min(dn, pitch * 0.75); }); }
    const lx = Math.min(...rows.map(r => Math.min(r.x, r.icon.x0)), head ? head.x : 1e9, uo ? uo.x : 1e9);
    return { rows, head, qh, panelX: head ? Math.min(head.x - W * 0.02, (isFinite(lx) ? lx : head.x) - W * 0.01) : null };
  };
  /** Образец из ячейки: обрезка по «чернилам» без рамок таблицы. */
  S.cropIcon = (ink, box) => {
    let x0 = Math.max(0, Math.floor(box.x0)), x1 = Math.min(ink.w - 1, Math.ceil(box.x1)), y0 = Math.max(0, Math.floor(box.y0)), y1 = Math.min(ink.h - 1, Math.ceil(box.y1));
    // убрать линии таблицы: строки/столбцы, почти целиком тёмные (тонкие линии светлее из-за сглаживания)
    const dark = (x, y) => ink.g[y * ink.w + x] > 0.15;
    const rowFull = y => { let c = 0; for (let x = x0; x <= x1; x++) c += dark(x, y); return c > (x1 - x0 + 1) * 0.7; };
    const colFull = x => { let c = 0; for (let y = y0; y <= y1; y++) c += dark(x, y); return c > (y1 - y0 + 1) * 0.7; };
    // внутренняя граница: последняя «полная» линия от края внутрь (в пределах трети ячейки)
    const lim = f => Math.max(2, Math.floor(f / 3));
    for (let k = 0, h = lim(y1 - y0); k < h; k++) if (rowFull(y0 + k)) { y0 = y0 + k + 1; k = -1; if (y0 >= y1) break; }
    for (let k = 0, h = lim(y1 - y0); k < h; k++) if (rowFull(y1 - k)) { y1 = y1 - k - 1; k = -1; if (y1 <= y0) break; }
    for (let k = 0, h = lim(x1 - x0); k < h; k++) if (colFull(x0 + k)) { x0 = x0 + k + 1; k = -1; if (x0 >= x1) break; }
    for (let k = 0, h = lim(x1 - x0); k < h; k++) if (colFull(x1 - k)) { x1 = x1 - k - 1; k = -1; if (x1 <= x0) break; }
    y0 += 1; y1 -= 1; x0 += 1; x1 -= 1;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (ink.g[y * ink.w + x] > 0.08) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    if (bx1 < 0 || bx1 - bx0 < 3 || by1 - by0 < 3) return null;
    { // связные куски (с зазором 2 px); значок — самый крупный кусок и всё, что его касается
      const w = bx1 - bx0 + 1, h = by1 - by0 + 1, lab = new Int32Array(w * h).fill(-1), comps = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (lab[y * w + x] >= 0 || ink.g[(y + by0) * ink.w + x + bx0] <= 0.08) continue; const id = comps.length, q = [y * w + x]; lab[y * w + x] = id; let a = 0, c = { x0: x, y0: y, x1: x, y1: y, a: 0 };
        while (q.length) { const v = q.pop(), vx = v % w, vy = (v - vx) / w; a++; if (vx < c.x0) c.x0 = vx; if (vx > c.x1) c.x1 = vx; if (vy < c.y0) c.y0 = vy; if (vy > c.y1) c.y1 = vy;
          for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const nx = vx + i, ny = vy + j; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const n = ny * w + nx; if (lab[n] < 0 && ink.g[(ny + by0) * ink.w + nx + bx0] > 0.08) { lab[n] = id; q.push(n); } } }
        c.a = a; comps.push(c); }
      if (comps.length > 1) { comps.sort((p, q) => (q.x1 - q.x0 + 1) * (q.y1 - q.y0 + 1) - (p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1)); const m = comps[0];
        bx1 = bx0 + m.x1; by1 = by0 + m.y1; bx0 = bx0 + m.x0; by0 = by0 + m.y0; if (bx1 - bx0 < 3 || by1 - by0 < 3) return null; }
    }
    return { x: bx0 - 1, y: by0 - 1, w: bx1 - bx0 + 3, h: by1 - by0 + 3 };
  };
  /** Экспликация помещений: номер → название, площадь. */
  S.roomTable = items => {
    S._fh = []; const out = []; let fl = 0;
    for (const ln of S.linesOf(items)) {
      const fm = ln.s.match(/^\s*(\d)\s*[-–]?\s*(?:й|ой|ый)?\s*этаж|^\s*(перв|втор|трет)[а-я]*\s+этаж/i); if (fm && !/\d+[.,]\d/.test(ln.s)) { fl = fm[1] ? +fm[1] : ['перв', 'втор', 'трет'].indexOf(fm[2].toLowerCase()) + 1; (S._fh = S._fh || []).push({ y: ln.y, fl }); }
      const m = ln.s.match(/(?:^|\s)(\d{1,2})\s+([А-ЯЁA-Z][А-Яа-яёЁA-Za-z0-9 \-\/.,()]{2,40}?)\s+(\d{1,3}[.,]\d{1,2})(?:\s|$)/);
      if (m && !/итого|всего|этаж$|натуральн|сильвер|\bral\b|цвет|матов|глянц|покрыти|отделк|краск|ламинат|паркет|керамогр/i.test(m[2])) { const ni = ln.items.find(i => i.s === m[1]) || ln.items[0]; out.push({ no: +m[1], name: m[2].replace(/\s+/g, ' ').trim(), S: +m[3].replace(',', '.'), y: ln.y, x: ni.x, floor: fl }); }
    }
    // строки с названием в две строки: номер по центру ячейки, название выше/ниже — собрать по колонке номеров
    if (out.length) { const cx = out.map(r => r.x).sort((a, b) => a - b)[out.length >> 1], ys = out.map(r => r.y), yMin = Math.min(...ys), yMax = Math.max(...ys), pitch = (yMax - yMin) / Math.max(1, out.length - 1) || 60;
      for (const it of items) { if (!/^\d{1,2}$/.test(it.s) || Math.abs(it.x - cx) > it.h * 1.5 || out.some(r => r.no === +it.s)) continue;
        const near = items.filter(j => j !== it && Math.abs(j.y - it.y) < it.h * 1.4 && j.x > it.x + it.w);
        const area = near.filter(j => /^\d{1,3}[.,]\d{1,2}$/.test(j.s)).sort((a, b) => a.x - b.x)[0]; if (!area) continue;
        const name = near.filter(j => j.x < area.x && /[А-Яа-яЁёA-Za-z]/.test(j.s)).sort((a, b) => a.y - b.y || a.x - b.x).map(j => j.s).join(' ');
        if (name && !/итого|всего|натуральн|сильвер|\bral\b|цвет|матов|глянц|покрыти|отделк|краск|плитк|ламинат|паркет|керамогр/i.test(name)) out.push({ no: +it.s, name: name.replace(/\s+/g, ' ').trim(), S: +area.s.replace(',', '.'), y: it.y, x: it.x }); } }
    // этаж строки — по ближайшему заголовку «N этаж» выше
    const hs = (S._fh || []).filter(h => out.some(r => Math.abs(r.y - h.y) < 400)); S._fh = [];
    if (hs.length) out.forEach(r => { const h = hs.filter(q => q.y < r.y).sort((a, b) => b.y - a.y)[0]; r.floor = h ? h.fl : 0; });
    const seen = new Set(); return out.filter(r => !seen.has(r.no) && seen.add(r.no));
  };
  /** Номера помещений на плане (одна-две цифры вне таблицы). */
  S.roomNumbers = (items, table, panelX, ink) => {
    const nos = new Set(table.map(r => r.no)), xs = table.map(r => r.x).sort((a, b) => a - b), tx = xs[xs.length >> 1] - 40, ty0 = Math.min(...table.map(r => r.y)) - 20, ty1 = Math.max(...table.map(r => r.y)) + 20;
    const res = new Map();
    for (const it of items) {
      if (!/^\d{1,2}$/.test(it.s) || !nos.has(+it.s) || Math.abs(it.rot || 0) > 5) continue;
      if (it.x >= tx - 10 && it.y >= ty0 && it.y <= ty1) continue;
      // (правая панель не исключается: таблицы бывают внизу, а план — справа от них)
      // часть размера «1 058» / «2,3» — не номер помещения
      if (items.some(j => j !== it && Math.abs(j.y - it.y) < it.h * 0.3 && ((j.x - (it.x + it.w) > -1 && j.x - (it.x + it.w) < it.h * 0.7 && /^[\d,.]/.test(j.s)) || (it.x - (j.x + j.w) > -1 && it.x - (j.x + j.w) < it.h * 0.7 && /[\d,.]$/.test(j.s))))) continue;
      const cx = it.x + it.w / 2, cy = it.y - it.h * 0.35;
      // номер помещения обычно в кружке: проверяем кольцо вокруг цифры (красные «марки» групп и размеры — без кружка)
      let ring = 0;
      if (ink) for (const k of [0.6, 0.7, 0.8, 0.9, 1.0, 1.15, 1.3, 1.5]) { let hit = 0; const R = it.h * k; for (let a = 0; a < 32; a++) { const x = Math.round(cx + R * Math.cos(a / 32 * 6.283)), y = Math.round(cy + R * Math.sin(a / 32 * 6.283)); let v = 0; for (let d = -1; d <= 1; d++) v = Math.max(v, ink.g[(y + d) * ink.w + x] || 0, ink.g[y * ink.w + x + d] || 0); if (v > 0.3) hit++; } ring = Math.max(ring, hit / 32); }
      const prev = res.get(+it.s);
      if (items.some(j => (/м²|м2|кв\.?\s*м/i.test(j.s) || /^\d{1,3}[.,]\d{1,2}(\s*м)?/.test(j.s)) && j.y > it.y && j.y - it.y < it.h * 3 && Math.abs(j.x - it.x) < it.h * 4)) ring += 0.5;   // под номером — площадь
      if (ink && ring < 0.45) continue;   // без кружка — не номер помещения
      if (!prev || ring > prev.ring + 0.15) res.set(+it.s, { x: cx, y: cy, ring });
    }
    return res;
  };

  /* ---------- стены и зоны помещений ---------- */
  /** Маска толстых тёмных областей (стены) на сетке с шагом ds. */
  S.walls = (cv, ds = 4) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, w = Math.floor(cv.width / ds), h = Math.floor(cv.height / ds), m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let dark = 0; for (let j = 0; j < ds; j++) for (let i = 0; i < ds; i++) { const k = ((y * ds + j) * cv.width + x * ds + i) * 4, r = d[k], g = d[k + 1], b = d[k + 2], l = 0.3 * r + 0.59 * g + 0.11 * b;
        if (l < 200 && Math.max(r, g, b) - Math.min(r, g, b) < 40) dark++; }
      m[y * w + x] = dark >= ds * ds * 0.4 ? 1 : 0;
    }
    // открытие 3×3: убрать тонкие линии и текст
    const er = new Uint8Array(w * h), op = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { let ok = 1; for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) if (!m[(y + j) * w + x + i]) { ok = 0; break; } er[y * w + x] = ok; }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (er[y * w + x]) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) op[(y + j) * w + x + i] = 1;
    // мелкие пятна (залитые значки, буквы) — не стены
    const seen = new Uint8Array(w * h), q = new Int32Array(w * h);
    for (let s = 0; s < w * h; s++) { if (!op[s] || seen[s]) continue; let qh = 0, qt = 0; q[qt++] = s; seen[s] = 1; const comp = [];
      while (qh < qt) { const c = q[qh++]; comp.push(c); const x = c % w, y = (c - x) / w; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const n = ny * w + nx; if (op[n] && !seen[n]) { seen[n] = 1; q[qt++] = n; } } }
      if (comp.length < 60) comp.forEach(c => { op[c] = 0; }); }
    return { m: op, w, h, ds };
  };
  /** Зоны: ближайшая метка помещения по пути в обход стен. labels: [{x, y}] в пикселях изображения. */
  S.zones = (walls, labels) => {
    const { m, w, h, ds } = walls, lab = new Int16Array(w * h).fill(-1), q = new Int32Array(w * h); let qh = 0, qt = 0;
    labels.forEach((L, i) => { let x = Math.round(L.x / ds), y = Math.round(L.y / ds); x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y));
      // на свободную клетку рядом
      outer: for (let r = 0; r < 12; r++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) { const nx = x + k, ny = y + j; if (nx >= 0 && ny >= 0 && nx < w && ny < h && !m[ny * w + nx]) { x = nx; y = ny; break outer; } }
      const s = y * w + x; if (lab[s] < 0) { lab[s] = i; q[qt++] = s; } });
    while (qh < qt) { const c = q[qh++], x = c % w, y = (c - x) / w; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const n = ny * w + nx; if (!m[n] && lab[n] < 0) { lab[n] = lab[c]; q[qt++] = n; } } }
    const L = labels.map(l => [l.x / ds, l.y / ds]);
    const clear = (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); let wall = 0; for (let i = 1; i < n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); if (m[y * w + x]) { if (++wall > 1) return false; } else wall = 0; } return true; };
    return { lab, w, h, ds, at(px, py) {
      // сначала — ближайшая метка «в прямой видимости» (без стены между значком и меткой), иначе — по пути в обход стен
      const qx = px / ds, qy = py / ds, ord = L.map(([lx, ly], i) => [Math.hypot(lx - qx, ly - qy), i]).sort((p, q) => p[0] - q[0]); for (const [, i] of ord) if (clear(qx, qy, L[i][0], L[i][1])) return i;
      let x = Math.round(px / ds), y = Math.round(py / ds);
      for (let r = 0; r < 10; r++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) { const nx = x + k, ny = y + j; if (nx >= 0 && ny >= 0 && nx < w && ny < h && lab[ny * w + nx] >= 0) return lab[ny * w + nx]; }
      return -1; } };
  };

  /* ---------- поиск значков (Web Worker) ---------- */
  const WORKER = `
  function integ(g, w, h) { const I = new Float64Array((w + 1) * (h + 1)), I2 = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let s = 0, s2 = 0; for (let x = 0; x < w; x++) { const v = g[y * w + x]; s += v; s2 += v * v; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s; I2[(y + 1) * (w + 1) + x + 1] = I2[y * (w + 1) + x + 1] + s2; } }
    return { I, I2 }; }
  const box = (I, w, x, y, a, b) => I[(y + b) * (w + 1) + x + a] - I[y * (w + 1) + x + a] - I[(y + b) * (w + 1) + x] + I[y * (w + 1) + x];
  function down(g, w, h, f) { const W = Math.floor(w / f), H = Math.floor(h / f), o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += g[(y * f + j) * w + x * f + i]; o[y * W + x] = s / (f * f); } return { g: o, w: W, h: H }; }
  function rot(t, tw, th, r) { if (r === 0) return { t, w: tw, h: th }; let o, W = r % 2 ? th : tw, H = r % 2 ? tw : th; o = new Float32Array(W * H);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { let nx, ny; if (r === 1) { nx = th - 1 - y; ny = x; } else if (r === 2) { nx = tw - 1 - x; ny = th - 1 - y; } else { nx = y; ny = tw - 1 - x; } o[ny * W + nx] = t[y * tw + x]; }
    return { t: o, w: W, h: H }; }
  function resize(t, tw, th, k) { const W = Math.max(4, Math.round(tw * k)), H = Math.max(4, Math.round(th * k)), o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = Math.min(tw - 1.001, (x + 0.5) / k - 0.5), sy = Math.min(th - 1.001, (y + 0.5) / k - 0.5), x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy)), fx = Math.max(0, sx - x0), fy = Math.max(0, sy - y0);
      o[y * W + x] = t[y0 * tw + x0] * (1 - fx) * (1 - fy) + t[y0 * tw + x0 + 1] * fx * (1 - fy) + t[(y0 + 1) * tw + x0] * (1 - fx) * fy + t[(y0 + 1) * tw + x0 + 1] * fx * fy; }
    return { t: o, w: W, h: H }; }
  function prep(t) { const n = t.t.length; let m = 0; for (const v of t.t) m += v; m /= n; const z = new Float32Array(n); let nn = 0; for (let i = 0; i < n; i++) { z[i] = t.t[i] - m; nn += z[i] * z[i]; } return Object.assign({}, t, { z, norm: Math.sqrt(nn), mean: m }); }
  function ncc(img, S, T, x, y) { const n = T.w * T.h, s = box(S.I, img.w, x, y, T.w, T.h), s2 = box(S.I2, img.w, x, y, T.w, T.h), v = s2 - s * s / n; if (v <= 1e-6) return 0;
    let num = 0; for (let j = 0; j < T.h; j++) { const ro = (y + j) * img.w + x, to = j * T.w; for (let i = 0; i < T.w; i++) num += img.g[ro + i] * T.z[to + i]; } return num / (Math.sqrt(v) * T.norm); }
  function similar(a, b) { if (a.w !== b.w || a.h !== b.h) return false; let num = 0; for (let i = 0; i < a.z.length; i++) num += a.z[i] * b.z[i]; return num / (a.norm * b.norm) > 0.92; }
  onmessage = e => {
    const { g, w, h, templates, thr, region } = e.data, img = { g, w, h };
    const ts = Math.min(...templates.map(t => Math.min(t.w, t.h))) * Math.min(...(e.data.scales || [1])), f = Math.max(1, Math.min(4, Math.floor(ts / 8)));
    const small = down(g, w, h, f), Ss = integ(small.g, small.w, small.h), Sf = integ(g, w, h);
    const rx0 = Math.floor((region ? region.x0 : 0) / f), ry0 = Math.floor((region ? region.y0 : 0) / f), rx1 = Math.floor((region ? region.x1 : w) / f), ry1 = Math.floor((region ? region.y1 : h) / f);
    const cand = [];
    templates.forEach((tp, ti) => {
      const full = [], sm = [];
      for (const k of (e.data.scales || [1])) for (let r = 0; r < 4; r++) { const z = resize(tp.g, tp.w, tp.h, k), R = prep(rot(z.t, z.w, z.h, r)); if (full.some(o => similar(o, R))) continue; full.push(Object.assign(R, { r, k }));
        const d = down(R.t, R.w, R.h, f); sm.push(Object.assign(prep({ t: d.g, w: d.w, h: d.h }), { r })); }
      sm.forEach((T, k) => {
        const n = T.w * T.h, inkT = T.mean * n;
        for (let y = ry0; y < Math.min(ry1, small.h - T.h); y++) for (let x = rx0; x < Math.min(rx1, small.w - T.w); x++) {
          const s = box(Ss.I, small.w, x, y, T.w, T.h); if (s < inkT * 0.55 || s > inkT * 1.6) continue;
          const c = ncc(small, Ss, T, x, y); if (c > thr - 0.12) cand.push({ x: x * f, y: y * f, ti, k, c, cw: T.w * f, ch: T.h * f });
        }
        postMessage({ progress: (ti + (k + 1) / sm.length) / templates.length });
      });
      tp.full = full;
    });
    // уточнение на полном разрешении: лучший образец и поворот в окрестности
    cand.sort((a, b) => b.c - a.c);
    const out = [], taken = [];
    for (const c of cand) {
      const tsz = Math.max(c.cw, c.ch);
      if (taken.some(t => Math.abs(t.x - c.x) < tsz * 0.6 && Math.abs(t.y - c.y) < tsz * 0.6)) continue;
      let best = null;
      templates.forEach((tp, ti) => tp.full.forEach(T => { if (Math.abs(T.w - c.cw) > Math.max(3, c.cw * 0.2) && Math.abs(T.h - c.cw) > Math.max(3, c.cw * 0.2)) return; for (let dy = -f - 1; dy <= f + 1; dy++) for (let dx = -f - 1; dx <= f + 1; dx++) {
        const x = c.x + dx - Math.round((T.w - c.cw) / 2), y = c.y + dy - Math.round((T.h - c.ch) / 2);
        if (x < 0 || y < 0 || x + T.w >= w || y + T.h >= h) continue; const v = ncc(img, Sf, T, x, y); if (!best || v > best.c) best = { x, y, w: T.w, h: T.h, ti, r: T.r, c: v }; } }));
      if (best && best.c >= thr && !out.some(o => Math.abs(o.x + o.w / 2 - best.x - best.w / 2) < Math.min(o.w, best.w) * 0.6 && Math.abs(o.y + o.h / 2 - best.y - best.h / 2) < Math.min(o.h, best.h) * 0.6)) out.push(best);
      taken.push(c);
      if (out.length > 3000) break;
    }
    postMessage({ done: true, found: out });
  };`;
  let wurl = null;
  /** templates: [{g: Float32Array, w, h}], thr ~0.7. Возвращает [{x, y, w, h, ti, r, c}]. */
  S.find = (ink, templates, thr, region, onProgress) => new Promise((ok, no) => {
    wurl = wurl || URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }));
    const wk = new Worker(wurl);
    wk.onmessage = e => { if (e.data.progress != null && onProgress) onProgress(e.data.progress); if (e.data.done) { wk.terminate(); ok(e.data.found); } };
    wk.onerror = e => { wk.terminate(); no(new Error(e.message)); };
    wk.postMessage({ g: ink.g, w: ink.w, h: ink.h, templates: templates.map(t => ({ g: t.g, w: t.w, h: t.h })), thr, region, scales: S.scales || [0.7, 0.78, 0.86, 0.94, 1, 1.1, 1.22] });
  });
  /** Подписи рамок на плане: «Р-02» (Р-0N — рамка на N постов). */
  S.frameLabels = items => items.filter(i => /^[РP]\s*-\s*0?([1-5])$/.test(i.s)).map(i => ({ n: +i.s.match(/([1-5])$/)[1], x: i.x + i.w / 2, y: i.y - i.h / 3 }));
  S.cut = (ink, r) => { const g = new Float32Array(r.w * r.h); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) g[y * r.w + x] = ink.g[(r.y + y) * ink.w + r.x + x] || 0; return { g, w: r.w, h: r.h }; };

  /** Рамки: значки вплотную (по горизонтали или вертикали) — одна рамка. Возвращает кластеры индексов. */
  S.frames = dets => {
    const p = dets.map((_, i) => i), f = i => p[i] === i ? i : (p[i] = f(p[i]));
    for (let i = 0; i < dets.length; i++) for (let j = i + 1; j < dets.length; j++) {
      const a = dets[i], b = dets[j], s = Math.max(a.w, a.h, b.w, b.h);
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const horiz = Math.abs(ay - by) < s * 0.3 && Math.abs(ax - bx) < (a.w + b.w) / 2 + s * 0.25;
      const vert = Math.abs(ax - bx) < s * 0.3 && Math.abs(ay - by) < (a.h + b.h) / 2 + s * 0.25;
      if (horiz || vert) p[f(i)] = f(j);
    }
    const g = new Map(); dets.forEach((_, i) => { const r = f(i); if (!g.has(r)) g.set(r, []); g.get(r).push(i); });
    return [...g.values()];
  };

  /* ---------- поиск по цвету заливки (основной способ для цветных условных обозначений) ----------
     1) цвет заливки образца; 2) на плане — пятна этого цвета (тонкие серые линии поверх значка «сшиваются»);
     3) пятна одного значка объединяются (кольцо вокруг круга, половинки двухклавишного); 4) размер значка — самый частый;
     5) тип внутри цвета — по рисунку внутри значка (сравнение в нормированной сетке 24×24, 4 поворота). */
  S.rgbOf = cv => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const N = 24;
  function desc(get, x0, y0, w, h) {   // внутренняя часть значка в сетке N×N (без рамки), нормированная
    const v = new Float32Array((N - 6) * (N - 6)); let k = 0, m = 0;
    for (let j = 3; j < N - 3; j++) for (let i = 3; i < N - 3; i++) {
      const sx0 = x0 + i * w / N, sy0 = y0 + j * h / N, sx1 = x0 + (i + 1) * w / N, sy1 = y0 + (j + 1) * h / N; let s = 0, c = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) { s += get(x, y); c++; }
      v[k] = c ? s / c : 0; m += v[k]; k++; }
    m /= v.length; let n = 0, sd = 0; for (let i = 0; i < v.length; i++) { v[i] -= m; n += v[i] * v[i]; } sd = Math.sqrt(n / v.length); n = Math.sqrt(n);
    if (n > 1e-6) for (let i = 0; i < v.length; i++) v[i] /= n; return { v, sd, m };
  }
  function rotDesc(d, r) { if (!r) return d; const M = N - 6, o = new Float32Array(d.v.length); for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { let nx = x, ny = y; for (let q = 0; q < r; q++) { const t = nx; nx = M - 1 - ny; ny = t; } o[ny * M + nx] = d.v[y * M + x]; } return { v: o, sd: d.sd, m: d.m }; }
  /** Цвет заливки образца (в «чернилах» 0..1 по каналам) и рамка залитой части. */
  S.fillOf = (rgb, W, bb) => {
    const px = []; for (let y = bb.y; y < bb.y + bb.h; y++) for (let x = bb.x; x < bb.x + bb.w; x++) { const k = (y * W + x) * 4, r = 1 - rgb[k] / 255, g = 1 - rgb[k + 1] / 255, b = 1 - rgb[k + 2] / 255, gr = (r + g + b) / 3;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 0.06 && gr < 0.4) px.push([r, g, b]); }
    let col;
    if (px.length >= 8) { const h = new Map(); for (const p of px) { const k = p.map(v => Math.round(v * 63)).join(','); h.set(k, (h.get(k) || 0) + 1); } let bk = null, bc = 0; for (const [k, c] of h) if (c > bc) { bc = c; bk = k; } col = bk.split(',').map(v => +v / 63); }
    else {   // серая заливка: самый частый цвет средней плотности
      const h = new Map(); for (let y = bb.y; y < bb.y + bb.h; y++) for (let x = bb.x; x < bb.x + bb.w; x++) { const k = (y * W + x) * 4, gr = 1 - (rgb[k] + rgb[k + 1] + rgb[k + 2]) / 765; if (gr < 0.06 || gr > 0.6) continue; const key = (rgb[k] >> 2) + ',' + (rgb[k + 1] >> 2) + ',' + (rgb[k + 2] >> 2); h.set(key, (h.get(key) || 0) + 1); }
      let best = null, bc = 0; for (const [k, c] of h) if (c > bc) { bc = c; best = k; }
      if (!best || bc < bb.w * bb.h * 0.08) return null;
      col = best.split(',').map(v => 1 - (+v * 4 + 2) / 255);
    }
    // рамка залитой части — самая крупная связная область цвета заливки (а не все пиксели этого цвета: контуры бывают того же серого)
    const bw = bb.w, bh = bb.h, mm = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const k = ((y + bb.y) * W + x + bb.x) * 4; if (Math.max(Math.abs(1 - rgb[k] / 255 - col[0]), Math.abs(1 - rgb[k + 1] / 255 - col[1]), Math.abs(1 - rgb[k + 2] / 255 - col[2])) < 0.035) mm[y * bw + x] = 1; }
    const comps = [], seen = new Uint8Array(bw * bh), q = new Int32Array(bw * bh);
    for (let s0 = 0; s0 < bw * bh; s0++) { if (!mm[s0] || seen[s0]) continue; let qh = 0, qt = 0, a = 0, cx0 = 1e9, cy0 = 1e9, cx1 = -1, cy1 = -1; q[qt++] = s0; seen[s0] = 1;
      while (qh < qt) { const c = q[qh++], x = c % bw, y = (c - x) / bw; a++; if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue; const n = ny * bw + nx; if (mm[n] && !seen[n]) { seen[n] = 1; q[qt++] = n; } } }
      comps.push({ x0: cx0, y0: cy0, x1: cx1, y1: cy1, a }); }
    // главная область — с наибольшей площадью заливки; к ней — соседние куски того же значка (углы вокруг круга, половинки клавиш); тонкий контур рамки — нет
    comps.sort((p, q) => q.a - p.a); const M0 = comps[0]; if (!M0) return null;
    let x0 = M0.x0, y0 = M0.y0, x1 = M0.x1, y1 = M0.y1; const mw = x1 - x0 + 1, mh = y1 - y0 + 1, ex = Math.max(mw, mh) * 0.7;
    for (const c of comps.slice(1)) { if (c.a < 3) continue; const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1; if (c.a < 0.2 * cw * ch) continue;
      if (c.x0 >= M0.x0 - ex && c.x1 <= M0.x1 + ex && c.y0 >= M0.y0 - ex && c.y1 <= M0.y1 + ex) { const nx0 = Math.min(x0, c.x0), ny0 = Math.min(y0, c.y0), nx1 = Math.max(x1, c.x1), ny1 = Math.max(y1, c.y1); if (Math.abs((nx1 - nx0) - (ny1 - ny0)) <= Math.max(3, 0.25 * Math.max(nx1 - nx0, ny1 - ny0)) || (nx1 - nx0 <= Math.max(mw, mh) * 1.5 && ny1 - ny0 <= Math.max(mw, mh) * 1.5)) { x0 = nx0; y0 = ny0; x1 = nx1; y1 = ny1; } } }
    x0 += bb.x; x1 += bb.x; y0 += bb.y; y1 += bb.y;
    return x1 < 0 ? null : { col, fb: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
  };
  const TOL = 0.065, PTOL = 0.045; let DW = 0;
  S.setDW = v => { DW = v; }; let MODE = "raw"; S.setMode = v => { MODE = v; }; S.cfg = { rescale: false };
  S.findByColor = (rgb, W, H, ink, samples, region, src) => {
    const R = region || { x0: 0, y0: 0, x1: W, y1: H }, rx0 = Math.max(1, Math.floor(R.x0)), ry0 = Math.max(1, Math.floor(R.y0)), rx1 = Math.min(W - 2, Math.ceil(R.x1)), ry1 = Math.min(H - 2, Math.ceil(R.y1));
    // образцы: из того же рендера или (src) из рендера в масштабе значков плана — тогда рисунок совпадает пиксель в пиксель
    const tps = samples.map((s, i) => { const T = src && src.bbs[i] ? src : null, bb = T ? T.bbs[i] : s.bb, R0 = T ? T.rgb : rgb, W0 = T ? T.W : W, I0 = T ? T.ink : ink;
      { const gi = S.glyphColor(R0, W0, bb); if (gi && gi.inner) return null; }   // рисунок другого цвета внутри цветной рамки — искать рисунок
      const f = S.fillOf(R0, W0, bb); if (!f) return null;
      // значок с тёмным контуром вокруг заливки — этот способ; без контура (цветная точка, цветной контурный значок) — поиск по цветовой маске
      { const I1 = I0, fg = (f.col[0] + f.col[1] + f.col[2]) / 3, th = Math.max(0.45, fg + 0.22), at = (x, y) => I1.g[y * I1.w + x] || 0; let n = 0, d = 0; const b = f.fb;
        const P = (x, y, ox, oy) => { n++; if (at(x + ox, y + oy) > th || at(x + 2 * ox, y + 2 * oy) > th) d++; };
        for (let x = b.x; x < b.x + b.w; x++) { P(x, b.y, 0, -1); P(x, b.y + b.h - 1, 0, 1); } for (let y = b.y; y < b.y + b.h; y++) { P(b.x, y, -1, 0); P(b.x + b.w - 1, y, 1, 0); }
        if (d < n * 0.6) return null; }
      const fg = (f.col[0] + f.col[1] + f.col[2]) / 3, d = desc((x, y) => I0.g[y * I0.w + x] || 0, f.fb.x - 1, f.fb.y - 1, f.fb.w + 2, f.fb.h + 2), dm = desc((x, y) => (Math.abs((I0.g[y * I0.w + x] || 0) - fg) > 0.09 ? 1 : 0), f.fb.x - 1, f.fb.y - 1, f.fb.w + 2, f.fb.h + 2);
      const f0 = T ? S.fillOf(rgb, W, s.bb) : f;
      return { i, col: f.col, fs: Math.max((f0 || f).fb.w, (f0 || f).fb.h), d: [0, 1, 2, 3].map(r => rotDesc(d, r)), dm: [0, 1, 2, 3].map(r => rotDesc(dm, r)) }; });
    const pal = []; tps.forEach(t => { if (t && !pal.some(c => Math.max(...c.map((v, k) => Math.abs(v - t.col[k]))) < PTOL)) pal.push(t.col); });
    const boxes = [], w = rx1 - rx0, h = ry1 - ry0, m = new Uint8Array(w * h), lab = new Int32Array(w * h), q = new Int32Array(w * h);
    for (const col of pal) {
      const fsC = tps.filter(t => t && Math.max(...t.col.map((v, k) => Math.abs(v - col[k]))) < PTOL).map(t => t.fs), maxS = Math.max(...fsC) * 1.8, minFs = Math.min(...fsC);
      m.fill(0);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = ((y + ry0) * W + x + rx0) * 4; if (Math.abs(1 - rgb[k] / 255 - col[0]) < TOL && Math.abs(1 - rgb[k + 1] / 255 - col[1]) < TOL && Math.abs(1 - rgb[k + 2] / 255 - col[2]) < TOL) m[y * w + x] = 1; }
      // сшить тонкие светлые линии поверх заливки
      const light = (x, y) => { const k = ((y + ry0) * W + x + rx0) * 4, r = 1 - rgb[k] / 255, g = 1 - rgb[k + 1] / 255, b = 1 - rgb[k + 2] / 255; return (r + g + b) / 3 < 0.4 && Math.max(r, g, b) - Math.min(r, g, b) < 0.05; };
      for (const [dx, dy] of [[1, 0], [0, 1]]) for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { const o = y * w + x; if (m[o] || !light(x, y)) continue;
        for (let d = 1; d <= 2; d++) if (m[(y - d * dy) * w + x - d * dx] && m[(y + d * dy) * w + x + d * dx]) { m[o] = 1; break; } }
      // связные области
      lab.fill(0); let nl = 0; const bx = [];
      for (let s = 0; s < w * h; s++) { if (!m[s] || lab[s]) continue; nl++; let qh = 0, qt = 0; q[qt++] = s; lab[s] = nl; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, area = 0;
        while (qh < qt) { const c = q[qh++], x = c % w, y = (c - x) / w; area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const nx = x + i, ny = y + j; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const n = ny * w + nx; if (m[n] && !lab[n]) { lab[n] = nl; q[qt++] = n; } } }
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1; if (bw < 4 || bh < 4 || bw > maxS || bh > maxS || area < 0.2 * bw * bh) continue; bx.push([x0 + rx0, y0 + ry0, x1 + rx0 + 1, y1 + ry0 + 1]); }
      // вложенные / перекрывающиеся — одно
      for (let ch = true; ch;) { ch = false; outer: for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) { const A = bx[i], B = bx[j];
        if (Math.min(A[2], B[2]) > Math.max(A[0], B[0]) && Math.min(A[3], B[3]) > Math.max(A[1], B[1])) { bx[i] = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])]; bx.splice(j, 1); ch = true; break outer; } } }
      // у значка — тёмный контур вокруг заливки (отсекает штриховку стен, текст, заливки мебели)
      const inkAt = (x, y) => ink.g[y * ink.w + x] || 0;
      const ringOk = b => { let n = 0, d = 0; const x0 = b[0], y0 = b[1], x1 = b[2] - 1, y1 = b[3] - 1;
        const fi = (col[0] + col[1] + col[2]) / 3, thr = Math.max(0.45, fi + 0.22);
        const P = (x, y, ox, oy) => { n++; if (inkAt(x + ox, y + oy) > thr || inkAt(x + 2 * ox, y + 2 * oy) > thr) d++; };
        for (let x = x0; x <= x1; x++) { P(x, y0, 0, -1); P(x, y1, 0, 1); } for (let y = y0; y <= y1; y++) { P(x0, y, -1, 0); P(x1, y, 1, 0); }
        return d >= n * 0.7; };
      // кусок заливки (угол вокруг круга, половинка клавиши) — расширить до тёмного контура значка
      const fgi = (col[0] + col[1] + col[2]) / 3, dth = Math.max(0.45, fgi + 0.2), dkk = (x, y) => inkAt(x, y) > dth;
      const isFill = (x, y) => { const k = (y * W + x) * 4; return Math.abs(1 - rgb[k] / 255 - col[0]) < TOL && Math.abs(1 - rgb[k + 1] / 255 - col[1]) < TOL && Math.abs(1 - rgb[k + 2] / 255 - col[2]) < TOL; };
      // контур значка — лучами от центра куска до длинных тёмных линий (дуги круга короткие, стороны квадрата — длинные)
      const Lmin = Math.max(8, Math.round(minFs * 0.65));
      const run = (x, y, dx, dy) => { let n = 0, gap = 0; for (let k = 1; k < 80; k++) { const X = x + dx * k, Y = y + dy * k; if (X < 0 || Y < 0 || X >= W || Y >= H) break; if (dkk(X, Y)) { n++; gap = 0; } else if (++gap > 1) break; } return n; };
      const vRun = (x, y) => (dkk(x, y) ? 1 : 0) + run(x, y, 0, -1) + run(x, y, 0, 1), hRun = (x, y) => (dkk(x, y) ? 1 : 0) + run(x, y, -1, 0) + run(x, y, 1, 0);
      const ray = (cx, cy, dx, dy, from = 0) => { for (let k = from; k <= maxS; k++) { const X = cx + dx * k, Y = cy + dy * k; if (X < 1 || Y < 1 || X >= W - 1 || Y >= H - 1) return null; if (dkk(X, Y) && (dx ? vRun(X, Y) : hRun(X, Y)) >= Lmin) return k; } return null; };
      const expand = b => { const cx = Math.round((b[0] + b[2]) / 2), cy = Math.round((b[1] + b[3]) / 2);
        let l = ray(cx, cy, -1, 0), r = ray(cx, cy, 1, 0), u = ray(cx, cy, 0, -1), d = ray(cx, cy, 0, 1); if (l == null || r == null || u == null || d == null) return null;
        let x0 = cx - l + 1, x1 = cx + r - 1, y0 = cy - u + 1, y1 = cy + d - 1;
        for (let it = 0; it < 3; it++) { const w0 = x1 - x0 + 1, h0 = y1 - y0 + 1;   // перегородки двух-/трёхклавишных
          if (w0 < h0 * 0.8) { const rr = ray(x1 + 1, cy, 1, 0, 2); if (rr != null && x1 + rr - x0 <= h0 * 1.15) x1 = x1 + rr; else { const ll = ray(x0 - 1, cy, -1, 0, 2); if (ll != null && x1 - (x0 - ll) <= h0 * 1.15) x0 = x0 - ll; else break; } }
          else if (h0 < w0 * 0.8) { const dd = ray(cx, y1 + 1, 0, 1, 2); if (dd != null && y1 + dd - y0 <= w0 * 1.15) y1 = y1 + dd; else { const uu = ray(cx, y0 - 1, 0, -1, 2); if (uu != null && y1 - (y0 - uu) <= w0 * 1.15) y0 = y0 - uu; else break; } }
          else break; }
        if (x1 - x0 < 4 || y1 - y0 < 4) return null;
        return [x0, y0, x1 + 1, y1 + 1]; };
      const ex = []; for (const b of bx) { const e = window.SYM_RAY ? expand(b) : b; if (e && !ex.some(o => Math.abs(o[0] - e[0]) <= 2 && Math.abs(o[1] - e[1]) <= 2 && Math.abs(o[2] - e[2]) <= 2 && Math.abs(o[3] - e[3]) <= 2)) ex.push(e); }
      (S._dbgE = S._dbgE || []).push([col.map(v => +v.toFixed(2)).join(','), bx.length, ex.length, ex.filter(ringOk).length, JSON.stringify(ex.slice(0, 3))]);
      ex.filter(ringOk).forEach(b => boxes.push({ b, col }));
    }
    // типичный размер значка
    const hist = {}; boxes.forEach(({ b }) => { const bw = b[2] - b[0], bh = b[3] - b[1]; if (Math.abs(bw - bh) <= 2 && Math.max(bw, bh) >= 6) hist[Math.max(bw, bh)] = (hist[Math.max(bw, bh)] || 0) + 1; });
    let Sz = 0, best = -1; for (const k in hist) { const c = (hist[k] || 0) + (hist[+k - 1] || 0) * 0.5 + (hist[+k + 1] || 0) * 0.5; if (c > best) { best = c; Sz = +k; } }
    if (!Sz) return { found: [], noColor: tps.map((t, i) => (t ? null : i)).filter(v => v != null) };
    // соседние части одного значка (половинки двухклавишного выключателя)
    for (const col of pal) {
      const bx = boxes.filter(o => o.col === col);
      for (let ch = true; ch;) { ch = false; outer: for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) { const A = bx[i].b, B = bx[j].b, U = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])];
        const gx = Math.max(A[0], B[0]) - Math.min(A[2], B[2]), gy = Math.max(A[1], B[1]) - Math.min(A[3], B[3]);
        if (Math.max(gx, gy) <= 3 && Math.abs((U[2] - U[0]) - (U[3] - U[1])) <= 3 && Math.max(U[2] - U[0], U[3] - U[1]) <= Sz + 3 && Math.min(A[2] - A[0], A[3] - A[1]) < Sz * 0.75) { bx[i].b = U; boxes.splice(boxes.indexOf(bx[j]), 1); bx.splice(j, 1); ch = true; break outer; } } }
    }
    // кандидаты по группам цвета: дескриптор «как есть» и «метки» (всё, что отличается от заливки)
    const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
    const groups = new Map();
    for (const { b, col } of boxes) {
      const bw = b[2] - b[0], bh = b[3] - b[1]; if (Math.max(bw, bh) < 0.7 * Sz || Math.max(bw, bh) > 1.3 * Sz || Math.min(bw, bh) < 0.6 * Sz) continue;
      const vals = []; for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) vals.push(ink.g[y * ink.w + x] || 0); vals.sort((p, q) => p - q);
      const fg = vals[vals.length >> 1], raw = desc((x, y) => ink.g[y * ink.w + x] || 0, b[0] - 1, b[1] - 1, bw + 2, bh + 2), mark = desc((x, y) => (Math.abs((ink.g[y * ink.w + x] || 0) - fg) > 0.09 ? 1 : 0), b[0] - 1, b[1] - 1, bw + 2, bh + 2);
      const sh = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sh.push({ raw: dx || dy ? desc((x, y) => ink.g[y * ink.w + x] || 0, b[0] - 1 + dx, b[1] - 1 + dy, bw + 2, bh + 2) : raw, mark: dx || dy ? desc((x, y) => (Math.abs((ink.g[y * ink.w + x] || 0) - fg) > 0.09 ? 1 : 0), b[0] - 1 + dx, b[1] - 1 + dy, bw + 2, bh + 2) : mark });
      const hm = new Map(); for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) { const k = (y * W + x) * 4, gr = 1 - (rgb[k] + rgb[k + 1] + rgb[k + 2]) / 765; if (gr < 0.04 || gr > 0.62) continue; const kk = (rgb[k] >> 2) * 4096 + (rgb[k + 1] >> 2) * 64 + (rgb[k + 2] >> 2); hm.set(kk, (hm.get(kk) || 0) + 1); }
      let tk = -1, tc = 0; for (const [kk, c] of hm) if (c > tc) { tc = c; tk = kk; }
      const tf = tk < 0 ? col : [tk >> 12, (tk >> 6) & 63, tk & 63].map(v => 1 - (v * 4 + 2) / 255);
      const key = col.join(','); if (!groups.has(key)) groups.set(key, { col, items: [] }); groups.get(key).items.push({ b, raw, mark, sh, tf, rr: [0, 1, 2, 3].map(r => rotDesc(raw, r)) });
    }
    const part = (td, pd) => td.sd > 0.03 ? dot(td.v, pd.v) : 1 - 6 * pd.sd;
    // одинаковый цвет заливки в таблице и на плане — рисунок совпадает, сравниваем «как есть»; иначе — только метки (толщина линий другая)
    const score = (m, t, same) => { let best = -9; for (let r = 0; r < 4; r++) { const vr = part(t.d[r], m.raw) - DW * Math.abs(m.raw.m - t.d[r].m), vm = (t.dm[r].sd > 0.05 ? dot(t.dm[r].v, m.mark.v) : 1 - 4 * m.mark.sd) - 1.5 * Math.abs(m.mark.m - t.dm[r].m), v = (window.SYM_MODE || MODE) === 'max' ? Math.max(vr, vm) : same ? vr : vm; if (v > best) best = v; } return best; };
    const found = []; S._dbg = [];
    for (const { col, items } of groups.values()) {
      const cands = tps.filter(t => t && Math.max(...t.col.map((v, k) => Math.abs(v - col[k]))) < PTOL); if (!cands.length) continue;
      // похожие значки плана — в группы (рисунок на плане может отличаться от таблицы толщиной линий)
      const cl = [];
      for (const it of items) { let bc = null, bs = 0.82; for (const c of cl) { const v = it.raw.sd < 0.03 && c.rep.raw.sd < 0.03 ? 1 : Math.max(...it.rr.map(r => dot(r.v, c.rep.raw.v))); if (v > bs) { bs = v; bc = c; } } if (bc) bc.mem.push(it); else cl.push({ rep: it, mem: [it] }); }
      cl.forEach(c => { const b = c.rep.b, cs = [[], [], []]; for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) { const k = (y * W + x) * 4, px = [0, 1, 2].map(q => 1 - rgb[k + q] / 255); if (px.every((v, q) => Math.abs(v - col[q]) < TOL)) for (let q = 0; q < 3; q++) cs[q].push(px[q]); } c.fill = cs[0].length ? cs.map(a => a.sort((p, q) => p - q)[a.length >> 1]) : col; });
      (S._dbg = S._dbg || []).push({ col: col.map(v => +v.toFixed(3)), cl: cl.map(c => ({ n: c.mem.length, fill: c.fill.map(v => +v.toFixed(3)) })), t: cands.map(t => t.col.map(v => +v.toFixed(3))) });
      // тип — по каждому значку отдельно; группы похожих значков нужны для проверки в интерфейсе
      cl.forEach((c, i) => c.mem.forEach(m => { let bt = null, bv = -9, b2 = -9; for (const t of cands) { const same = (window.SYM_MODE || MODE) === "raw", v = Math.max(...m.sh.map(q => score(q, t, same))) - 8 * Math.max(...t.col.map((u, k) => Math.abs(u - m.tf[k]))); if (S._dbgS && c === cl.reduce((a, q) => q.mem.length > a.mem.length ? q : a) && m === c.mem[0]) S._dbgS.push([t.i, +v.toFixed(3), t.d[0].sd.toFixed(3), +m.raw.sd.toFixed(3), +m.raw.m.toFixed(3), +t.d[0].m.toFixed(3)]); if (v > bv) { b2 = bv; bv = v; bt = t; } else if (v > b2) b2 = v; }
        found.push({ x: m.b[0] - 1, y: m.b[1] - 1, w: m.b[2] - m.b[0] + 2, h: m.b[3] - m.b[1] + 2, ti: bt.i, c: bv, margin: cands.length > 1 ? bv - b2 : 1, byColor: true, grp: col.join(',') + '#' + i }); }));
    }
    // внутри группы одинаковых значков — один тип: по большинству (с учётом уверенности)
    const byG = new Map(); found.forEach(d => { if (!byG.has(d.grp)) byG.set(d.grp, []); byG.get(d.grp).push(d); });
    for (const ds of byG.values()) { const v = new Map(); ds.forEach(d => v.set(d.ti, (v.get(d.ti) || 0) + 1 + Math.max(0, d.margin || 0) * 5)); let bt = ds[0].ti, bv = -1; for (const [t, c] of v) if (c > bv) { bv = c; bt = t; }
      const mixed = v.size > 1; ds.forEach(d => { if (d.ti !== bt) d.margin = 0; d.ti = bt; if (mixed) d.margin = Math.min(d.margin ?? 1, 0.05); }); }
    // один значок мог попасть в две близкие по цвету группы — оставить лучший
    found.sort((a, b) => b.c - a.c); const keep = [];
    for (const d of found) if (!keep.some(o => Math.abs(o.x + o.w / 2 - d.x - d.w / 2) < Math.min(o.w, d.w) * 0.5 && Math.abs(o.y + o.h / 2 - d.y - d.h / 2) < Math.min(o.h, d.h) * 0.5)) keep.push(d);
    found.length = 0; found.push(...keep);
    const fss = tps.filter(Boolean).map(t => t.fs).sort((a, b) => a - b);
    return { found, size: Sz, tplSize: fss.length ? fss[fss.length >> 1] : 0, noColor: tps.map((t, i) => (t ? null : i)).filter(v => v != null) };
  };
  /** Главный цвет значка (насыщенный), если есть. */
  S.keyColor = (rgb, W, bb) => { const h = new Map(); let n = 0;
    for (let y = bb.y; y < bb.y + bb.h; y++) for (let x = bb.x; x < bb.x + bb.w; x++) { const k = (y * W + x) * 4, r = rgb[k], g = rgb[k + 1], b = rgb[k + 2]; if (Math.max(r, g, b) - Math.min(r, g, b) < 60) continue; n++; const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4); h.set(key, (h.get(key) || 0) + 1); }
    if (n < 6) return null; let bk = null, bc = 0; for (const [k, c] of h) if (c > bc) { bc = c; bk = k; } return bk.split(',').map(v => +v * 16 + 8); };
  /** Цвет значка для поиска: если значок — цветная рамка/заливка с рисунком другого цвета внутри (розетка в розовой рамке), ищем рисунок. */
  S.glyphColor = (rgb, W, bb, satMin = 50) => {
    const h = new Map();
    for (let y = bb.y; y < bb.y + bb.h; y++) for (let x = bb.x; x < bb.x + bb.w; x++) { const k = (y * W + x) * 4, r = rgb[k], g = rgb[k + 1], b = rgb[k + 2]; if (Math.max(r, g, b) - Math.min(r, g, b) < satMin) continue; const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4); const e = h.get(key) || { n: 0, c: [r & 0xF0 | 8, g & 0xF0 | 8, b & 0xF0 | 8] }; e.n++; h.set(key, e); }
    const cl = []; for (const e of [...h.values()].sort((a, b) => b.n - a.n)) { const m = cl.find(c => Math.max(...c.c.map((v, i) => Math.abs(v - e.c[i]))) < 48); if (m) m.n += e.n; else cl.push({ c: e.c, n: e.n }); }
    if (!cl.length || cl[0].n < 6) return satMin > 24 ? S.glyphColor(rgb, W, bb, 24) : null;   // бледный цветной значок (сиреневый) — по мягкому порогу
    const lum = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2], area = bb.w * bb.h;
    let pick = cl[0];
    if (cl[0].n > area * 0.3) { const g2 = cl.slice(1).find(c => c.n >= 12 && lum(c.c) < lum(cl[0].c) - 30); if (g2) pick = g2; }
    // рамка рисунка этого цвета
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = bb.y; y < bb.y + bb.h; y++) for (let x = bb.x; x < bb.x + bb.w; x++) { const k = (y * W + x) * 4; if (Math.max(Math.abs(rgb[k] - pick.c[0]), Math.abs(rgb[k + 1] - pick.c[1]), Math.abs(rgb[k + 2] - pick.c[2])) < 48) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    return { c: pick.c, bb: pick === cl[0] ? bb : { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 3, h: y1 - y0 + 3 }, inner: pick !== cl[0] };
  };
  /** Обрезать рамку-контур значка того же цвета: остаётся рисунок внутри (розетка внутри рамки). */
  S.trimFrame = m => {
    let x0 = 0, y0 = 0, x1 = m.w - 1, y1 = m.h - 1; const at = (x, y) => m.g[y * m.w + x];
    const row = y => { let c = 0; for (let x = x0; x <= x1; x++) c += at(x, y) > 0.5; return c / (x1 - x0 + 1); }, col = x => { let c = 0; for (let y = y0; y <= y1; y++) c += at(x, y) > 0.5; return c / (y1 - y0 + 1); };
    let cut = false;
    for (let k = 0; k < 4; k++) { // контур + отступ
      while (y1 - y0 > 6 && row(y0) < 0.02) y0++; while (y1 - y0 > 6 && row(y1) < 0.02) y1--; while (x1 - x0 > 6 && col(x0) < 0.02) x0++; while (x1 - x0 > 6 && col(x1) < 0.02) x1--;
      if (row(y0) > 0.6 && row(y1) > 0.6 && col(x0) > 0.6 && col(x1) > 0.6 && x1 - x0 > 10 && y1 - y0 > 10) { let d = 0; while (d < 4 && (row(y0) > 0.4 || col(x0) > 0.4)) { y0++; y1--; x0++; x1--; d++; } cut = true; } else break; }
    if (!cut) return null;
    while (y1 - y0 > 4 && row(y0) < 0.02) y0++; while (y1 - y0 > 4 && row(y1) < 0.02) y1--; while (x1 - x0 > 4 && col(x0) < 0.02) x0++; while (x1 - x0 > 4 && col(x1) < 0.02) x1--;
    if (x1 - x0 < 4 || y1 - y0 < 4) return null;
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(m.w - 1, x1 + 1); y1 = Math.min(m.h - 1, y1 + 1);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, g = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = at(x + x0, y + y0); return { g, w, h, dx: x0, dy: y0 };
  };
  /** Толщина цветных пятен без тонких линий: маска → эрозия (радиус 2) → связные области → меньшая сторона.
   *  Возвращает массив меньших сторон (вернув толщину, снятую эрозией). Нужна, чтобы оценить масштаб значков плана относительно образца. */
  S.blobSides = (m, box, ex) => {
    const x0 = box ? Math.max(2, Math.floor(box.x0)) : 2, y0 = box ? Math.max(2, Math.floor(box.y0)) : 2, x1 = box ? Math.min(m.w - 3, Math.ceil(box.x1)) : m.w - 3, y1 = box ? Math.min(m.h - 3, Math.ceil(box.y1)) : m.h - 3;
    const w = x1 - x0 + 1, h = y1 - y0 + 1; if (w < 3 || h < 3) return [];
    const on = (x, y) => m.g[y * m.w + x] > 0.5, er = new Uint8Array(w * h);
    // эрозия крестом радиуса 2 (быстро и достаточно, чтобы убрать линии толщиной до 4 px)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const X = x + x0, Y = y + y0; if (on(X, Y) && on(X - 2, Y) && on(X + 2, Y) && on(X, Y - 2) && on(X, Y + 2) && on(X - 1, Y - 1) && on(X + 1, Y + 1) && on(X - 1, Y + 1) && on(X + 1, Y - 1)) er[y * w + x] = 1; }
    const lab = new Uint8Array(w * h), q = new Int32Array(w * h), out = [];
    for (let s0 = 0; s0 < w * h; s0++) { if (!er[s0] || lab[s0]) continue; let qh = 0, qt = 0, a = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1; q[qt++] = s0; lab[s0] = 1;
      while (qh < qt) { const c = q[qh++], x = c % w, y = (c - x) / w; a++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        if (x > 0 && er[c - 1] && !lab[c - 1]) { lab[c - 1] = 1; q[qt++] = c - 1; } if (x < w - 1 && er[c + 1] && !lab[c + 1]) { lab[c + 1] = 1; q[qt++] = c + 1; }
        if (y > 0 && er[c - w] && !lab[c - w]) { lab[c - w] = 1; q[qt++] = c - w; } if (y < h - 1 && er[c + w] && !lab[c + w]) { lab[c + w] = 1; q[qt++] = c + w; } }
      const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, cx = bx0 + x0 + bw / 2, cy = by0 + y0 + bh / 2;
      if (a < 6 || (ex && ex.some(e => cx > e.x0 && cx < e.x1 && cy > e.y0 && cy < e.y1))) continue;
      out.push({ s: Math.min(bw, bh) + 4, l: Math.max(bw, bh) + 4, a, x0: bx0 + x0 - 2, y0: by0 + y0 - 2, x1: bx1 + x0 + 3, y1: by1 + y0 + 3 }); }
    return out;
  };
  /** «Чернила» по цвету: 1 — пиксель того же цвета, 0 — другой (линии другого цвета, текст, штриховка не мешают). */
  S.colorInk = (rgb, W, H, col, box) => { const x0 = box ? box.x : 0, y0 = box ? box.y : 0, w = box ? box.w : W, h = box ? box.h : H, g = new Float32Array(w * h);
    const sat = Math.max(...col) - Math.min(...col);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = ((y + y0) * W + x + x0) * 4, r = rgb[k], gg = rgb[k + 1], b = rgb[k + 2];
      const d = Math.max(Math.abs(r - col[0]), Math.abs(gg - col[1]), Math.abs(b - col[2])), s2 = Math.max(r, gg, b) - Math.min(r, gg, b);
      // сглаженные края — частичное совпадение: оттенок тот же, насыщенность меньше
      let v = d < 40 && !(sat >= 20 && sat < 60 && s2 < sat * 0.5) ? 1 : 0;   // бледный цвет (сиреневый) не путать с серыми линиями плана if (!v && sat > 60 && s2 > 25) { const hue = (c) => Math.atan2(Math.sqrt(3) * (c[1] - c[2]), 2 * c[0] - c[1] - c[2]); const dh = Math.abs(hue([r, gg, b]) - hue(col)); if (Math.min(dh, 2 * Math.PI - dh) < 0.35) v = Math.min(1, s2 / sat); }
      g[y * w + x] = v; }
    return { g, w, h };
  };
  window.SYM = S;
})();
