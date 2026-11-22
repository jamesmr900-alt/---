/* 3D-визуализация помещения со светильниками (three.js). Иллюстративная, не светотехнический расчёт.
   Сцена:
   { title, room:{length, width, height, wall, floor, ceiling},
     furniture:[{type:'sofa'|'bed'|'table'|'kitchen'|'island'|'wardrobe'|'chair'|'tv'|'box', x, y, w, d, h, color, rot}],
     luminaires:[{article, name, kind:'recessed'|'surface'|'pendant'|'wall'|'track'|'strip'|'floor'|'table', x, y, z, count, color, lm, cct, beam, group, length, size}],
     heatmap:{grid, nx, ny, vmax} }
   Координаты в метрах от левого верхнего угла плана: x — по ширине, y — по длине. */
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';

const COLORS = { white: '#f4f4f2', 'белый': '#f4f4f2', black: '#1d1d1f', 'черный': '#1d1d1f', 'чёрный': '#1d1d1f', gold: '#c8a25a', 'золото': '#c8a25a',
  brass: '#b5904f', 'латунь': '#b5904f', chrome: '#c9ccd1', 'хром': '#c9ccd1', grey: '#8a8a8f', 'серый': '#8a8a8f' };
const col = c => { if (!c) return '#f4f4f2'; const k = String(c).toLowerCase().trim(); if (COLORS[k]) return COLORS[k];
  for (const key in COLORS) if (k.includes(key)) return COLORS[key]; return /^#|^rgb/.test(k) ? c : '#f4f4f2'; };
function kelvin(k) {               // приближённый цвет света по цветовой температуре
  const t = Math.min(Math.max(+k || 3000, 1500), 12000) / 100; let r, g, b;
  r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
  g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * Math.pow(t - 60, -0.0755);
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305.0;
  const c = v => Math.min(255, Math.max(0, v)) / 255; return new THREE.Color(c(r), c(g), c(b));
}
function falseColor(t) {
  t = Math.min(1, Math.max(0, t));
  const st = [[0, [20, 40, 160]], [0.25, [0, 160, 230]], [0.5, [40, 200, 80]], [0.75, [250, 220, 0]], [1, [230, 40, 30]]];
  for (let k = 1; k < st.length; k++) if (t <= st[k][0]) { const [t0, a] = st[k - 1], [t1, b] = st[k], u = (t - t0) / (t1 - t0); return a.map((v, i) => Math.round(v + (b[i] - v) * u)); }
  return st[4][1];
}
function autoLayout(n, W, L) {
  let best = null;
  for (let r = 1; r <= n; r++) { const c = Math.ceil(n / r), s = Math.abs(Math.log((W / c) / (L / r))) + (r * c - n) * 0.15; if (!best || s < best.s) best = { r, c, s }; }
  const pts = []; let left = n;
  for (let i = 0; i < best.r; i++) { const k = Math.min(best.c, Math.ceil(left / (best.r - i))); left -= k; for (let j = 0; j < k; j++) pts.push([W * (j + 0.5) / k, L * (i + 0.5) / best.r]); }
  return pts;
}

/** Развернуть luminaires с count и без координат в отдельные точки. */
export function expand(scene) {
  const R = scene.room, out = [];
  for (const l of scene.luminaires || []) {
    const n = Math.max(1, Math.round(l.count || 1));
    if (l.x != null && l.y != null && n === 1) { out.push(Object.assign({}, l, { count: 1 })); continue; }
    if (Array.isArray(l.points)) { l.points.forEach(p => out.push(Object.assign({}, l, { x: p[0], y: p[1], count: 1, points: undefined }))); continue; }
    if (l.kind === 'pendant' && n <= 4 && l.x != null) { for (let i = 0; i < n; i++) out.push(Object.assign({}, l, { x: l.x + (i - (n - 1) / 2) * 0.45, count: 1 })); continue; }
    if (l.kind === 'wall') { for (let i = 0; i < n; i++) out.push(Object.assign({}, l, { x: R.width * (i + 0.5) / n, y: 0.02, count: 1 })); continue; }
    if (l.kind === 'strip' || l.kind === 'trackbar') { out.push(Object.assign({}, l, { count: 1 })); continue; }
    const area = l.area || { x: 0, y: 0, w: R.width, l: R.length };
    autoLayout(n, area.w, area.l).forEach(([x, y]) => out.push(Object.assign({}, l, { x: area.x + x, y: area.y + y, count: 1 })));
  }
  return out;
}

const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: col(c), roughness: 0.75, metalness: 0 }, o));
function furniture(f) {
  const g = new THREE.Group(), c = f.color || '#b9b2a6';
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat(c)); b.position.set(x, y, z); g.add(b); return b; };
  const t = f.type || 'box', w = f.w, d = f.d;
  if (t === 'sofa') { const W = w || 2.2, D = d || 0.95; box(W, 0.42, D, 0, 0.21, 0); box(W, 0.45, 0.2, 0, 0.62, -D / 2 + 0.1); box(0.2, 0.25, D, -W / 2 + 0.1, 0.55, 0); box(0.2, 0.25, D, W / 2 - 0.1, 0.55, 0); }
  else if (t === 'bed') { const W = w || 1.8, D = d || 2.1; box(W, 0.45, D, 0, 0.225, 0); box(W, 0.9, 0.08, 0, 0.45, -D / 2, mat('#6d5a48')); box(W - 0.1, 0.1, D * 0.3, 0, 0.5, D * 0.3, mat('#e8e4dc')); }
  else if (t === 'table') { const W = w || 1.6, D = d || 0.9, H = f.h || 0.75; box(W, 0.04, D, 0, H - 0.02, 0, mat(f.color || '#8a6a4a')); [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => box(0.05, H - 0.04, 0.05, a * (W / 2 - 0.08), (H - 0.04) / 2, b * (D / 2 - 0.08), mat('#2a2a2a'))); }
  else if (t === 'chair') { box(0.45, 0.45, 0.45, 0, 0.225, 0); box(0.45, 0.45, 0.06, 0, 0.67, -0.2); }
  else if (t === 'kitchen') { const W = w || 3, D = d || 0.6; box(W, 0.86, D, 0, 0.43, 0, mat(f.color || '#e9e6df')); box(W, 0.04, D + 0.02, 0, 0.88, 0, mat('#3b3b3d')); box(W, 0.7, 0.35, 0, 1.85, -D / 2 + 0.175, mat(f.color || '#e9e6df')); }
  else if (t === 'island') { const W = w || 2, D = d || 0.9; box(W, 0.88, D, 0, 0.44, 0, mat(f.color || '#e9e6df')); box(W + 0.04, 0.04, D + 0.04, 0, 0.9, 0, mat('#3b3b3d')); }
  else if (t === 'wardrobe') { box(w || 2, f.h || 2.4, d || 0.6, 0, (f.h || 2.4) / 2, 0, mat(f.color || '#ddd6ca')); }
  else if (t === 'tv') { box(w || 1.8, 0.45, d || 0.4, 0, 0.225, 0, mat(f.color || '#3a3a3c')); box(1.4, 0.8, 0.04, 0, 1.25, -0.1, mat('#111')); }
  else box(w || 1, f.h || 0.8, d || 0.6, 0, (f.h || 0.8) / 2, 0);
  return g;
}

