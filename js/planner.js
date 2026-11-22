/* Вкладка «План и 3D»: план помещения с подложкой, ручная расстановка светильников и мебели,
   размеры привязки, 3D-вид и монтажная схема (PNG / PDF). */
(function () {
  'use strict';
  const { $, esc } = MTUI;
  const el = document.querySelector('section[data-p="plan"]'); if (!el) return;
  const FURN = { sofa: ['Диван', 2.2, 0.95], bed: ['Кровать', 1.8, 2.1], table: ['Стол', 1.6, 0.9], chair: ['Стул', 0.45, 0.45], kitchen: ['Кухня', 3, 0.6], island: ['Остров', 2, 0.9], wardrobe: ['Шкаф', 2, 0.6], tv: ['ТВ-тумба', 1.8, 0.4], box: ['Объект', 1, 0.6] };
  const KINDS = { recessed: 'встраиваемый', surface: 'накладной', pendant: 'подвесной', wall: 'настенный (бра)', track: 'трековый', floor: 'торшер', table: 'настольный' };
  const LINES = { trackbar: 'шинопровод', strip: 'лента' };
  const SYM = { recessed: '#ffffff', surface: '#d9d9d9', pendant: '#c8a25a', wall: '#7aa6d8', track: '#222222', floor: '#9b7bd0', table: '#9b7bd0' };
  const newPlan = name => ({ name: name || 'Помещение', W: 4.5, L: 5.2, H: 2.75, bg: null, items: [], seq: 1 });
  const TS = MTUI.TS; TS.planner = TS.planner || { plans: [newPlan('Гостиная')], cur: 0 };
  const S = () => TS.planner.plans[TS.planner.cur];
  let FS = 1;
  let view = { ppm: 80, ox: 40, oy: 40 }, sel = null, mode = 'select', placing = null, drag = null, calib = null, lineStart = null, showDims = true, snap = true;

  el.innerHTML = `
  <div class="card">
    <div class="row" style="margin-bottom:8px">
      <label style="flex-direction:row;align-items:center;gap:6px">Помещение <select id="pSel"></select></label>
      <button class="b ghost sm" id="pNew">+ помещение</button><button class="b ghost sm" id="pDel">удалить</button>
      <label style="flex-direction:row;align-items:center;gap:4px">Название <input id="pName" style="width:150px"></label>
      <label style="flex-direction:row;align-items:center;gap:4px">Ширина <input id="pW" type="number" step="0.01" style="width:70px"></label>
      <label style="flex-direction:row;align-items:center;gap:4px">Длина <input id="pL" type="number" step="0.01" style="width:70px"></label>
      <label style="flex-direction:row;align-items:center;gap:4px">Высота <input id="pH" type="number" step="0.01" style="width:70px"></label>
    </div>
    <div class="row" style="margin-bottom:8px">
      <label class="b ghost sm" style="display:inline-flex;flex-direction:row;cursor:pointer;color:var(--ink)">Подложка: план (PDF / картинка)<input type="file" id="pBg" accept=".pdf,image/*" hidden></label>
      <button class="b ghost sm" id="pCal" title="Щёлкните две точки на плане и введите расстояние">Масштаб по двум точкам</button>
      <button class="b ghost sm" id="pOrg" title="Щёлкните левый верхний угол помещения на подложке">Угол помещения</button>
      <label style="flex-direction:row;align-items:center;gap:4px">прозрачность <input type="range" id="pOp" min="0.1" max="1" step="0.05" value="0.6" style="width:80px;padding:0"></label>
      <button class="b ghost sm" id="pBgDel">убрать подложку</button>
      <span class="mute" id="pHint"></span>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 300px;gap:12px">
      <div><canvas id="pCv" style="width:100%;height:560px;border:1px solid var(--line);border-radius:8px;background:#fff;touch-action:none;cursor:default"></canvas>
        <div class="row" style="margin-top:6px"><label style="flex-direction:row;align-items:center;gap:4px"><input type="checkbox" id="pDims" checked> размеры привязки</label>
          <label style="flex-direction:row;align-items:center;gap:4px"><input type="checkbox" id="pSnap" checked> шаг 5 см</label>
          <span class="mute">Колесо — масштаб, перетаскивание пустого места — сдвиг, Delete — удалить, R — повернуть, стрелки — сдвиг на 1 см.</span></div></div>
      <div>
        <div class="card" style="margin-bottom:8px"><b>Добавить</b>
          <label style="margin-top:6px">Светильник из КП или каталога<select id="pFromKp"></select></label>
          <div class="row" style="margin-top:4px"><input id="pArt" placeholder="или артикул" style="flex:1"><select id="pKind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="row" style="margin-top:6px"><button class="b sm" id="pPlace">Ставить щелчком</button>
            <input id="pCnt" type="number" min="1" value="6" style="width:56px"><button class="b ghost sm" id="pGrid">рядами по помещению</button></div>
          <div class="row" style="margin-top:6px">${Object.entries(LINES).map(([k, v]) => `<button class="b ghost sm" data-line="${k}">${v} (2 щелчка)</button>`).join('')}</div>
          <label style="margin-top:6px">Мебель<div class="row">${Object.entries(FURN).map(([k, v]) => `<button class="b ghost sm" data-furn="${k}">${v[0]}</button>`).join('')}</div></label>
        </div>
        <div class="card" id="pProps" style="margin-bottom:8px"><span class="mute">Выберите объект на плане.</span></div>
        <div class="card"><b>Результат</b>
          <div class="row" style="margin-top:6px"><button class="b sm" id="p3d">3D-вид</button><label class="b ghost sm" style="cursor:pointer" title="Файлы .glb / .obj; имя файла — артикул (TR243-4-12WTW-DSZ-B), начало артикула (TR243) или серия (Focus Led). Модели хранятся в этом браузере.">3D-модели…<input type="file" id="pMdl" accept=".glb,.gltf,.obj" multiple hidden></label><button class="b ghost sm" id="pPng">PNG</button><button class="b ghost sm" id="pPdf">Монтажная схема PDF</button></div>
          <div class="row" style="margin-top:6px"><button class="b ghost sm" id="pToKp">Светильники плана → в КП</button><button class="b ghost sm" id="pClear">очистить план</button></div>
          <div id="pSum" class="mute" style="margin-top:6px"></div></div>
      </div>
    </div>
  </div>
  <div class="card" id="p3dBox" hidden></div>`;

  const cv = $('#pCv'), ctx = cv.getContext('2d');
  let bgImg = null;
  const loadBg = () => { const b = S().bg; if (!b) { bgImg = null; draw(); return; } const im = new Image(); im.onload = () => { bgImg = im; draw(); }; im.src = b.url; };
  function fit() { const r = cv.getBoundingClientRect(), p = S(); const k = Math.min((r.width - 70) / p.W, (r.height - 70) / p.L); view.ppm = Math.max(20, k); view.ox = (r.width - p.W * view.ppm) / 2; view.oy = (r.height - p.L * view.ppm) / 2; }
  const toPx = (x, y) => [view.ox + x * view.ppm, view.oy + y * view.ppm];
  const toM = (px, py) => [(px - view.ox) / view.ppm, (py - view.oy) / view.ppm];
  const sn = v => snap ? Math.round(v * 20) / 20 : Math.round(v * 1000) / 1000;
  const cm = v => Math.round(v * 100);

  function syncHeader() {
    $('#pSel').innerHTML = TS.planner.plans.map((p, i) => `<option value="${i}"${i === TS.planner.cur ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    const p = S(); $('#pName').value = p.name; $('#pW').value = p.W; $('#pL').value = p.L; $('#pH').value = p.H;
    $('#pFromKp').innerHTML = '<option value="">— выберите —</option>' + [...new Set(MTUI.kp.get().rows.map(r => r.a))].map(a => MT.get(a)).filter(x => x && ['tech', 'decor'].includes(MT.cls(x)) && !['комплектующие', 'аксессуар', 'профиль', 'шинопровод'].includes(MT.kind(x)))
      .map(x => `<option value="${esc(x.a)}">${esc(x.a)} · ${esc((x.n || '').slice(0, 40))}</option>`).join('');
  }
  const kindOf = x => { const k = MT.kind(x); return k === 'встраиваемый' ? 'recessed' : k === 'подвесной' || k === 'трековый подвесной' ? 'pendant' : k === 'настенный' ? 'wall' : k === 'трековый' ? 'track' : k === 'напольный' ? 'floor' : k === 'настольный' ? 'table' : k === 'лента' ? 'strip' : 'surface'; };

  /** Подпись плана: что и сколько стоит. Изменилась — проект и КП пересчитываются по плану. */
  const planSig = p => JSON.stringify(legendOf(p).filter(l => l.a).map(l => [l.key, l.n, Math.round(l.len * 10)]).sort());
  let planTimer = null;
  let v3Timer = null, v3Sig = "", v3 = null;
  function planChanged(p) {
    if (!p) return;
    const box = document.getElementById('p3dBox');
    if (box && !box.hidden && window.MT3D) { const g = JSON.stringify(p.items.map(i => [i.a, i.kind, i.x, i.y, i.z, i.x1, i.y1, i.x2, i.y2, i.w, i.d, i.rot])) + p.W + p.L;
      if (g !== v3Sig) { const first = !v3Sig; v3Sig = g; if (!first) { clearTimeout(v3Timer); v3Timer = setTimeout(async () => { const cam = v3 && v3.camera ? { p: v3.camera.position.clone(), t: v3.controls && v3.controls.target.clone() } : null; const sc = scene3d(); try { await MT3D.prepare(sc); } catch (e) { } if (v3) v3.dispose(); v3 = MT3D.render(box, sc); if (cam && v3 && v3.camera) { v3.camera.position.copy(cam.p); if (cam.t && v3.controls) { v3.controls.target.copy(cam.t); v3.controls.update(); } } }, 900); } } }
    const sg = planSig(p);
    if (p._sig === undefined) { p._sig = sg; return; }
    if (sg === p._sig) return;
    p._sig = sg; clearTimeout(planTimer);
    planTimer = setTimeout(() => { if (window.PROJECT && PROJECT.fromPlan) PROJECT.fromPlan(p); }, 500);
  }
  function draw() {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
    render(ctx, { ui: true });
    planChanged(S());
    summary();
  }
  /** Рисует план в контекст (на экране и для экспорта). */
  function render(c, o) {
    const p = S(), F = o.fs || 1; FS = F;
    if (p.bg && bgImg) { const b = p.bg; c.save(); c.globalAlpha = b.op ?? 0.6; const [x, y] = toPx(b.x, b.y); c.drawImage(bgImg, x, y, bgImg.width * b.scale * view.ppm, bgImg.height * b.scale * view.ppm); c.restore(); }
    // сетка
    c.strokeStyle = '#eee'; c.lineWidth = 1;
    for (let x = 0; x <= p.W + 1e-6; x += 0.5) { const [a, b] = toPx(x, 0), [, d] = toPx(x, p.L); c.beginPath(); c.moveTo(a, b); c.lineTo(a, d); c.stroke(); }
    for (let y = 0; y <= p.L + 1e-6; y += 0.5) { const [a, b] = toPx(0, y), [d] = toPx(p.W, y); c.beginPath(); c.moveTo(a, b); c.lineTo(d, b); c.stroke(); }
    const [x0, y0] = toPx(0, 0); c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(x0, y0, p.W * view.ppm, p.L * view.ppm);
    c.fillStyle = '#555'; c.font = `${12 * FS}px system-ui`; c.textAlign = 'center';
    c.fillText(`${cm(p.W)} см`, x0 + p.W * view.ppm / 2, y0 + p.L * view.ppm + 18 * FS);
    c.save(); c.translate(x0 + p.W * view.ppm + 18 * FS, y0 + p.L * view.ppm / 2); c.rotate(Math.PI / 2); c.fillText(`${cm(p.L)} см`, 0, 0); c.restore();
    // мебель
    p.items.filter(i => i.t === 'furn').forEach(i => { const [x, y] = toPx(i.x, i.y); c.save(); c.translate(x, y); c.rotate((i.rot || 0) * Math.PI / 180);
      c.fillStyle = 'rgba(185,178,166,.45)'; c.strokeStyle = i === sel ? '#b08d57' : '#8a8377'; c.lineWidth = i === sel ? 2.5 : 1.5;
      c.fillRect(-i.w * view.ppm / 2, -i.d * view.ppm / 2, i.w * view.ppm, i.d * view.ppm); c.strokeRect(-i.w * view.ppm / 2, -i.d * view.ppm / 2, i.w * view.ppm, i.d * view.ppm);
      c.fillStyle = '#5a554c'; c.font = `${11 * FS}px system-ui`; c.textAlign = 'center'; c.fillText(FURN[i.type] ? FURN[i.type][0] : i.type, 0, 4); c.restore(); });
    // линии (трек, лента)
    p.items.filter(i => i.t === 'line').forEach(i => { const [a, b] = toPx(i.x1, i.y1), [d, e] = toPx(i.x2, i.y2);
      c.strokeStyle = i === sel ? '#b08d57' : i.kind === 'strip' ? '#f0b400' : '#222'; c.lineWidth = i.kind === 'strip' ? 4 : 6; c.setLineDash(i.kind === 'strip' ? [8, 4] : []);
      c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#333'; c.font = `${11 * FS}px system-ui`; c.textAlign = 'center'; c.fillText(`${LINES[i.kind]} ${cm(Math.hypot(i.x2 - i.x1, i.y2 - i.y1))} см`, (a + d) / 2, (b + e) / 2 - 8); });
    // светильники
    const lums = p.items.filter(i => i.t === 'lum'), legend = legendOf(p);
    lums.forEach(i => { const [x, y] = toPx(i.x, i.y), r = (i.kind === 'pendant' ? 9 : 7) * FS;
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = SYM[i.kind] || '#fff'; c.fill(); c.lineWidth = i === sel ? 3 : 1.6; c.strokeStyle = i === sel ? '#b08d57' : '#111'; c.stroke();
      if (i.kind === 'recessed' || i.kind === 'surface') { c.beginPath(); c.moveTo(x - r * .6, y); c.lineTo(x + r * .6, y); c.moveTo(x, y - r * .6); c.lineTo(x, y + r * .6); c.lineWidth = 1; c.strokeStyle = '#111'; c.stroke(); }
      const n = legend.findIndex(l => l.key === (i.a || i.kind)) + 1; c.fillStyle = '#111'; c.font = `600 ${10 * FS}px system-ui`; c.textAlign = 'left'; c.fillText(n, x + r + 2, y - r + 2); });
    // размеры
    if (o.dims !== false && (showDims || sel)) dims(c, p, showDims ? lums : sel && sel.t === 'lum' ? [sel] : []);
    if (o.ui) {
      if (sel && sel.t !== 'lum') { /* подсветка уже нарисована */ }
      if (calib && calib.length === 1) { const [x, y] = toPx(calib[0][0], calib[0][1]); c.fillStyle = '#c0392b'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
      if (lineStart) { const [x, y] = toPx(lineStart[0], lineStart[1]); c.fillStyle = '#b08d57'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
    }
  }
  function dims(c, p, lums) {
    if (!lums.length) return;
    const [x0, y0] = toPx(0, 0), xs = [...new Set(lums.map(i => Math.round(i.x * 100) / 100))].sort((a, b) => a - b), ys = [...new Set(lums.map(i => Math.round(i.y * 100) / 100))].sort((a, b) => a - b);
    c.strokeStyle = '#c0392b'; c.fillStyle = '#c0392b'; c.lineWidth = 1; c.font = `${10 * FS}px system-ui`; c.textAlign = 'center';
    const ty = y0 - 14 * FS; let prev = 0;
    [...xs, p.W].forEach(x => { const [a] = toPx(prev, 0), [b] = toPx(x, 0); c.beginPath(); c.moveTo(a, ty); c.lineTo(b, ty); c.moveTo(b, ty - 4); c.lineTo(b, ty + 4); c.stroke(); if (b - a > 18 * FS) c.fillText(cm(x - prev), (a + b) / 2, ty - 3); prev = x; });
    const lx = x0 - 40 * FS; prev = 0; c.textAlign = 'right';
    [...ys, p.L].forEach(y => { const [, a] = toPx(0, prev), [, b] = toPx(0, y); c.beginPath(); c.moveTo(lx, a); c.lineTo(lx, b); c.moveTo(lx - 4, b); c.lineTo(lx + 4, b); c.stroke(); if (b - a > 14 * FS) c.fillText(cm(y - prev), lx - 3, (a + b) / 2 + 3); prev = y; });
    c.setLineDash([2, 3]); c.strokeStyle = 'rgba(192,57,43,.35)';
    xs.forEach(x => { const [a] = toPx(x, 0); c.beginPath(); c.moveTo(a, ty); c.lineTo(a, y0); c.stroke(); });
    ys.forEach(y => { const [, a] = toPx(0, y); c.beginPath(); c.moveTo(lx, a); c.lineTo(x0, a); c.stroke(); });
    c.setLineDash([]);
  }
  function legendOf(p) {
    const m = new Map();
    p.items.forEach(i => { if (i.t === 'furn') return; const key = i.t === 'line' ? 'line:' + i.kind + ':' + (i.a || '') : (i.a || i.kind);
      const e = m.get(key) || { key, a: i.a, kind: i.kind, n: 0, len: 0, name: i.a && MT.get(i.a) ? MT.get(i.a).n : (i.t === 'line' ? LINES[i.kind] : KINDS[i.kind]) };
      if (i.t === 'line') e.len += Math.hypot(i.x2 - i.x1, i.y2 - i.y1); else e.n++; m.set(key, e); });
    return [...m.values()];
  }
  function summary() {
    const lg = legendOf(S());
    $('#pSum').innerHTML = lg.length ? lg.map((l, i) => `${l.key.startsWith('line') ? '—' : i + 1}. ${esc(l.a || '')} ${esc((l.name || '').slice(0, 40))} — ${l.key.startsWith('line') ? (l.len).toFixed(2) + ' м' : l.n + ' шт'}`).join('<br>') : 'План пуст.';
  }
  function props() {
    const b = $('#pProps');
    if (!sel) { b.innerHTML = '<span class="mute">Выберите объект на плане.</span>'; return; }
    const i = sel, f = (k, label, w = 70, step = 1) => `<label style="flex-direction:row;align-items:center;gap:4px">${label} <input data-pp="${k}" type="number" step="${step}" value="${k === 'x' || k === 'y' || k === 'w' || k === 'd' || k === 'z' ? cm(i[k] || 0) : i[k] ?? ''}" style="width:${w}px"></label>`;
    let h = `<b>${i.t === 'lum' ? 'Светильник' : i.t === 'line' ? LINES[i.kind] : 'Мебель'}</b>${i.a ? ` · ${esc(i.a)}` : ''}<div class="row" style="margin-top:6px">`;
    if (i.t === 'lum') h += f('x', 'X, см') + f('y', 'Y, см') + (i.kind === 'pendant' ? f('z', 'низ над полом, см') : '') + `<label style="flex-direction:row;align-items:center;gap:4px">группа <input data-pp="group" value="${esc(i.group || '')}" style="width:110px"></label>`;
    if (i.t === 'furn') h += f('x', 'X, см') + f('y', 'Y, см') + f('w', 'ширина, см') + f('d', 'глубина, см') + f('rot', 'поворот, °', 60, 90);
    if (i.t === 'line') h += `<label style="flex-direction:row;align-items:center;gap:4px">группа <input data-pp="group" value="${esc(i.group || '')}" style="width:110px"></label>`;
    h += `</div><div class="row" style="margin-top:6px"><button class="b ghost sm" id="ppDup">копия</button><button class="b ghost sm" id="ppDel">удалить</button></div>`;
    b.innerHTML = h;
    b.querySelectorAll('[data-pp]').forEach(inp => inp.onchange = () => { const k = inp.dataset.pp, v = inp.value;
      if (['x', 'y', 'w', 'd', 'z'].includes(k)) i[k] = (+v || 0) / 100; else if (k === 'rot') i.rot = +v || 0; else i[k] = v; draw(); });
    $('#ppDel').onclick = () => { S().items.splice(S().items.indexOf(i), 1); sel = null; props(); draw(); };
    $('#ppDup').onclick = () => { const c = JSON.parse(JSON.stringify(i)); c.id = S().seq++; if (c.t === 'line') { c.y1 += 0.3; c.y2 += 0.3; } else { c.x += 0.3; } S().items.push(c); sel = c; props(); draw(); };
  }
  function hit(mx, my) {
    const p = S(), [x, y] = toM(mx, my), tol = 10 / view.ppm;
    const lum = p.items.filter(i => i.t === 'lum').reverse().find(i => Math.hypot(i.x - x, i.y - y) < tol * 1.2); if (lum) return lum;
    const ln = p.items.filter(i => i.t === 'line').find(i => { const dx = i.x2 - i.x1, dy = i.y2 - i.y1, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - i.x1) * dx + (y - i.y1) * dy) / L2)); return Math.hypot(i.x1 + t * dx - x, i.y1 + t * dy - y) < tol; }); if (ln) return ln;
    return p.items.filter(i => i.t === 'furn').reverse().find(i => { const a = -(i.rot || 0) * Math.PI / 180, dx = x - i.x, dy = y - i.y, u = dx * Math.cos(a) - dy * Math.sin(a), v = dx * Math.sin(a) + dy * Math.cos(a); return Math.abs(u) <= i.w / 2 && Math.abs(v) <= i.d / 2; });
  }
  const setHint = t => $('#pHint').textContent = t || '';
  function currentLum() {
    const a = ($('#pArt').value.trim() || $('#pFromKp').value).trim(), x = a ? MT.get(a) : null;
    return { a: x ? x.a : null, kind: x ? kindOf(x) : $('#pKind').value };
  }
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, [x, y] = toM(mx, my), p = S();
    if (mode === 'calib') { calib = calib || []; calib.push([x, y]);
      if (calib.length === 2) { const d = Math.hypot(calib[1][0] - calib[0][0], calib[1][1] - calib[0][1]); askNumber('Расстояние между точками, см', v => { if (v > 0 && p.bg) { const k = (v / 100) / d; p.bg.scale *= k; p.bg.x *= k; p.bg.y *= k; } calib = null; mode = 'select'; setHint(''); fit(); draw(); }); } draw(); return; }
    if (mode === 'origin') { if (p.bg) { p.bg.x -= x; p.bg.y -= y; } mode = 'select'; setHint(''); draw(); return; }
    if (mode === 'place') { const it = Object.assign({ id: p.seq++, t: 'lum', x: sn(x), y: sn(y), group: 'Общий свет' }, placing); if (it.kind === 'pendant') it.z = Math.max(1.5, p.H - 0.9); p.items.push(it); sel = it; props(); draw(); return; }
    if (mode === 'line') { if (!lineStart) { lineStart = [sn(x), sn(y)]; draw(); return; }
      const it = { id: p.seq++, t: 'line', kind: placing.kind, a: placing.a || null, x1: lineStart[0], y1: lineStart[1], x2: sn(x), y2: sn(y), group: placing.kind === 'strip' ? 'Подсветка' : 'Общий свет' };
      if (Math.abs(it.x2 - it.x1) > Math.abs(it.y2 - it.y1) * 3) it.y2 = it.y1; else if (Math.abs(it.y2 - it.y1) > Math.abs(it.x2 - it.x1) * 3) it.x2 = it.x1;
      p.items.push(it); lineStart = null; mode = 'select'; sel = it; setHint(''); props(); draw(); return; }
    const h = hit(mx, my); sel = h || null; props();
    drag = h ? { it: h, sx: x, sy: y, o: JSON.parse(JSON.stringify(h)) } : { pan: true, sx: mx, sy: my, ox: view.ox, oy: view.oy };
    cv.setPointerCapture(e.pointerId); draw();
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (drag.pan) { view.ox = drag.ox + mx - drag.sx; view.oy = drag.oy + my - drag.sy; draw(); return; }
    const [x, y] = toM(mx, my), dx = x - drag.sx, dy = y - drag.sy, it = drag.it, o = drag.o;
    if (it.t === 'line') { it.x1 = sn(o.x1 + dx); it.y1 = sn(o.y1 + dy); it.x2 = it.x1 + (o.x2 - o.x1); it.y2 = it.y1 + (o.y2 - o.y1); } else { it.x = sn(o.x + dx); it.y = sn(o.y + dy); }
    draw();
  });
  cv.addEventListener('pointerup', () => { if (drag && !drag.pan) props(); drag = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, [x, y] = toM(mx, my), k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    view.ppm = Math.max(10, Math.min(600, view.ppm * k)); view.ox = mx - x * view.ppm; view.oy = my - y * view.ppm; draw(); }, { passive: false });
  document.addEventListener('keydown', e => {
    if (el.hidden || /input|select|textarea/i.test(document.activeElement.tagName)) return;
    if (e.key === 'Escape') { mode = 'select'; placing = null; lineStart = null; calib = null; setHint(''); draw(); }
    if (!sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { S().items.splice(S().items.indexOf(sel), 1); sel = null; props(); draw(); e.preventDefault(); }
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') { if (sel.t === 'furn') { sel.rot = ((sel.rot || 0) + 90) % 360; [sel.w, sel.d] = [sel.w, sel.d]; props(); draw(); } }
    const mv = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key];
    if (mv) { if (sel.t === 'line') { sel.x1 += mv[0]; sel.x2 += mv[0]; sel.y1 += mv[1]; sel.y2 += mv[1]; } else { sel.x += mv[0]; sel.y += mv[1]; } props(); draw(); e.preventDefault(); }
  });
  function askNumber(label, cb) {
    setHint(''); const b = $('#pHint'); b.innerHTML = `${esc(label)} <input id="pAsk" type="number" style="width:90px"> <button class="b sm" id="pAskOk">OK</button>`;
    $('#pAsk').focus(); const ok = () => { const v = +$('#pAsk').value; b.textContent = ''; cb(v); };
    $('#pAskOk').onclick = ok; $('#pAsk').onkeydown = e => { if (e.key === 'Enter') ok(); };
  }
  // шапка
  $('#pSel').onchange = () => { TS.planner.cur = +$('#pSel').value; sel = null; syncHeader(); loadBg(); fit(); props(); draw(); };
  $('#pNew').onclick = () => { TS.planner.plans.push(newPlan('Помещение ' + (TS.planner.plans.length + 1))); TS.planner.cur = TS.planner.plans.length - 1; sel = null; syncHeader(); loadBg(); fit(); draw(); };
  $('#pDel').onclick = () => { if (TS.planner.plans.length < 2) { S().items = []; S().bg = null; } else { TS.planner.plans.splice(TS.planner.cur, 1); TS.planner.cur = 0; } sel = null; syncHeader(); loadBg(); fit(); draw(); };
  $('#pName').onchange = () => { S().name = $('#pName').value; syncHeader(); };
  ['W', 'L', 'H'].forEach(k => $('#p' + k).onchange = () => { S()[k] = +$('#p' + k).value || S()[k]; fit(); draw(); });
  $('#pBg').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = ''; setHint('загружаю подложку…');
    try {
      let url, w;
      if (/\.pdf$/i.test(f.name)) { const r = await MTUI.pdfPageImage(f, 1); url = r.url; w = r.w; }
      else { url = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(f); }); w = await new Promise(ok => { const im = new Image(); im.onload = () => ok(im.width); im.src = url; }); }
      S().bg = { url, x: -0.5, y: -0.5, scale: (S().W + 1) / w, op: +$('#pOp').value }; loadBg();
      setHint('Подложка загружена. Нажмите «Масштаб по двум точкам», щёлкните концы известной стены и введите её длину; затем «Угол помещения».');
    } catch (er) { setHint('Не удалось загрузить: ' + er.message); }
  };
  $('#pOp').oninput = () => { if (S().bg) { S().bg.op = +$('#pOp').value; draw(); } };
  $('#pBgDel').onclick = () => { S().bg = null; loadBg(); };
  $('#pCal').onclick = () => { if (!S().bg) { setHint('Сначала загрузите подложку.'); return; } mode = 'calib'; calib = []; setHint('Щёлкните первую, затем вторую точку известного размера.'); };
  $('#pOrg').onclick = () => { if (!S().bg) { setHint('Сначала загрузите подложку.'); return; } mode = 'origin'; setHint('Щёлкните левый верхний угол помещения на подложке.'); };
  $('#pDims').onchange = () => { showDims = $('#pDims').checked; draw(); };
  $('#pSnap').onchange = () => { snap = $('#pSnap').checked; };
  $('#pPlace').onclick = () => { placing = currentLum(); mode = 'place'; setHint(`Щёлкайте по плану, чтобы ставить ${placing.a || KINDS[placing.kind]}. Esc — закончить.`); };
  $('#pGrid').onclick = () => { const L = currentLum(), n = +$('#pCnt').value || 1, p = S();
    MT.layout(n, p.W, p.L).forEach(([x, y]) => p.items.push(Object.assign({ id: p.seq++, t: 'lum', x: sn(x), y: sn(y), group: 'Общий свет' }, L))); draw(); };
  el.querySelectorAll('[data-line]').forEach(b => b.onclick = () => { const a = $('#pArt').value.trim(); placing = { kind: b.dataset.line, a: MT.get(a) ? MT.get(a).a : null }; mode = 'line'; lineStart = null; setHint(`Щёлкните начало и конец линии (${LINES[b.dataset.line]}).`); });
  el.querySelectorAll('[data-furn]').forEach(b => b.onclick = () => { const p = S(), f = FURN[b.dataset.furn]; const it = { id: p.seq++, t: 'furn', type: b.dataset.furn, x: sn(p.W / 2), y: sn(p.L / 2), w: f[1], d: f[2], rot: 0 }; p.items.push(it); sel = it; props(); draw(); });
  $('#pClear').onclick = () => { S().items = []; sel = null; props(); draw(); };
  $('#pToKp').onclick = () => { const rows = legendOf(S()).filter(l => l.a).map(l => ({ room: S().name, a: l.a, qty: l.key.startsWith('line') ? Math.ceil(l.len) : l.n })); MTUI.kp.add(rows); $('#pToKp').textContent = `Добавлено: ${rows.length} поз.`; };

  /* ---------- 3D ---------- */
  // v3 объявлен выше
  function scene3d() {
    const p = S(), lums = [], furn = [];
    p.items.forEach(i => {
      const x = i.a ? MT.get(i.a) : null, f = x ? MT.features(x) : {};
      if (i.t === 'furn') furn.push({ type: i.type, x: i.x, y: i.y, w: i.w, d: i.d, rot: -(i.rot || 0) });
      else if (i.t === 'lum') lums.push({ article: i.a, name: x ? x.n : '', kind: i.kind, x: i.x, y: i.y, z: i.kind === 'pendant' ? i.z : undefined, color: x ? x.col : 'white', group: i.group || 'Общий свет',
        lm: x && x.lm ? x.lm : (f.cap === 'GU10' ? 800 * 0.85 : f.cap === 'GX53' ? 680 : x && x.w ? x.w * 80 : 700), cct: typeof f.cct === 'number' ? f.cct : 3000, beam: x && x.ang ? x.ang : (i.kind === 'recessed' || i.kind === 'track' ? 38 : 120) });
      else if (i.t === 'line') { const len = Math.hypot(i.x2 - i.x1, i.y2 - i.y1), rot = Math.atan2(i.y2 - i.y1, i.x2 - i.x1) * 180 / Math.PI;
        lums.push({ article: i.a, kind: i.kind === 'strip' ? 'strip' : 'trackbar', x: (i.x1 + i.x2) / 2, y: (i.y1 + i.y2) / 2, length: len, rot, z: i.kind === 'strip' ? p.H - 0.05 : p.H - 0.02, lm: i.kind === 'strip' ? len * 700 : 0, cct: 3000, group: i.group || (i.kind === 'strip' ? 'Подсветка' : 'Общий свет'), color: 'black' }); }
    });
    return { title: p.name, room: { width: p.W, length: p.L, height: p.H }, luminaires: lums, furniture: furn };
  }
  async function open3d(scroll) { if (!window.MT3D) { setHint('3D загружается…'); return; } const b = $('#p3dBox'); b.hidden = false; const sc = scene3d(); try { await MT3D.prepare(sc); } catch (e) { } if (v3) v3.dispose(); v3 = MT3D.render(b, sc); if (scroll) b.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  $('#p3d').onclick = () => open3d(true);
  $('#pMdl').onchange = async e => { if (!window.MT3D) return; const done = await MT3D.addModels([...e.target.files]); e.target.value = '';
    setHint(done.length ? `Загружено моделей: ${done.length} (${done.join(', ')}). Они применяются к артикулам, начинающимся так же, или к серии.` : 'Не удалось прочитать модели: нужны .glb, .gltf (со встроенными данными) или .obj.'); if (!$('#p3dBox').hidden) open3d(false); };

  /* ---------- Экспорт ---------- */
  function snapshot(scale = 2.5) {
    const p = S(), pad = 150, W = 1400, k = Math.min((W - 2 * pad) / p.W, (W * 0.9 - 2 * pad) / p.L), H = Math.round(p.L * k + 2 * pad);
    const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale; const g = c.getContext('2d'); g.scale(scale, scale); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const keep = Object.assign({}, view), ks = sel; sel = null; view = { ppm: k, ox: pad, oy: pad };
    render(g, { ui: false, dims: true, fs: 2 }); view = keep; FS = 1; sel = ks; return c;
  }
  $('#pPng').onclick = () => snapshot().toBlob(async b => { const fn = `План ${S().name}.png`; if (!(await MTUI.saveFile(fn, b))) { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fn; a.click(); } });
  $('#pPdf').onclick = async () => {
    if (!window.MTDOC) { setHint('Модуль документов не загружен'); return; }
    try { await MTDOC.mountingPDF(S(), snapshot(2).toDataURL('image/jpeg', 0.88), legendOf(S())); } catch (er) { setHint('PDF: ' + er.message); }
  };

  /* ---------- Связь с другими вкладками ---------- */
  function addRoomPlan(name, W, L, H) {
    let i = TS.planner.plans.findIndex(p => p.name === name);
    if (i < 0) { TS.planner.plans.push(newPlan(name)); i = TS.planner.plans.length - 1; }
    TS.planner.cur = i; const p = S(); p.W = +(+W).toFixed(2); p.L = +(+L).toFixed(2); p.H = H || p.H; p.items = p.items.filter(it => it.t === 'furn'); return p;
  }
  /** Трасса трека в плане: линия, Г, П, квадрат — стороны по введённым длинам, вписанные в помещение с отступом 0,6 м. */
  function trackPath(room, p) {
    const shape = room.trackShape && room.trackShape !== 'нет' ? room.trackShape : 'линия';
    let sd = String(room.trackSides || room.track || '').split(/[,;\s]+/).map(v => parseFloat(String(v).replace(',', '.'))).filter(v => v > 0);
    if (!sd.length) sd = [p.L * 0.6];
    const m = 0.6, maxX = Math.max(0.5, p.W - 2 * m), maxY = Math.max(0.5, p.L - 2 * m), cx = p.W / 2, cy = p.L / 2;
    const fy = v => Math.min(v, maxY), fx = v => Math.min(v, maxX);
    let pts;
    if (shape === 'Г') { const a = fy(sd[0]), b = fx(sd[1] || sd[0]); const x0 = cx - b / 2, y0 = cy - a / 2; pts = [[x0, y0], [x0, y0 + a], [x0 + b, y0 + a]]; }
    else if (shape === 'П') { const a = fy(sd[0]), b = fx(sd[1] || sd[0]), c = fy(sd[2] || sd[0]); const x0 = cx - b / 2, y0 = cy - Math.max(a, c) / 2; pts = [[x0, y0 + a], [x0, y0], [x0 + b, y0], [x0 + b, y0 + c]]; }
    else if (shape === 'квадрат') { const a = fy(sd[0]), b = fx(sd[1] || sd[0]); const x0 = cx - b / 2, y0 = cy - a / 2; pts = [[x0, y0], [x0 + b, y0], [x0 + b, y0 + a], [x0, y0 + a], [x0, y0]]; }
    else { const a = fy(sd[0]); pts = [[cx, cy - a / 2], [cx, cy + a / 2]]; }
    const segs = []; for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
    const len = segs.reduce((t, [a, b]) => t + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
    const at = d => { for (const [a, b] of segs) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= l) return [a[0] + (b[0] - a[0]) * d / l, a[1] + (b[1] - a[1]) * d / l]; d -= l; } return pts[pts.length - 1]; };
    return { segs, len, at };
  }
  window.PLANNER = {
    fromWizard(room, rows) {
      this.syncRoom(room, rows); TS.planner.cur = TS.planner.plans.findIndex(p => p.name === room.name);
      sel = null; syncHeader(); loadBg(); fit(); props(); draw();
    },
    /** Синхронизация плана с рабочим вариантом: позиции, расставленные вручную, сохраняются, если не изменилось количество. */
    syncRoom(room, rows) {
      let L = +room.L, W = +room.W; if (!(L > 0 && W > 0) && room.S > 0) { L = Math.sqrt(room.S * 1.3); W = room.S / L; }
      const w = +Math.min(L, W).toFixed(2), l = +Math.max(L, W).toFixed(2);
      let p = TS.planner.plans.find(x => x.name === room.name);
      if (!p) { if (TS.planner.plans.length === 1 && !TS.planner.plans[0].items.length && /^(Гостиная|Помещение)/.test(TS.planner.plans[0].name) && !TS.planner.plans[0].bg) TS.planner.plans = []; p = newPlan(room.name); TS.planner.plans.push(p); }
      const resized = Math.abs(p.W - w) > 0.01 || Math.abs(p.L - l) > 0.01; p.W = w; p.L = l; p.H = +room.H || p.H;
      if (resized) p.items = p.items.filter(i => !i.auto);
      const want = {}, manual = {}, manLine = new Set();
      p.items.forEach(i => { if (i.auto || !i.a) return; if (i.t === 'lum') manual[i.a] = (manual[i.a] || 0) + 1; else if (i.t === 'line') manLine.add(i.a); });
      const put = (key, a, kind, qty, extra) => {
        if (kind === 'strip' || kind === 'trackbar') { if (manLine.has(a)) return; }
        else { const m = Math.min(manual[a] || 0, qty); manual[a] = (manual[a] || 0) - m; qty -= m; if (qty <= 0) return; }
        (want[key] = want[key] || { a, kind, qty: 0, extra }).qty += qty; };
      for (const r of rows) {
        const x = MT.get(r.a); if (!x || x.g === 'Voltum' || MT.cls(x) === 'source' || (MT.cls(x) === 'control' && MT.kind(x) !== 'лента')) continue;
        const k = MT.kind(x), g = r.group || '', note = r.note || '';
        if (k === 'шинопровод') { put('Трек: шинопровод', x.a, 'trackbar', 1); continue; }
        if (['блок питания', 'профиль', 'комплектующие', 'аксессуар', 'контроллер', 'пульт', 'диммер'].includes(k)) continue;
        if (k === 'лента') { put('Подсветка', x.a, 'strip', 1); continue; }
        if (/^Общий свет/.test(g)) put('Общий свет', x.a, kindOf(x), r.qty);
        else if (/^Трек/.test(g)) put('Трек', x.a, kindOf(x), r.qty);
        else if (/стол/.test(note)) put('Над столом', x.a, kindOf(x), r.qty, { table: +((note.match(/([\d.]+)\s*м/) || [])[1] || 0) });
        else if (/остров/.test(note)) put('Над островом', x.a, kindOf(x), r.qty, { island: +((note.match(/([\d.]+)\s*м/) || [])[1] || 0) });
        else if (/бра/.test(note) || k === 'настенный') put('Бра', x.a, 'wall', r.qty);
        else put('Общий свет', x.a, kindOf(x), r.qty);
      }
      // убрать группы, которых больше нет
      p.items = p.items.filter(i => !i.auto || want[i.gk]);
      for (const [key, v] of Object.entries(want)) {
        const ex = p.items.filter(i => i.auto && i.gk === key && i.t !== 'furn');
        const isLine = v.kind === 'strip' || v.kind === 'trackbar';
        if (!isLine && ex.length === v.qty) { ex.forEach(i => { i.a = v.a; i.kind = v.kind; }); continue; }
        const tp = key.startsWith('Трек') ? trackPath(room, p) : null;
        if (isLine && ex.length && (key !== 'Трек: шинопровод' || ex.length === tp.segs.length)) { ex.forEach(i => { i.a = v.a; }); continue; }
        p.items = p.items.filter(i => !(i.auto && i.gk === key));
        const A = o => p.items.push(Object.assign({ id: p.seq++, auto: true, gk: key, group: key.replace(/^Трек: .*/, 'Трек') }, o));
        if (key === 'Общий свет') MT.layout(v.qty, p.W, p.L).forEach(([xx, yy]) => A({ t: 'lum', a: v.a, kind: v.kind, x: sn(xx), y: sn(yy) }));
        else if (key === 'Над столом' || key === 'Над островом') {
          const y = sn(p.L * (key === 'Над столом' ? 0.7 : 0.4)), n = v.qty, len = Math.max(1.2, (v.extra && (v.extra.table || v.extra.island)) || n * 0.6);
          for (let j = 0; j < n; j++) A({ t: 'lum', a: v.a, kind: 'pendant', x: sn(p.W / 2 + (j - (n - 1) / 2) * Math.min(0.6, len / n)), y, z: Math.max(1.5, p.H - 0.95) });
          A({ t: 'furn', type: key === 'Над столом' ? 'table' : 'island', x: sn(p.W / 2), y, w: len, d: 0.9, rot: 0 });
        }
        else if (key === 'Бра') for (let j = 0; j < v.qty; j++) A({ t: 'lum', a: v.a, kind: 'wall', x: sn(p.W * (j + 1) / (v.qty + 1)), y: 0.05 });
        else if (key === 'Подсветка') { const len = Math.min(+room.strip || p.W - 0.3, p.W - 0.3); A({ t: 'line', kind: 'strip', a: v.a, x1: sn((p.W - len) / 2), y1: 0.15, x2: sn((p.W + len) / 2), y2: 0.15 }); }
        else if (key === 'Трек: шинопровод') tp.segs.forEach(([a, b]) => A({ t: 'line', kind: 'trackbar', a: v.a, x1: sn(a[0]), y1: sn(a[1]), x2: sn(b[0]), y2: sn(b[1]) }));
        else if (key === 'Трек') for (let j = 0; j < v.qty; j++) { const [xx, yy] = tp.at(tp.len * (j + 0.5) / v.qty); A({ t: 'lum', a: v.a, kind: 'track', x: sn(xx), y: sn(yy) }); }
      }
      p._sig = planSig(p);
      if (!el.hidden && S() === p) { syncHeader(); fit(); draw(); } else syncHeader();
    },
    fromCalc(calc, title) {
      const p = addRoomPlan(title || calc.summary.room || 'Помещение', calc.grid.W, calc.grid.L, calc.R.H);
      const a = calc.fixture ? calc.fixture.a : null, k = a ? kindOf(MT.get(a)) : 'recessed';
      calc.grid.pts.forEach(([x, y]) => p.items.push({ id: p.seq++, t: 'lum', a, kind: k, x: sn(x), y: sn(y), group: 'Общий свет' }));
      sel = null; syncHeader(); loadBg(); fit(); props(); draw();
    },
    refresh() { syncHeader(); loadBg(); fit(); draw(); },
    snapshot, legendOf, scene3d,
  };
  MTUI.kp.on(() => { if (!el.hidden) syncHeader(); });
  new ResizeObserver(() => { if (!el.hidden) draw(); }).observe(cv);
  syncHeader(); setTimeout(() => { fit(); draw(); }, 50);
  window.addEventListener('tab-shown', e => { if (e.detail === 'plan') { syncHeader(); fit(); draw(); } });
})();
