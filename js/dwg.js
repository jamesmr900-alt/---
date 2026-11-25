/* Чертежи DWG/DXF для вкладки «По чертежу»: чтение (libredwg, WebAssembly), картинка листа и значки по векторным данным.
   Светильники в DWG — это вставки блоков (одинаковое имя блока = один тип) или, в экспорте DIALux, номера-индексы
   возле светильников и таблица «Перечень светильников». Количество считается точно по объектам чертежа,
   а картинка нужна, чтобы глазами проверить, что и где найдено. */
(function () {
  'use strict';
  const D = {};
  let modP = null;
  const base = () => new URL('vendor/libredwg/', document.baseURI).href;
  /** Загрузка библиотеки (≈8 МБ, только при первом открытии DWG). */
  D.lib = () => modP || (modP = (async () => {
    const m = await import(base() + 'dist/libredwg-web.js');
    const lib = await m.LibreDwg.create(base() + 'wasm');
    return { m, lib };
  })());

  /** Файл DWG/DXF → база чертежа (таблицы, блоки, объекты). */
  D.open = async file => {
    const { m, lib } = await D.lib(); let buf = await file.arrayBuffer();
    const dxf = /\.dxf$/i.test(file.name);
    if (dxf) { // текстовый DXF: кириллицу — в коды \U+XXXX (так библиотека читает её без потерь при любой кодировке файла)
      const u8 = new Uint8Array(buf); let txt; try { txt = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { txt = new TextDecoder('windows-1251').decode(u8); }
      if (/[^\x00-\x7F]/.test(txt)) buf = new TextEncoder().encode(txt.replace(/[^\x00-\x7F]/g, c => '\\U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))).buffer; }
    const dwg = lib.dwg_read_data(buf, dxf ? m.Dwg_File_Type.DXF : m.Dwg_File_Type.DWG);
    if (!dwg) throw new Error('файл не прочитан (повреждён или неподдерживаемая версия)');
    const db = lib.convert(dwg); try { lib.dwg_free(dwg); } catch (e) { }
    return db;
  };

  /* ---------- цвета AutoCAD (ACI) ---------- */
  const ACI = { 1: '#e00000', 2: '#b8a000', 3: '#00a000', 4: '#00a0a0', 5: '#0000e0', 6: '#c000c0', 7: '#000000', 8: '#606060', 9: '#909090', 250: '#333', 251: '#505050', 252: '#696969', 253: '#808080', 254: '#bebebe', 255: '#d0d0d0' };
  function aci(i) {
    if (ACI[i]) return ACI[i];
    if (i >= 10 && i <= 249) { // упрощённая палитра: тон по номеру, тёмные оттенки для читаемости на белом
      const h = ((i - 10) / 240) * 360, odd = (i % 10) % 2, l = (i % 10) < 4 ? 40 : 30 + odd * 10;
      return `hsl(${Math.round(h)},70%,${l}%)`; }
    return '#000';
  }
  const rgbHex = c => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
  const darken = hex => { // жёлтые и очень светлые цвета на белом не видны
    const m = /^#(..)(..)(..)$/.exec(hex); if (!m) return hex; let [r, g, b] = m.slice(1).map(v => parseInt(v, 16)); const l = 0.3 * r + 0.59 * g + 0.11 * b;
    if (l > 170) { const k = 170 / l; r *= k; g *= k; b *= k; } return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); };

  /** Кодировка: UTF-8, прочитанный как Latin-1 («Ð¡Ð²ÐµÑ‚»), и cp1251 как Latin-1 («Ñâåò»). */
  const dec = new TextDecoder('utf-8', { fatal: true }), W1252 = new Map([...'€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ'].map((c, i) => [c, 0x80 + i]));
  D.fix = t => { t = String(t || '').replace(/\\U\+([0-9A-Fa-f]{4})/g, (s, h) => String.fromCharCode(parseInt(h, 16))); if (!/[\u0080-\u00FF]/.test(t) || /[\u0400-\u04FF]/.test(t)) return t;
    if (/[\u00D0\u00D1]/.test(t)) { try { const B = []; for (const c of t) { const o = c.charCodeAt(0), q = o < 256 ? o : W1252.get(c); if (q == null) throw 0; B.push(q); } return dec.decode(Uint8Array.from(B)); } catch (e) { } }
    return window.SYM && SYM.fixText ? SYM.fixText(t) : t; };
  /** MTEXT: убрать коды форматирования. */
  D.plain = t => D.fix(t)
    .replace(/\\[Pp]/g, '\n').replace(/\\~/g, ' ')
    .replace(/\\[ACcFfHhQqTtWw][^;\\{}]*;/g, '').replace(/\\[LlOoKk]/g, '')
    .replace(/\\S([^;]*)[\^#/]([^;]*);/g, '$1/$2')
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (s, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '')
    .replace(/[{}]/g, '').replace(/\\\\/g, '\\').replace(/[ \t]+/g, ' ').trim();

  /* ---------- разворачивание блоков в примитивы (мировые координаты) ---------- */
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const ap = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const I = [1, 0, 0, 1, 0, 0];
  const arcPts = (cx, cy, r, a0, a1, M) => { let da = a1 - a0; while (da <= 0) da += Math.PI * 2; const n = Math.max(6, Math.min(72, Math.ceil(da / (Math.PI / 24)))), P = [];
    for (let i = 0; i <= n; i++) { const a = a0 + da * i / n; P.push(ap(M, cx + r * Math.cos(a), cy + r * Math.sin(a))); } return P; };
  /** Вершины с bulge (дуги в полилинии) → точки. */
  function bulgePts(V, closed, M) {
    const P = [], n = V.length; if (!n) return P;
    for (let i = 0; i < n; i++) { const a = V[i], b = V[(i + 1) % n], bu = a.bulge || 0; P.push(ap(M, a.x, a.y)); if (i === n - 1 && !closed) break;
      if (Math.abs(bu) > 1e-6) { const th = 4 * Math.atan(bu), dx = b.x - a.x, dy = b.y - a.y, c = Math.hypot(dx, dy); if (c < 1e-9) continue; const r = c / (2 * Math.sin(th / 2)), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = r * Math.cos(th / 2);
        const cx = mx - h * dy / c, cy = my + h * dx / c, a0 = Math.atan2(a.y - cy, a.x - cx), k = Math.max(4, Math.ceil(Math.abs(th) / (Math.PI / 18)));
        for (let j = 1; j < k; j++) { const t = a0 + th * j / k; P.push(ap(M, cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t))); } } }
    if (closed) P.push(P[0]); return P;
  }
  const ang = v => (Math.abs(v) > Math.PI * 2 + 0.01 ? v * Math.PI / 180 : v);   // градусы или радианы

  /** База → {lines:[{p, c}], fills, texts:[{s,x,y,h,rot,c}], inserts:[{name, M, bb, attrs, layer}], layers}. */
  D.flatten = db => {
    (db.tables.BLOCK_RECORD.entries || []).forEach(b => { b.name0 = b.name; b.dname = D.fix(b.name); });
    const blocks = new Map(); (db.tables.BLOCK_RECORD.entries || []).forEach(b => blocks.set(b.name, b));
    const byHandle = new Map(); (db.tables.BLOCK_RECORD.entries || []).forEach(b => byHandle.set(b.handle, b));
    const layers = new Map(); (db.tables.LAYER.entries || []).forEach(l => layers.set(l.name, l));
    const ms = (db.tables.BLOCK_RECORD.entries || []).find(b => /^\*model_space$/i.test(b.name));
    const out = { lines: [], fills: [], texts: [], inserts: [], layers };
    const LN = new Map(), lname = L => { if (!LN.has(L)) LN.set(L, D.fix(L)); return LN.get(L); };
    const hidden = L => { const l = layers.get(L); return l && (l.off || l.frozen || l.colorIndex < 0); };
    const colorOf = (e, parentC) => {
      if (e.color != null && e.color > 0 && e.colorIndex === 257) return darken(rgbHex(e.color));
      let ci = e.colorIndex == null ? 256 : e.colorIndex;
      if (ci === 0) return parentC || '#000';
      if (ci === 256) { const l = layers.get(e.layer); if (!l) return parentC || '#000'; if (l.color > 0 && (l.colorIndex === 257 || l.colorIndex == null)) return darken(rgbHex(l.color)); ci = Math.abs(l.colorIndex || 7); }
      return darken(aci(ci));
    };
    let budget = 3e6;
    function walk(list, M, depth, parentC, parentL, top) {
      for (const e of list) {
        if (--budget < 0) return;
        if (e.isInPaperSpace || e.isVisible === false) continue;
        const L = e.layer === '0' && parentL ? parentL : e.layer; if (hidden(L)) continue;
        const c = colorOf(e, parentC), t = e.type; const Ln = lname(L); const pl = (P, closed, wd) => { if (P.length > 1) out.lines.push({ p: P, c, L: Ln, closed, wd: wd ? wd * Math.hypot(M[0], M[1]) : 0 }); };
        if (t === 'LINE') pl([ap(M, e.startPoint.x, e.startPoint.y), ap(M, e.endPoint.x, e.endPoint.y)]);
        else if (t === 'LWPOLYLINE') pl(bulgePts(e.vertices || [], !!(e.flag & 1) || !!(e.flag & 512), M), !!(e.flag & 1), e.constantWidth || 0);
        else if (t === 'POLYLINE2D' || t === 'POLYLINE3D') { const V = (e.vertices || []).filter(v => !(v.flag & 16)); pl(t === 'POLYLINE2D' ? bulgePts(V, !!(e.flag & 1), M) : V.map(v => ap(M, v.x, v.y)).concat(e.flag & 1 && V.length ? [ap(M, V[0].x, V[0].y)] : []), !!(e.flag & 1)); }
        else if (t === 'CIRCLE') pl(arcPts(e.center.x, e.center.y, e.radius, 0, Math.PI * 2, M), true);
        else if (t === 'ARC') pl(arcPts(e.center.x, e.center.y, e.radius, ang(e.startAngle), ang(e.endAngle), M));
        else if (t === 'ELLIPSE') { const ax = e.majorAxisEndPoint, a = Math.hypot(ax.x, ax.y), b = a * e.axisRatio, rot = Math.atan2(ax.y, ax.x); let a0 = e.startAngle || 0, a1 = e.endAngle || Math.PI * 2; if (a1 <= a0) a1 += Math.PI * 2;
          const n = Math.max(12, Math.ceil((a1 - a0) / (Math.PI / 24))), P = []; for (let i = 0; i <= n; i++) { const u = a0 + (a1 - a0) * i / n, x = a * Math.cos(u), y = b * Math.sin(u); P.push(ap(M, e.center.x + x * Math.cos(rot) - y * Math.sin(rot), e.center.y + x * Math.sin(rot) + y * Math.cos(rot))); } pl(P); }
        else if (t === 'SPLINE') { const P = (e.fitPoints && e.fitPoints.length > 1 ? e.fitPoints : e.controlPoints || []).map(p => ap(M, p.x, p.y)); pl(P); }
        else if (t === 'SOLID' || t === 'TRACE') { const P = [e.corner1, e.corner2, e.corner4 || e.corner3, e.corner3].filter(Boolean).map(p => ap(M, p.x, p.y)); out.fills.push({ p: P, c, L: Ln }); }
        else if (t === 'HATCH') {
          for (const bp of e.boundaryPaths || []) { let P = [];
            if (bp.vertices) P = bulgePts(bp.vertices, true, M);
            else for (const ed of bp.edges || []) { if (ed.type === 1 || ed.start) { if (ed.start && ed.end) { P.push(ap(M, ed.start.x, ed.start.y), ap(M, ed.end.x, ed.end.y)); } }
              else if (ed.type === 2 && ed.center) { const a0 = ang(ed.startAngle), a1 = ang(ed.endAngle); P.push(...(ed.isCCW === false ? arcPts(ed.center.x, ed.center.y, ed.radius, -a1, -a0, M).reverse() : arcPts(ed.center.x, ed.center.y, ed.radius, a0, a1, M))); } }
            if (P.length > 2) { if (e.solidFill === 1) out.fills.push({ p: P, c, L: Ln }); else pl(P.concat([P[0]]), true); } } }
        else if (t === 'TEXT' || t === 'ATTRIB') {
          const T = t === 'ATTRIB' ? e.text || {} : e, s = D.plain(T.text); if (!s) continue;
          const al = (T.halign || T.valign) && T.endPoint && (T.endPoint.x || T.endPoint.y) ? T.endPoint : T.startPoint; if (!al) continue;
          const [x, y] = ap(M, al.x, al.y), sc = Math.hypot(M[0], M[1]), rot = ang(T.rotation || 0) + Math.atan2(M[1], M[0]);
          out.texts.push({ s, x, y, h: (T.textHeight || 2.5) * sc, rot, c, L: Ln, ha: T.halign || 0, va: T.valign || 0, tag: e.tag });
        }
        else if (t === 'MTEXT') {
          const s = D.plain(e.text); if (!s) continue; const p = e.insertionPoint, sc = Math.hypot(M[0], M[1]), h = (e.textHeight || 2.5) * sc;
          const rot = (e.direction && (e.direction.x || e.direction.y) ? Math.atan2(e.direction.y, e.direction.x) : ang(e.rotation || 0)) + Math.atan2(M[1], M[0]);
          const lines = s.split('\n').filter(x => x.trim()), ap0 = e.attachmentPoint || 1, row = Math.floor((ap0 - 1) / 3), col = (ap0 - 1) % 3, lh = h * 1.6, tot = lh * lines.length;
          const [px, py] = ap(M, p.x, p.y), dy0 = row === 0 ? -h : row === 1 ? tot / 2 - h : tot - h;
          lines.forEach((ln, k) => { const off = dy0 - k * lh; out.texts.push({ s: ln.trim(), x: px - Math.sin(rot) * off, y: py + Math.cos(rot) * off, h, rot, c, L: Ln, ha: col === 1 ? 1 : col === 2 ? 2 : 0, va: 0 }); });
        }
        else if (t === 'INSERT' || t === 'DIMENSION' || t === 'ACAD_TABLE') {
          const b = t === 'ACAD_TABLE' ? byHandle.get(e.blockRecordHandle) : blocks.get(e.name); if (!b || depth > 8) continue;
          const bp = b.basePoint || { x: 0, y: 0 };
          if (t !== 'INSERT') { const p = t === 'ACAD_TABLE' ? e.startPoint || { x: 0, y: 0 } : { x: 0, y: 0 }; walk(b.entities || [], mul(M, [1, 0, 0, 1, p.x, p.y]), depth + 1, c, L, false); continue; }
          const rows = Math.max(1, e.rowCount || 1), cols = Math.max(1, e.columnCount || 1), r = ang(e.rotation || 0), cs = Math.cos(r), sn = Math.sin(r), xs = e.xScale || 1, ys = e.yScale || 1;
          for (let ri = 0; ri < rows; ri++) for (let ci = 0; ci < cols; ci++) {
            const ox = ci * (e.columnSpacing || 0), oy = ri * (e.rowSpacing || 0), ix = e.insertionPoint.x + ox * cs - oy * sn, iy = e.insertionPoint.y + ox * sn + oy * cs;
            const Mi = mul(M, mul([cs, sn, -sn, cs, ix, iy], [xs, 0, 0, ys, -bp.x * xs, -bp.y * ys]));
            const l0 = out.lines.length, f0 = out.fills.length, t0 = out.texts.length;
            walk(b.entities || [], Mi, depth + 1, c, L, false);
            const attrs = []; for (const a of e.attribs || []) { const s = D.plain((a.text || {}).text); if (s) attrs.push({ tag: a.tag || '', s }); }
            walk(e.attribs || [], M, depth + 1, c, L, false);
            if (top && !/^\*/.test(e.name)) { // вставки модели: рамка по нарисованному (без атрибутов)
              let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; const acc = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
              for (let i = l0; i < out.lines.length; i++) out.lines[i].p.forEach(q => acc(q[0], q[1])); for (let i = f0; i < out.fills.length; i++) out.fills[i].p.forEach(q => acc(q[0], q[1]));
              for (let i = t0; i < out.texts.length; i++) if (!out.texts[i].tag) acc(out.texts[i].x, out.texts[i].y);
              if (x1 < x0) acc(Mi[4], Mi[5]);
              out.inserts.push({ name: b.dname || e.name, x: Mi[4], y: Mi[5], bb: [x0, y0, x1, y1], attrs, L: Ln, c, desc: b.description || '' }); }
          }
        }
      }
    }
    const top = ms && ms.entities && ms.entities.length ? ms.entities : db.entities;
    walk(top, I, 0, '#000', null, true);
    out.truncated = budget < 0;
    return out;
  };

  /** Границы рисунка без далёких «мусорных» объектов: по квантилям точек. */
  function extents(F) {
    const xs = [], ys = [], step = Math.max(1, Math.floor(F.lines.length / 40000));
    for (let i = 0; i < F.lines.length; i += step) for (const p of F.lines[i].p) { xs.push(p[0]); ys.push(p[1]); }
    F.texts.forEach(t => { xs.push(t.x); ys.push(t.y); }); F.fills.forEach(f => f.p.forEach(p => { xs.push(p[0]); ys.push(p[1]); }));
    if (!xs.length) return null; xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const q = (A, f) => A[Math.min(A.length - 1, Math.max(0, Math.floor(A.length * f)))];
    // ядро рисунка — без 1 % крайних точек; в кадр — всё, что не дальше полутора размеров ядра (таблицы, легенда), далёкий мусор — нет
    const cx0 = q(xs, 0.01), cx1 = q(xs, 0.99), cy0 = q(ys, 0.01), cy1 = q(ys, 0.99), S = Math.max(cx1 - cx0, cy1 - cy0, 1e-6) * 1.5;
    const fx = xs.filter(x => x >= cx0 - S && x <= cx1 + S), fy = ys.filter(y => y >= cy0 - S && y <= cy1 + S);
    const x0 = fx[0], x1 = fx[fx.length - 1], y0 = fy[0], y1 = fy[fy.length - 1], m = Math.max(x1 - x0, y1 - y0) * 0.015;
    return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
  }

  /** Подготовка чертежа: развёртка и кадр. maxPx — длинная сторона картинки при масштабе 1. */
  D.prepare = (db, name) => {
    const F = D.flatten(db), ext = extents(F); if (!ext) throw new Error('в модели чертежа нет объектов');
    const W = ext.x1 - ext.x0, H = ext.y1 - ext.y0, k = Math.min(4800 / W, 4800 / H, Math.sqrt(1.8e7 / (W * H)));
    return { db, F, ext, k, name };
  };
  /** Мировые координаты → пиксели картинки (масштаб s относительно базового). */
  D.toPx = (P, x, y, s = 1) => [(x - P.ext.x0) * P.k * s, (P.ext.y1 - y) * P.k * s];

  /** Картинка листа (как растр PDF). */
  D.render = (P, s = 1) => {
    const k = P.k * s, W = Math.ceil((P.ext.x1 - P.ext.x0) * k), H = Math.ceil((P.ext.y1 - P.ext.y0) * k);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.lineJoin = 'round'; x.lineCap = 'round';
    const X = v => (v - P.ext.x0) * k, Y = v => (P.ext.y1 - v) * k;
    for (const f of P.F.fills) { x.fillStyle = f.c; x.beginPath(); f.p.forEach((q, i) => i ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1]))); x.closePath(); x.fill(); }
    const lw = Math.max(1, s * 1.2); x.lineWidth = lw;
    const byC = new Map(); for (const l of P.F.lines) { if (!byC.has(l.c)) byC.set(l.c, []); byC.get(l.c).push(l); }
    for (const [c, L] of byC) { x.strokeStyle = c; x.lineWidth = lw; x.beginPath(); for (const l of L) if (!(l.wd * k > lw)) l.p.forEach((q, i) => i ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1]))); x.stroke();
      for (const l of L) if (l.wd * k > lw) { x.lineWidth = l.wd * k; x.beginPath(); l.p.forEach((q, i) => i ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1]))); x.stroke(); } }
    for (const t of P.F.texts) { const h = t.h * k; if (h < 2.5) continue; x.save(); x.translate(X(t.x), Y(t.y)); x.rotate(-t.rot); x.font = `${h * 1.15}px "Arial Narrow", Arial, sans-serif`; x.fillStyle = t.c;
      x.textAlign = t.ha === 1 || t.ha === 4 ? 'center' : t.ha === 2 ? 'right' : 'left'; x.textBaseline = t.va === 2 || t.ha === 4 ? 'middle' : t.va === 3 ? 'top' : 'alphabetic'; x.fillText(t.s, 0, 0); x.restore(); }
    return cv;
  };
  /** Стены по слоям чертежа (стены, перегородки, колонны) — толстыми линиями; null, если таких слоёв нет. */
  D.wallCanvas = P => {
    if (P.wallCv !== undefined) return P.wallCv;
    const RX = /стен|перегор|колонн|кладк|wall|a-wall|s-col|column|partition|огражд/i, L = P.F.lines.filter(l => RX.test(l.L)), Fl = P.F.fills.filter(f => RX.test(f.L));
    if (L.length + Fl.length < 2) return (P.wallCv = null);
    const k = P.k, W = Math.ceil((P.ext.x1 - P.ext.x0) * k), H = Math.ceil((P.ext.y1 - P.ext.y0) * k), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.strokeStyle = x.fillStyle = '#000'; x.lineWidth = 14; x.lineCap = 'square';
    const X = v => (v - P.ext.x0) * k, Y = v => (P.ext.y1 - v) * k;
    for (const l of L) { x.lineWidth = Math.max(14, l.wd * k); x.beginPath(); l.p.forEach((q, i) => i ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1]))); x.stroke(); }
    for (const f of Fl) { x.beginPath(); f.p.forEach((q, i) => i ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1]))); x.closePath(); x.fill(); }
    return (P.wallCv = cv);
  };
  /** Тексты в формате SYM.pageItems: {s, x, y (базовая линия), w, h, rot}. */
  D.items = (P, s = 1) => {
    const k = P.k * s, c = document.createElement('canvas').getContext('2d');
    return P.F.texts.map(t => { const h = t.h * k; c.font = `${h * 1.15}px Arial`; const w = c.measureText(t.s).width, [X, Y] = D.toPx(P, t.x, t.y, s);
      const dx = t.ha === 1 || t.ha === 4 ? -w / 2 : t.ha === 2 ? -w : 0, dy = t.va === 2 || t.ha === 4 ? h / 2 : t.va === 3 ? h : 0;
      return { s: t.s, x: X + dx, y: Y + dy, w, h, rot: Math.round(t.rot * 180 / Math.PI) }; }).filter(i => i.h > 1);
  };

  /* ---------- значки по векторным данным ---------- */
  const pxBox = (P, bb, s = 1) => { const [x0, y1] = D.toPx(P, bb[0], bb[1], s), [x1, y0] = D.toPx(P, bb[2], bb[3], s), m = 2; return { x: Math.floor(x0 - m), y: Math.floor(y0 - m), w: Math.max(4, Math.ceil(x1 - x0 + 2 * m)), h: Math.max(4, Math.ceil(y1 - y0 + 2 * m)) }; };
  const LIGHT_RX = /светил|свет\b|лампа|люстр|бра\b|подвес|спот|трек|downlight|lamp|light|lum|led|DL\d|встраив|накладн/i;
  const EUI_RX = /розет|выключ|переключ|rj-?45|socket|switch|usb|терморег|датчик|кнопк/i;

  /** Экспорт DIALux: индексы светильников (тексты на слое *_IDX) + таблица «Перечень светильников». */
  function dialux(P) {
    const F = P.F, idx = F.texts.filter(t => /LUMKEY_IDX|_IDX$/i.test(t.L) && /^\d{1,3}$/.test(t.s)); if (idx.length < 1) return null;
    // таблица: строки по Y, колонки по заголовкам
    const tt = F.texts.filter(t => /LUMKEY/i.test(t.L) && !/_IDX/i.test(t.L));
    const hdr = name => tt.find(t => new RegExp(name, 'i').test(t.s));
    const hI = hdr('^Индекс$|^Index$|^№$'), hN = hdr('^Название артикула|Article name|^Наименование'), hA = hdr('^Номер артикула|Article No') || hdr('^Артикул$'), hQ = hdr('^Число$|^Кол|Quantity|^Qty'), hF = hdr('Световой поток|Luminous flux'), hP = hdr('мощность|Power'), hM = hdr('Производитель|Manufacturer'), hK = hdr('^Комплектация|^Lamp|^Equipment');
    const rows = new Map();
    if (hI) { const tol = hI.h * 1.2, col = (t, h) => h && Math.abs(t.x - h.x) < Math.max(h.h * 6, 0.5 * Math.abs((hN || h).x - h.x) || 1);
      for (const t of tt) { if (t.y >= hI.y - tol * 0.5 || !col(t, hI) || !/^\d{1,3}$/.test(t.s)) continue;
        const same = tt.filter(o => Math.abs(o.y - t.y) < tol), get = h => { if (!h) return ''; const o = same.filter(z => z !== t).sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x))[0]; return o && Math.abs(o.x - h.x) < Math.abs(h.x - hI.x) * 0.45 + h.h * 8 ? o.s : ''; };
        rows.set(t.s, { name: get(hN), art: get(hA), qty: +(get(hQ) || '').replace(/\D/g, '') || null, flux: get(hF), pw: get(hP), man: get(hM), kit: get(hK) }); } }
    // геометрия светильника — линии слоя *_LUM рядом с индексом
    // геометрия светильника — линии слоя *_LUM; каждая линия — ближайшему индексу
    const G = 0.5, tg = new Map(); idx.forEach(t => { const k = Math.floor(t.x / G) + ',' + Math.floor(t.y / G); if (!tg.has(k)) tg.set(k, []); tg.get(k).push(t); t.box = null; });
    for (const l of F.lines) { if (!/_LUM$/i.test(l.L)) continue; const mx = (l.p[0][0] + l.p[l.p.length - 1][0]) / 2, my = (l.p[0][1] + l.p[l.p.length - 1][1]) / 2, gx = Math.floor(mx / G), gy = Math.floor(my / G); let best = null, bd = 1e9;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const t of tg.get((gx + i) + ',' + (gy + j)) || []) { const d = (t.x - mx) ** 2 + (t.y - my) ** 2; if (d < bd) { bd = d; best = t; } }
      if (!best) continue; const B = best.box || (best.box = [1e18, 1e18, -1e18, -1e18]); l.p.forEach(q => { B[0] = Math.min(B[0], q[0]); B[1] = Math.min(B[1], q[1]); B[2] = Math.max(B[2], q[0]); B[3] = Math.max(B[3], q[1]); }); }
    const groups = new Map(); idx.forEach(t => { if (!groups.has(t.s)) groups.set(t.s, []); groups.get(t.s).push(t); });
    const samples = [];
    for (const [no, list] of [...groups].sort((a, b) => +a[0] - +b[0])) {
      const r = rows.get(no) || {}, label = [r.name, r.art].filter(Boolean).join(' ') || 'Светильник ' + no;
      // шаг между соседними индексами той же позиции (у ленты = длина сегмента) и размер светильника по линиям рядом с индексом
      const sm = list.slice(0, 300), nn = sm.map(t => { let d = 1e9; for (const o of sm) if (o !== t) { const q = Math.hypot(o.x - t.x, o.y - t.y); if (q > 1e-4 && q < d) d = q; } return d; }).filter(d => d < 1e8).sort((a, b) => a - b), step = nn.length ? nn[nn.length >> 1] : 0;
      const sizes = list.filter(t => t.box).map(t => Math.max(t.box[2] - t.box[0], t.box[3] - t.box[1]));
      sizes.sort((a, b) => a - b); const size = sizes.length ? sizes[sizes.length >> 1] : 0;
      // лента: позиция из коротких сегментов — длина сегмента из «(100 mm)», иначе шаг индексов (≈ длина сегмента)
      const strip = /^SU-|лент|strip|\bLED[- ]?strip/i.test(r.name || '') || (/^\d{6}\b/.test(r.art || '') && list.length > 20);
      let seg = 0; if (strip) { const mm = /\((\d+(?:[.,]\d+)?)\s*mm\)/i.exec(r.art || ''); seg = mm ? +mm[1].replace(',', '.') / 1000 : step > 0.005 && step < 1 ? Math.max(0.01, Math.round(step * 100) / 100) : 0.05; }
      const art = ((r.art || '').match(/^[A-Z0-9][A-Z0-9().\-/]*[A-Z0-9)]/i) || [''])[0], lamp = ((r.kit || '').match(/\/\s*([A-Z0-9][A-Z0-9-]{2,})\s*$/i) || [])[1] || '';
      const reel = strip ? +(((r.name || '').match(/-(\d+(?:[.,]\d+)?)m\b/i) || [])[1] || 5) : 0;
      const half = Math.max(Math.min(size, step || size), list[0].h * 0.6) / 2 * 1.15, ctr = t => t.box && Math.max(t.box[2] - t.box[0], t.box[3] - t.box[1]) < Math.max(size * 3, list[0].h * 3) ? [(t.box[0] + t.box[2]) / 2, (t.box[1] + t.box[3]) / 2] : [t.x, t.y];
      samples.push({ lamp, label: strip ? `${label} — лента, сегмент ${Math.round(seg * 1000)} мм` : label, a: art, qty: r.qty, seg, reel, kind: 'light',
        dets: list.map(t => { const [cx, cy] = strip ? [t.x, t.y] : ctr(t), hh = strip ? half : Math.max(half, t.box ? Math.max(t.box[2] - t.box[0], t.box[3] - t.box[1]) / 2 * 1.15 : 0); return { bb: [cx - hh, cy - hh, cx + hh, cy + hh] }; }) });
    }
    return { mode: 'dialux', samples, title: (tt.find(t => /Перечень|Luminaire/i.test(t.s)) || {}).s || '' };
  }

  /** Обычный DWG: вставки блоков. Подписи — из условных обозначений (текст справа от образца блока в легенде), атрибутов или имени блока. */
  function blocks(P, legendLabels) {
    const F = P.F, by = new Map(); F.inserts.forEach(i => { const w = i.bb[2] - i.bb[0], h = i.bb[3] - i.bb[1]; i.sz = Math.max(w, h); if (!by.has(i.name)) by.set(i.name, []); by.get(i.name).push(i); });
    const W = P.ext.x1 - P.ext.x0, H = P.ext.y1 - P.ext.y0, big = Math.max(W, H) * 0.06;
    const hdr = F.texts.filter(t => /условн[а-я]*\s+обозначен|экспликац[а-я]*\s+(механизм|светил|оборуд)|спецификац[а-я]*\s+(светил|розет)|ведомост[а-я]*\s+светил|обозначени[ея]\s*$/i.test(t.s));
    const samples = [];
    for (const [name, list] of by) {
      const small = list.filter(i => i.sz > 0 && i.sz < big); if (!small.length) continue;
      // экземпляр в легенде: рядом заголовок легенды или справа на той же строке длинный текст
      let label = '', legendIns = null;
      for (const i of small) { const cy = (i.bb[1] + i.bb[3]) / 2, row = F.texts.filter(t => t.x > i.bb[2] - i.sz * 0.2 && t.x < i.bb[2] + Math.max(i.sz * 3, t.h * 5) && Math.abs(t.y + t.h * 0.4 - cy) < Math.max(i.sz * 0.6, t.h * 1.2) && t.s.length > 6 && /[а-яa-z]{3}/i.test(t.s)).sort((a, b) => a.x - b.x);
        const inLeg = hdr.some(h => i.bb[0] > h.x - h.h * 4 && i.bb[0] < h.x + h.h * 25 && cy < h.y && cy > h.y - h.h * 80);
        if (row.length && (inLeg || small.length > 1)) { const t0 = row[0], cont = F.texts.filter(t => Math.abs(t.x - t0.x) < t0.h * 2 && t.y < t0.y && t.y > t0.y - t0.h * 2.6 && t !== t0 && /^[а-яa-z(]/.test(t.s));
          const cand = [t0.s, ...cont.map(t => t.s)].join(' ').replace(/\s+/g, ' '); if (inLeg || !label) { label = cand; legendIns = i; } if (inLeg) break; } }
      const at = small[0].attrs.map(a => a.s).filter(s => /[а-яa-z]{3}/i.test(s)).join(' ');
      if (!label) label = at || small[0].desc || name.replace(/^[A-Z]\$\d+\$/, '');
      const pos = small.filter(i => i !== legendIns), rel = LIGHT_RX.test(label + ' ' + name) || EUI_RX.test(label + ' ' + name);
      samples.push({ label, block: name, inLegend: !!legendIns, rel, dets: pos.map(i => ({ bb: i.bb })), legendBb: legendIns ? legendIns.bb : null, kind: EUI_RX.test(label + ' ' + name) ? 'eui' : LIGHT_RX.test(label + ' ' + name) ? 'light' : '' });
    }
    // что показывать: всё из легенды; без легенды — блоки, похожие на свет/ЭУИ, иначе самые частые мелкие
    let pick = samples.filter(s => s.inLegend && s.dets.length);
    if (!pick.length) pick = samples.filter(s => s.rel && s.dets.length);
    const off = !pick.length; if (off) pick = samples.filter(s => s.dets.length >= 2).sort((a, b) => b.dets.length - a.dets.length).slice(0, 15);
    pick.forEach(s => { s.on = !off; });
    return { mode: 'blocks', samples: pick.sort((a, b) => b.dets.length - a.dets.length), blocksTotal: by.size };
  }

  /** Значки чертежа: [{label, a?, qty?, seg?, reel?, kind?, on?, dets:[{x,y,w,h}], bb}] в пикселях картинки. */
  D.detect = (P, s = 1) => {
    const r = dialux(P) || blocks(P);
    r.samples.forEach(q => { q.dets = q.dets.map(d => pxBox(P, d.bb, s)); q.bb = q.legendBb ? pxBox(P, q.legendBb, s) : q.dets[0]; });
    return r;
  };
  window.DWG = D;
})();