/** Нарисовать сцену в контейнере. Возвращает {dispose}. */
export function render(el, scene) {
  el.innerHTML = '';
  const R = Object.assign({ width: 4, length: 5, height: 2.7 }, scene.room || {});
  const W = R.width, L = R.length, H = R.height;
  const wrap = document.createElement('div'); wrap.style.cssText = 'position:relative;width:100%;aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:#0d0d10';
  el.appendChild(wrap);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  wrap.appendChild(renderer.domElement); renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
  const s = new THREE.Scene(); s.background = new THREE.Color('#0d0d10');
  const cam = new THREE.PerspectiveCamera(55, 4 / 3, 0.05, 100);
  const D = Math.max(W, L);
  cam.position.set(W * 0.7, H + D * 1.1, L * 1.2);
  const ctl = new OrbitControls(cam, renderer.domElement); ctl.target.set(0, H * 0.35, 0); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.95;

  // помещение: стены видны только изнутри — «кукольный домик»
  const plane = (w, h, c, pos, rot, side = THREE.FrontSide) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(c, { side, roughness: 0.9 })); m.position.copy(pos); m.rotation.set(...rot); s.add(m); return m; };
  const floor = plane(W, L, R.floor || '#b8a48c', new THREE.Vector3(0, 0, 0), [-Math.PI / 2, 0, 0]);
  plane(W, L, R.ceiling || '#f2f1ee', new THREE.Vector3(0, H, 0), [Math.PI / 2, 0, 0]);
  const wall = R.wall || '#e6e2da';
  plane(W, H, wall, new THREE.Vector3(0, H / 2, -L / 2), [0, 0, 0]);
  plane(W, H, wall, new THREE.Vector3(0, H / 2, L / 2), [0, Math.PI, 0]);
  plane(L, H, wall, new THREE.Vector3(-W / 2, H / 2, 0), [0, Math.PI / 2, 0]);
  plane(L, H, wall, new THREE.Vector3(W / 2, H / 2, 0), [0, -Math.PI / 2, 0]);
  const amb = new THREE.HemisphereLight('#ffffff', '#555555', 0.35); s.add(amb);
  const K = 0.012;   // перевод фотометрических единиц в яркость экрана (≈200 лк — нормальная экспозиция)
  const P = (x, y) => [x - W / 2, y - L / 2];

  for (const f of scene.furniture || []) { const g = furniture(f); const [x, z] = P(f.x ?? W / 2, f.y ?? L / 2); g.position.set(x, 0, z); g.rotation.y = (f.rot || 0) * Math.PI / 180; s.add(g); }

  // тепловая карта на полу
  let heat = null;
  if (scene.heatmap && scene.heatmap.grid) {
    const hm = scene.heatmap, cv = document.createElement('canvas'); cv.width = hm.nx; cv.height = hm.ny; const c = cv.getContext('2d'), img = c.createImageData(hm.nx, hm.ny);
    for (let i = 0; i < hm.nx * hm.ny; i++) { const [r, g, b] = falseColor(hm.grid[i] / hm.vmax); img.data.set([r, g, b, 255], i * 4); }
    c.putImageData(img, 0, 0); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter;
    heat = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9 }));
    heat.rotation.x = -Math.PI / 2; heat.position.y = 0.005; heat.visible = false; s.add(heat);
  }

  // светильники
  const lums = expand(Object.assign({}, scene, { room: R }));
  const groups = {}, gMats = {}, gCct = {}; let lightCount = 0; const MAXL = 60;
  for (const l of lums) {
    const grp = l.group || 'Общий свет'; (groups[grp] = groups[grp] || []);
    const [x, z] = P(l.x ?? W / 2, l.y ?? L / 2), body = col(l.color), lc = kelvin(l.cct || 3000), lm = +l.lm || 600;
    const beam = Math.min(Math.max(+l.beam || (l.kind === 'recessed' || l.kind === 'track' ? 40 : 120), 10), 170);
    const emis = new THREE.MeshStandardMaterial({ color: lc, emissive: lc, emissiveIntensity: 2.5 });
    (gMats[grp] = gMats[grp] || []).push(emis); if (!gCct[grp]) gCct[grp] = +l.cct || 3000;
    const items = []; let light = null;
    const add = m => { s.add(m); items.push(m); return m; };
    if (l.kind === 'pendant') {
      const zc = l.z ?? Math.max(H - 0.9, 1.6), sz = l.size || 0.3;
      const cord = add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, H - zc), mat('#222'))); cord.position.set(x, (H + zc) / 2, z);
      const round = /шар|sphere|ball|globe/i.test(l.name || l.shape || '');
      const shade = add(new THREE.Mesh(round ? new THREE.SphereGeometry(sz / 2, 24, 16) : new THREE.ConeGeometry(sz / 2, sz * 0.6, 32, 1, true), round ? emis : mat(body, { side: THREE.DoubleSide, metalness: 0.4, roughness: 0.4 })));
      shade.position.set(x, zc, z);
      if (!round) { const bulb = add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), emis)); bulb.position.set(x, zc - sz * 0.15, z); }
      light = new THREE.PointLight(lc, lm / (4 * Math.PI), 0, 2); light.position.set(x, zc - 0.1, z);
    } else if (l.kind === 'wall') {
      const zc = l.z ?? 1.8, b = add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.1), mat(body))); b.position.set(x, zc, z + (l.y < L / 2 ? 0.05 : -0.05));
      light = new THREE.PointLight(lc, lm / (4 * Math.PI), 0, 2); light.position.set(x, zc, z + (l.y < L / 2 ? 0.2 : -0.2));
    } else if (l.kind === 'strip' || l.kind === 'trackbar') {
      const len = l.length || W * 0.9, zc = l.z ?? H - 0.05, ang = -(l.rot || 0) * Math.PI / 180, ca = Math.cos(-ang), sa = Math.sin(-ang);
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(len, l.kind === 'trackbar' ? 0.035 : 0.015, l.kind === 'trackbar' ? 0.035 : 0.02), l.kind === 'trackbar' ? mat(body, { metalness: 0.3, roughness: 0.5 }) : emis));
      b.position.set(x, zc, z); b.rotation.y = ang;
      if (l.kind === 'strip') { const n = Math.min(6, Math.max(1, Math.round(len / 1.2)));
        for (let i = 0; i < n; i++) { const t = -len / 2 + len * (i + 0.5) / n, pl = new THREE.PointLight(lc, lm / n / (4 * Math.PI), 0, 2); pl.position.set(x + t * ca, zc - 0.05, z + t * sa); s.add(pl); items.push(pl); lightCount++; } }
    } else if (l.kind === 'floor' || l.kind === 'table') {
      const hh = l.kind === 'floor' ? 1.6 : 0.75 + 0.45, st = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, hh), mat(body))); st.position.set(x, hh / 2, z);
      const sh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.25, 24, 1, true), mat('#efe9dd', { side: THREE.DoubleSide, emissive: lc, emissiveIntensity: 0.4 }))); sh.position.set(x, hh, z);
      light = new THREE.PointLight(lc, lm / (4 * Math.PI), 0, 2); light.position.set(x, hh, z);
    } else {   // recessed, surface, track
      const surf = l.kind === 'surface' || l.kind === 'track', sz = l.size || (surf ? 0.08 : 0.09);
      if (surf) { const c = add(new THREE.Mesh(new THREE.CylinderGeometry(sz / 2, sz / 2, 0.14, 24), mat(body, { metalness: 0.3, roughness: 0.5 }))); c.position.set(x, H - 0.07, z); }
      else { const ring = add(new THREE.Mesh(new THREE.CylinderGeometry(sz / 2, sz / 2, 0.006, 28), mat(body))); ring.position.set(x, H - 0.003, z); }
      const lens = add(new THREE.Mesh(new THREE.CircleGeometry(sz * 0.3, 20), emis)); lens.rotation.x = Math.PI / 2; lens.position.set(x, H - (surf ? 0.141 : 0.007), z);
      const half = beam / 2 * Math.PI / 180, cd = lm / (2 * Math.PI * (1 - Math.cos(half)));
      light = new THREE.SpotLight(lc, cd, 0, Math.min(Math.PI / 2.05, half * 1.6), 0.6, 2); light.position.set(x, H - 0.02, z);
      light.target.position.set(x + (l.aim ? l.aim[0] : 0), 0, z + (l.aim ? l.aim[1] : 0)); s.add(light.target);
    }
    if (light && lightCount < MAXL) { s.add(light); items.push(light); lightCount++; }
    groups[grp].push(...items);
  }
  s.traverse(o => { if (o.isLight && o !== amb) { o.intensity *= K; o.userData.base = o.intensity; } });

  // панель управления
  const ui = document.createElement('div'); ui.style.cssText = 'position:absolute;left:8px;top:8px;background:rgba(255,255,255,.88);border-radius:8px;padding:6px 9px;font:12px system-ui;color:#111;display:flex;flex-direction:column;gap:3px;max-width:60%';
  const gname = g => g.replace(/[<>&"]/g, '');
  const SCENES = { 'Всё включено': g => [1, null], 'Вечер': g => [/общий/i.test(g) ? 0.3 : /подсвет|лент/i.test(g) ? 0.6 : 0.9, 2700], 'Ужин': g => [/стол|остров/i.test(g) ? 1 : /общий/i.test(g) ? 0.15 : 0.4, 2700],
    'Кино': g => [/подсвет|лент/i.test(g) ? 0.3 : 0, 2700], 'Работа / уборка': g => [1.2, 4000], 'Ночник': g => [/бра|подсвет|лент/i.test(g) ? 0.15 : 0, 2700] };
  ui.innerHTML = `<b data-t style="cursor:pointer" title="свернуть"><span>▾</span> ${(scene.title || 'Помещение').replace(/[<>&]/g, '')}</b>` +
    `<label style="display:flex;gap:5px;align-items:center;color:#111;flex-direction:row;font-size:12px">сценарий <select data-scene style="font-size:12px;padding:1px 4px">${Object.keys(SCENES).map(n => `<option>${n}</option>`).join('')}</select></label>` +
    Object.keys(groups).map(g => `<div data-row="${gname(g)}" style="border-top:1px solid #ddd;padding-top:3px"><label style="display:flex;gap:5px;align-items:center;color:#111;flex-direction:row;font-size:12px;font-weight:600"><input type="checkbox" data-g="${gname(g)}" checked>${gname(g)}</label>
      <label style="display:flex;gap:4px;align-items:center;color:#333;flex-direction:row;font-size:11px">яркость <input type="range" data-b="${gname(g)}" min="0" max="1.5" step="0.05" value="1" style="width:84px;padding:0"><span data-bv>100%</span></label>
      <label style="display:flex;gap:4px;align-items:center;color:#333;flex-direction:row;font-size:11px">Tцв <input type="range" data-k="${gname(g)}" min="2700" max="6500" step="100" value="${gCct[g] || 3000}" style="width:84px;padding:0"><span data-kv>${gCct[g] || 3000}K</span></label></div>`).join('') +
    `<label style="display:flex;gap:5px;align-items:center;color:#111;flex-direction:row;font-size:12px;border-top:1px solid #ddd;padding-top:3px">экспозиция <input type="range" min="0.2" max="3" step="0.1" value="1" data-exp style="width:80px;padding:0"></label>` +
    (heat ? `<label style="display:flex;gap:5px;align-items:center;color:#111;flex-direction:row;font-size:12px"><input type="checkbox" data-heat>карта освещённости</label>` : '') +
    `<div style="display:flex;gap:4px"><button data-v="top">сверху</button><button data-v="persp">3D</button><button data-v="in">внутри</button><button data-v="full">⛶</button><button data-v="png">PNG</button></div>`;
  ui.style.maxHeight = '92%'; ui.style.overflow = 'auto';
  const gState = {}; Object.keys(groups).forEach(g => { gState[gname(g)] = { b: 1, k: gCct[g] || 3000, on: true, key: g }; });
  function applyGroup(n) {
    const st = gState[n], g = st.key, c = kelvin(st.k);
    groups[g].forEach(o => { if (o.isLight) { o.intensity = (o.userData.base || 0) * st.b; o.color.copy(c); o.visible = st.on; } else o.visible = st.on; });
    (gMats[g] || []).forEach(m => { m.color.copy(c); m.emissive.copy(c); m.emissiveIntensity = 2.5 * Math.max(0.05, st.b); });
    const row = ui.querySelector(`[data-row="${n}"]`); if (row) { row.querySelector('[data-bv]').textContent = Math.round(st.b * 100) + '%'; row.querySelector('[data-kv]').textContent = st.k + 'K';
      row.querySelector('[data-b]').value = st.b; row.querySelector('[data-k]').value = st.k; row.querySelector('[data-g]').checked = st.on; }
  }
  ui.querySelectorAll('button').forEach(b => b.style.cssText = 'font:11px system-ui;padding:2px 6px;border:1px solid #ccc;border-radius:5px;background:#fff;cursor:pointer');
  wrap.appendChild(ui);
  ui.querySelector('[data-t]').onclick = () => { const hid = ui.dataset.min === '1'; ui.dataset.min = hid ? '0' : '1'; [...ui.children].slice(1).forEach(c => c.style.display = hid ? '' : 'none'); ui.querySelector("[data-t] span").textContent = hid ? "▾" : "▸"; };
  const note = document.createElement('div'); note.style.cssText = 'position:absolute;right:8px;bottom:6px;font:11px system-ui;color:#ddd';
  note.textContent = 'Визуализация иллюстративная; точный вид изделий — по фото в каталоге'; wrap.appendChild(note);
  ui.querySelectorAll('[data-g]').forEach(cb => cb.onchange = () => { gState[cb.dataset.g].on = cb.checked; applyGroup(cb.dataset.g); });
  ui.querySelectorAll('[data-b]').forEach(r => r.oninput = () => { gState[r.dataset.b].b = +r.value; gState[r.dataset.b].on = +r.value > 0; applyGroup(r.dataset.b); });
  ui.querySelectorAll('[data-k]').forEach(r => r.oninput = () => { gState[r.dataset.k].k = +r.value; applyGroup(r.dataset.k); });
  ui.querySelector('[data-scene]').onchange = e => { const f = SCENES[e.target.value]; Object.entries(gState).forEach(([n, st]) => { const [b, k] = f(st.key); st.b = b; st.on = b > 0; if (k) st.k = k; else st.k = gCct[st.key] || 3000; applyGroup(n); }); };
  ui.querySelector('[data-exp]').oninput = e => { renderer.toneMappingExposure = +e.target.value; };
  if (heat) ui.querySelector('[data-heat]').onchange = e => { heat.visible = e.target.checked; };
  ui.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    const v = b.dataset.v;
    if (v === 'top') { cam.position.set(0, H + D * 1.4, 0.001); ctl.target.set(0, 0, 0); }
    if (v === 'persp') { cam.position.set(W * 0.7, H + D * 1.1, L * 1.2); ctl.target.set(0, H * 0.35, 0); }
    if (v === 'in') { cam.position.set(-W / 2 + 0.4, 1.6, L / 2 - 0.4); ctl.target.set(W / 4, 1.0, -L / 4); }
    if (v === 'full') { if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen && wrap.requestFullscreen(); }
    if (v === 'png') { renderer.render(s, cam); const fn = (scene.title || 'визуализация') + '.png';
      renderer.domElement.toBlob(async blob => { if (window.MTUI && await window.MTUI.saveFile(fn, blob)) return; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; a.click(); }, 'image/png'); }
  });

  let alive = true;
  const size = () => { const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  const ro = new ResizeObserver(size); ro.observe(wrap); size();
  (function loop() { if (!alive) return; ctl.update(); renderer.render(s, cam); requestAnimationFrame(loop); })();
  return { lights: lightCount, luminaires: lums.length, dispose() { alive = false; ro.disconnect(); renderer.dispose(); } };
}

/** Сцена из результата светорасчёта (MTUI.roomCalc). */
export function sceneFromCalc(calc, extra = {}) {
  const g = calc.grid, s = calc.summary, pk = calc.pick, fx = calc.fixture;
  const item = fx && window.MT ? window.MT.get(fx.a) : null;
  const kind = calc.profile.mount === 'open' ? 'surface' : 'recessed';
  return Object.assign({
    title: s.room || 'Помещение',
    room: { width: g.W, length: g.L, height: calc.R.H },
    luminaires: [{ article: fx ? fx.a : 'светильник', name: fx ? fx.n : '', kind, points: g.pts, color: item ? item.col : 'white', lm: pk.src.lm * pk.lor, cct: 3000, beam: pk.beam, group: 'Общий свет' }],
    heatmap: { grid: g.grid, nx: g.nx, ny: g.ny, vmax: Math.max(calc.R.E * 1.5, g.max) },
  }, extra);
}

window.MT3D = { render, sceneFromCalc, expand };
window.dispatchEvent(new Event('mt3d-ready'));
